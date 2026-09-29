import {canonicalDetail,aggregate,questionKey,answerValue} from './learning-core.mjs';
export const STUDY_VERSION='2026-09-28.results.r5.1';
const DAY=86400000;
export const STUDY_RULES=Object.freeze({min_answered:5,min_wrong:2,error_rate:.4,verification_correct:3,verification_exams:2,verification_delay_days:1,followup_days:3});
// Procedures for a type, not an invented explanation of a particular question.
export const METHODS=Object.freeze({
 '독서::내용일치':['선지의 주체·조건·범위를 나누기','각 부분의 근거 문장을 지문에서 찾기','틀린 부분 한 곳을 지문 표현으로 고치기'],
 '독서::<보기> 적용':['지문의 원리와 적용 조건을 짧게 정리하기','<보기>의 대상·수치를 원리의 각 항목에 대응하기','조건을 하나 바꾸어도 같은 결론인지 점검하기'],
 '독서::관점·주장':['누구의 주장인지 주체별로 나누기','주장과 이를 뒷받침하는 이유를 연결하기','서로 동의하는 지점과 다른 지점을 구별하기'],
 '독서::반론·반응':['반론이 겨냥하는 주장이나 전제 찾기','반론의 근거가 그 전제를 흔드는지 확인하기','주장과 무관한 비판은 따로 제외하기'],
 '독서::비교·대응':['비교할 기준을 먼저 고정하기','두 대상의 같은 속성을 같은 줄에 정리하기','공통점과 차이점의 적용 범위를 확인하기'],
 '독서::어휘':['단어가 쓰인 문장과 앞뒤 문장 읽기','문맥에 맞는 쉬운 말로 바꾸기','바꾼 말을 다시 넣어 의미가 유지되는지 확인하기'],
 '독서::이유·전제 추론':['설명해야 하는 결과나 주장을 먼저 찾기','지문에 제시된 이유를 연결하기','추가한 전제가 지문 밖의 상식은 아닌지 확인하기'],
 '독서::자료·도표':['축·단위·기준값과 비교 조건 확인하기','지문의 변인 관계를 자료의 항목에 대응하기','수치와 변화 방향을 각각 검산하기'],
 '독서::전개 방식':['문단마다 하는 일을 한 단어로 적기','정의·예시·비교·반박이 연결되는 순서 확인하기','내용 요약과 설명 방식을 구별하기'],
 '독서::추론':['지문에서 확정된 사실만 먼저 모으기','결론까지 필요한 연결을 한 단계씩 설명하기','가능한 일과 반드시 성립하는 일을 구별하기'],
 '독서::핵심·주제':['반복되는 대상과 핵심 문제 찾기','대상에 대한 중심 설명을 한 문장으로 만들기','일부 사례만 담은 선지는 제외하기'],
 '문학::<보기> 문제':['<보기>의 해석 기준을 항목별로 나누기','각 기준과 연결되는 작품 표현 찾기','기준에 없는 의미를 덧붙이지 않았는지 확인하기'],
 '문학::내용일치':['말하는 인물과 사건의 전후 확인하기','선지의 행동·감정에 해당하는 표현 찾기','작품에 없는 단정이나 관계를 지우기'],
 '문학::밑줄 문제':['밑줄 앞뒤의 상황과 말하는 주체 확인하기','표현의 뜻과 장면에서의 역할을 구별하기','선지의 해석을 작품 근거와 대조하기'],
 '문학::서술상 특징':['서술자와 인물의 시점 구별하기','시간 이동·대화·묘사가 나타나는 부분 표시하기','기법의 이름뿐 아니라 실제 효과도 확인하기'],
 '문학::시어·구절 의미':['화자의 상황과 태도부터 확인하기','시어가 다른 표현과 맺는 관계 찾기','사전적 뜻만으로 해석하지 않았는지 점검하기'],
 '문학::인물·사건':['인물별 목표와 갈등 상대 정리하기','사건 전후의 행동·인식 변화를 연결하기','발언의 주체와 사건의 원인을 다시 확인하기'],
 '문학::작품 비교':['두 작품에 적용할 비교 기준 정하기','각 작품에서 기준에 해당하는 표현 찾기','한 작품에만 해당하는 설명을 구별하기'],
 '문학::표현상 특징':['선지의 표현 기법을 짧게 정의하기','실제로 그 기법이 쓰인 구절 찾기','표현의 존재와 효과를 각각 확인하기'],
 '언매::단어':['품사·형태소·단어 형성 중 묻는 기준 확인하기','예시를 최소 단위로 나누고 기능 표시하기','형태가 비슷해도 기능이 다른 예와 비교하기'],
 '언매::매체 내용':['매체 자료에서 발신자·목적·대상 찾기','선지의 정보가 어느 자료에 있는지 확인하기','드러난 정보와 추측을 분리하기'],
 '언매::매체 표현':['문자·영상·소리의 표현을 따로 확인하기','각 표현이 정보 전달에 하는 일 정리하기','표현 효과를 실제 자료의 근거와 연결하기'],
 '언매::매체 활용':['소통 목적과 수용자 조건 확인하기','매체의 기능이 목적에 맞는지 비교하기','수정 제안이 기존 정보나 목적을 바꾸는지 점검하기'],
 '언매::문장':['문장 성분과 문장 구조를 구별하기','서술어를 중심으로 성분·절을 나누기','한 성분을 바꾼 예문에도 같은 분석을 적용하기'],
 '언매::음운':['표기와 실제 발음을 나란히 적기','환경과 변화 전후의 음운을 표시하기','교체·탈락·첨가·축약을 결과로 확인하기'],
 '언매::중세국어':['자료에 제시된 시대와 문법 조건 확인하기','형태·기능을 현대국어와 항목별로 비교하기','현대국어 규칙을 그대로 적용한 부분 점검하기'],
 '화작::고쳐쓰기':['글의 목적과 고칠 부분의 문제 확인하기','내용·조직·표현 중 수정 기준 정하기','수정 뒤 앞뒤 문맥과의 연결 다시 읽기'],
 '화작::내용일치':['대화·글에서 실제 언급한 내용 찾기','누가 무엇을 말했는지 선지와 대응하기','언급되지 않은 내용이나 범위 확대 제외하기'],
 '화작::말하기 방식':['발화의 목적부터 확인하기','질문·예시·요약 등 실제 표현 찾기','그 방식이 청자에게 하는 역할 설명하기'],
 '화작::자료 활용':['글이나 발표에서 뒷받침할 내용 찾기','자료의 대상·기간·단위를 확인하기','자료가 직접 뒷받침하는 주장만 연결하기'],
 '화작::작문 계획':['주제·목적·예상 독자 확인하기','계획의 항목을 실제 글의 내용과 대응하기','계획에 없는 내용과 빠진 내용을 구별하기'],
 '화작::청중 반응':['반응의 근거가 되는 발표 부분 찾기','청중의 질문·평가·추가 생각을 구별하기','발표자가 한 말과 청중의 해석 분리하기'],
 '화작::화작 통합':['대화에서 정한 내용과 조건 모으기','정해진 내용이 글에 반영된 위치 찾기','반영·수정·누락된 내용을 각각 구별하기']
});
export const REASON_TIPS=Object.freeze({
 condition:'다음 문제에서는 「~일 때·~에 한해·모든」을 표시하고, 선지에도 같은 조건이 있는지 확인하세요.',
 target:'주어·대명사·비교 대상을 실명이나 기호로 바꾸어 쓰고, 선지의 주체와 다시 맞추세요.',
 causality:'원인 → 결과를 한 줄로 쓰세요. 함께 나타나는 현상을 원인으로 바꾸지 않았는지 확인하세요.',
 category:'상위 개념과 하위 사례를 나눠 적고, 일부 사례의 특징을 전체로 확대하지 않았는지 확인하세요.',
 sequence:'사건이나 과정에 순서를 붙이고, 시간상 앞섬과 원인 관계를 따로 확인하세요.',
 over_inference:'선지 옆에 근거 문장을 표시하세요. 지문만으로 확인되지 않는 연결은 판단을 보류하세요.',
 concept:'헷갈린 용어 하나를 정의하고, 해당하는 예와 해당하지 않는 예를 하나씩 만들어 비교하세요.',
 application:'원리의 조건과 <보기>의 항목을 일대일로 연결한 뒤, 연결되지 않는 조건부터 확인하세요.',
 prompt:'발문의 「적절한·적절하지 않은」과 판단 대상을 표시하고, 답을 고르기 직전에 다시 읽으세요.',
 time:'먼저 시간 제한 없이 근거를 찾고, 다음 새 지문에서 시간을 재세요. 오래 걸린 단계만 따로 기록하세요.',
 selection:'근거 확인을 마친 번호와 실제 선택한 번호를 제출 전에 한 번 대조하세요.',
 unknown:'원문에서 내가 고른 선지와 정답을 비교해, 처음 판단이 갈라진 부분을 찾으세요.',
 other:'풀이가 막힌 첫 지점을 한 문장으로 기록하고, 다음 문제에서 확인할 행동 하나를 정하세요.'
});
export function studyMethod(typeId,reason='unknown',eligible=true){
 return {steps:eligible&&METHODS[typeId]?METHODS[typeId]:['발문이 요구하는 판단 대상 확인하기','내가 고른 답과 정답의 근거를 원문에서 비교하기','놓친 조건이나 근거를 한 문장으로 기록하기'],tip:REASON_TIPS[reason]||REASON_TIPS.unknown,specific:eligible&&!!METHODS[typeId]};
}
export function studyEvidence(attempts,taxonomy,answers,now=Date.now()){
 const latestById=new Map();
 (Array.isArray(attempts)?attempts:[]).forEach((a,i)=>{const at=Number(a?.at);if(!a||!Array.isArray(a.details)||!Number.isFinite(at)||at<=0||at>now+300000)return;const id=String(a.id||'row-'+i);if(!latestById.has(id))latestById.set(id,{a,at,id,i});});
 const ordered=[...latestById.values()].sort((a,b)=>b.at-a.at||a.i-b.i).slice(0,30).reverse();
 const seen=new Set(),seenUnits=new Set(),first=[],events=[];let ignored=0;
 for(const {a,at,id} of ordered){const within=new Set(),attemptUnits=new Set();for(const raw of a.details.slice(0,45)){
  const d=canonicalDetail(raw,taxonomy,answers);if(!d||within.has(d.question_key)){ignored++;continue;}within.add(d.question_key);
  const e={...d,at,attempt_id:id,first_exposure:!seen.has(d.question_key),first_passage_exposure:!!d.unit_id&&!seenUnits.has(d.unit_id),source_exam:d.question_key.slice(0,7)};
  if(e.first_exposure)first.push(e);events.push(e);seen.add(e.question_key);if(d.unit_id)attemptUnits.add(d.unit_id);
 }for(const unit of attemptUnits)seenUnits.add(unit);}
 const types=aggregate(first).rows.map(r=>{
  const all=events.filter(e=>e.type_id===r.key&&e.analysis_eligible),bad=all.filter(e=>e.selected!==null&&!e.is_correct);
  const lastAt=bad.length?Math.max(...bad.map(e=>e.at)):null;
  const origin=new Set(bad.filter(e=>e.at===lastAt).map(e=>e.source_exam));
  const novel=lastAt===null?[]:all.filter(e=>e.first_exposure&&e.first_passage_exposure&&e.at>lastAt&&e.is_correct&&!origin.has(e.source_exam));
  const exams=new Set(novel.map(e=>e.source_exam));
  const delayed=novel.some(e=>e.at-lastAt>=DAY);
  const verified=novel.length>=3&&exams.size>=2&&delayed;
  const counts=new Map();for(const e of bad)counts.set(e.question_key,(counts.get(e.question_key)||0)+1);
  const lastNovel=novel.length?Math.max(...novel.map(e=>e.at)):null;
  return {...r,reinforce:r.reinforce&&!verified,had_errors:bad.length>0,latest_error_at:lastAt,repeat_wrong:[...counts.values()].filter(n=>n>1).length,
   verification_correct:novel.length,verification_exams:exams.size,verification_delayed:delayed,state:verified?'verified':novel.length?'checking':bad.length?'needs_review':'no_error',
   due_at:lastAt===null?null:verified?lastNovel+3*DAY:lastAt+DAY};
 }).sort((a,b)=>Number(b.reinforce)-Number(a.reinforce)||Number(a.state==='verified')-Number(b.state==='verified')||b.wrong-a.wrong||b.answered-a.answered||a.key.localeCompare(b.key));
 return {types,first,events,ignored,attempts:ordered.length,unique_questions:first.length,repeat_responses:events.length-first.length,excluded:first.filter(d=>!d.analysis_eligible).length};
}
export function transferCandidates(rows,index,historyDetails,sourceKeys,taxonomy){
 const seenUnits=new Set((historyDetails||[]).map(d=>d.unit_id));
 const origins=new Set();for(const key of sourceKeys||[]){const m=taxonomy[key];if(m){origins.add(key.slice(0,7));seenUnits.add(m.unit_id);}}
 return rows.filter(r=>!seenUnits.has(r.id)&&!(index.get(r.id)||[]).some(q=>origins.has(q.key.slice(0,7))));
}
export function selectTransferSets(rows,targets,count,index,rng=Math.random){
 const pool=rows.filter(r=>(index.get(r.id)||[]).some(q=>q.eligible&&targets.includes(q.type_id))).map(r=>({r,p:rng()})).sort((a,b)=>a.p-b.p).map(x=>x.r);
 const chosen=[],ids=new Set(),exams=new Set();
 const session=r=>(index.get(r.id)||[])[0]?.key.slice(0,7)||r.id;
 const add=r=>{if(r&&!ids.has(r.id)&&chosen.length<count){chosen.push(r);ids.add(r.id);exams.add(session(r));}};
 for(const t of targets){if(chosen.some(r=>(index.get(r.id)||[]).some(q=>q.eligible&&q.type_id===t)))continue;add(pool.find(r=>!ids.has(r.id)&&!exams.has(session(r))&&(index.get(r.id)||[]).some(q=>q.eligible&&q.type_id===t))||pool.find(r=>!ids.has(r.id)&&(index.get(r.id)||[]).some(q=>q.eligible&&q.type_id===t)));}
 for(const r of pool)if(!exams.has(session(r)))add(r);
 for(const r of pool)add(r);
 return chosen;
}

