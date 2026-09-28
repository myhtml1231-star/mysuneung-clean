import {authorizeBridge,exchangeBridge} from './bridge.mjs';
import { HttpError,fail,randomToken,hash,cookie,cookieHeader,SESSION_COOKIE,LOGIN_COOKIE,CONSENT_VERSION,sessionCSRF,originGuard,readBody,verifyIdentity,privateJSON,sessionFor,rateLimit } from './security.mjs';
import { KINDS,text,integer,applyOperations,pullRecords,pack,reconstruct } from './records.mjs';
import firebaseConfig from '../public/account-assets/firebase-config.json';
import {handleVisit} from './visits.mjs';
export const VERSION='2026-09-27.accounts.v1.2';
export const CLIENT_REVISION='accounts-ui-20260927-r5';
const publicUser=s=>({id:s.account_id||s.id,name:s.display_name,email:s.email,consent_version:s.consent_version,provider:s.auth_provider||'google.com'});
const pageHeaders={
 'Cache-Control':'no-store, private, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
 'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src https://mysuneung.firebaseapp.com https://accounts.google.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
function clearCookie(){return cookieHeader(SESSION_COOKIE,'',0);}
function deviceLabel(req){const s=req.headers.get('User-Agent')||'';return (/Edg\//.test(s)?'Edge':/Firefox\//.test(s)?'Firefox':/Chrome\//.test(s)?'Chrome':/Safari\//.test(s)?'Safari':'브라우저')+' · '+(/Android/.test(s)?'Android':/iPhone|iPad/.test(s)?'iOS':/Windows/.test(s)?'Windows':/Mac OS/.test(s)?'Mac':'기타 기기');}
// Dependency injection is used exclusively by module tests. No request/header/env flag can bypass verification.
export function createHandler(deps={}){
 const verify=deps.verifyIdentity||verifyIdentity,externalFetch=deps.fetch||fetch;
 return {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.hostname==='www.mysuneung.com')return Response.redirect('https://mysuneung.com'+url.pathname+url.search,308);
  if(url.pathname==='/api/visit')return handleVisit(request,env,externalFetch);
  if(url.pathname.startsWith('/api/account/')){
   try{
    const route=url.pathname.slice('/api/account/'.length),method=request.method;
    if(route==='connect/exchange' && method==='POST'){
      if(url.origin!==(env.SITE_ORIGIN||'https://mysuneung.com'))fail(403,'ORIGIN','허용되지 않은 주소입니다.');
      return await exchangeBridge(request,env);
    }
    originGuard(request,env);
    if(route==='health'&&method==='GET')return privateJSON({ok:true,version:VERSION,client_revision:CLIENT_REVISION,auth:'firebase-google-and-verified-email',storage:'cloudflare-d1',ready:!!env.DB});
    if(route==='config'&&method==='GET'){
     const nonce=randomToken();return privateJSON({ok:true,version:VERSION,consent_version:CONSENT_VERSION,firebase:firebaseConfig,providers:['google.com','password'],login_csrf:nonce},200,{'Set-Cookie':cookieHeader(LOGIN_COOKIE,nonce,600)});
    }
    if(route==='session'&&method==='GET'){
     try{const s=await sessionFor(request,env);return privateJSON({ok:true,user:publicUser(s),csrf:s.csrf,expires_at:s.expires_at});}
     catch(e){if(e instanceof HttpError&&e.status===401)return privateJSON({ok:true,user:null},200,{'Set-Cookie':clearCookie()});throw e;}
    }
    if(route==='session'&&method==='POST'){
     await rateLimit(request,env,'login',15,300);
     const nonce=cookie(request,LOGIN_COOKIE),provided=request.headers.get('X-MSN-Login-CSRF');if(!nonce||nonce!==provided||!/^[-\w]{43}$/.test(nonce))fail(403,'LOGIN_CSRF','로그인 화면을 새로고침한 뒤 다시 시도해 주세요.');
     const body=await readBody(request,16000),identity=await verify(body.id_token,env);
     let a=await env.DB.prepare('SELECT * FROM accounts WHERE firebase_uid=?').bind(identity.uid).first();
     if(a?.disabled)fail(403,'ACCOUNT_DISABLED','현재 사용할 수 없는 계정입니다.');
     if(!a){
      if(body.consent_version!==CONSENT_VERSION||body.over14!==true||body.accept_privacy!==true)fail(422,'CONSENT_REQUIRED','계정 생성에 필요한 안내를 확인하고 동의해 주세요.');
      const id=crypto.randomUUID(),now=Date.now(),name=text(body.name,32)||text(identity.name,32)||'수험생';
      await env.DB.prepare(`INSERT INTO accounts(id,firebase_uid,email,display_name,provider,consent_version,consent_at,created_at,updated_at,auth_provider) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(firebase_uid) DO NOTHING`).bind(id,identity.uid,identity.email,name,'google.com',CONSENT_VERSION,now,now,now,identity.provider).run();
      a=await env.DB.prepare('SELECT * FROM accounts WHERE firebase_uid=?').bind(identity.uid).first();
     }
     if(a.email!==identity.email)await env.DB.prepare('UPDATE accounts SET email=?,updated_at=? WHERE id=?').bind(identity.email,Date.now(),a.id).run();
     const token=randomToken(),h=await hash(token),life=body.remember===true?7*86400000:8*3600000,now=Date.now(),old=cookie(request,SESSION_COOKIE);
     const statements=[env.DB.prepare('DELETE FROM account_sessions WHERE account_id=? AND expires_at<=?').bind(a.id,now)];
     if(old)statements.push(env.DB.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await hash(old)));
     statements.push(env.DB.prepare('INSERT INTO account_sessions(token_hash,account_id,created_at,expires_at,auth_time,device_label) VALUES(?,?,?,?,?,?)').bind(h,a.id,now,now+life,identity.auth_time,deviceLabel(request)));
     statements.push(env.DB.prepare('DELETE FROM account_sessions WHERE account_id=? AND token_hash NOT IN (SELECT token_hash FROM account_sessions WHERE account_id=? ORDER BY created_at DESC LIMIT 10)').bind(a.id,a.id));
     await env.DB.batch(statements);
     const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Vary':'Cookie','X-Content-Type-Options':'nosniff'});
     headers.append('Set-Cookie',cookieHeader(SESSION_COOKIE,token,Math.floor(life/1000)));headers.append('Set-Cookie',cookieHeader(LOGIN_COOKIE,'',0));
     return new Response(JSON.stringify({ok:true,user:{...publicUser(a),email:identity.email},csrf:await sessionCSRF(token),expires_at:now+life}),{headers});
    }
    const write=!['GET','HEAD'].includes(method);const s=await sessionFor(request,env,write);
    await rateLimit(request,env,'authenticated',360,300,s.account_id);
    if(route==='connect/authorize'&&method==='POST')return await authorizeBridge(request,env,s);
    if(route==='logout'&&method==='POST'){
     const b=await readBody(request,2000);await env.DB.prepare(b.all===true?'DELETE FROM account_sessions WHERE account_id=?':'DELETE FROM account_sessions WHERE token_hash=?').bind(b.all===true?s.account_id:s.token_hash).run();return privateJSON({ok:true},200,{'Set-Cookie':clearCookie()});
    }
    if(route==='sessions'&&method==='GET'){
     const r=await env.DB.prepare('SELECT token_hash,created_at,expires_at,device_label FROM account_sessions WHERE account_id=? AND expires_at>? ORDER BY created_at DESC').bind(s.account_id,Date.now()).all();
     return privateJSON({ok:true,sessions:r.results.map(r=>({current:r.token_hash===s.token_hash,created_at:r.created_at,expires_at:r.expires_at,device:r.device_label}))});
    }
    if(route==='profile'&&method==='PATCH'){
     const b=await readBody(request,4000),name=text(b.name,32);if(!name)fail(400,'NAME_REQUIRED','표시할 이름을 입력해 주세요.');await env.DB.prepare('UPDATE accounts SET display_name=?,updated_at=? WHERE id=?').bind(name,Date.now(),s.account_id).run();return privateJSON({ok:true,user:{...publicUser(s),name}});
    }
    if(route==='records'&&method==='GET'){
     const after=integer(url.searchParams.get('after'),0,Number.MAX_SAFE_INTEGER,0);return privateJSON({ok:true,...await pullRecords(env,s.account_id,after,100)});
    }
    if(route==='records/batch'&&method==='POST'){
     const b=await readBody(request);const results=await applyOperations(env,s.account_id,b.operations);return privateJSON({ok:true,results});
    }
    if(route==='summary'&&method==='GET'){
     const r=await env.DB.prepare('SELECT kind,COUNT(*) AS count FROM account_records WHERE account_id=? AND deleted=0 GROUP BY kind').bind(s.account_id).all();const size=await env.DB.prepare('SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) AS bytes FROM account_records WHERE account_id=?').bind(s.account_id).first();return privateJSON({ok:true,counts:Object.fromEntries(r.results.map(x=>[x.kind,x.count])),bytes:size.bytes,byte_limit:10485760,record_limit:3000});
    }
    if(route.startsWith('replay/')&&method==='GET'){
     const id=route.slice(7),kind=url.searchParams.get('kind')==='draft'?'draft':'attempt';if(!/^[-a-zA-Z0-9_.:]{1,160}$/.test(id))fail(400,'BAD_ID','기록 번호가 올바르지 않습니다.');
     const r=await env.DB.prepare('SELECT * FROM account_records WHERE account_id=? AND kind=? AND record_id=? AND deleted=0').bind(s.account_id,kind,id).first();if(!r)fail(404,'NOT_FOUND','이 계정에서 해당 풀이 기록을 찾지 못했습니다.');return privateJSON({ok:true,...await reconstruct(env,pack(r))});
    }
    if(route==='delete'&&method==='POST'){
     const b=await readBody(request,16000);if(b.confirm!=='계정 삭제')fail(400,'CONFIRM_REQUIRED','계정 삭제 확인 문구를 입력해 주세요.');const identity=await verify(b.id_token,env);if(identity.uid!==s.firebase_uid)fail(403,'IDENTITY_MISMATCH','현재 로그인한 계정으로 다시 확인해 주세요.');
     // Delete Firebase identity first. Never report success until both providers have acknowledged.
     const r=await externalFetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key='+firebaseConfig.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:b.id_token})});
     if(!r.ok)fail(502,'IDENTITY_DELETE_FAILED','인증 계정 삭제를 완료하지 못했습니다. 데이터는 아직 보관되어 있습니다.');
     await env.DB.prepare('DELETE FROM accounts WHERE id=?').bind(s.account_id).run();return privateJSON({ok:true,deleted:true},200,{'Set-Cookie':clearCookie()});
    }
    fail(404,'NOT_FOUND','요청한 기능을 찾을 수 없습니다.');
   }catch(e){
    if(e instanceof HttpError)return privateJSON({ok:false,code:e.code,error:e.message},e.status,e.status===429?{'Retry-After':'60'}:{});
    // Never log request bodies, tokens, personal notes or database result rows.
    console.error('ACCOUNT_REQUEST_FAILED',e?.name||'Error');return privateJSON({ok:false,code:'TEMPORARY_FAILURE',error:'계정 서버에 일시적인 문제가 있습니다. 저장 대기 중인 기록은 이 기기에 남겨 둡니다.'},503);
   }
  }
  if(url.pathname==='/auth'||url.pathname==='/my'||url.pathname==='/account/privacy'||url.pathname==='/account/terms'||url.pathname==='/account/connect'){
   const file=url.pathname==='/account/connect'?'connect.html':url.pathname==='/auth'?'auth.html':url.pathname==='/my'?'workspace.html':url.pathname.endsWith('privacy')?'privacy.html':'terms.html';
   const r=await env.ASSETS.fetch(new Request(new URL('/account-assets/'+file,url)));const h=new Headers(r.headers);for(const [k,v] of Object.entries(pageHeaders))h.set(k,v);return new Response(r.body,{status:r.status,headers:h});
  }
  if(url.pathname.startsWith('/account-assets/')){
   const r=await env.ASSETS.fetch(request),h=new Headers(r.headers);h.set('X-Content-Type-Options','nosniff');h.set('Cache-Control',url.pathname.endsWith('.js')?'no-cache, max-age=0':'public, max-age=300');return new Response(r.body,{status:r.status,headers:h});
  }
  // Transparent public-page integration. Do not forward private session cookies to the static origin.
  const forwarded=new Request(request);if((request.headers.get('Accept')||'').includes('text/html')||url.pathname.endsWith('.html')||url.pathname==='/'){forwarded.headers.delete('If-None-Match');forwarded.headers.delete('If-Modified-Since');}const cookies=(forwarded.headers.get('Cookie')||'').split(';').filter(c=>!c.trim().startsWith('__Host-msn-')).join(';');if(cookies.trim())forwarded.headers.set('Cookie',cookies);else forwarded.headers.delete('Cookie');
  const response=await externalFetch(forwarded);
  if(request.method!=='GET'||!(response.headers.get('Content-Type')||'').includes('text/html')||response.status>=400)return response;
  const h=new Headers(response.headers);h.delete('Content-Length');h.delete('ETag');h.delete('Last-Modified');h.set('Cache-Control','public, max-age=60');
  // App-specific /mixed-cbt routes remain with their existing Worker and get the same script in its R2 HTML.
  return new HTMLRewriter().on('head',{element(e){e.append('<script src="/account-assets/visit.js?v=visitor-v2" data-visit-source="main" defer></script><script src="/account-assets/store.js?v=accounts-ui-20260927-r5" defer></script><script src="/account-assets/navigation.js?v=accounts-ui-20260927-r5" defer></script>',{html:true});}}).transform(new Response(response.body,{status:response.status,headers:h}));
 },
 async scheduled(event,env){const now=Date.now();await env.DB.batch([env.DB.prepare('DELETE FROM account_sessions WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM account_rate_limits WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM account_bridge_codes WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM visitor_daily WHERE first_seen<?').bind(now-45*86400000)]);}
 };
}
export default createHandler();
