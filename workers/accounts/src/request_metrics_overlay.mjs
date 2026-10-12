import original from './admin_base.mjs';
const clientScript="(()=>{const metric=document.getElementById('metricUniversityRequests');if(!metric)return;async function refresh(){const account=window.MSNAccount;if(!account)return;await account.ready;if(!account.info().user)return;try{const data=await account.api('admin/requests');if(!Number.isSafeInteger(data.total)||data.total<0)throw Error();metric.textContent=data.total.toLocaleString('ko-KR');metric.title='집계 시작: '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(data.started_at))+' · 자동 요청 포함';}catch{metric.textContent='—';metric.title='요청 수를 불러오지 못했습니다.';}}refresh();document.addEventListener('click',e=>{if(e.target.closest('#refreshAll,[data-view=\"overview\"]'))refresh();});})();";
const metricCSS=".metric-grid.metric-seven{grid-template-columns:repeat(7,minmax(0,1fr))}@media(max-width:1280px){.metric-grid.metric-seven{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:900px){.metric-grid.metric-seven{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:640px){.metric-grid.metric-seven{grid-template-columns:1fr 1fr}}";
const privateJSON=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'}});
export function createAdminRequestOverlay(base){
 return {...base,async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/api/account/admin/requests'){
   const url=new URL('/api/account/admin/me',u);
   const auth=await base.fetch(new Request(url,{method:'GET',headers:request.headers}),env,ctx);
   if(auth.status!==200)return auth;
   const permission=await auth.json();
   if(permission.ok!==true||!permission.admin)return privateJSON({error:'관리자 권한을 확인하지 못했습니다.'},403);
   if(request.method!=='GET')return privateJSON({error:'지원하지 않는 요청입니다.'},405);
   try{const response=await env.UNIVERSITY_METRICS.fetch('https://request-metrics.internal/request-total');if(!response.ok)throw Error();const data=await response.json();if(!Number.isSafeInteger(data.total)||data.total<0)throw Error();return privateJSON({ok:true,...data});}
   catch{return privateJSON({error:'요청 수를 불러오지 못했습니다.'},503);}
  }
  if(u.pathname==='/account-assets/university-request-stats.js')return new Response(request.method==='HEAD'?null:clientScript,{status:['GET','HEAD'].includes(request.method)?200:405,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-cache, max-age=0','X-Content-Type-Options':'nosniff'}});
  if(u.pathname==='/account-assets/university-request-stats.css')return new Response(request.method==='HEAD'?null:metricCSS,{status:['GET','HEAD'].includes(request.method)?200:405,headers:{'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-cache, max-age=0'}});
  const response=await base.fetch(request,env,ctx);
  if(u.pathname!=='/admin'||request.method!=='GET'||response.status!==200||!response.headers.get('Content-Type')?.includes('text/html'))return response;
  const headers=new Headers(response.headers);headers.delete('ETag');headers.delete('Content-Length');
  return new HTMLRewriter()
  .on('[data-panel="overview"] .metric-grid',{element(e){e.setAttribute('class',e.getAttribute('class')+' metric-seven');e.append('<article class="metric"><span>정시 예측 요청</span><strong id="metricUniversityRequests">—</strong><small>universitypredict.com</small></article>',{html:true});}})
  .on('head',{element(e){e.append('<link href="/account-assets/university-request-stats.css?v=r111" rel="stylesheet">',{html:true});}})
  .on('body',{element(e){e.append('<script defer src="/account-assets/university-request-stats.js?v=r111"></script>',{html:true});}})
  .transform(new Response(response.body,{status:response.status,headers}));
 }};
}
export * from './admin_base.mjs';
export default createAdminRequestOverlay(original);
