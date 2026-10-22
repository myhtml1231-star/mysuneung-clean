import {EXTRA_SUBJECTS,EXTRA_VERSION,extraRecordSubject,extraReferenceKey,loadExtraBank,gradeExtra,extraExam} from './extra-core.mjs';
function rejected(message='저장할 문항 출처를 확인해 주세요.'){throw Object.assign(Error(message),{status:400,code:'BAD_EXTRA_RECORD'});}
const timestamp=value=>Number.isFinite(Number(value))&&Number(value)>=1262304000000&&Number(value)<=Date.now()+300000?Number(value):Date.now();
const reasons=new Set(['unknown','condition','target','causality','category','sequence','over_inference','concept','application','prompt','time','selection','other']);
function paused(value,seconds){const remaining=Number(value?.remaining_ms);return value?.status==='paused'&&Number.isFinite(remaining)&&remaining>=0&&remaining<=seconds*1000?{session:{version:1,status:'paused',remaining_ms:remaining,paused_at:timestamp(value.paused_at)}}:{};}
export async function sanitizeExtraRecord(kind,data,id,env){
 if(!['attempt','draft'].includes(kind))rejected();
 if(!data||typeof data!=='object'||['account_id','user_id','firebase_uid'].some(key=>key in data))rejected();
 const subject=extraRecordSubject(data);if(!subject)rejected();
 const bank=await loadExtraBank(env,subject),raw=data.details||data.refs;
 const graded=gradeExtra(bank,raw.map((q,i)=>({...q,display_no:i+1,selected:q.selected??data.answers?.[String(i+1)]})),{},true);
 const keys=graded.details.map(q=>q.question_key),form=bank.forms.find(f=>f.question_keys.length===keys.length&&f.question_keys.every((key,i)=>key===keys[i]));
 const full=data.mode==='full'&&!!form,seconds=full?form.time_limit_seconds:Math.max(300,Math.ceil(keys.reduce((sum,key)=>sum+bank.questions[key].time_per_question_seconds,0)/60)*60);
 const cleanReasons={};if(kind==='attempt'&&data.reasons&&typeof data.reasons==='object')for(const q of graded.details){const r=data.reasons[q.question_key];if(r&&!q.is_correct)cleanReasons[q.question_key]={code:reasons.has(r.code)?r.code:'unknown',note:typeof r.note==='string'?r.note.slice(0,500):'',source:'self_report'};}
 const details=kind==='attempt'?graded.details:graded.details.map(({correct_answer,correct_answers,accepted_answers,is_correct,earned_points,...q})=>q);
 const common={id,subject:EXTRA_SUBJECTS[subject],subject_key:subject,at:timestamp(data.at),mode:full?'full':'custom',source_family:form?.exam_family||'all',source_session:form?.id||null,years:[...new Set(details.map(q=>q.academic_year))],categories:['전체 문항'],details,taxonomy_version:EXTRA_VERSION,schema_version:5};
 if(kind==='attempt')return {...common,score:graded.correct_count,total:details.length,percent:graded.percent,raw_score:graded.raw_score,max_score:graded.max_score,unanswered:graded.unanswered_count,reasons:cleanReasons};
 const current=Number.isInteger(data.current)&&data.current>=0&&data.current<details.length?data.current:0;
 return {...common,current,startedAt:timestamp(data.startedAt),time_limit_seconds:seconds,...paused(data.session,seconds)};
}
export async function reconstructExtraRecord(record,env){
 const data=record.data,subject=extraRecordSubject(data);if(!subject)rejected();const bank=await loadExtraBank(env,subject),keys=data.details.map(extraReferenceKey),questions=keys.map(k=>bank.questions[k]);if(questions.some(q=>!q))rejected();
 const form=data.mode==='full'?bank.forms.find(f=>f.question_keys.length===keys.length&&f.question_keys.every((k,i)=>k===keys[i])):null;
 const exam=extraExam(bank,questions,{id:record.id,form,source_family:data.source_family});
 return {exam,saved:{...data,details:data.details.map((q,i)=>({...q,display_no:i+1}))},kind:record.kind};
}
export function extraAnnotationSubject(id){const m=/^g[23]-20\d{2}-(?:06|09|10|11)-((?:voc|lang)-[a-z-]+)-q\d{2}$/.exec(id||'');return m&&Object.hasOwn(EXTRA_SUBJECTS,m[1])?m[1]:null;}
export async function sanitizeExtraAnnotation(data,env){
 if(!data||typeof data!=='object'||['account_id','user_id','firebase_uid'].some(key=>key in data))rejected();
 const subject=extraAnnotationSubject(data.unit_id);if(!subject||typeof data.exam_id!=='string'||!/^[-\w.:]{1,150}$/.test(data.exam_id))rejected();
 const bank=await loadExtraBank(env,subject),question=Object.values(bank.questions).find(q=>q.unit_id===data.unit_id);if(!question||!Array.isArray(data.strokes)||data.strokes.length>500)rejected();let points=0;
 const strokes=data.strokes.map(stroke=>{
  if(!stroke||!['pen','highlight','underline','eraser'].includes(stroke.tool)||!Array.isArray(stroke.points))rejected();points+=stroke.points.length;if(points>16000)rejected('필기 데이터가 저장 한도를 초과했습니다.');
  const clean={tool:stroke.tool,color:/^#[0-9a-f]{6}$/i.test(stroke.color)?stroke.color:'#202020',size:Number.isFinite(stroke.size)?Math.min(30,Math.max(1,stroke.size)):3,points:stroke.points.map(p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)rejected();return {x:Math.round(p.x*1e5)/1e5,y:Math.round(p.y*1e5)/1e5};})};
  if(stroke.surface!==undefined&&!['passage','question'].includes(stroke.surface))rejected();if(stroke.surface)clean.surface=stroke.surface;
  if(stroke.surface==='question'){if(stroke.question_no!==question.original_no)rejected();clean.question_no=question.original_no;if(stroke.anchor!==undefined){const a=stroke.anchor;if(!a||!/^((stem)|(box-[0-9]{1,3})|(source-[0-9]{1,3})|(choice-[1-5]))$/.test(a.id)||['x','y','w','h'].some(k=>!Number.isFinite(a[k])||a[k]<0||a[k]>1)||a.w<=0||a.h<=0||a.x+a.w>1.01||a.y+a.h>1.01)rejected();clean.anchor={id:a.id,x:a.x,y:a.y,w:a.w,h:a.h};}}
  return clean;
 });
 return {exam_id:data.exam_id,unit_id:data.unit_id,strokes,at:timestamp(data.at)};
}
