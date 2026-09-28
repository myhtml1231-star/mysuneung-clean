import {HttpError,fail,randomToken,hash,cookie,cookieHeader,equal,originGuard,readBody,privateJSON,rateLimit} from './security.mjs';
import {text,integer} from './records.mjs';

export const CHAT_COOKIE='__Host-msn-chat';
const ITERATIONS=120000;
const enc=new TextEncoder();

function b64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function fromB64(s){const raw=atob(String(s).replaceAll('-','+').replaceAll('_','/')+'==='.slice((String(s).length+3)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function pbkdf2(password,salt,iterations=ITERATIONS){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
 return b64(new Uint8Array(bits));
}
export async function makePasswordRecord(password){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 return {salt:b64(salt),hash:await pbkdf2(password,salt,ITERATIONS),iterations:ITERATIONS};
}
async function verifyPassword(password,row){
 if(!row?.password_salt||!row?.password_hash||!row?.password_iterations)return false;
 const candidate=await pbkdf2(password,fromB64(row.password_salt),Number(row.password_iterations));
 return equal(candidate,row.password_hash);
}
function clearChatCookie(){return cookieHeader(CHAT_COOKIE,'',0);}
function deviceLabel(req){const s=req.headers.get('User-Agent')||'';return (/Edg\//.test(s)?'Edge':/Firefox\//.test(s)?'Firefox':/Chrome\//.test(s)?'Chrome':/Safari\//.test(s)?'Safari':'브라우저')+' · '+(/Android/.test(s)?'Android':/iPhone|iPad/.test(s)?'iOS':/Windows/.test(s)?'Windows':/Mac OS/.test(s)?'Mac':'기타 기기');}
function dateLabel(ms){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}).format(new Date(ms));}
function publicInquiryRow(r){
 return {id:r.id,title:r.privacy==='private'?'비공개 질문':r.title,author:r.author||'익명',privacy:r.privacy,date:r.date_label||'',created_at:r.created_at,answered:!!r.answered};
}
function inquiryDetail(r){return {id:r.id,title:r.title,author:r.author||'익명',content:r.content,privacy:r.privacy,date:r.date_label||'',created_at:r.created_at,answer:r.answer||'',answered:!!r.answered,answered_at:r.answered_at||null};}
async function chatSession(req,env){
 const token=cookie(req,CHAT_COOKIE);if(!token||!/^[-\w]{43}$/.test(token))return null;
 const h=await hash(token),now=Date.now();
 const s=await env.DB.prepare(`SELECT s.token_hash,s.user_id,s.expires_at,u.nickname,u.disabled
 FROM community_chat_sessions s JOIN community_chat_users u ON u.id=s.user_id
 WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`).bind(h,now).first();
 return s||null;
}
function safeError(e){
 if(e instanceof HttpError)return privateJSON({ok:false,code:e.code,error:e.message},e.status,e.status===429?{'Retry-After':'60'}:{});
 console.error('COMMUNITY_REQUEST_FAILED',e?.name||'Error');return privateJSON({ok:false,code:'TEMPORARY_FAILURE',error:'커뮤니티 서버에 일시적인 문제가 있습니다.'},503);
}
export async function handleCommunity(request,env){
 try{
  const url=new URL(request.url),route=url.pathname.slice('/api/community/'.length),method=request.method;
  if(!['GET','HEAD'].includes(method))originGuard(request,env);

  if(route==='inquiries'&&method==='GET'){
   const limit=integer(url.searchParams.get('limit'),1,100,100);
   const rows=(await env.DB.prepare(`SELECT id,title,author,privacy,date_label,created_at,answered
    FROM community_inquiries ORDER BY created_at DESC LIMIT ?`).bind(limit).all()).results||[];
   return privateJSON({ok:true,inquiries:rows.map(publicInquiryRow)});
  }
  if(route==='inquiries'&&method==='POST'){
   await rateLimit(request,env,'community-inquiry-create',5,600);
   const b=await readBody(request,20000),title=text(b.title,120),author=text(b.author,40)||'익명',content=text(b.content,5000),privacy=b.privacy==='private'?'private':'public',password=text(b.password,128);
   if(!title||!content)fail(400,'INQUIRY_REQUIRED','제목과 질문 내용을 입력해 주세요.');
   if(privacy==='private'&&(password.length<4||password.length>128))fail(400,'PASSWORD_REQUIRED','비공개 질문 비밀번호는 4~128자로 입력해 주세요.');
   const id=crypto.randomUUID(),now=Date.now(),pw=privacy==='private'?await makePasswordRecord(password):null;
   await env.DB.prepare(`INSERT INTO community_inquiries(id,title,author,content,privacy,password_salt,password_hash,password_iterations,date_label,created_at,source)
    VALUES(?,?,?,?,?,?,?,?,?,?, 'server')`).bind(id,title,author,content,privacy,pw?.salt||null,pw?.hash||null,pw?.iterations||null,dateLabel(now),now).run();
   return privateJSON({ok:true,id},201);
  }

  let m=route.match(/^inquiries\/([-a-zA-Z0-9_.:]{1,160})$/);
  if(m&&method==='GET'){
   const r=await env.DB.prepare('SELECT * FROM community_inquiries WHERE id=?').bind(m[1]).first();if(!r)fail(404,'INQUIRY_NOT_FOUND','질문을 찾지 못했습니다.');
   if(r.privacy==='private')return privateJSON({ok:true,inquiry:publicInquiryRow(r),locked:true});
   return privateJSON({ok:true,inquiry:inquiryDetail(r),locked:false});
  }
  m=route.match(/^inquiries\/([-a-zA-Z0-9_.:]{1,160})\/open$/);
  if(m&&method==='POST'){
   await rateLimit(request,env,'community-inquiry-open:'+m[1],12,600);
   const b=await readBody(request,2000),password=text(b.password,128);
   const r=await env.DB.prepare('SELECT * FROM community_inquiries WHERE id=?').bind(m[1]).first();if(!r)fail(404,'INQUIRY_NOT_FOUND','질문을 찾지 못했습니다.');
   if(r.privacy!=='private')return privateJSON({ok:true,inquiry:inquiryDetail(r),locked:false});
   if(!password||!(await verifyPassword(password,r)))fail(403,'BAD_INQUIRY_PASSWORD','비밀번호가 올바르지 않습니다.');
   return privateJSON({ok:true,inquiry:inquiryDetail(r),locked:false});
  }

  if(route==='chat/session'&&method==='GET'){
   const s=await chatSession(request,env);return privateJSON({ok:true,user:s?{id:s.user_id,nickname:s.nickname}:null});
  }
  if(route==='chat/session'&&method==='POST'){
   await rateLimit(request,env,'community-chat-login',15,600);
   const b=await readBody(request,4000),nickname=text(b.nickname,24),password=text(b.password,128);
   if(nickname.length<2)fail(400,'NICKNAME_REQUIRED','닉네임은 2자 이상 입력해 주세요.');
   if(password.length<4||password.length>128)fail(400,'PASSWORD_REQUIRED','비밀번호는 4~128자로 입력해 주세요.');
   let u=await env.DB.prepare('SELECT * FROM community_chat_users WHERE nickname=? COLLATE NOCASE').bind(nickname).first(),now=Date.now();
   if(u){
    if(u.disabled)fail(403,'CHAT_USER_DISABLED','현재 채팅방을 이용할 수 없습니다.');
    if(!(await verifyPassword(password,u)))fail(403,'BAD_CHAT_PASSWORD','비밀번호가 올바르지 않습니다.');
   }else{
    const pw=await makePasswordRecord(password),id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO community_chat_users(id,nickname,password_salt,password_hash,password_iterations,created_at) VALUES(?,?,?,?,?,?)').bind(id,nickname,pw.salt,pw.hash,pw.iterations,now).run();
    u=await env.DB.prepare('SELECT * FROM community_chat_users WHERE id=?').bind(id).first();
   }
   const token=randomToken(),h=await hash(token),life=7*86400000;
   await env.DB.batch([
    env.DB.prepare('DELETE FROM community_chat_sessions WHERE user_id=? AND expires_at<=?').bind(u.id,now),
    env.DB.prepare('INSERT INTO community_chat_sessions(token_hash,user_id,created_at,expires_at,device_label) VALUES(?,?,?,?,?)').bind(h,u.id,now,now+life,deviceLabel(request)),
    env.DB.prepare('DELETE FROM community_chat_sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM community_chat_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 5)').bind(u.id,u.id)
   ]);
   return privateJSON({ok:true,user:{id:u.id,nickname:u.nickname}},200,{'Set-Cookie':cookieHeader(CHAT_COOKIE,token,Math.floor(life/1000))});
  }
  if(route==='chat/logout'&&method==='POST'){
   const token=cookie(request,CHAT_COOKIE);if(token&&/^[-\w]{43}$/.test(token))await env.DB.prepare('DELETE FROM community_chat_sessions WHERE token_hash=?').bind(await hash(token)).run();
   return privateJSON({ok:true},200,{'Set-Cookie':clearChatCookie()});
  }
  if(route==='chat/messages'&&method==='GET'){
   const limit=integer(url.searchParams.get('limit'),1,200,120);
   const rows=(await env.DB.prepare('SELECT id,user_id,author,content,created_at FROM community_chat_messages ORDER BY created_at DESC LIMIT ?').bind(limit).all()).results||[];
   rows.reverse();return privateJSON({ok:true,messages:rows});
  }
  if(route==='chat/messages'&&method==='POST'){
   await rateLimit(request,env,'community-chat-send',90,300);
   const s=await chatSession(request,env);if(!s)fail(401,'CHAT_LOGIN_REQUIRED','채팅방에 다시 입장해 주세요.');
   const b=await readBody(request,5000),content=text(b.content,1000);
   if(!content)fail(400,'MESSAGE_REQUIRED','메시지를 입력해 주세요.');
   const banned=['씨발','병신'];if(banned.some(w=>content.includes(w)))fail(400,'MESSAGE_BLOCKED','부적절한 표현이 포함되어 전송할 수 없습니다.');
   const id=crypto.randomUUID(),now=Date.now();
   await env.DB.prepare("INSERT INTO community_chat_messages(id,user_id,author,content,created_at,source) VALUES(?,?,?,?,?,'server')").bind(id,s.user_id,s.nickname,content,now).run();
   return privateJSON({ok:true,message:{id,user_id:s.user_id,author:s.nickname,content,created_at:now}},201);
  }
  fail(404,'COMMUNITY_NOT_FOUND','요청한 커뮤니티 기능을 찾을 수 없습니다.');
 }catch(e){return safeError(e);}
}
