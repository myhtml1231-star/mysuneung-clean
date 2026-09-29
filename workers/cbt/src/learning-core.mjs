// Pure learning logic, shared by the Worker and the browser. No network or storage side effects.
export const LEARNING_VERSION = '2026-09-27.learning.v1';
export const MIN_EVIDENCE = 5;
export const REASONS = Object.freeze([
 ['unknown','아직 모르겠음'],['condition','조건 누락'],['target','대상 혼동'],
 ['causality','인과관계 혼동'],['category','범주 혼동'],['sequence','선후관계 혼동'],
 ['over_inference','과도한 추론'],['concept','개념·어휘 부족'],['application','보기 적용 어려움'],
 ['prompt','발문 오독'],['time','시간 부족'],['selection','선택 실수'],['other','기타']
]);
export function answerValue(v,kind='mcq') {
 if(typeof v!=='number'&&typeof v!=='string')return null;
 if(typeof v==='string'&&(kind==='numeric'?!/^[0-9]{1,3}$/.test(v):v===''))return null;
 const n=Number(v);return Number.isInteger(n)&&n>=(kind==='numeric'?0:1)&&n<=(kind==='numeric'?999:5)?n:null;
}
export function questionKey(d) {
 if(!d || typeof d!=='object') return null;
 const s=d.source||d, y=Number(d.academic_year??s.academic_year??d.year),m=Number(d.month??s.month),no=Number(d.original_no);
 const sec=d.section_code,math=['mA','mB','mga','mna','mcommon','mprob','mcalc','mgeom'].includes(sec);
 const months=math?[3,4,5,6,7,9,10,11]:[3,5,6,7,9,11];
 if(!Number.isInteger(y)||y<(math?2014:2017)||y>2027||!months.includes(m)||!Number.isInteger(no)||no<1||no>(math?30:45)||(!math&&!['common','hw','lm','full'].includes(sec)))return null;
 if(math&&((['mA','mB'].includes(sec)&&y>2016)||(['mga','mna'].includes(sec)&&(y<2017||y>2021))||(['mcommon','mprob','mcalc','mgeom'].includes(sec)&&y<2022)))return null;
 return `${y}-${String(m).padStart(2,'0')}-${sec}-${String(no).padStart(2,'0')}`;
}
export function typeGroup(m) {
 return m?.type_group || (['독서론','비문학'].includes(m?.area)?'독서':m?.area==='문학'?'문학':m?.category==='화법과 작문'?'화작':m?.category==='언어와 매체'?'언매':'');
}
export function canonicalDetail(d,taxonomy,answers) {
 const key=questionKey(d),m=key && taxonomy[key];
 if(!key||!m)return null;
 const kind=m.answer_type==='numeric'?'numeric':'mcq';
 const selected=answerValue(d.selected,kind),correct=answers ? answerValue(answers[key],kind) : answerValue(d.correct_answer,kind);
 if(correct===null)return null;
 const accepted=Array.isArray(d.accepted_answers)?[...new Set(d.accepted_answers.map(v=>answerValue(v,kind)).filter(v=>v!==null))]:[];
 const is_correct=selected!==null&&(accepted.includes(selected)||selected===correct);
 return {...d,question_key:key,selected,correct_answer:correct,accepted_answers:accepted.length?accepted:undefined,is_correct,answer_type:kind,subject:m.subject||d.subject||'korean',points:m.points??d.points,
 question_type:m.type,skill:m.type,type_group:typeGroup(m),type_id:m.type_id||typeGroup(m)+'::'+m.type,
 area:m.area,category:m.category,unit_id:m.unit_id,review_status:m.review_status||'needs_review',
 analysis_eligible:m.analysis_eligible===true,taxonomy_version:m.taxonomy_version||LEARNING_VERSION};
}
export function normalizedReason(value) {
 if(!value || typeof value!=='object')return {code:'unknown',note:'',source:'self_report'};
 return {code:REASONS.some(r=>r[0]===value.code)?value.code:'unknown',note:String(value.note||'').slice(0,500),source:'self_report'};
}
export function aggregate(details,field='type_id') {
 const map=new Map();let excluded=0;
 for(const d of details){
  if(field==='type_id' && !d.analysis_eligible){excluded++;continue;}
  const key=field==='category' ? `${d.type_group}::${d.category}` : d[field];
  if(!key){excluded++;continue;}
  if(!map.has(key))map.set(key,{key,group:d.type_group,label:field==='category'?d.category:d.question_type,total:0,answered:0,correct:0,wrong:0,unanswered:0,question_keys:[]});
  const a=map.get(key);a.total++;a.question_keys.push(d.question_key);
  if(d.selected===null){a.unanswered++;continue;}
  a.answered++;if(d.is_correct)a.correct++;else a.wrong++;
 }
 const rows=[...map.values()].map(a=>({...a,error_rate:a.answered?a.wrong/a.answered:null,
  evidence_sufficient:a.answered>=MIN_EVIDENCE,
  // Product criterion, not a diagnosis or calibrated probability.
  reinforce:a.answered>=MIN_EVIDENCE&&a.wrong>=2&&a.wrong/a.answered>=0.4}));
 rows.sort((a,b)=>Number(b.reinforce)-Number(a.reinforce)||(b.error_rate??-1)-(a.error_rate??-1)||b.answered-a.answered||a.key.localeCompare(b.key));
 return {rows,excluded};
}
export function buildProfile(attempts,taxonomy,answers,now=Date.now()) {
 const valid=Array.isArray(attempts)?attempts.filter(a=>a&&typeof a==='object'&&Array.isArray(a.details)):[];
 const ordered=valid.map((a,i)=>({a,i,at:Number(a.at)})).filter(x=>Number.isFinite(x.at)&&x.at>0&&x.at<=now+300000)
   .sort((a,b)=>b.at-a.at||b.i-a.i).slice(0,30);
 const seen=new Map();let invalid=0,raw=0;
 for(const {a,at} of ordered){
  for(const input of a.details.slice(0,45)){
   raw++;const d=canonicalDetail(input,taxonomy,answers);
   if(!d){invalid++;continue;} if(seen.has(d.question_key))continue;
   const reason=normalizedReason(a.reasons?.[d.question_key]);
   seen.set(d.question_key,{...d,at,attempt_id:String(a.id||''),reason:d.is_correct?{code:'unknown',note:'',source:'self_report'}:reason});
  }
 }
 const details=[...seen.values()];const types=aggregate(details,'type_id');const topics=aggregate(details,'category');
 const reasonMap=new Map();
 for(const d of details){
  // Unanswered is separated. No cause is inferred from an answer or a type label.
  if(!d.analysis_eligible||d.selected===null||d.is_correct||d.reason.code==='unknown')continue;
  const k=d.type_id+'::'+d.reason.code;
  if(!reasonMap.has(k))reasonMap.set(k,{type_id:d.type_id,group:d.type_group,type:d.question_type,code:d.reason.code,count:0});
  reasonMap.get(k).count++;
 }
 return {details,types:types.rows,topics:topics.rows,reasons:[...reasonMap.values()],excluded_types:types.excluded,invalid,
  attempts:ordered.length,raw_responses:raw,unique_questions:details.length,unanswered:details.filter(d=>d.selected===null).length,
  weights:Object.fromEntries(types.rows.filter(r=>r.reinforce).map(r=>[r.key,1+Math.min(3,r.error_rate*3)])),
  recent_units:[...new Set(details.filter(d=>now-d.at<7*86400000).map(d=>d.unit_id))]};
}
export function exactSubset(rows,target,rng=Math.random,weight=()=>1) {
 if(!Number.isInteger(target)||target<0)return null;
 // Weighted random priority + exact integer DP. Never splits a passage set.
 const sorted=rows.map(r=>({r,p:-Math.log(Math.max(1e-12,rng()))/Math.max(.01,Math.min(20,weight(r)))})).sort((a,b)=>a.p-b.p).map(x=>x.r);
 const dp=Array(target+1).fill(null);dp[0]=[];
 for(const row of sorted){const c=Number(row.question_count);if(!Number.isInteger(c)||c<1||c>target)continue;
  for(let t=target;t>=c;t--)if(dp[t]===null&&dp[t-c]!==null)dp[t]=dp[t-c].concat(row);
  if(dp[target])break;
 }
 return dp[target];
}
export function unitTypeIndex(taxonomy) {
 const map=new Map();
 for(const [key,m] of Object.entries(taxonomy)){
  if(!map.has(m.unit_id))map.set(m.unit_id,[]);
  map.get(m.unit_id).push({key,type_id:m.type_id||typeGroup(m)+'::'+m.type,eligible:m.analysis_eligible===true,no:Number(m.original_no)});
 }
 return map;
}
export function rowWeight(row,index,weights,recent) {
 const qs=index.get(row.id)||[],vs=qs.filter(q=>q.eligible).map(q=>weights[q.type_id]||1);
 const boost=vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:1;
 return boost*(recent.has(row.id)?.2:1);
}
export function chooseExact(rows,target,index,weights,recent,rng=Math.random) {
 // Prefer unseen passage sets when an exact composition is possible, then relax visibly.
 const fresh=rows.filter(r=>!recent.has(r.id));
 return exactSubset(fresh,target,rng,r=>rowWeight(r,index,weights,recent)) || exactSubset(rows,target,rng,r=>rowWeight(r,index,weights,recent));
}
export function selectTargetSets(rows,targets,count,index,recent,rng=Math.random,weights={}) {
 const wanted=new Set(targets);const pool=rows.filter(r=>(index.get(r.id)||[]).some(q=>q.eligible&&wanted.has(q.type_id)));
 const priority=r=>{
  const n=(index.get(r.id)||[]).filter(q=>q.eligible&&wanted.has(q.type_id)).length;
  return (1+n/Math.max(1,r.question_count))*rowWeight(r,index,weights,recent);
 };
 const sorted=pool.map(r=>({r,p:-Math.log(Math.max(1e-12,rng()))/priority(r)})).sort((a,b)=>a.p-b.p).map(x=>x.r);
 const chosen=[];const used=new Set();
 if(count>=targets.length)for(const t of targets){const r=sorted.find(r=>!used.has(r.id)&&(index.get(r.id)||[]).some(q=>q.eligible&&q.type_id===t));if(r){chosen.push(r);used.add(r.id);}}
 for(const r of sorted){if(chosen.length>=count)break;if(!used.has(r.id)){chosen.push(r);used.add(r.id);}}
 return chosen;
}
