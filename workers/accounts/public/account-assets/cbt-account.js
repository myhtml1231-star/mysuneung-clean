(async function(){
'use strict';if(!window.MSNAccount)return;const A=window.MSNAccount,$=s=>document.querySelector(s);
function wipePrivateView(){window.clearAllInkPrivateView?.();clearInterval(window.timerId);window.exam=null;window.flat=[];window.answers={};window.grading=null;window.annotationData={};window.redoData={};window.activeStroke=null;for(const id of ['#app','#analysis','#modal','#originalModal'])$(id)?.classList.add('hidden');$('#start')?.classList.remove('hidden');for(const id of ['#reading','#choices','#pgrid','#wrongList','#historyTopic','#historyType','#learnDrill'])if($(id))$(id).innerHTML='';if($('#originalImg'))$('#originalImg').removeAttribute('src');}
window.addEventListener('msn-account-locked',wipePrivateView);
await A.ready;
for(let i=0;i<100&&!window.CBTLearningUI;i++)await new Promise(r=>setTimeout(r,30));
if(window.CBTLearningUI)await CBTLearningUI.ready().catch(()=>{});
const params=new URLSearchParams(location.search),id=params.get('accountReplay');
const start=$('#start');let note=$('#accountCBTStatus');if(!note){note=document.createElement('p');note.id='accountCBTStatus';note.setAttribute('role','status');note.style.cssText='font-size:12px;color:#65748f;line-height:1.8;margin:14px 0;overflow-wrap:anywhere';$('#generate')?.before(note);}
function update(){const s=A.info();note.textContent=s.user?((s.status==='saved'?'계정에 저장됨':s.status==='offline'?'오프라인 · 이 기기에 저장 대기':'계정 동기화 '+(s.pending?s.pending+'개 대기':''))+(s.message?' · '+s.message:'')):'비로그인 기록은 이 기기에만 저장됩니다. 로그인하면 내 정보에서 선택해서 가져올 수 있습니다.';}
window.addEventListener('msn-account-change',update);update();
let historyRefreshPending=false;
const editingReason=()=>document.activeElement?.closest('.learn-reason-editor');
function refreshHistory(){
 if(editingReason()){historyRefreshPending=true;return;}
 historyRefreshPending=false;
 if(window.CBTLearningUI)window.dispatchEvent(new StorageEvent('storage',{key:'mysuneung-cbt-learning-history-v2'}));
}
window.addEventListener('msn-cbt-history-updated',refreshHistory);
document.addEventListener('focusin',e=>{
 const editor=e.target.closest?.('.learn-reason-editor');
 if(editor&&A.info().user&&!editor.msnEditSnapshot&&editor.dataset.attempt)editor.msnEditSnapshot=A.beginEdit('attempt',editor.dataset.attempt);
});
document.addEventListener('focusout',()=>{setTimeout(()=>{if(historyRefreshPending&&!editingReason())refreshHistory();},200);});
// Detached editors no longer need version guards. Never release a still-open input.
new MutationObserver(()=>{for(const editor of reasonEditors){if(!editor.isConnected){A.endEdit(editor.msnEditSnapshot);reasonEditors.delete(editor);}}}).observe(document.querySelector('#analysis'),{childList:true,subtree:true});
const reasonEditors=new Set();
document.addEventListener('focusin',e=>{const editor=e.target.closest?.('.learn-reason-editor');if(editor?.msnEditSnapshot)reasonEditors.add(editor);});
if(!id)return;
if(!/^[-\w.:]{1,160}$/.test(id)){note.textContent='풀이 기록 주소가 올바르지 않습니다.';return;}
if(!A.info().user){note.textContent='이 풀이 기록을 보려면 저장한 계정으로 로그인해 주세요.';const link=document.createElement('a');link.href='/auth?returnTo='+encodeURIComponent(location.pathname+location.search);link.textContent='저장한 계정으로 로그인 →';link.style.cssText='display:block;margin:10px 0;color:#4763a1';note.after(link);return;}
$('#loading')?.classList.remove('hidden');
try{
 const kind=params.get('kind')==='draft'?'draft':'attempt';const d=await A.api('replay/'+encodeURIComponent(id)+'?kind='+kind);
 if(params.get('practice')==='1'){
  d.exam.id=crypto.randomUUID();window.loadExam(d.exam,true);return;
 }
 window.loadExam(d.exam,false);clearInterval(window.timerId);
 window.answers=Object.fromEntries(d.saved.details.filter(q=>q.selected!==null).map(q=>[q.display_no,q.selected]));
 if(kind==='draft'){
  window.current=Math.min(d.saved.current||0,window.flat.length-1);window.startedAt=d.saved.startedAt||Date.now();window.grading=null;window.persist();window.render();window.startTimer();
 }else{
  window.grading=Object.fromEntries(d.saved.details.map(q=>[q.display_no,q]));window.render();
  const count=d.saved.details.length,correct=d.saved.details.filter(q=>q.is_correct).length,unanswered=d.saved.details.filter(q=>q.selected===null).length;
  await window.showAnalysis({ok:true,total_count:count,correct_count:correct,unanswered_count:unanswered,wrong_count:count-correct-unanswered,percent:Math.round(correct/count*100),details:d.saved.details});
  const focus=params.get('question');
  if(focus&&/^20\d{2}-\d{2}-(common|hw|lm|full)-\d{2}$/.test(focus)){
   const at=window.flat.findIndex(x=>x.q.question_key===focus);
   if(at>=0){$('#analysis').classList.add('hidden');$('#app').classList.remove('hidden');$('#learnReturn')?.classList.remove('hidden');window.go(at);}
  }
  const area=$('#learnStatus');if(area){const a=document.createElement('a');a.href='/mixed-cbt?accountReplay='+encodeURIComponent(id)+'&kind=attempt&practice=1';a.textContent='같은 문제를 새 답안으로 다시 풀기 →';a.style.cssText='display:block;font-size:13px;color:#4763a1;margin:12px 0';area.after(a);}
 }
}catch(e){note.textContent=e.message;start.classList.remove('hidden');}
finally{$('#loading')?.classList.add('hidden');}
})();
