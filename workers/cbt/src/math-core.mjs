// Mathematics uses the same evidence rules as Korean. All answers/points come from the canonical bank.
import * as Learning from './learning-core.mjs';
import * as Study from './study-core.mjs';
import MATH_BANK from '../data/math-bank.json' with {type:'json'};
export const MATH_VERSION='2026-09-29.math.v2';
export const TRACKS=Object.freeze({A:'수학 A형',B:'수학 B형',ga:'수학 가형',na:'수학 나형',prob:'확률과 통계',calc:'미적분',geom:'기하'});

export class MathInputError extends Error{constructor(message,code='INVALID_MATH_REQUEST',status=400){super(message);this.code=code;this.status=status;}}
const fail=(s,c,status)=>{throw new MathInputError(s,c,status);};
export function mathKey(ref){const k=Learning.questionKey(ref);return k&&/^20\d\d-\d\d-m(A|B|ga|na|common|prob|calc|geom)-\d\d$/.test(k)?k:null;}
export function loadMathBank(){return MATH_BANK;}
export function mathTaxonomy(bank){return Object.fromEntries(Object.entries(bank.questions).map(([key,q])=>[key,{
 subject:'수학',type:q.type,type_group:q.type_group,type_id:q.type_id,area:q.area,category:q.category,
 unit_id:q.unit_id,original_no:q.original_no,academic_year:q.academic_year,month:q.month,section_code:q.section_code,
 answer_type:q.answer_type,points:q.points,analysis_eligible:q.analysis_eligible===true,review_status:q.review_status,
 taxonomy_version:MATH_VERSION,original_url:q.image.src,solution_url:q.solution_url,solution_page:q.solution_page,
 problem_url:q.problem_url,problem_page:q.problem_page,review_note:q.objective||'분류 근거 검토 중',source_label:q.source_label,track:q.track,curriculum:q.curriculum,
 exam_family:q.exam_family||'kice',provider:q.provider||''
 }]));}
