import {HttpError,fail,hash,readBody} from './security.mjs';

const FIREBASE_VISITS='https://mysuneung-default-rtdb.firebaseio.com/visits.json';
const ALLOWED_ORIGINS=new Set([
 'https://mysuneung.com',
 'https://www.mysuneung.com',
 'https://universitypredict.com',
 'https://www.universitypredict.com'
]);
const SOURCES=new Set(['main','cbt','university']);

function kstKeys(ms=Date.now()){
 const d=new Date(ms+9*3600000);
 const y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,'0'),day=String(d.getUTCDate()).padStart(2,'0');
 return {day:y+'-'+m+'-'+day,month:y+'-'+m};
}
function cors(origin){
 return {
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
  'Access-Control-Max-Age':'600',
  'Cache-Control':'no-store, max-age=0',
  'Vary':'Origin',
  'X-Content-Type-Options':'nosniff'
 };
}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...cors(origin)}});}
function originFor(request){
 const h=request.headers.get('Origin');
 const origin=h||new URL(request.url).origin;
 if(!ALLOWED_ORIGINS.has(origin))fail(403,'VISIT_ORIGIN','허용되지 않은 방문 출처입니다.');
 return origin;
}
function cleanCount(v){v=Number(v);return Number.isFinite(v)&&v>=0?Math.floor(v):0;}
async function readFirebase(fetcher){
 const r=await fetcher(FIREBASE_VISITS,{headers:{'Cache-Control':'no-cache'}});
 if(!r.ok)throw new Error('VISIT_COUNTER_READ_'+r.status);
 const d=await r.json()||{};
 return d&&typeof d==='object'?d:{};
}
async function bumpFirebase(fetcher,day,month){
 for(let i=0;i<5;i++){
  const r=await fetcher(FIREBASE_VISITS,{headers:{'X-Firebase-ETag':'true','Cache-Control':'no-cache'}});
  if(!r.ok)throw new Error('VISIT_COUNTER_READ_'+r.status);
  const etag=r.headers.get('ETag');
  if(!etag)throw new Error('VISIT_COUNTER_ETAG_MISSING');
  const d=await r.json()||{};
  const today=(d.lastUpdateDate===day?cleanCount(d.today):0)+1;
  const monthly=(d.lastUpdateMonth===month?cleanCount(d.month):0)+1;
  const next={...d,today,month:monthly,lastUpdateDate:day,lastUpdateMonth:month};
  const w=await fetcher(FIREBASE_VISITS,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(next)});
  if(w.status===412)continue;
  if(!w.ok)throw new Error('VISIT_COUNTER_WRITE_'+w.status);
  return {today,month:monthly};
 }
 throw new Error('VISIT_COUNTER_CONFLICT');
}
function countsFor(d,day,month){
 return {today:d.lastUpdateDate===day?cleanCount(d.today):0,month:d.lastUpdateMonth===month?cleanCount(d.month):0};
}
async function fingerprint(request,env,day){
 const h=request.headers;
 const raw=[
  day,
  h.get('CF-Connecting-IP')||'local',
  h.get('User-Agent')||'',
  h.get('Accept-Language')||'',
  h.get('Sec-CH-UA')||'',
  h.get('Sec-CH-UA-Platform')||'',
  h.get('Sec-CH-UA-Mobile')||''
 ].join('\n');
 return hash((env.RATE_SALT||'development-only')+':visitor-v2:'+raw);
}

export async function handleVisit(request,env,fetcher=fetch){
 let origin;
 try{
  origin=originFor(request);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(request.method!=='POST')return json({ok:false,code:'METHOD',error:'POST 요청만 허용합니다.'},405,origin);
  const body=await readBody(request,2000);
  const source=String(body.source||'');
  if(!SOURCES.has(source))fail(400,'VISIT_SOURCE','방문 출처를 확인할 수 없습니다.');
  const already=body.already_counted===true;
  const {day,month}=kstKeys();
  const id=await fingerprint(request,env,day);
  const now=Date.now();
  const insert=await env.DB.prepare('INSERT OR IGNORE INTO visitor_daily(day,visitor_hash,first_seen,first_source,counted) VALUES(?,?,?,?,?)').bind(day,id,now,source,already?1:0).run();
  const inserted=Number(insert.meta?.changes||0)>0;

  if(!inserted&&already){
   await env.DB.prepare('UPDATE visitor_daily SET counted=1 WHERE day=? AND visitor_hash=? AND counted=0').bind(day,id).run();
  }

  let claimant=false;
  if(!already){
   const claim=await env.DB.prepare('UPDATE visitor_daily SET counted=2 WHERE day=? AND visitor_hash=? AND counted=0').bind(day,id).run();
   claimant=Number(claim.meta?.changes||0)>0;
  }

  let counts;
  if(claimant){
   try{
    counts=await bumpFirebase(fetcher,day,month);
    await env.DB.prepare('UPDATE visitor_daily SET counted=1 WHERE day=? AND visitor_hash=?').bind(day,id).run();
   }catch(e){
    await env.DB.prepare('UPDATE visitor_daily SET counted=0 WHERE day=? AND visitor_hash=? AND counted=2').bind(day,id).run();
    throw e;
   }
  }else{
   counts=countsFor(await readFirebase(fetcher),day,month);
  }
  return json({ok:true,day,month_key:month,today:counts.today,month:counts.month,counted:claimant,duplicate:!claimant},200,origin);
 }catch(e){
  const status=e instanceof HttpError?e.status:503,code=e instanceof HttpError?e.code:'VISIT_TEMPORARY_FAILURE';
  return json({ok:false,code,error:e instanceof HttpError?e.message:'방문자 집계를 잠시 후 다시 시도합니다.'},status,origin&&ALLOWED_ORIGINS.has(origin)?origin:'https://mysuneung.com');
 }
}
