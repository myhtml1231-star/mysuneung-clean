import { createRemoteJWKSet, jwtVerify } from 'jose';
export const SESSION_COOKIE='__Host-msn-session';
export const LOGIN_COOKIE='__Host-msn-login';
export const CONSENT_VERSION='2026-09-27.accounts.v1';
export class HttpError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
export const fail=(status,code,message)=>{throw new HttpError(status,code,message);};
const enc=new TextEncoder();
export function randomToken(){const a=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...a)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length||a.length>512)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export function cookie(req,name){const cs=(req.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));return cs.length===1?cs[0].slice(name.length+1):null;}
export const cookieHeader=(name,value,age)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
export const sessionCSRF=t=>hash('mysuneung-csrf-v1:'+t);
export function originGuard(req,env){
 const url=new URL(req.url),allowed=env.SITE_ORIGIN||'https://mysuneung.com';
 if(url.origin!==allowed)fail(403,'ORIGIN','허용되지 않은 주소입니다.');
 const origin=req.headers.get('Origin'),site=req.headers.get('Sec-Fetch-Site');
 if(!['GET','HEAD'].includes(req.method) && origin!==allowed)fail(403,'ORIGIN','요청 출처를 확인하지 못했습니다.');
 if(site==='cross-site')fail(403,'ORIGIN','다른 사이트의 요청은 허용하지 않습니다.');
}
export async function readBody(req,max=512*1024){
 if(!(req.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))fail(415,'CONTENT_TYPE','JSON 요청만 허용합니다.');
 const len=Number(req.headers.get('Content-Length'));if(len>max)fail(413,'TOO_LARGE','한 번에 전송할 수 있는 크기를 초과했습니다.');
 const reader=req.body?.getReader();let size=0,chunks=[];
 if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,'TOO_LARGE','전송할 데이터가 너무 큽니다.');}chunks.push(value);}
 try{const out=new Uint8Array(size);let n=0;for(const x of chunks){out.set(x,n);n+=x.length;}const j=JSON.parse(new TextDecoder().decode(out));if(!j||typeof j!=='object'||Array.isArray(j))throw Error();return j;}catch(e){if(e instanceof HttpError)throw e;fail(400,'BAD_JSON','요청 형식을 확인해 주세요.');}
}
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),{timeoutDuration:8000,cooldownDuration:30000,cacheMaxAge:3600000});
async function identityClaims(token,env,keyset,recent){
 if(typeof token!=='string'||token.length>12000)fail(401,'LOGIN_REQUIRED','다시 로그인해 주세요.');
 let p;
 try{({payload:p}=await jwtVerify(token,keyset,{algorithms:['RS256'],audience:env.FIREBASE_PROJECT_ID||'mysuneung',issuer:'https://securetoken.google.com/'+(env.FIREBASE_PROJECT_ID||'mysuneung'),clockTolerance:5,requiredClaims:['exp','iat','auth_time','sub','aud','iss']}));}
 catch{fail(401,'INVALID_IDENTITY','로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');}
 const now=Math.floor(Date.now()/1000);
 if(typeof p.sub!=='string'||!p.sub||p.sub.length>128||typeof p.auth_time!=='number'||p.auth_time>now+5||typeof p.iat!=='number'||p.iat>now+5)fail(401,'INVALID_IDENTITY','로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
 if(recent&&now-p.auth_time>300)fail(401,'RECENT_LOGIN_REQUIRED','보안을 위해 다시 로그인해 주세요.');
 const provider=p.firebase?.sign_in_provider;
 if(!['google.com','password'].includes(provider)||typeof p.email!=='string'||p.email.length>254)fail(403,'PROVIDER_NOT_ALLOWED','지원하는 로그인 방법을 선택해 주세요.');
 if(p.email_verified!==true)fail(403,'EMAIL_NOT_VERIFIED','이메일을 인증한 뒤 다시 로그인해 주세요.');
 return {uid:p.sub,email:p.email,name:typeof p.name==='string'?p.name.slice(0,40):'수험생',auth_time:p.auth_time,provider};
}
export const verifyIdentity=(token,env,keyset=googleKeys)=>identityClaims(token,env,keyset,true);
export const verifyIdentityAccess=(token,env,keyset=googleKeys)=>identityClaims(token,env,keyset,false);
export function privateJSON(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private, max-age=0','Pragma':'no-cache','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});}
export async function sessionFor(req,env,write=false){
 const token=cookie(req,SESSION_COOKIE);if(!token||!/^[-\w]{43}$/.test(token))fail(401,'LOGIN_REQUIRED','로그인이 필요합니다.');
 const h=await hash(token),now=Date.now();
 const s=await env.DB.prepare(`SELECT s.*,a.firebase_uid,a.email,a.display_name,a.consent_version,a.auth_provider FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0`).bind(h,now).first();
 if(!s)fail(401,'LOGIN_REQUIRED','로그인이 만료됐습니다. 다시 로그인해 주세요.');
 if(req.headers.get('X-MSN-Account')!==s.account_id && new URL(req.url).pathname!=='/api/account/session')fail(409,'ACCOUNT_CHANGED','다른 탭에서 계정이 바뀌었습니다. 다시 연결해 주세요.');
 if(write&&!equal(req.headers.get('X-MSN-CSRF'),await sessionCSRF(token)))fail(403,'CSRF','요청 확인 정보가 만료됐습니다. 새로고침해 주세요.');
 return {...s,csrf:await sessionCSRF(token)};
}
export async function rateLimit(req,env,scope,max,seconds,account=''){
 const now=Date.now(),window=Math.floor(now/(seconds*1000)),ip=req.headers.get('CF-Connecting-IP')||'local';
 const id=await hash((env.RATE_SALT||'development-only')+':'+scope+':'+(account||ip)+':'+window);
 const r=await env.DB.prepare(`INSERT INTO account_rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`).bind(id,(window+1)*seconds*1000).first();
 if(r.count>max)fail(429,'RATE_LIMIT','요청이 많습니다. 잠시 후 다시 시도해 주세요.');
}
