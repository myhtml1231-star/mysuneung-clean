import {isMathRecord,sanitizeMath,mathReferenceKey,mathDrawingMetadata,reconstructMath} from './math-records.mjs';
import { fail, hash } from './security.mjs';
export const KINDS=['download','attempt','draft','university','annotation','university_state'];
const REASONS=new Set(['unknown','condition','target','causality','category','sequence','over_inference','concept','application','prompt','time','selection','other']);
export function text(v,n=200){return typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n):'';}
export function safeURL(value,download=false){
 if(typeof value!=='string'||value.length>2048)fail(400,'BAD_URL','올바른 HTTPS 출처 주소를 입력해 주세요.');
 let u;try{u=new URL(value,'https://mysuneung.com');}catch{fail(400,'BAD_URL','출처 주소를 확인해 주세요.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.includes(':')||/^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname))fail(400,'BAD_URL','공개된 HTTPS 주소만 저장할 수 있습니다.');
 if(download && !(['mysuneung.com','www.mysuneung.com','ebsi.co.kr','www.ebsi.co.kr','wdown.ebsi.co.kr'].includes(u.hostname)||u.hostname.endsWith('.r2.dev')))fail(400,'BAD_DOWNLOAD_HOST','이 사이트에서 제공한 기출 파일만 보관할 수 있습니다.');
 for(const k of [...u.searchParams.keys()])if(/^utm_|^(token|id_token|access_token|refresh_token)$/i.test(k))u.searchParams.delete(k);
 u.hash='';return u.href;
}
export function refKey(d){
 const math=mathReferenceKey(d);if(math)return math;
 const s=d?.source||d||{},year=Number(d?.academic_year??s.academic_year),month=Number(d?.month??s.month),no=Number(d?.original_no),sec=d?.section_code;
 if(!Number.isInteger(year)||year<2017||year>2027||![3,5,6,7,9,11].includes(month)||!Number.isInteger(no)||no<1||no>45||!['common','hw','lm','full'].includes(sec))return null;
 return `${year}-${String(month).padStart(2,'0')}-${sec}-${String(no).padStart(2,'0')}`;
}
let dataPromise=null;
export async function cbtData(env){
 if(!dataPromise)dataPromise=Promise.all(['catalog.json','question-types.json','answers.json','categories.json'].map(async key=>{const o=await env.CBT.get(key);if(!o)throw Error('CBT_METADATA_MISSING');return JSON.parse(await o.text());})).then(([catalog,types,answers,categories])=>({catalog,rows:new Map(catalog.map(r=>[r.id,r])),types:types.questions,answers,categories:categories.units})).catch(e=>{dataPromise=null;throw e;});
 return dataPromise;
}
export function resetMetadataForTests(){dataPromise=null;}
export function answer(v){const n=Number(v);return (typeof v==='number'||typeof v==='string')&&v!==''&&Number.isInteger(n)&&n>=1&&n<=5?n:null;}
function date(v,fallback=Date.now()){const n=Number(v);return Number.isFinite(n)&&n>=1262304000000&&n<=Date.now()+300000?n:fallback;}
export async function sanitize(kind,d,id,env){
 if(!d||typeof d!=='object'||Array.isArray(d))fail(400,'BAD_RECORD','저장할 기록 형식을 확인해 주세요.');
 if(['account_id','user_id','firebase_uid'].some(k=>k in d))fail(400,'OWNER_FIELD','계정 정보는 기록에 지정할 수 없습니다.');
 if(kind==='download'){
  const url=safeURL(d.url,true);return {url,title:text(d.title,180)||decodeURIComponent(new URL(url).pathname.split('/').pop()||'기출 자료'),page:d.page?safeURL(d.page):'',at:date(d.at),subject:text(d.subject,30),year:integer(d.year,2010,2035,null),file_type:text(d.file_type,15),event:'download_link_opened'};
 }
 if(kind==='university_state'){
  if(!['favorites','compare'].includes(id)||!Array.isArray(d.items)||d.items.length>(id==='compare'?3:250))fail(400,'BAD_COLLECTION','관심 대학은 250개, 비교 대학은 3개까지 저장할 수 있습니다.');
  const seen=new Set(),items=[];
  for(const x of d.items){if(!x||typeof x.code!=='string'||!/^\d{7}$/.test(x.code)||seen.has(x.code))fail(400,'BAD_COLLECTION','대학 코드가 올바르지 않거나 중복되었습니다.');seen.add(x.code);items.push({code:x.code,name:text(x.name,100)||x.code});}
  return {items,source_kind:'universitypredict_collection'};
 }
 if(kind==='university'){
  const name=text(d.name,100);if(!name)fail(400,'NAME_REQUIRED','대학 이름을 입력해 주세요.');
  const status=['관심','조사 중','지원 검토','비교 완료'].includes(d.status)?d.status:'관심';
  return {name,university_code:/^\d{7}$/.test(d.university_code||'')?d.university_code:null,department:text(d.department,120),admission_year:integer(d.admission_year,2020,2040,new Date().getFullYear()+1),track:text(d.track,100),status,source_url:d.source_url?safeURL(d.source_url):'',note:text(d.note,5000),checked_at:date(d.checked_at),tags:Array.isArray(d.tags)?d.tags.filter(t=>typeof t==='string').slice(0,8).map(t=>text(t,24)):[],created_at:date(d.created_at),source_kind:'user_research_note'};
 }
 if((kind==='attempt'||kind==='draft')&&isMathRecord(d))return sanitizeMath(kind,d,id);
 if(kind==='attempt'||kind==='draft'){
  const raw=d.details||d.refs;if(!Array.isArray(raw)||!raw.length||raw.length>45)fail(400,'BAD_QUESTIONS','CBT 기록은 1~45문항으로 저장해야 합니다.');
  const meta=await cbtData(env),seen=new Set();let details=[];
  for(let i=0;i<raw.length;i++){
   const r=raw[i],key=refKey(r),m=key&&meta.types[key];if(!m||seen.has(key))fail(400,'BAD_REFERENCE','원문 출처가 없거나 같은 문항이 중복됐습니다.');seen.add(key);
   const [y,mo,sec,no]=key.split('-');const selected=answer(r.selected??d.answers?.[String(i+1)]);const correct=answer(meta.answers[key]);if(correct===null)fail(400,'ANSWER_MISSING','정답 자료를 확인하지 못했습니다.');
   details.push({display_no:i+1,academic_year:+y,month:+mo,section_code:sec,original_no:+no,question_key:key,unit_id:m.unit_id,selected,...(kind==='attempt'?{correct_answer:correct,is_correct:selected!==null&&selected===correct}:{}),question_type:m.type,type_group:m.type_group||(['독서론','비문학'].includes(m.area)?'독서':m.area==='문학'?'문학':m.category==='언어와 매체'?'언매':'화작'),type_id:m.type_id,analysis_eligible:m.analysis_eligible===true,review_status:m.review_status,area:m.area,category:m.category});
  }
  const reasons={};if(kind==='attempt'&&d.reasons&&typeof d.reasons==='object')for(const r of details){const x=d.reasons[r.question_key];if(x&&!r.is_correct)reasons[r.question_key]={code:REASONS.has(x.code)?x.code:'unknown',note:text(x.note,500),source:'self_report'};}
  const mode=d.mode==='full'?'full':'custom',correct=details.filter(q=>q.is_correct).length,unanswered=details.filter(q=>q.selected===null).length;
  return {id,at:date(d.at),mode,choice:['hw','lm'].includes(d.choice)?d.choice:null,years:[...new Set(details.map(q=>q.academic_year))],categories:[...new Set(details.map(q=>q.category))],details,...(kind==='attempt'?{score:correct,total:details.length,percent:Math.round(correct/details.length*100),unanswered,reasons}:{current:integer(d.current,0,details.length-1,0),startedAt:date(d.startedAt),time_limit_seconds:integer(d.time_limit_seconds,60,10800,mode==='full'?4800:1800)}),schema_version:3};
 }
 if(kind==='annotation'){
  const exam_id=text(d.exam_id,150),unit_id=text(d.unit_id,150);const mathMeta=mathDrawingMetadata(),meta=mathMeta.rows.has(unit_id)?mathMeta:await cbtData(env);if(!exam_id||!meta.rows.has(unit_id)||!Array.isArray(d.strokes)||d.strokes.length>500)fail(400,'BAD_DRAWING','필기 데이터 크기나 원문 출처를 확인해 주세요.');
  let points=0;
  const strokes=d.strokes.map(s=>{
   if(!s||!['pen','highlight','underline','eraser'].includes(s.tool)||!Array.isArray(s.points))fail(400,'BAD_DRAWING','필기 데이터가 올바르지 않습니다.');
   points+=s.points.length;if(points>16000)fail(413,'DRAWING_TOO_LARGE','필기가 많아 동기화 한도를 초과했습니다. 내보내기로 보관해 주세요.');
   const out={tool:s.tool,color:/^#[0-9a-f]{6}$/i.test(s.color)?s.color:'#202020',size:Number.isFinite(s.size)?Math.max(1,Math.min(30,s.size)):3,points:s.points.map(p=>{
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)fail(400,'BAD_DRAWING','필기 좌표가 올바르지 않습니다.');
    return {x:Math.round(p.x*100000)/100000,y:Math.round(p.y*100000)/100000};
   })};
   if(s.surface!==undefined&&!['passage','question'].includes(s.surface))fail(400,'BAD_DRAWING_SURFACE','필기 영역이 올바르지 않습니다.');
   if(s.surface==='question'){
    const row=meta.rows.get(unit_id),no=s.question_no,key=refKey({academic_year:row.year,month:row.month,section_code:row.section_code,original_no:no});
    if(!Number.isInteger(no)||!key||meta.types[key]?.unit_id!==unit_id)fail(400,'BAD_DRAWING_QUESTION','문제 필기의 원문 문항을 확인해 주세요.');
    out.surface='question';out.question_no=no;
    if(s.anchor!==undefined){
     const a=s.anchor;
     if(!a||!/^((stem)|(box-[0-9]{1,3})|(source-[0-9]{1,3})|(choice-[1-5]))$/.test(a.id)||['x','y','w','h'].some(k=>!Number.isFinite(a[k])||a[k]<0||a[k]>1)||a.w<=0||a.h<=0||a.x+a.w>1.01||a.y+a.h>1.01)fail(400,'BAD_DRAWING_ANCHOR','필기 기준 영역을 확인해 주세요.');
     out.anchor={id:a.id,x:a.x,y:a.y,w:a.w,h:a.h};
    }
   }
   return out;
  });
  return {exam_id,unit_id,strokes};
 }
 fail(400,'BAD_KIND','지원하지 않는 기록 종류입니다.');
}
export function integer(x,min,max,fallback){const v=Number(x);return Number.isInteger(v)&&v>=min&&v<=max?v:fallback;}
export const pack=r=>r?{kind:r.kind,id:r.record_id,version:r.version,deleted:!!r.deleted,updated_at:r.updated_at,mutation_id:r.mutation_id,data:JSON.parse(r.data)}:null;
export async function applyOperations(env,account,ops){
 if(!Array.isArray(ops)||!ops.length||ops.length>20)fail(400,'BATCH_LIMIT','한 번에 1~20개 기록을 보낼 수 있습니다.');
 const prepared=[],seen=new Set(),stamp=Date.now();
 for(const op of ops){
  if(!op||!KINDS.includes(op.kind)||typeof op.id!=='string'||!/^[-a-zA-Z0-9_.:]{1,160}$/.test(op.id)||!Number.isInteger(op.base_version)||op.base_version<0||typeof op.mutation_id!=='string'||!/^[-a-zA-Z0-9_]{16,100}$/.test(op.mutation_id))fail(400,'INVALID_OPERATION','동기화 요청의 형식이 올바르지 않습니다.');
  const uniq=op.kind+':'+op.id;if(seen.has(uniq))fail(400,'DUPLICATE_OPERATION','같은 기록이 요청에 중복됐습니다.');seen.add(uniq);
  const deleted=op.deleted===true;const data=deleted?{}:await sanitize(op.kind,op.data,op.id,env);const value=JSON.stringify(data);if(new TextEncoder().encode(value).length>(op.kind==='annotation'?450000:240000))fail(413,'RECORD_TOO_LARGE','기록이 너무 커서 저장하지 못했습니다.');
  prepared.push({op,data,value,deleted});
 }
 const statements=[];
 for(const {op,value,deleted} of prepared){
  statements.push(env.DB.prepare(`INSERT INTO account_records(account_id,kind,record_id,version,data,deleted,updated_at,mutation_id)
   SELECT ?,?,?,1,?,?,?,? WHERE ?=0 AND ?=0
   ON CONFLICT(account_id,kind,record_id) DO UPDATE SET version=version+1,data=excluded.data,deleted=excluded.deleted,updated_at=excluded.updated_at,mutation_id=excluded.mutation_id
   WHERE account_records.version=? AND account_records.mutation_id<>?
   RETURNING *`).bind(account,op.kind,op.id,value,deleted?1:0,stamp,op.mutation_id,op.base_version,deleted?1:0,op.base_version,op.mutation_id));
  // For existing updates with base_version>0, use separate UPDATE (INSERT SELECT would produce no row).
  statements.push(env.DB.prepare(`UPDATE account_records SET version=version+1,data=?,deleted=?,updated_at=?,mutation_id=? WHERE account_id=? AND kind=? AND record_id=? AND version=? AND ?>0 AND mutation_id<>? RETURNING *`).bind(value,deleted?1:0,stamp,op.mutation_id,account,op.kind,op.id,op.base_version,op.base_version,op.mutation_id));
  statements.push(env.DB.prepare('SELECT * FROM account_records WHERE account_id=? AND kind=? AND record_id=?').bind(account,op.kind,op.id));
 }
 let rows;try{rows=await env.DB.batch(statements);}catch(e){if(String(e).includes('account_quota'))fail(413,'ACCOUNT_QUOTA','계정 저장 한도(10MB 또는 3,000개)를 초과했습니다. 기록을 내보낸 뒤 정리해 주세요.');throw e;}
 return prepared.map(({op},i)=>{const changed=rows[i*3].results?.[0]||rows[i*3+1].results?.[0],current=rows[i*3+2].results?.[0];const accepted=!!changed||current?.mutation_id===op.mutation_id||(!current&&op.deleted===true&&op.base_version===0);return {kind:op.kind,id:op.id,mutation_id:op.mutation_id,status:accepted?'saved':'conflict',record:pack(current)||(!current&&accepted?{kind:op.kind,id:op.id,version:0,deleted:true,updated_at:stamp,mutation_id:op.mutation_id,data:{}}:null)};});
}
export async function pullRecords(env,account,after=0,limit=100){
 const rows=await env.DB.prepare(`SELECT c.seq,r.* FROM account_changes c JOIN account_records r ON r.account_id=c.account_id AND r.kind=c.kind AND r.record_id=c.record_id WHERE c.account_id=? AND c.seq>? ORDER BY c.seq LIMIT ?`).bind(account,after,limit+1).all();
 const has_more=rows.results.length>limit,items=rows.results.slice(0,limit);return {records:items.map(pack),cursor:items.length?items.at(-1).seq:after,has_more};
}
function unsafe(v){if(typeof v==='string')return /[\uE000-\uF8FF\uFFFD]/.test(v);if(Array.isArray(v))return v.some(unsafe);if(v&&typeof v==='object')return Object.values(v).some(unsafe);return false;}
function header(a){if(a?.page!==1||a?.target!=='passage'||!Array.isArray(a.rect)||a.rect.length!==4)return false;const [x,y,x1,y1]=a.rect;return x>=330&&x<=345&&y>=150&&y<=158&&x1-x>=160&&x1-x<=170&&y1-y>=40&&y1-y<=45;}
const encPath=p=>p.split('/').map(encodeURIComponent).join('/');
export async function reconstruct(env,record){
 if(isMathRecord(record.data))return reconstructMath(record);
 const d=record.data,meta=await cbtData(env),ids=[...new Set(d.details.map(q=>meta.types[q.question_key]?.unit_id))];
 if(ids.some(id=>!meta.rows.has(id)))fail(404,'SOURCE_MISSING','원문을 찾지 못했습니다. 기록 자체는 보관되어 있습니다.');
 let start=1;const sections=[];
 for(const id of ids){
  const row=meta.rows.get(id),obj=await env.CBT.get(row.key);if(!obj)fail(404,'SOURCE_MISSING','원문 자료가 일시적으로 없습니다.');const u=JSON.parse(await obj.text()),cat=meta.categories[id]||{},base=row.key.replace(/unit\.json$/,'');
  const map=a=>a?.file?{...a,url:'/cbt-data/'+encPath(base+a.file)}:a;const assets=(u.assets||[]).filter(a=>!header(a)).map(map),wanted=d.details.filter(q=>q.unit_id===id),questions=[];
  for(const ref of wanted){const q=u.questions.find(q=>+q.original_no===ref.original_no);if(!q)fail(404,'SOURCE_MISSING','문항 원문을 찾지 못했습니다.');const qt=meta.types[ref.question_key];
   questions.push({...q,display_no:start++,question_key:ref.question_key,question_type:qt.type,skill:qt.type,type_id:qt.type_id,type_group:qt.type_group,analysis_eligible:qt.analysis_eligible,review_status:qt.review_status,assets:(q.assets||[]).map(map),force_image_render:!!q.force_image_render||unsafe(q)||assets.some(a=>a.target==='passage'||a.target==='question'&&Number(a.question_no)===ref.original_no)});
  }
  const source={...u.source};delete source.source_pdf;sections.push({id,section_code:row.section_code,area:cat.area,category:cat.category,display_start:questions[0].display_no,display_end:questions.at(-1).display_no,source,passage:u.passage||{sections:[]},questions,assets,force_image_render:unsafe(u.passage),original_url:'/cbt-data/originals/'+encPath(row.key.replace(/unit\.json$/,'original.png'))});
 }
 const normalized=sections.flatMap(s=>s.questions.map(q=>{const r=d.details.find(r=>r.question_key===q.question_key);return {...r,display_no:q.display_no};}));
 return {exam:{id:record.id,subject:'국어',mode:d.mode,choice:d.choice,legacy_format:d.mode==='full'&&d.years.every(y=>y<2022),years:d.years,categories:d.categories,question_count:normalized.length,time_limit_seconds:d.time_limit_seconds||4800,sections},saved:{...d,details:normalized},kind:record.kind};
}
