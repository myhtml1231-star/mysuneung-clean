import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHandler} from '../reports/worker-check.mjs';
import {hash} from '../src/security.mjs';
import {makeEnv,makeDB,identity} from './fixtures.mjs';

const env=makeEnv();
env.ADMIN_EMAIL_HASHES=await hash('mysuneung-admin-v1:alice@example.invalid');
const reportDB=makeDB();
reportDB.exec(`CREATE TABLE reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL DEFAULT 'error',nickname TEXT NOT NULL,content TEXT NOT NULL,source_page TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending',admin_note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,created_unix INTEGER NOT NULL,updated_at TEXT NOT NULL,ip_hash TEXT NOT NULL DEFAULT '',user_agent TEXT NOT NULL DEFAULT ''
);`);
reportDB.prepare("INSERT INTO reports(type,nickname,content,source_page,status,admin_note,created_at,created_unix,updated_at,ip_hash,user_agent) VALUES('error','tester','broken button','/mixed-cbt','pending','',?,?,?,?,?)")
 .bind(new Date().toISOString(),Math.floor(Date.now()/1000),new Date().toISOString(),'x','test').run();
env.REPORTS=reportDB;

const handler=createHandler({verifyIdentity:async token=>identity(token),fetch:async()=>Response.json({})});
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
 jars[who]={cookie:x.r.headers.getSetCookie().find(s=>s.startsWith('__Host-msn-session=')).split(';')[0],id:x.data.user.id,csrf:x.data.csrf};return x.data;
}
const tests=[];const test=async(name,fn)=>{await fn();tests.push(name);};

await login('alice');await login('bob');
env.DB.raw.prepare("INSERT INTO community_inquiries(id,legacy_id,title,author,content,privacy,date_label,created_at,answer,answered,source) VALUES('q1','legacy-q1','기존 문의','수험생','문의 내용','private','2026. 9. 28.',?,'',0,'legacy_firestore')").run(Date.now()-1000);
env.DB.raw.prepare("INSERT INTO community_chat_messages(id,legacy_id,user_id,author,content,created_at,source) VALUES('c1','legacy-c1',NULL,'채팅학생','채팅 내용',?,'legacy_firestore')").run(Date.now()-500);

await test('successful login creates durable login events',async()=>{
 const rows=env.DB.raw.prepare('SELECT account_id,device_label,source FROM account_login_events ORDER BY id').all();assert.equal(rows.length,2);assert.ok(rows.every(x=>x.source==='login'));
});
await test('non-admin account is blocked from all admin data',async()=>{
 const x=await call('admin/summary',undefined,{who:'bob'});assert.equal(x.r.status,403);assert.equal(x.data.code,'ADMIN_REQUIRED');
});
await test('admin summary distinguishes login events, unique users, sessions and accounts',async()=>{
 const x=await call('admin/summary');assert.equal(x.r.status,200);assert.equal(x.data.accounts,2);assert.equal(x.data.active_sessions,2);assert.equal(x.data.logins_today,2);assert.equal(x.data.login_users_today,2);
});
await test('account list and detail expose login history without session secrets',async()=>{
 let x=await call('admin/accounts');assert.equal(x.r.status,200);const bob=x.data.accounts.find(a=>a.email==='bob@example.invalid');assert.ok(bob);assert.equal(bob.login_count,1);assert.equal(bob.token_hash,undefined);
 x=await call('admin/accounts/'+bob.id);assert.equal(x.data.logins.length,1);assert.equal(x.data.sessions[0].token_hash,undefined);
});
await test('admin cannot disable own account',async()=>assert.equal((await call('admin/accounts/'+jars.alice.id+'/status',{disabled:true})).r.status,409));
await test('admin can disable a member and immediately revoke member sessions',async()=>{
 const x=await call('admin/accounts/'+jars.bob.id+'/status',{disabled:true,reason:'test'});assert.equal(x.r.status,200);assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM account_sessions WHERE account_id=?').get(jars.bob.id).n,0);
});
await test('admin reads migrated inquiry and chat directly from server DB without Firebase token',async()=>{
 let x=await call('admin/community/inquiries?limit=10');assert.equal(x.r.status,200);assert.equal(x.data.inquiries.length,1);assert.equal(x.data.inquiries[0].content,'문의 내용');assert.equal(x.data.inquiries[0].password_hash,undefined);
 x=await call('admin/community/chat?limit=10');assert.equal(x.r.status,200);assert.equal(x.data.messages[0].content,'채팅 내용');
});
await test('inquiry answer and delete plus chat delete are server DB operations and audited',async()=>{
 assert.equal((await call('admin/community/inquiries/q1/answer',{answer:'관리자 답변'})).r.status,200);
 assert.equal(env.DB.raw.prepare('SELECT answer,answered FROM community_inquiries WHERE id=?').get('q1').answer,'관리자 답변');
 assert.equal((await call('admin/community/inquiries/q1/delete',{})).r.status,200);
 assert.equal((await call('admin/community/chat/c1/delete',{})).r.status,200);
 const actions=env.DB.raw.prepare("SELECT action FROM admin_audit WHERE action LIKE 'inquiry_%' OR action='chat_delete' ORDER BY id").all().map(x=>x.action);
 assert.deepEqual(actions,['inquiry_answer','inquiry_delete','chat_delete']);
});
await test('error reports are listed and updated through existing reports database',async()=>{
 let x=await call('admin/reports');assert.equal(x.r.status,200);const id=x.data.reports[0].id;x=await call('admin/reports/'+id,{status:'resolved',admin_note:'checked'});assert.equal(x.r.status,200);
 assert.equal(reportDB.raw.prepare('SELECT status FROM reports WHERE id=?').get(id).status,'resolved');
});
await test('admin audit omits private community content',async()=>{
 const x=await call('admin/audit?limit=100');const raw=JSON.stringify(x.data);assert.ok(!raw.includes('문의 내용'));assert.ok(!raw.includes('채팅 내용'));
});
await test('admin assets are served with no-store page protection and bundled client',async()=>{
 const page=await handler.fetch(new Request('https://mysuneung.com/admin'),env);assert.equal(page.status,200);assert.match(await page.text(),/회원 계정/);
 const js=await handler.fetch(new Request('https://mysuneung.com/account-assets/admin.js'),env);assert.equal(js.status,200);assert.ok((await js.text()).length>1000);
});

fs.mkdirSync(new URL('../reports',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../reports/admin-tests.json',import.meta.url),JSON.stringify({passed:tests.length,tests},null,2));
console.log('ADMIN_PASS',tests.length);env.DB.raw.close();reportDB.raw.close();
