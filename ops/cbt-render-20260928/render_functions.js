function render(){
 var item=flat[current];if(!item)return;finishActiveInk();var q=prepareQuestion(item.q),set=item.set;renderSerial++;
 currentSetId=set.id;renderReading(set);var plan=renderingPlan(set,q);window.lastRenderPlan=plan.kind;
 var context=[set.area,set.category].filter((v,i,a)=>v&&a.indexOf(v)===i).map(esc).join(' · ');
 $('#qno').innerHTML=q.display_no+'번 · '+context+'<span class="qtype">'+esc(q.question_type||'기타')+'</span>'+(plan.score?'<span class="question-score">'+esc(plan.score)+'</span>':'');
 var source=set.source||{},nos=source.original_questions||[],first=nos.length?nos[0]:q.original_no,last=nos.length?nos[nos.length-1]:q.original_no;
 $('#tag').textContent=[set.area,set.category].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ')+' · '+source.academic_year+'학년도 '+(source.month===11?'수능':source.month+'월')+' · 원문 '+first+(first!==last?'~'+last:'')+'번';
 $('#stem').textContent=plan.prompt;$('#stem').classList.toggle('hidden',!plan.prompt);$('#view').replaceChildren();$('#qassets').innerHTML=plan.body;
 var compact=!plan.matrix&&(plan.numeric||(q.choices||[]).every(c=>/^[ⓐ-ⓩ㉠-㉻ㄱ-ㅎ①-⑤]$/.test(String(c.text||'').trim())));
 $('#choices').classList.toggle('compact',compact);$('#choices').classList.toggle('matrix',!!plan.matrix);$('#choices').setAttribute('role','radiogroup');$('#choices').setAttribute('aria-label','답 선택');
 $('#choiceMatrixHead').innerHTML=plan.matrix?'<span aria-hidden="true"></span>'+plan.matrix.columns.map(c=>'<span>'+esc(c)+'</span>').join(''):'';
 $('#choiceMatrixHead').classList.toggle('hidden',!plan.matrix);
 for(var e of [$('#choices'),$('#choiceMatrixHead')])e.style.setProperty('--choice-columns',plan.matrix?plan.matrix.columns.length:1);
 $('#choices').innerHTML=(q.choices||[]).map(function(c,i){
  var value=Number(c.index),selected=answers[q.display_no]===value;
  var text=plan.numeric?'원문 '+(['①','②','③','④','⑤'][value-1]||value):c.text;
  var label='<span class="num">'+value+'</span>';
  if(plan.matrix){label+=plan.matrix.values[i].map((t,k)=>'<span class="choice-cell" data-column="'+esc(plan.matrix.columns[k])+'">'+esc(t)+'</span>').join('');text=plan.matrix.columns.map((h,k)=>h+' '+plan.matrix.values[i][k]).join(', ')}
  else if(!plan.numeric)label+='<span>'+esc(text)+'</span>';
  return '<button type="button" class="'+choiceClass(q,c)+'" data-v="'+value+'" role="radio" aria-checked="'+selected+'" aria-label="'+esc(value+'번 '+text)+'">'+label+'</button>';
 }).join('');
 $('#choices').querySelectorAll('.choice').forEach(el=>el.onclick=function(){if(grading||drawTool!=='hand')return;answers[q.display_no]=Number(el.dataset.v);persist();renderChoice();updatePalette()});
 var end=flat.length-1;$('#prev').disabled=current===0;
 $('#next').textContent=current===end?(grading?'처음으로':'답안 확인'):'다음 →';$('#next').onclick=function(){finishActiveInk();if(current===end){grading?go(0):openSubmit()}else go(current+1)};$('#prev').onclick=()=>go(current-1);
 if(grading){var g=grading[q.display_no];$('#qno').append(document.createTextNode(' · '+(g&&g.is_correct?'정답':'오답')))}
 hydrateSourceFrames($('#qassets'));scheduleCanvasResize();updatePalette();applyPassageState();
}
function renderChoice(){
 var item=flat[current];if(!item)return;var q=item.q;
 $('#choices').querySelectorAll('.choice').forEach(function(el){var c=(q.choices||[]).find(x=>Number(x.index)===Number(el.dataset.v));if(!c)return;el.className=choiceClass(q,c);el.setAttribute('aria-checked',String(answers[q.display_no]===Number(c.index)))})
}
function closeOriginal(){var panel=$('#inlineOriginal');panel.classList.add('hidden');panel.querySelector('.inline-original-body').replaceChildren();$('#showOriginal').setAttribute('aria-expanded','false')}
function go(i){
 finishActiveInk();current=Math.max(0,Math.min(flat.length-1,i));closeOriginal();persist();render();
 var pane=$('#questionPane');if(pane)pane.scrollTop=0;if(innerWidth<=960)pane.scrollIntoView({block:'start'});
}
