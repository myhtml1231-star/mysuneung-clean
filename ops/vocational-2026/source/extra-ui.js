// Supplement the existing CBT workspace; preserve its renderer and controls.
window.extraSourceSession=new URLSearchParams(location.search).get('form')||null;
function extraRequestOptions(body){
 if(body&&!body.question_keys&&['full','custom','mixed'].includes(body.mode)&&window.extraSourceSession)return {...body,source_session:window.extraSourceSession};
 return body;
}
(() => {
 const config=window.EXTRA_UI_CONFIG,$=selector=>document.querySelector(selector);
 const originalRefresh=refreshYearModeUi;
 refreshYearModeUi=function(){
  originalRefresh();
  const scope=mathSourceScope(),selectedForm=config.forms.find(form=>form.id===window.extraSourceSession);
  if(selectedForm&&(!selectedYears.has(selectedForm.academic_year)||scope!=='all'&&selectedForm.exam_family!==scope))window.extraSourceSession=null;
  const form=config.forms.find(form=>form.id===window.extraSourceSession);
  $('#currentComposition').innerHTML=form?'<b>'+form.question_count+'문항</b><span class="arrow">·</span><b>50점</b><span class="arrow">·</span><b>'+form.time_limit_seconds/60+'분</b>':'<b>실제 회차 구성</b><span class="arrow">·</span><b>50점</b>';
  $('#startHint').textContent=mode==='full'?(form?form.question_count+'문항 · '+form.time_limit_seconds/60+'분':'선택한 실제 회차의 문항 수와 제한시간 적용')+' · 답안 자동저장':'1~30문항 · 원문과 공통 자료 보존';
  $('#generate').textContent=mode==='full'?config.label+' 시험지 만들기':'맞춤 문제 만들기';
  const forms=config.forms.filter(f=>scope==='all'||f.exam_family===scope);
  $('#sourceHint').textContent='수록 '+forms.length+'회차 · '+Math.min(...config.years)+'~'+Math.max(...config.years)+'학년도';
 };
 const originalRender=render;
 render=function(){originalRender();if(flat?.[current]?.q.presentation?.whole_source){$('#qassets').replaceChildren();$('#choices').classList.add('compact');}};
 window.MSNAccount.ready.then(async()=>{
  const form=config.forms.find(f=>f.id===window.extraSourceSession);
  if(form){
   selectedYears=new Set([form.academic_year]);
   const family=$('input[name="sourceFamily"][value="'+form.exam_family+'"]');
   if(family){family.checked=true;family.dispatchEvent(new Event('change',{bubbles:true}));}
  }else window.extraSourceSession=null;
  // Keep the original year presets and controls, including their position.
  // Disable only a range with no actual source years instead of creating an
  // empty selection or silently changing the original range boundaries.
  for(const button of document.querySelectorAll('[data-science-years]')){
   const choice=button.dataset.scienceYears;
   button.disabled=!config.years.some(y=>choice==='all'||(choice==='current'?y>=2021:y<=2020));
  }
  refreshYearModeUi();initCategories();
  const params=new URLSearchParams(location.search),recordId=params.get('accountReplay');
  if(recordId){
   try{
    if(!/^[-\w.:]{1,160}$/.test(recordId))throw Error('풀이 기록 번호를 확인해 주세요.');
    const kind=params.get('kind')==='draft'?'draft':'attempt';
    const record=await MSNAccount.api('replay/'+encodeURIComponent(recordId)+'?kind='+kind),saved=record.saved;
    if(record.exam?.subject_key!==config.subject||!Array.isArray(saved?.details))throw Error('이 과목의 풀이 기록을 찾지 못했습니다.');
    const restoredAnswers=Object.fromEntries(saved.details.filter(q=>q.selected!==null&&q.selected!==undefined).map((q,i)=>[q.display_no,q.selected]));
    if(kind==='draft'){
     const seconds=record.exam.time_limit_seconds,left=saved.session?.status==='paused'?saved.session.remaining_ms:Math.max(0,seconds*1000-(Date.now()-saved.startedAt));
     const state={exam:record.exam,answers:restoredAnswers,current:saved.current||0,startedAt:Date.now()-(seconds*1000-left),session:saved.session};
     MSNStorage.setItem(CURRENT_EXAM_KEY,JSON.stringify(state));await restore();
    }else{
     loadExam(record.exam,false);clearInterval(timerId);answers=restoredAnswers;grading=Object.fromEntries(saved.details.map(q=>[q.display_no,q]));render();
     await window.showAnalysis({ok:true,subject:record.exam.subject,subject_key:config.subject,details:saved.details,correct_count:saved.score,total_count:saved.total,unanswered_count:saved.unanswered,raw_score:saved.raw_score,max_score:saved.max_score,percent:saved.percent});
     const question=params.get('question');if(question){const index=flat.findIndex(item=>item.q.question_key===question);if(index>=0){$('#analysis').classList.add('hidden');$('#r5Report')?.classList.add('hidden');$('#app').classList.remove('hidden');go(index);}}
    }
   }catch(error){$('#startHint').textContent=error.message;$('#start').classList.remove('hidden');}
  }
 });
})();
