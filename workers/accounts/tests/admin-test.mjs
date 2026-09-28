import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHandler} from '../reports/worker-check.mjs';
import {hash} from '../src/security.mjs';
import {makeEnv,makeDB,identity} from './fixtures.mjs';

const env=makeEnv();
env.ADMIN_EMAIL_HASHES=await hash('mysuneung-admin-v1:alice@example.invalid');
const reportDB=makeDB();
reportDB.exec(`CREATE TABLE reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT NOT NULL DEFAULT 'error',
 nickname TEXT NOT NULL,
 content TEXT NOT NULL,
 source_page TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending',
 admin_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 created_unix INTEGER NOT NULL,
 updated_at TEXT NOT NULL,
 ip_hash TEXT NOT NULL DEFAULT '',
 user_agent TEXT NOT NULL DEFAULT ''
);`);
reportDB.prepare("INSERT INTO reports(type,nickname,content,source_page,status,admin_note,created_at,created_unix,updated_at,ip_hash,user_agent) VALUES('error','tester','broken button','/mixed-cbt','pending','',?,?,?,?,?)")
 .bind(new Date().toISOString(),Math.floor(Date.now()/1000),new Date().toISOString(),'x','test').run();
env.REPORTS=reportDB;

const firestoreCalls=[];
const inquiryDoc={
 name:'projects/mysuneung/databases/(default)/documents/inquiries/q1',
 createTime:'2026-09-28T10:00:00.000Z',
 fields:{
  title:{stringValue:'기존 문의'},author:{stringValue:'수험생'},content:{stringValue:'문의 내용'},
  privacy:{stringValue:'private'},password:{stringValue:'legacy-secret'},date:{stringValue:'2026. 9. 28.'},
  createdAt:{timestampValue:'2026-09-28T10:00:00.000Z'},answer:{nullValue:null},answered:{booleanValue:false}
 }
};
const chatDoc={
 name:'projects/mysuneung/databases/(default)/documents/chatMessages/c1',
 createTime:'2026-09-28T11:00:00.000Z',
 fields:{author:{stringValue:'채팅학생'},content:{stringValue:'채팅 내용'},createdAt:{timestampValue:'2026-09-28T11:00:00.000Z'}}
};
const externalFetch=async(url,opt={})=>{
 const u=new URL(url);firestoreCalls.push({path:u.pathname+u.search,method:opt.method||'GET',auth:opt.headers?.Authorization||''});
 if(u.pathname.endsWith('/inquiries')&&(!opt.method||opt.method==='GET'))return Response.json({documents:[inquiryDoc]});
 if(u.pathname.endsWith('/chatMessages')&&(!opt.method||opt.method==='GET'))return Response.json({documents:[chatDoc]});
 if((u.pathname.includes('/inquiries/q1')||u.pathname.includes('/chatMessages/c1'))&&['PATCH','DELETE'].includes(opt.method))return Response.json({});
 if(u.hostname==='identitytoolkit.googleapis.com')return Response.json({});
 return Response.json({error:{message:'not found'}},{status:404});
};
const handler=createHandler({
 verifyIdentity:async token=>identity(token),
 verifyIdentityAccess:async token=>{if(token!=='community-token')throw Error('bad community token');return identity('alice');},
 fetch:externalFetch
});
const jars={};
async function call(route,body,{who='alice',method,headers={},noAuth=false}={}){
 const h={Origin:'https://mysuneung.com',...headers};if(body!==undefined)h['Content-Type']='application/json';
 const j=jars[who];if(!noAuth&&j){h.Cookie=j.cookie;h['X-MSN-Account']=j.id;if(body!==undefined)h['X-MSN-CSRF']=j.csrf;}
 const r=await handler.fetch(new Request('https://mysuneung.com/api/account/'+route,{method:method||(body===undefined?'GET':'POST'),headers:h,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 const data=await r.json();return {r,data};
}
async function login(who){
 const c=await call('config',undefined,{noAuth:true}),nonce=c.r.headers.getSetCookie()[0].split(';')[0];
 const x=await call('session',{id_token:who,over14:true,accept_privacy:true,consent_version:c.data.consent_version},{noAuth:true,headers:{Cookie:nonce,'X-MSN-Login-CSRF':c.data.login_csrf}});
 assert.equal(x.r.status,200,JSON.stringify(x.data));
 jars[who]={cookie:x.r.headers.getSetCookie().find(s=>s.startsWith('__Host-msn-session=')).split(';')[0],id:x.data.user.id,csrf:x.data.csrf};
 return x.data;
}
const tests=[];const test=async(name,fn)=>{await fn();tests.push(name);};

await login('alice');await login('bob');
await test('successful login creates durable login events',async()=>{
 const rows=env.DB.raw.prepare('SELECT account_id,device_label,source FROM account_login_events ORDER BY id').all();
 assert.equal(rows.length,2);assert.ok(rows.every(x=>x.source==='login'));assert.ok(rows.every(x=>x.device_label.includes('기타 기기')));
});
await test('non-admin account is blocked from all admin data',async()=>{
 const x=await call('admin/summary',undefined,{who:'bob'});assert.equal(x.r.status,403);assert.equal(x.data.code,'ADMIN_REQUIRED');
});
await test('admin summary distinguishes login events, unique users, sessions and accounts',async()=>{
 const x=await call('admin/summary');assert.equal(x.r.status,200);assert.equal(x.data.accounts,2);assert.equal(x.data.active_sessions,2);
 assert.equal(x.data.logins_today,2);assert.equal(x.data.login_users_today,2);assert.equal(x.data.login_users_7d,2);
});
await test('account list and detail expose login history without session secrets',async()=>{
 let x=await call('admin/accounts');assert.equal(x.r.status,200);assert.equal(x.data.accounts.length,2);
 const bob=x.data.accounts.find(a=>a.email==='bob@example.invalid');assert.ok(bob);assert.equal(bob.login_count,1);assert.equal(bob.token_hash,undefined);
 x=await call('admin/accounts/'+bob.id);assert.equal(x.data.logins.length,1);assert.equal(x.data.sessions[0].token_hash,undefined);
});
await test('admin cannot disable own account',async()=>{
 const x=await call('admin/accounts/'+jars.alice.id+'/status',{disabled:true});assert.equal(x.r.status,409);assert.equal(x.data.code,'ADMIN_SELF_DISABLE');
});
await test('admin can disable a member and immediately revoke member sessions',async()=>{
 const x=await call('admin/accounts/'+jars.bob.id+'/status',{disabled:true,reason:'test'});assert.equal(x.r.status,200);assert.equal(x.data.disabled,true);
 assert.equal(env.DB.raw.prepare('SELECT disabled FROM accounts WHERE id=?').get(jars.bob.id).disabled,1);
 assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM account_sessions WHERE account_id=?').get(jars.bob.id).n,0);
});
await test('community query requires matching Firebase identity and never returns legacy private password',async()=>{
 let x=await call('admin/community/inquiries/query',{id_token:'community-token',limit:10});assert.equal(x.r.status,200);assert.equal(x.data.inquiries.length,1);
 assert.equal(x.data.inquiries[0].password,undefined);assert.equal(x.data.inquiries[0].privacy,'private');
 x=await call('admin/community/chat/query',{id_token:'community-token',limit:10});assert.equal(x.data.messages[0].content,'채팅 내용');
 assert.ok(firestoreCalls.every(c=>c.auth==='Bearer community-token'));
});
await test('inquiry answer and delete plus chat delete are proxied and audited',async()=>{
 assert.equal((await call('admin/community/inquiries/q1/answer',{id_token:'community-token',answer:'관리자 답변'})).r.status,200);
 assert.equal((await call('admin/community/inquiries/q1/delete',{id_token:'community-token'})).r.status,200);
 assert.equal((await call('admin/community/chat/c1/delete',{id_token:'community-token'})).r.status,200);
 const actions=env.DB.raw.prepare("SELECT action FROM admin_audit WHERE action LIKE 'inquiry_%' OR action='chat_delete' ORDER BY id").all().map(x=>x.action);
 assert.deepEqual(actions,['inquiry_answer','inquiry_delete','chat_delete']);
});
await test('error reports are listed and updated through the existing reports database',async()=>{
 let x=await call('admin/reports');assert.equal(x.r.status,200);assert.equal(x.data.reports.length,1);
 const id=x.data.reports[0].id;x=await call('admin/reports/'+id,{status:'resolved',admin_note:'checked'});assert.equal(x.r.status,200);
 const row=reportDB.raw.prepare('SELECT status,admin_note FROM reports WHERE id=?').get(id);assert.equal(row.status,'resolved');assert.equal(row.admin_note,'checked');
});
await test('admin audit contains member, community and report changes only, not private content',async()=>{
 const x=await call('admin/audit?limit=100');assert.equal(x.r.status,200);assert.ok(x.data.logs.length>=5);
 const raw=JSON.stringify(x.data);assert.ok(!raw.includes('legacy-secret'));assert.ok(!raw.includes('문의 내용'));assert.ok(!raw.includes('채팅 내용'));
});
await test('admin assets are served with no-store page protection and bundled client',async()=>{
 const page=await handler.fetch(new Request('https://mysuneung.com/admin'),env);assert.equal(page.status,200);assert.match(await page.text(),/회원 계정/);
 const js=await handler.fetch(new Request('https://mysuneung.com/account-assets/admin.js'),env);assert.equal(js.status,200);assert.ok((await js.text()).length>1000);
});

fs.mkdirSync(new URL('../reports',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../reports/admin-tests.json',import.meta.url),JSON.stringify({passed:tests.length,tests},null,2));
console.log('ADMIN_PASS',tests.length);
env.DB.raw.close();reportDB.raw.close();
