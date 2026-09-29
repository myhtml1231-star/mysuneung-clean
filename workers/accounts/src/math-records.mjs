import {fail} from './security.mjs';
import {loadMathBank,mathKey,mathGrade,mathTaxonomy,mathExamFromQuestions,TRACKS} from '../../cbt/src/math-core.mjs';
const reasonCodes=new Set(['unknown','condition','target','causality','category','sequence','over_inference','concept','application','prompt','time','selection','other']);
const text=(x,n)=>typeof x==='string'?x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n):'';
const date=(x)=>Number.isFinite(Number(x))&&Number(x)>=1262304000000&&Number(x)<=Date.now()+300000?Number(x):Date.now();
export function isMathRecord(d){const refs=d?.details||d?.refs;return d?.subject==='수학'||d?.subject==='math'||Array.isArray(refs)&&refs.some(r=>mathKey(r));}
export function mathReferenceKey(d){return mathKey(d);}
export function sanitizeMath(kind,d,id){
 const bank=loadMathBank();let result;
 try{
  const raw=d.details||d.refs;
  if(!Array.isArray(raw))fail(400,'BAD_QUESTIONS','수학 문항 출처를 확인해 주세요.');
  result=mathGrade(bank,raw.map((q,i)=>({...q,display_no:i+1,selected:q.selected??d.answers?.[String(i+1)]})),{}, {embedded:true});
 }catch(e){fail(400,e.code||'BAD_MATH_RECORD',e.message||'수학 기록이 올바르지 않습니다.');}
 const all=result.details,details=kind==='attempt'?all:all.map(({correct_answer,is_correct,earned_points,...q})=>q);
 const reasons={};if(kind==='attempt'&&d.reasons&&typeof d.reasons==='object')for(const q of all){const r=d.reasons[q.question_key];if(r&&!q.is_correct)reasons[q.question_key]={code:reasonCodes.has(r.code)?r.code:'unknown',note:text(r.note,500),source:'self_report'};}
 const choice=Object.keys(TRACKS).includes(d.choice)?d.choice:null;
 const mode=d.mode==='full'&&details.length===30&&result.max_score===100&&details.filter(q=>q.answer_type==='mcq').length===21?'full':'custom';
 const current=Number.isInteger(d.current)&&d.current>=0&&d.current<details.length?d.current:0;
 const limit=Number.isInteger(d.time_limit_seconds)&&d.time_limit_seconds>=60&&d.time_limit_seconds<=10800?d.time_limit_seconds:mode==='full'?6000:Math.max(300,details.length*200);
 return {id,subject:'수학',at:date(d.at),mode,choice,years:[...new Set(details.map(q=>q.academic_year))],categories:[...new Set(details.map(q=>q.category))],details,
  ...(kind==='attempt'?{score:result.correct_count,total:details.length,percent:result.percent,raw_score:result.raw_score,max_score:result.max_score,unanswered:result.unanswered_count,reasons,taxonomy_version:result.taxonomy_version}:{current,startedAt:date(d.startedAt),time_limit_seconds:limit}),schema_version:4};
}
let drawMeta;
export function mathDrawingMetadata(){
 if(drawMeta)return drawMeta;const b=loadMathBank(),types=mathTaxonomy(b),rows=new Map();
 for(const q of Object.values(b.questions))rows.set(q.unit_id,{id:q.unit_id,year:q.academic_year,month:q.month,section_code:q.section_code});
 drawMeta={types,rows};return drawMeta;
}
export function reconstructMath(record){
 const d=record.data,b=loadMathBank();if(!Array.isArray(d.details)||!d.details.length||d.details.length>30)fail(404,'SOURCE_MISSING','수학 기록의 원문을 찾지 못했습니다.');
 const qs=d.details.map(q=>b.questions[q.question_key]);if(qs.some(q=>!q))fail(404,'SOURCE_MISSING','수학 기록의 원문을 찾지 못했습니다.');
 const exam=mathExamFromQuestions(qs,{id:record.id,mode:d.mode,choice:d.choice,years:d.years});
 if(record.kind==='draft')exam.time_limit_seconds=d.time_limit_seconds||exam.time_limit_seconds;
 return {exam,saved:{...d,details:d.details.map((q,i)=>({...q,display_no:i+1}))},kind:record.kind};
}
