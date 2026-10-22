// Shared server-authoritative data and grading for vocational/language subjects.
export const EXTRA_VERSION='2026-10-23.voclang.v1';
export const EXTRA_PREFIX='vocational/20261023-v1/';
export const EXTRA_SUBJECTS={
 'voc-agriculture':'농업 이해','voc-agriculture-tech':'농업 기초 기술','voc-industry':'공업 일반','voc-drafting':'기초 제도','voc-commerce':'상업 경제','voc-accounting':'회계 원리','voc-ocean':'해양의 이해','voc-marine':'수산·해운 산업 기초','voc-human':'인간 발달','voc-service':'생활 서비스 산업의 이해','voc-career':'성공적인 직업 생활',
 'lang-german':'독일어Ⅰ','lang-french':'프랑스어Ⅰ','lang-spanish':'스페인어Ⅰ','lang-chinese':'중국어Ⅰ','lang-japanese':'일본어Ⅰ','lang-russian':'러시아어Ⅰ','lang-arabic':'아랍어Ⅰ','lang-vietnamese':'베트남어Ⅰ','lang-classical':'한문Ⅰ'
};
const slugs=Object.keys(EXTRA_SUBJECTS),codes=Object.fromEntries(slugs.map((s,i)=>[(s.startsWith('voc-')?'v':'l')+String(i+1).padStart(2,'0'),s]));
const caches=new WeakMap();
function invalid(message='문항 출처와 선택 범위를 확인해 주세요.',status=400){throw Object.assign(Error(message),{status,code:'EXTRA_INVALID_REQUEST'});}
export function extraReferenceKey(ref){
 if(typeof ref==='string')return /^(20\d{2})-(06|09|10|11)-([vl]\d{2})g([23])-(\d{2})$/.test(ref)&&extraSubjectForKey(ref)?ref:null;
 if(typeof ref?.question_key==='string')return extraReferenceKey(ref.question_key);
 if(!ref||typeof ref!=='object')return null;
 const src=ref.source||ref,y=Number(ref.academic_year??src.academic_year),m=Number(ref.month??src.month),n=Number(ref.original_no),section=ref.section_code??src.section_code;
 if(!Number.isInteger(y)||y<2020||y>2027||![6,9,10,11].includes(m)||!Number.isInteger(n)||n<1||n>30||!/^([vl]\d{2})g[23]$/.test(section||'')||!codes[section.slice(0,3)])return null;
 return `${y}-${String(m).padStart(2,'0')}-${section}-${String(n).padStart(2,'0')}`;
}
export function extraSubjectForKey(key){const match=/^20\d{2}-(?:06|09|10|11)-([vl]\d{2})g[23]-(?:0[1-9]|[12]\d|30)$/.exec(key||'');return match?codes[match[1]]||null:null;}
export function extraRecordSubject(record){const rows=record?.details||record?.refs;return Array.isArray(rows)?extraSubjectForKey(extraReferenceKey(rows[0])):null;}
export async function loadExtraBank(env,subject){
 if(!Object.hasOwn(EXTRA_SUBJECTS,subject))invalid('지원하지 않는 과목입니다.');
 if(!env?.CBT?.get)invalid('문항 자료를 불러오지 못했습니다.',503);
 let cache=caches.get(env.CBT);if(!cache){cache=new Map();caches.set(env.CBT,cache);}
 const existing=cache.get(subject);if(existing)return existing;
 const job=(async()=>{const obj=await env.CBT.get(EXTRA_PREFIX+'banks/'+subject+'.json');if(!obj)invalid('문항 자료를 불러오지 못했습니다.',503);const bank=JSON.parse(await obj.text());
  if(bank.version!==EXTRA_VERSION||bank.subject!==subject||!Array.isArray(bank.forms)||!Array.isArray(bank.years)||!bank.questions)invalid('문항 자료 검증에 실패했습니다.',503);
  return bank;
 })();
 // Keep at most two subject banks in one isolate; image ranges do not load packs.
 if(cache.size>=2)cache.delete(cache.keys().next().value);cache.set(subject,job);job.catch(()=>cache.delete(subject));return job;
}
function selectedAnswer(value){if(value===null||value===undefined||value==='')return null;if(!['number','string'].includes(typeof value)||!Number.isInteger(Number(value))||Number(value)<1||Number(value)>5)invalid('답은 1~5 중에서 선택해 주세요.');return Number(value);}
export function gradeExtra(bank,refs,answers={},embedded=false){
 if(!Array.isArray(refs)||!refs.length||refs.length>30||!answers||typeof answers!=='object'||Array.isArray(answers))invalid();
 const seen=new Set();let raw=0,maximum=0,correct=0,unanswered=0;
 const details=refs.map((ref,i)=>{const key=extraReferenceKey(ref),q=key&&bank.questions[key],display=Number(ref?.display_no??i+1);
  if(!q||seen.has(key)||display!==i+1)invalid();seen.add(key);
  const selected=selectedAnswer(embedded?ref.selected:answers[String(display)]),accepted=q.accepted_answers||[q.correct_answer];
  if(!accepted.length||accepted.some(a=>!Number.isInteger(a)||a<1||a>5)||!Number.isFinite(q.points)||q.points<=0)invalid('채점 자료 검증에 실패했습니다.',503);
  const ok=q.grading_policy==='all_credit'||selected!==null&&accepted.includes(selected);raw+=ok?q.points:0;maximum+=q.points;correct+=Number(ok);unanswered+=Number(selected===null);
  return {display_no:display,question_key:key,academic_year:q.academic_year,month:q.month,grade:q.grade,original_no:q.original_no,section_code:q.section_code,unit_id:q.unit_id,subject:q.subject,subject_key:bank.subject,source_label:q.source_label,exam_family:q.exam_family,selected,correct_answer:q.correct_answer,accepted_answers:accepted,correct_answers:accepted,is_correct:ok,points:q.points,earned_points:ok?q.points:0,answer_type:'mcq',category:q.category,area:q.subject,question_type:q.type,type:q.type,type_id:q.type_id,type_group:q.subject,analysis_eligible:q.analysis_eligible===true,review_status:q.review_status,taxonomy_version:bank.version};
 });
 return {ok:true,subject:EXTRA_SUBJECTS[bank.subject],subject_key:bank.subject,details,correct_count:correct,total_count:details.length,unanswered_count:unanswered,raw_score:raw,max_score:maximum,percent:Math.round(correct/details.length*100),score_percent:Math.round(raw/maximum*100),taxonomy_version:bank.version};
}
export function extraUnit(q,display){
 const im=q.image,p=q.presentation;if(!im||!p||!im.src.startsWith('/cbt-data/'+EXTRA_PREFIX+'images/')||!Number.isInteger(im.w)||!Number.isInteger(im.h)||im.w<=0||im.h<=0||p.image_sha256!==im.sha256||p.choices?.length!==5)invalid('원문 이미지 검증에 실패했습니다.',503);
 for(const r of [p.body,p.choice_block,...p.choices])if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>im.w||r[1]+r[3]>im.h)invalid('원문 좌표 검증에 실패했습니다.',503);
 const image={src:im.src,w:im.w,h:im.h},question={display_no:display,original_no:q.original_no,question_key:q.question_key,section_code:q.section_code,subject:q.subject,subject_key:q.subject_key,answer_type:'mcq',points:q.points,presentation:p,stem:'',choices:[1,2,3,4,5].map(index=>({index,marker:'①②③④⑤'[index-1],text:''})),assets:[],force_image_render:true,original_url:im.src,question_type:q.type,type_id:q.type_id,type_group:q.subject,analysis_eligible:q.analysis_eligible===true,review_status:q.review_status,taxonomy_version:EXTRA_VERSION};
 return {id:q.unit_id,section_code:q.section_code,area:q.subject,category:q.category,display_start:display,display_end:display,source:{academic_year:q.academic_year,month:q.month,grade:q.grade,exam_family:q.exam_family,subject_name:q.subject,section:q.source_label,original_questions:[q.original_no],area:q.subject,category:q.category},passage:{sections:[]},questions:[question],assets:[],force_image_render:true,original_url:im.src,frames:[{src:im.src,page:q.source_segments[0].page,crop:[0,0,im.w,im.h],page_width:im.w,page_height:im.h}],problem_url:q.problem_url,solution_url:q.solution_url,render_meta:{original:im.src,originalParts:[image],questions:{[q.original_no]:{full:[image],parts:[image],render_mode:'full',allow_text:false}},passage:[]},shared_group:q.shared_group};
}
export function extraExam(bank,questions,options={}){
 if(!questions.length||questions.length>30||questions.some(q=>!q))invalid();
 const form=options.form||null,full=!!form,seconds=full?form.time_limit_seconds:Math.max(300,Math.ceil(questions.reduce((sum,q)=>sum+q.time_per_question_seconds,0)/60)*60);
 if(!Number.isInteger(seconds)||seconds<60||seconds>10800)invalid('시험 시간 자료를 확인해야 합니다.',503);
 return {id:options.id||crypto.randomUUID(),generated_at:new Date().toISOString(),subject:EXTRA_SUBJECTS[bank.subject],subject_key:bank.subject,version:EXTRA_VERSION,taxonomy_version:EXTRA_VERSION,mode:full?'full':'custom',years:[...new Set(questions.map(q=>q.academic_year))],source_family:options.source_family||'all',source_session:form?.id||null,source_label:form?.source_label||'선택 기출 문항',categories:['전체 문항'],question_count:questions.length,time_limit_seconds:seconds,max_score:questions.reduce((sum,q)=>sum+q.points,0),total_score:questions.reduce((sum,q)=>sum+q.points,0),image_layout:'question-local-v3',learning:{strategy:'balanced',matched_questions:0,note:'공식 원문의 문항 순서·배점과 공통 자료를 보존합니다.'},sections:questions.map((q,index)=>extraUnit(q,index+1))};
}
function shuffle(rows){return rows.map(value=>({value,random:Math.random()})).sort((a,b)=>a.random-b.random).map(x=>x.value);}
export function generateExtra(bank,options={}){
 const years=options.years??bank.years,family=options.source_family||'all',mode=options.mode||'full';
 if(!Array.isArray(years)||!years.length||years.length>8||years.some(y=>!Number.isInteger(y)||!bank.years.includes(y))||!['all','kice','education_office'].includes(family)||!['full','custom','mixed'].includes(mode))invalid();
 const formFilter=f=>years.includes(f.academic_year)&&(family==='all'||f.exam_family===family)&&(!options.source_session||f.id===options.source_session);
 if(options.question_keys){if(!Array.isArray(options.question_keys)||options.question_keys.length<1||options.question_keys.length>30||new Set(options.question_keys).size!==options.question_keys.length)invalid();const questions=options.question_keys.map(k=>bank.questions[extraReferenceKey(k)]);if(questions.some(q=>!q))invalid();const form=mode==='full'?bank.forms.find(f=>f.question_keys.length===questions.length&&f.question_keys.every((key,i)=>key===questions[i].question_key)):null;return extraExam(bank,questions,{form,source_family:family});}
 if(mode==='full'){const forms=bank.forms.filter(formFilter);if(!forms.length)invalid('선택 범위에 해당하는 회차가 없습니다.');const form=shuffle(forms)[0],questions=form.question_keys.map(k=>bank.questions[k]);if(questions.some(q=>!q)||questions.length!==form.question_count||Math.abs(questions.reduce((sum,q)=>sum+q.points,0)-50)>.001)invalid('시험지 구성 검증에 실패했습니다.',503);return extraExam(bank,questions,{form,source_family:family});}
 const count=Number(options.set_count??options.count??5);if(!Number.isInteger(count)||count<1||count>30)invalid('문항 수는 1~30개로 선택해 주세요.');
 if(options.categories?.some(c=>c!=='전체 문항'))invalid('선택한 문항 분류를 확인해 주세요.');
 let pool=Object.values(bank.questions).filter(q=>years.includes(q.academic_year)&&(family==='all'||q.exam_family===family));
 if(options.source_session){const form=bank.forms.find(f=>f.id===options.source_session);if(!form)invalid();const keys=new Set(form.question_keys);pool=pool.filter(q=>keys.has(q.question_key));}
 if(pool.length<count)invalid('선택 범위의 문항 수가 부족합니다.');return extraExam(bank,shuffle(pool).slice(0,count),{source_family:family});
}
export function extraLearningMeta(bank){return {ok:true,version:EXTRA_VERSION,years:bank.years,questions:Object.fromEntries(Object.values(bank.questions).map(q=>[q.question_key,{question_key:q.question_key,academic_year:q.academic_year,month:q.month,grade:q.grade,original_no:q.original_no,section_code:q.section_code,subject:q.subject,subject_key:q.subject_key,unit_id:q.unit_id,area:q.subject,category:q.category,type:q.type,type_id:q.type_id,type_group:q.subject,analysis_eligible:q.analysis_eligible===true,review_status:q.review_status,points:q.points,answer_type:'mcq',original_url:q.image.src}])),summary:{total:Object.keys(bank.questions).length,pending:Object.values(bank.questions).filter(q=>!q.analysis_eligible).length},coverage:bank.coverage};}
export async function handleExtraAPI(request,env,subject){
 try{const bank=await loadExtraBank(env,subject),url=new URL(request.url),action=url.pathname.split('/').pop();let data;
  if(request.method==='GET'&&action==='coverage')data={ok:true,subject:EXTRA_SUBJECTS[subject],subject_key:subject,version:EXTRA_VERSION,years:bank.years,forms:bank.forms.map(({question_keys,...f})=>f),...bank.coverage};
  else if(request.method==='GET'&&action==='learning-meta')data=extraLearningMeta(bank);
  else if(request.method==='GET'&&action==='categories'){
   const years=url.searchParams.get('years')?.split(',').map(Number)||bank.years,family=url.searchParams.get('source_family')||'all',session=url.searchParams.get('source_session');
   const forms=bank.forms.filter(f=>years.includes(f.academic_year)&&(family==='all'||f.exam_family===family)&&(!session||f.id===session)),total=forms.reduce((sum,f)=>sum+f.question_count,0);
   data={ok:true,version:EXTRA_VERSION,subject,groups:[{area:'전체',categories:[{name:'전체 문항',label:'전체 문항',unit_count:total}]}],summary:{total,mapped:0,pending:total,count_basis:'questions'}};
  }
  else if(request.method==='GET'&&action==='question'){const q=bank.questions[extraReferenceKey(url.searchParams.get('key'))];if(!q)invalid('문항을 찾을 수 없습니다.',404);data={ok:true,exam:extraExam(bank,[q])};}
  else if(request.method==='POST'&&['generate','submit'].includes(action)){const bytes=await request.arrayBuffer();if(bytes.byteLength>256000)invalid('요청 내용이 너무 큽니다.',413);let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{invalid('요청 형식을 확인해 주세요.');}data=action==='generate'?{ok:true,exam:generateExtra(bank,body)}:gradeExtra(bank,body.refs,body.answers);}
  else invalid('지원하지 않는 요청입니다.',405);
  return Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return Response.json({ok:false,error:error.status?error.message:'문항 자료를 처리하지 못했습니다.',code:error.code||'EXTRA_INTERNAL'},{status:error.status||500,headers:{'Cache-Control':'no-store'}});}
}
export async function extraImageResponse(request,env){
 const url=new URL(request.url),match=new RegExp('^/cbt-data/'+EXTRA_PREFIX+'images/(g[23]-20\\d{2}-(?:06|09|10|11)-((?:voc|lang)-[a-z-]+))/(\\d{2})\\.webp$').exec(url.pathname);if(!match||!Object.hasOwn(EXTRA_SUBJECTS,match[2])||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
 const bank=await loadExtraBank(env,match[2]),q=Object.values(bank.questions).find(q=>q.image.src===url.pathname);if(!q)return new Response('Not found',{status:404});const im=q.image;
 const object=await env.CBT.get(im.pack_key,{range:{offset:im.offset,length:im.bytes}});if(!object)return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':'image/webp','Content-Length':String(im.bytes),'Cache-Control':'public,max-age=31536000,immutable','ETag':'"'+im.sha256+'"','X-Content-Type-Options':'nosniff'}});
}
