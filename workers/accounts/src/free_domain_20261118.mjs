const ACCOUNT='https://mysuneung-accounts.myhtml1231.workers.dev';
const UNIVERSITY='https://universitypredict-migration.myhtml1231.workers.dev';
const OLD_ACCOUNT='https://mysuneung.com',OLD_UNIVERSITY='https://universitypredict.com';
const ACCOUNT_HOSTS=new Set(['mysuneung.com','www.mysuneung.com',new URL(ACCOUNT).hostname]);
const originMap=new Map([[ACCOUNT,OLD_ACCOUNT],[UNIVERSITY,OLD_UNIVERSITY],[OLD_ACCOUNT,OLD_ACCOUNT],['https://www.mysuneung.com','https://www.mysuneung.com'],[OLD_UNIVERSITY,OLD_UNIVERSITY],['https://www.universitypredict.com','https://www.universitypredict.com']]);
const replaceOrigins=value=>String(value).replaceAll('https://www.mysuneung.com',ACCOUNT).replaceAll(OLD_ACCOUNT,ACCOUNT).replaceAll('https://www.universitypredict.com',UNIVERSITY).replaceAll(OLD_UNIVERSITY,UNIVERSITY);
const responseJSON=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'application/javascript; charset=utf-8',json:'application/json; charset=utf-8',pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',ico:'image/x-icon',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',woff2:'font/woff2',woff:'font/woff',mp3:'audio/mpeg',mp4:'video/mp4',wav:'audio/wav',ogg:'audio/ogg',wasm:'application/wasm',csv:'text/csv; charset=utf-8'};
async function publicStaticFetch(input,init){
 const request=input instanceof Request?new Request(input,init):new Request(input,init),u=new URL(request.url);
 if(!ACCOUNT_HOSTS.has(u.hostname))return fetch(request);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const decoded=decodeURIComponent(u.pathname),extension=decoded.split('.').at(-1).toLowerCase();
 if(!types[extension]||/^\/(?:api|workers|\.git|\.github)(?:\/|$)/.test(decoded))return new Response('Not found',{status:404});
 const path=decoded.split('/').map(encodeURIComponent).join('/'),headers=new Headers();
 for(const name of ['Accept','Range','If-Range','If-None-Match','If-Modified-Since'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
 headers.set('User-Agent','mysuneung-public-assets/20261118');
 // Public static files only: never forward sessions, authorization or form/query data.
 let response=await fetch('https://raw.githubusercontent.com/myhtml1231-star/mysuneung-clean/main'+path,{method:request.method,headers,redirect:'error'});
 const out=new Headers(response.headers);out.delete('Set-Cookie');out.set('Content-Type',types[extension]);out.set('X-Content-Type-Options','nosniff');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers:out});
}
export function freeAccountBase(createHandler,previous){
 return {...previous,async fetch(request,env,ctx){
  const u=new URL(request.url),configured={...env,SITE_ORIGIN:ACCOUNT};
  let forwarded=request,visitOrigin;
  if(u.pathname==='/api/visit'){
   visitOrigin=request.headers.get('Origin')||u.origin;
   if(!originMap.has(visitOrigin))return responseJSON({ok:false,code:'VISIT_ORIGIN',error:'허용되지 않은 방문 출처입니다.'},403);
   const h=new Headers(request.headers);if(h.has('Origin'))h.set('Origin',originMap.get(visitOrigin));
   forwarded=new Request(OLD_ACCOUNT+u.pathname+u.search,{method:request.method,headers:h,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
  }
  const response=await createHandler({fetch:publicStaticFetch}).fetch(forwarded,configured,ctx);
  if(!visitOrigin)return response;
  const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',visitOrigin);headers.set('Vary','Origin');
  return new Response(response.body,{status:response.status,headers});
 }};
}
const noticeCSS=String.raw`
#banner-popup .popup-box{max-width:430px!important;width:calc(100% - 32px)!important;max-height:90svh;overflow:auto}
#examNotice{padding:20px 10px 12px;letter-spacing:.015em;line-height:1.7}
#examNotice .exam-tabs{display:flex;gap:8px;margin:8px 0 24px}
#examNotice .exam-tabs button{flex:1;padding:10px 8px;border:1px solid #e6dfd3;background:#fff;border-radius:12px;font:inherit;cursor:pointer}
#examNotice .exam-tabs button[aria-selected=true]{background:#fff4da;border-color:#efb940;color:#7b5212;font-weight:700}
#examNotice h2{font-size:28px;line-height:1.45;letter-spacing:.02em;margin:12px 0 16px;color:#202939}
#examNotice p{font-size:15px;color:#5c6678;line-height:1.9;margin:8px 0}
#examNotice .exam-mark{font-size:42px;line-height:1.5}
#examNotice .free-address{display:block;font-size:12px;overflow-wrap:anywhere;padding:12px;margin-top:16px;border-radius:12px;background:#f8f5ef;color:#655137}
#examNotice img{max-height:54svh;width:100%;object-fit:contain}
#examNotice [hidden]{display:none!important}
#freeAddressNotice{font:inherit;font-size:13px;line-height:1.7;padding:10px 18px;background:#fff4d9;color:#70521b;text-align:center;letter-spacing:.015em;overflow-wrap:anywhere}
#freeAddressNotice a{color:inherit;font-weight:700}
`;
const noticeJS=String.raw`(()=>{'use strict';
const kstDay=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10),key='csat-2027-notice-v1-hide',popup=document.getElementById('banner-popup');
if(!popup)return;
const after=Date.now()>=Date.parse('2026-11-19T18:10:00+09:00'),title=document.getElementById('examNoticeTitle'),message=document.getElementById('examNoticeMessage');
if(title)title.textContent=after?'수능, 정말 수고 많았어요.':kstDay()==='2026-11-18'?'내일의 너를 응원해요.':'마지막까지, 너를 응원해요.';
if(message)message.textContent=after?'여기까지 달려온 모든 순간을 응원합니다. 오늘은 마음 편히 쉬어가요.':'그동안 쌓아온 시간이 힘이 될 거예요. 수험생 여러분의 하루를 응원합니다.';
const updateTabs=tab=>{for(const button of document.querySelectorAll('[data-exam-tab]'))button.setAttribute('aria-selected',String(button.dataset.examTab===tab));for(const panel of document.querySelectorAll('[data-exam-panel]'))panel.hidden=panel.dataset.examPanel!==tab;};
for(const button of document.querySelectorAll('[data-exam-tab]'))button.addEventListener('click',()=>updateTabs(button.dataset.examTab));
const hide=()=>{popup.classList.add('hidden');};
document.getElementById('today-hide')?.addEventListener('click',()=>{try{localStorage.setItem(key,kstDay());}catch{}hide();});
document.getElementById('popup-close')?.setAttribute('aria-label','안내 닫기');
document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
window.addEventListener('load',()=>{let hidden=false;try{hidden=localStorage.getItem(key)===kstDay();}catch{}popup.classList.toggle('hidden',hidden);if(!hidden)document.getElementById('popup-close')?.focus({preventScroll:true});},{once:true});
})();`;
const noticeHTML='<section id="examNotice"><div class="exam-tabs" role="tablist" aria-label="수험생 안내"><button type="button" role="tab" data-exam-tab="message" aria-selected="true">수능 응원</button><button type="button" role="tab" data-exam-tab="coffee" aria-selected="false">아메리카노 안내</button></div><div data-exam-panel="message"><div class="exam-mark" aria-hidden="true">🌿</div><h2 id="examNoticeTitle">수험생 여러분을 응원해요.</h2><p id="examNoticeMessage">그동안 달려온 모든 순간을 응원합니다.</p><a class="free-address" href="'+ACCOUNT+'/">새 무료 주소<br>mysuneung-accounts.myhtml1231.workers.dev</a><p>주소를 즐겨찾기에 저장해 주세요.</p></div><div data-exam-panel="coffee" hidden><img src="/Images/banner.png" alt="기존 아메리카노 오류 제보 행사 안내"><a href="/error-report.html">오류 제보하기 →</a></div></section>';
export function freeDomainLifecycle(application,{createHandler}){
 return {...application,async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(!ACCOUNT_HOSTS.has(u.hostname))return new Response('Not found',{status:404});
  if(u.origin!==ACCOUNT)return new Response(null,{status:308,headers:{Location:ACCOUNT+u.pathname+u.search,'Cache-Control':'no-store'}});
  const configured={...env,SITE_ORIGIN:ACCOUNT};
  if(u.pathname==='/account-assets/exam-notice-20261118.css'||u.pathname==='/account-assets/exam-notice-20261118.js'){
   const css=u.pathname.endsWith('.css'),allowed=['GET','HEAD'].includes(request.method);
   return new Response(!allowed?'Method not allowed':request.method==='HEAD'?null:css?noticeCSS:noticeJS,{status:allowed?200:405,headers:{'Content-Type':css?'text/css; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'no-cache, max-age=0',...(!allowed?{Allow:'GET, HEAD'}:{})}});
  }
  if(u.pathname.startsWith('/api/cbt/')||u.pathname.startsWith('/cbt-data/')||u.pathname.startsWith('/mixed-cbt')){
   if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==ACCOUNT)return responseJSON({error:'허용되지 않은 요청 출처입니다.'},403);
   if(u.pathname!=='/api/cbt/health'){
    const sessionRequest=new Request(ACCOUNT+'/api/account/session',{headers:request.headers});
    const sessionResponse=await createHandler({fetch:publicStaticFetch}).fetch(sessionRequest,configured,ctx);
    let session;try{session=await sessionResponse.json();}catch{}
    if(sessionResponse.status!==200||!session?.user){
     if(['GET','HEAD'].includes(request.method)&&u.pathname.startsWith('/mixed-cbt'))return new Response(null,{status:303,headers:{Location:'/auth?returnTo='+encodeURIComponent(u.pathname+u.search),'Cache-Control':'no-store, private'}});
     return responseJSON({error:'로그인한 뒤 이용해 주세요.',code:'LOGIN_REQUIRED'},401);
    }
   }
   if(!env.CBT_SERVICE)return responseJSON({error:'CBT 연결을 확인하고 있습니다.'},503);
   const response=await env.CBT_SERVICE.fetch(request),headers=new Headers(response.headers);headers.set('Cache-Control','no-store, private');
   return new Response(response.body,{status:response.status,headers});
  }
  const extension=decodeURIComponent(u.pathname).split('.').at(-1).toLowerCase();
  const staticFile=types[extension]&&!/^\/(?:api|auth|account-assets|site-content|workers|\.git|\.github)(?:\/|$)/.test(u.pathname)&&['GET','HEAD'].includes(request.method);
  let response=staticFile?await publicStaticFetch(request):await application.fetch(request,configured,ctx),headers=new Headers(response.headers);
  if(headers.has('Location'))headers.set('Location',replaceOrigins(headers.get('Location')));
  if(u.pathname==='/api/account/connect/authorize'&&response.ok){
   const value=await response.json(),target=new URL(value.redirect);
   if(target.origin!==OLD_UNIVERSITY||target.pathname!=='/account/callback')return responseJSON({error:'연결 주소를 확인하지 못했습니다.'},503);
   target.protocol='https:';target.host=new URL(UNIVERSITY).host;value.redirect=target.href;headers.delete('Content-Length');headers.delete('ETag');
   return new Response(JSON.stringify(value),{status:response.status,headers});
  }
  const type=headers.get('Content-Type')||'';
  if(request.method!=='HEAD'&&response.status===200&&/text\/html|javascript|text\/css|application\/xml/.test(type)){
   let text=replaceOrigins(await response.text());headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');headers.delete('Last-Modified');
   if(type.includes('text/html')&&['/','/index.html'].includes(u.pathname)){
    text=text.replace(/<img\b[^>]*src=["'](?:\.\/|\/)?Images\/banner\.png["'][^>]*>/i,noticeHTML);
    text=text.replace(/<\/head>/i,'<link rel="stylesheet" href="/account-assets/exam-notice-20261118.css"><script defer src="/account-assets/exam-notice-20261118.js"></script></head>');
    text=text.replace(/<body([^>]*)>/i,'<body$1><aside id="freeAddressNotice">새 무료 주소로 이전했어요. <a href="'+ACCOUNT+'/">주소 저장하기 →</a></aside>');
   }
   return new Response(text,{status:response.status,headers});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }};
}