export function mathLearningMeta(bank){
 const questions=mathTaxonomy(bank),groups={},statuses={};
 for(const q of Object.values(questions)){statuses[q.review_status]=(statuses[q.review_status]||0)+1;if(!groups[q.type_group])groups[q.type_group]=[];if(!groups[q.type_group].includes(q.type))groups[q.type_group].push(q.type);}
 return {ok:true,subject:'수학',version:MATH_VERSION,study_version:Study.STUDY_VERSION,min_evidence:Learning.MIN_EVIDENCE,questions,groups,
  summary:{total:Object.keys(questions).length,forms:bank.forms.length,years:bank.years,statuses,pending:Object.values(questions).filter(q=>!q.analysis_eligible).length},
  reasons:Learning.REASONS,coverage:bank.coverage};
}
export function mathCategories(bank,params=null){
 const ys=params?.get('years')?.split(',').map(Number),choice=params?.get('choice'),sourceFamily=params?.get('source_family')||'all';
 if(!['all','kice','education_office'].includes(sourceFamily))fail('출처 선택을 확인해 주세요.','MATH_SOURCE_FAMILY');
 const groups=new Map();for(const q of Object.values(bank.questions)){
  if(ys?.length&&!ys.includes(q.academic_year))continue;if(choice&&q.section_code!=='mcommon'&&q.section_code!=='m'+choice)continue;
  if(sourceFamily!=='all'&&(q.exam_family||'kice')!==sourceFamily)continue;
  if(!groups.has(q.area))groups.set(q.area,new Map());const g=groups.get(q.area);g.set(q.category,(g.get(q.category)||0)+1);
 }
 return {ok:true,groups:[...groups].map(([area,c])=>({area,categories:[...c].map(([name,unit_count])=>({name,unit_count}))})),years:bank.years,tracks:TRACKS,source_family:sourceFamily,coverage:bank.coverage};
}
export function mathUnit(q,display=1){
 // Explicit allowlist: no correct_answer or answer evidence is copied to an ungraded exam.
 const original=q.image.src,im={src:original,w:q.image.w,h:q.image.h};
 const question={display_no:display,original_no:q.original_no,question_key:q.question_key,section_code:q.section_code,
  subject:'수학',answer_type:q.answer_type,points:q.points,stem:'',choices:q.answer_type==='mcq'?[1,2,3,4,5].map(index=>({index,text:''})):[],
  question_type:q.type,skill:q.type,type_group:q.type_group,type_id:q.type_id,review_status:q.review_status,analysis_eligible:q.analysis_eligible===true,
  taxonomy_version:MATH_VERSION,qc:{unsafe_glyph:true},assets:[],original_url:original};
 return {id:q.unit_id,section_code:q.section_code,area:q.area,category:q.category,display_start:display,display_end:display,
  source:{academic_year:q.academic_year,month:q.month,exam_type:q.exam_type,exam_family:q.exam_family||'kice',provider:q.provider||'',section:q.source_label,original_questions:[q.original_no],area:q.area,category:q.category,administered_date:q.administered_date},
  passage:{sections:[]},questions:[question],assets:[],force_image_render:true,original_url:original,
  problem_url:q.problem_url,problem_page:q.problem_page,
  render_meta:{original:original,originalParts:[im],questions:{[q.original_no]:{full:[im],parts:[im],render_mode:'full',allow_text:false}},passage:[]}};
}
export function mathExamFromQuestions(qs,opts={}){
 if(!Array.isArray(qs)||!qs.length||qs.length>30)fail('수학 문항 수가 올바르지 않습니다.');
 return {id:opts.id||crypto.randomUUID(),generated_at:new Date().toISOString(),subject:'수학',mode:opts.mode||'custom',choice:opts.choice||null,source_family:opts.source_family||'all',
  legacy_format:qs.every(q=>q.academic_year<2022),categories:[...new Set(qs.map(q=>q.category))],years:opts.years||[...new Set(qs.map(q=>q.academic_year))],
  time_limit_seconds:opts.mode==='full'?6000:Math.max(300,Math.ceil(qs.length*200/60)*60),question_count:qs.length,
  common_count:qs.filter(q=>q.section_code==='mcommon').length,elective_count:qs.filter(q=>['mprob','mcalc','mgeom'].includes(q.section_code)).length,
  max_score:qs.reduce((n,q)=>n+q.points,0),taxonomy_version:MATH_VERSION,composition:opts.mode==='full'?{format:qs[0].academic_year>=2022?'common-elective':'legacy-paper',mcq:21,numeric:9,total_points:100}:null,
  learning:opts.learning||{strategy:'balanced',practice_mode:null,targets:[],note:'수학 기출'},sections:qs.map((q,i)=>mathUnit(q,i+1))};
}
export function mathGrade(bank,refs,answers={},options={}){
 if(!Array.isArray(refs)||refs.length<1||refs.length>30)fail('수학 답안은 1~30문항이어야 합니다.');
 if(!answers||typeof answers!=='object'||Array.isArray(answers))fail('답안 형식이 올바르지 않습니다.');
 const seen=new Set(),displaySeen=new Set();let points=0,max=0;
 const details=refs.map((ref,i)=>{
  const key=mathKey(ref),q=key&&bank.questions[key],display=Number(ref.display_no??i+1);
  if(!q||seen.has(key)||!Number.isInteger(display)||display<1||display>refs.length||displaySeen.has(display))fail('출처가 없거나 중복된 수학 문항입니다.','INVALID_MATH_REFERENCE');
  seen.add(key);displaySeen.add(display);
  const raw=options.embedded?ref.selected:answers[display];const selected=Learning.answerValue(raw,q.answer_type);
  if(raw!==undefined&&raw!==null&&raw!==''&&selected===null)fail('객관식은 1~5, 단답형은 0~999의 정수로 입력해 주세요.','INVALID_MATH_ANSWER');
  const is_correct=selected!==null&&selected===q.correct_answer;max+=q.points;if(is_correct)points+=q.points;
  return {subject:'수학',display_no:display,question_key:key,academic_year:q.academic_year,month:q.month,section_code:q.section_code,original_no:q.original_no,unit_id:q.unit_id,
   selected,correct_answer:q.correct_answer,is_correct,answer_type:q.answer_type,points:q.points,earned_points:is_correct?q.points:0,
   area:q.area,category:q.category,type_group:q.type_group,type_id:q.type_id,question_type:q.type,skill:q.type,
   review_status:q.review_status,analysis_eligible:q.analysis_eligible===true,taxonomy_version:MATH_VERSION,
   source_label:q.source_label,exam_family:q.exam_family||'kice',provider:q.provider||'',source:{academic_year:q.academic_year,month:q.month,section:q.source_label,exam_family:q.exam_family||'kice',provider:q.provider||''},original_url:q.image.src,
   solution_url:q.solution_url,solution_page:q.solution_page,problem_url:q.problem_url,problem_page:q.problem_page};
 });
 const correct=details.filter(d=>d.is_correct).length,blank=details.filter(d=>d.selected===null).length;
 return {ok:true,subject:'수학',total_count:details.length,correct_count:correct,wrong_count:details.length-correct-blank,unanswered_count:blank,
  percent:Math.round(correct/details.length*1000)/10,raw_score:points,max_score:max,details,taxonomy_version:MATH_VERSION};
}
function epoch(y){return y<=2016?'AB':y<=2021?'gana':'current';}
function trackForSection(s){return s.slice(1);}
function randomOrder(rows,weights={},seen=new Set()){
 return rows.map(q=>({q,p:-Math.log(Math.max(Number.EPSILON,Math.random()))/Math.max(.02,(weights[q.type_id]||1)*(seen.has(q.question_key)?.1:1))})).sort((a,b)=>a.p-b.p).map(x=>x.q);
}
export function generateMath(bank,body={}){
 if(!body||typeof body!=='object'||Array.isArray(body))fail('출제 조건을 확인해 주세요.');
 if(body.mode!==undefined&&!['full','custom'].includes(body.mode))fail('출제 모드가 올바르지 않습니다.');
 const mode=body.mode||'full',transfer=body.practice_mode==='transfer',sourceFamily=body.source_family??'all';
 if(!['all','kice','education_office'].includes(sourceFamily))fail('출처는 전체·평가원·교육청 중에서 선택해 주세요.','MATH_SOURCE_FAMILY');
 if(body.practice_mode!==undefined&&!transfer)fail('보완 출제 모드가 올바르지 않습니다.');
 const history=body.recent_attempts??[];
 if(!Array.isArray(history)||history.length>30||history.some(a=>!a||!Array.isArray(a.details)||a.details.length>30))fail('최근 수학 기록은 30회, 회당 30문항까지 사용합니다.');
 const taxonomy=mathTaxonomy(bank),official=Object.fromEntries(Object.entries(bank.questions).map(([k,q])=>[k,q.correct_answer]));
 const evidence=Study.studyEvidence(history,taxonomy,official),weights=body.strategy==='weakness'?Object.fromEntries(evidence.types.filter(t=>t.reinforce).map(t=>[t.key,1+Math.min(3,t.error_rate*3)])):{};
 const seen=new Set(history.flatMap(a=>a.details.map(mathKey)).filter(Boolean));
 const seenUnits=new Set([...seen].map(k=>bank.questions[k]?.unit_id).filter(Boolean));
 const types=body.type_ids??[];
 if(!Array.isArray(types)||types.length>3||types.some(x=>typeof x!=='string'||!Object.values(taxonomy).some(q=>q.type_id===x&&q.analysis_eligible)))fail('근거가 확인된 유형을 3개 이하로 선택해 주세요.');
 if(mode==='full'&&types.length)fail('유형별 연습은 맞춤 풀이에서 선택해 주세요.');
 if(body.strategy!==undefined&&!['balanced','weakness'].includes(body.strategy))fail('추천 방식이 올바르지 않습니다.');
 let years=body.years??[2022,2023,2024,2025,2026,2027];
 if(!Array.isArray(years)||!years.length||years.length>14||years.some(y=>!Number.isInteger(y)||!bank.years.includes(y)))fail('출제할 학년도를 선택해 주세요.');
 years=[...new Set(years)];let choice=body.choice||'prob',anchor=null;
 if(transfer){
  const keys=body.source_question_keys;
  if(mode!=='custom'||!types.length||!Array.isArray(keys)||keys.length!==1||!bank.questions[keys[0]])fail('보완의 기준 문항을 확인해 주세요.');
  anchor=bank.questions[keys[0]];if(!anchor.analysis_eligible||!types.includes(anchor.type_id))fail('기준 문항의 분류 근거를 확인해 주세요.');
  years=bank.years.filter(y=>epoch(y)===epoch(anchor.academic_year));choice=anchor.section_code==='mcommon'?(TRACKS[choice]&&['prob','calc','geom'].includes(choice)?choice:'prob'):trackForSection(anchor.section_code);
 }
 if(new Set(years.map(epoch)).size!==1)fail('A/B형·가/나형·현행 선택과목은 한 시험에 섞지 않습니다. 체제를 하나 선택해 주세요.','MIXED_MATH_CURRICULUM');
 const era=epoch(years[0]),validTracks=era==='AB'?['A','B']:era==='gana'?['ga','na']:['prob','calc','geom'];
 if(!validTracks.includes(choice))fail('선택한 학년도에 맞는 수학 유형을 선택해 주세요.','MATH_TRACK_MISMATCH');
 let pool=Object.values(bank.questions).filter(q=>years.includes(q.academic_year)&&(q.section_code==='m'+choice||q.section_code==='mcommon')&&(sourceFamily==='all'||(q.exam_family||'kice')===sourceFamily));
 let selected=[];
 if(mode==='full'){
  const forms=bank.forms.filter(f=>years.includes(f.academic_year)&&f.track===choice&&f.question_keys.length===30&&(sourceFamily==='all'||(f.exam_family||'kice')===sourceFamily));
  if(!forms.length)fail('선택한 조건의 완전한 30문항 시험이 없습니다.');
  if(era!=='current'){
   const f=randomOrder(forms.map(f=>({...f,question_key:f.id,type_id:'',score:f.question_keys.reduce((n,k)=>n+(seen.has(k)?0:1)+(weights[bank.questions[k].type_id]||0),0)}))).sort((a,b)=>b.score-a.score)[0];selected=f.question_keys.map(k=>bank.questions[k]);
  }else{
   const template=forms[Math.floor(Math.random()*forms.length)];const used=new Set();
   for(const key of template.question_keys){
    const slot=bank.questions[key],candidates=pool.filter(q=>!used.has(q.question_key)&&q.section_code===slot.section_code&&q.original_no===slot.original_no&&q.points===slot.points&&q.answer_type===slot.answer_type);
    const q=randomOrder(candidates,weights,seen)[0];if(!q)fail('정확한 30문항·100점 구성을 만들지 못했습니다.');selected.push(q);used.add(q.question_key);
   }
  }
  if(selected.length!==30||selected.reduce((n,q)=>n+q.points,0)!==100||selected.filter(q=>q.answer_type==='mcq').length!==21)throw new Error('Math full invariant violated');
 }else{
  const count=body.set_count??3;
  if(!Number.isInteger(count)||count<Math.max(1,types.length)||count>30)fail('맞춤 풀이는 1~30문항으로 선택해 주세요.');
  const categories=body.categories??[];if(!Array.isArray(categories)||categories.some(x=>typeof x!=='string'))fail('범주를 확인해 주세요.');
  if(categories.length)pool=pool.filter(q=>categories.includes(q.category));
  if(types.length)pool=pool.filter(q=>q.analysis_eligible&&types.includes(q.type_id));
  if(transfer){const ex=anchor.question_key.slice(0,7);pool=pool.filter(q=>q.question_key.slice(0,7)!==ex&&!seen.has(q.question_key)&&!seenUnits.has(q.unit_id)&&q.curriculum===anchor.curriculum);}
  const ranked=randomOrder(pool,weights,seen);const used=new Set();
  for(const t of types){const q=ranked.find(q=>q.type_id===t&&!used.has(q.question_key));if(!q)fail('다른 회차의 새 문항이 부족합니다. 기존 문제를 새 문제로 바꾸어 제공하지 않습니다.','NO_FRESH_MATH_QUESTION');selected.push(q);used.add(q.question_key);}
  for(const q of ranked){if(selected.length>=count)break;if(!used.has(q.question_key)){selected.push(q);used.add(q.question_key);}}
  if(!selected.length||(!transfer&&selected.length!==count))fail('선택 조건에 맞는 수학 문항 수가 부족합니다.','INSUFFICIENT_MATH_QUESTIONS');
 }
 const active=Object.keys(weights).length>0&&selected.some(q=>weights[q.type_id]);
 const learning={strategy:types.length?'targeted':active?'weakness':'balanced',practice_mode:transfer?'transfer':null,source_question_keys:anchor?[anchor.question_key]:[],targets:types.length?types:Object.keys(weights),
  selected_sets:selected.length,requested_sets:body.set_count||null,total_questions:selected.length,matched_questions:selected.filter(q=>types.includes(q.type_id)||weights[q.type_id]).length,
  repeated_recent_sets:selected.filter(q=>seen.has(q.question_key)).length,requested:body.strategy==='weakness',study_version:Study.STUDY_VERSION,min_evidence:Learning.MIN_EVIDENCE,
  source_family:sourceFamily,note:transfer?'다른 회차의 미풀이 문항 '+selected.length+'개 · '+(sourceFamily==='education_office'?'교육청 기출 · ':'')+'같은 교육과정':mode==='full'?(era==='current'?'공통 22 + 선택 8 · 객관식 21 + 단답형 9 · 100점':'이전 체제 한 회차 30문항 · 100점'):'선택한 범주의 '+(sourceFamily==='education_office'?'교육청 ':'')+'수학 기출 '+selected.length+'문항'};
 return {ok:true,exam:mathExamFromQuestions(selected,{mode,choice,years,learning,source_family:sourceFamily})};
}
export async function handleMath(request,env){
 const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 try{
  const url=new URL(request.url),route=url.pathname.slice('/api/cbt/math/'.length);
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
  const bank=await loadMathBank(env);
  if(route==='learning-meta'&&request.method==='GET')return json(mathLearningMeta(bank));
  if(route==='categories'&&request.method==='GET')return json(mathCategories(bank,url.searchParams));
  if(route==='coverage'&&request.method==='GET')return json({ok:true,version:bank.version,...bank.coverage});
  if(route==='question'&&request.method==='GET'){const q=bank.questions[url.searchParams.get('key')];return q?json({ok:true,unit:mathUnit(q)}):json({error:'문항이 없습니다.'},404);}
  if(!['generate','submit'].includes(route)||request.method!=='POST')return json({error:'Not found'},404);
  const len=Number(request.headers.get('content-length')||0);if(len>500000)fail('요청이 너무 큽니다.','BODY_TOO_LARGE',413);
  const text=await request.text();if(text.length>500000)fail('요청이 너무 큽니다.','BODY_TOO_LARGE',413);
  let b;try{b=JSON.parse(text);}catch{fail('JSON 형식이 올바르지 않습니다.');}
  return json(route==='generate'?generateMath(bank,b):mathGrade(bank,b.refs,b.answers));
 }catch(e){if(e instanceof MathInputError)return json({ok:false,error:e.message,code:e.code},e.status);console.error('MATH_CBT_ERROR',e?.message);return json({ok:false,error:'수학 CBT를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