// Grading survives missing classification. These rows are never used for type diagnosis.
export function gradedDetails(details,taxonomy={}){
 return (Array.isArray(details)?details:[]).map(raw=>{
  if(!raw||typeof raw!=='object')return null;
  const canonical=canonicalDetail(raw,taxonomy);if(canonical)return canonical;
  const key=questionKey(raw),kind=key&&/-m(A|B|ga|na|common|prob|calc|geom)-/.test(key)&&raw.answer_type==='numeric'?'numeric':'mcq',correct=answerValue(raw.correct_answer,kind);
  if(!key||correct===null)return null;
  const selected=answerValue(raw.selected,kind);
  const accepted=Array.isArray(raw.accepted_answers)?[...new Set(raw.accepted_answers.map(v=>answerValue(v,kind)).filter(v=>v!==null))]:[];
  return {...raw,question_key:key,selected,correct_answer:correct,accepted_answers:accepted.length?accepted:undefined,is_correct:selected!==null&&(accepted.includes(selected)||selected===correct),
   type_group:'분류 확인 중',question_type:'분류 검토 중',type_id:null,analysis_eligible:false,review_status:'needs_review'};
 }).filter(Boolean);
}
export function gradingSummary(data,details=[]){
 const total=data?.total_count,right=data?.correct_count,blank=data?.unanswered_count;
 const wrong=data?.wrong_count??(total-right-blank);
 const authoritative=[total,right,wrong,blank].every(n=>Number.isInteger(n)&&n>=0)&&right+wrong+blank===total;
 const counts=authoritative?{total,right,wrong,blank}:{total:details.length,right:details.filter(d=>d.is_correct).length,
  wrong:details.filter(d=>d.selected!==null&&!d.is_correct).length,blank:details.filter(d=>d.selected===null).length};
 return {...counts,percent:counts.total?Math.round(counts.right/counts.total*1000)/10:null,authoritative};
}
