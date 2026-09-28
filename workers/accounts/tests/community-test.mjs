import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHandler} from '../reports/worker-check.mjs';
import {makeEnv} from './fixtures.mjs';

const env=makeEnv(),handler=createHandler(),tests=[];
const test=async(name,fn)=>{await fn();tests.push(name);};
async function call(path,body,{cookie='',method}={}){
 const h={Origin:'https://mysuneung.com'};if(body!==undefined)h['Content-Type']='application/json';if(cookie)h.Cookie=cookie;
 const r=await handler.fetch(new Request('https://mysuneung.com/api/community/'+path,{method:method||(body===undefined?'GET':'POST'),headers:h,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 let data={};try{data=await r.json();}catch{}return {r,data};
}

let privateId;
await test('private inquiry password is hashed server-side and never stored as plaintext',async()=>{
 const x=await call('inquiries',{title:'비공개 테스트',author:'학생',privacy:'private',password:'safe-pass-123',content:'비공개 본문'});
 assert.equal(x.r.status,201);privateId=x.data.id;
 const row=env.DB.raw.prepare('SELECT password_salt,password_hash,password_iterations FROM community_inquiries WHERE id=?').get(privateId);
 assert.ok(row.password_salt&&row.password_hash&&row.password_iterations>=100000);assert.notEqual(row.password_hash,'safe-pass-123');
 assert.equal(JSON.stringify(row).includes('safe-pass-123'),false);
});
await test('public inquiry list hides private title, content and credential fields',async()=>{
 const x=await call('inquiries?limit=100');assert.equal(x.r.status,200);const q=x.data.inquiries.find(v=>v.id===privateId);
 assert.equal(q.title,'비공개 질문');assert.equal(q.content,undefined);assert.equal(q.password_hash,undefined);assert.equal(q.password,undefined);
});
await test('private inquiry detail stays locked until correct password is verified',async()=>{
 let x=await call('inquiries/'+privateId);assert.equal(x.r.status,200);assert.equal(x.data.locked,true);assert.equal(x.data.inquiry.content,undefined);
 x=await call('inquiries/'+privateId+'/open',{password:'wrong'});assert.equal(x.r.status,403);assert.equal(x.data.code,'BAD_INQUIRY_PASSWORD');
 x=await call('inquiries/'+privateId+'/open',{password:'safe-pass-123'});assert.equal(x.r.status,200);assert.equal(x.data.inquiry.content,'비공개 본문');
});
await test('public inquiry does not require password',async()=>{
 const c=await call('inquiries',{title:'공개 문의',author:'익명',privacy:'public',content:'공개 본문'});assert.equal(c.r.status,201);
 const x=await call('inquiries/'+c.data.id);assert.equal(x.data.locked,false);assert.equal(x.data.inquiry.content,'공개 본문');
});
let chatCookie,chatUser;
await test('chat nickname credential is hashed and returned as HttpOnly session cookie',async()=>{
 const x=await call('chat/session',{nickname:'테스트학생',password:'chat-pass'});assert.equal(x.r.status,200);chatUser=x.data.user;
 chatCookie=x.r.headers.getSetCookie().find(v=>v.startsWith('__Host-msn-chat=')).split(';')[0];assert.ok(chatCookie);
 const row=env.DB.raw.prepare('SELECT password_hash,password_salt,password_iterations FROM community_chat_users WHERE id=?').get(chatUser.id);
 assert.ok(row.password_hash&&row.password_salt);assert.notEqual(row.password_hash,'chat-pass');
 const set=x.r.headers.getSetCookie().join(';');for(const flag of ['HttpOnly','Secure','SameSite=Lax'])assert.ok(set.includes(flag));
});
await test('chat nickname password is shared server-side rather than localStorage-only',async()=>{
 let x=await call('chat/session',{nickname:'테스트학생',password:'bad-pass'});assert.equal(x.r.status,403);
 x=await call('chat/session',{nickname:'테스트학생',password:'chat-pass'});assert.equal(x.r.status,200);
});
await test('chat send requires valid chat session and message list returns saved messages',async()=>{
 assert.equal((await call('chat/messages',{content:'로그인 없음'})).r.status,401);
 const s=await call('chat/messages',{content:'안녕하세요'},{cookie:chatCookie});assert.equal(s.r.status,201);assert.equal(s.data.message.author,'테스트학생');
 const x=await call('chat/messages?limit=100');assert.ok(x.data.messages.some(v=>v.content==='안녕하세요'));
});
await test('chat logout revokes server session',async()=>{
 assert.equal((await call('chat/logout',{}, {cookie:chatCookie})).r.status,200);
 assert.equal((await call('chat/messages',{content:'로그아웃 후'},{cookie:chatCookie})).r.status,401);
});
await test('community pages are served by Account Worker and do not load Firebase SDK',async()=>{
 for(const p of ['/질문%20게시판.html','/수험채팅방.html']){
  const r=await handler.fetch(new Request('https://mysuneung.com'+p),env);assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('/api/community/')===false);assert.ok(!html.includes('firebase'));
  assert.match(r.headers.get('cache-control'),/no-store/);
 }
});
fs.mkdirSync(new URL('../reports',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../reports/community-tests.json',import.meta.url),JSON.stringify({passed:tests.length,tests},null,2));
console.log('COMMUNITY_PASS',tests.length);env.DB.raw.close();
