// First-party account linking. Single-use code + SHA-256 PKCE; no token in redirect URLs.
import {fail,randomToken,hash,readBody,privateJSON,rateLimit,sessionCSRF} from './security.mjs';
export const BRIDGE_CLIENT='universitypredict';
export const BRIDGE_CALLBACK='https://universitypredict.com/account/callback';
const tokenRE=/^[A-Za-z0-9_-]{43}$/;
export async function challenge(verifier){
 const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export async function authorizeBridge(request,env,session){
 await rateLimit(request,env,'link-authorize',15,300,session.account_id);
 const b=await readBody(request,4000);
 if(b.client!==BRIDGE_CLIENT||!tokenRE.test(b.state||'')||!tokenRE.test(b.challenge||''))fail(400,'INVALID_LINK','대학 조사 사이트에서 계정 연결을 다시 시작해 주세요.');
 const code=randomToken(),now=Date.now();
 await env.DB.batch([
  env.DB.prepare('DELETE FROM account_bridge_codes WHERE expires_at<=? OR account_id=?').bind(now,session.account_id),
  env.DB.prepare('INSERT INTO account_bridge_codes(code_hash,account_id,parent_session_hash,challenge,client,expires_at,session_expires_at,auth_time) VALUES(?,?,?,?,?,?,?,?)').bind(await hash(code),session.account_id,session.token_hash,b.challenge,BRIDGE_CLIENT,now+60000,Math.min(session.expires_at,now+8*3600000),session.auth_time)
 ]);
 const redirect=new URL(BRIDGE_CALLBACK);redirect.searchParams.set('code',code);redirect.searchParams.set('state',b.state);
 return privateJSON({ok:true,redirect:redirect.href,expires_in:60});
}
export async function exchangeBridge(request,env){
 // This endpoint is a server-to-server operation, not a CORS/session cookie login.
 // Request headers cannot bypass possession of both single-use code and verifier.
 if(request.headers.has('Origin')||request.headers.has('Sec-Fetch-Site'))fail(403,'SERVER_EXCHANGE_ONLY','계정 연결을 다시 시작해 주세요.');
 await rateLimit(request,env,'link-exchange',90,300);
 const b=await readBody(request,3000);
 if(b.client!==BRIDGE_CLIENT||!tokenRE.test(b.code||'')||!tokenRE.test(b.verifier||''))fail(400,'INVALID_LINK','계정 연결 정보가 올바르지 않습니다.');
 const now=Date.now(),ch=await challenge(b.verifier);
 const row=await env.DB.prepare(`DELETE FROM account_bridge_codes WHERE code_hash=? AND client=? AND challenge=? AND expires_at>? AND session_expires_at>?
 AND EXISTS(SELECT 1 FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=account_bridge_codes.parent_session_hash AND s.account_id=account_bridge_codes.account_id AND s.expires_at>? AND a.disabled=0)
 RETURNING *`).bind(await hash(b.code),BRIDGE_CLIENT,ch,now,now,now).first();
 if(!row)fail(401,'EXPIRED_LINK','계정 연결이 만료됐거나 이미 사용됐습니다. 다시 연결해 주세요.');
 const token=randomToken(),tokenHash=await hash(token);
 await env.DB.batch([
  env.DB.prepare('INSERT INTO account_sessions(token_hash,account_id,created_at,expires_at,auth_time,device_label) VALUES(?,?,?,?,?,?)').bind(tokenHash,row.account_id,now,row.session_expires_at,row.auth_time,'대학 조사 · 연결된 브라우저'),
  env.DB.prepare('DELETE FROM account_sessions WHERE account_id=? AND token_hash NOT IN (SELECT token_hash FROM account_sessions WHERE account_id=? ORDER BY created_at DESC LIMIT 10)').bind(row.account_id,row.account_id)
 ]);
 // Only the first-party backend receives this response and sets its HttpOnly cookie.
 return privateJSON({ok:true,session_token:token,account_id:row.account_id,expires_at:row.session_expires_at});
}
