// Applied to the existing CBT page before its normal initialization. No independent UI framework.
var MATH_TRACKS={A:'수학 A형',B:'수학 B형',ga:'수학 가형',na:'수학 나형',prob:'확률과 통계',calc:'미적분',geom:'기하'};
function mathEra(y){return y<=2016?'ab':y<=2021?'gana':'current'}
function mathChoice(){return document.querySelector('input[name="choice"]:checked')?.value||'prob'}
window.mathQuestionMatchesSelection=function(q){return selectedYears.has(q.academic_year)&&(q.section_code==='mcommon'||q.section_code==='m'+mathChoice())};
refreshYearModeUi=function(){
 var legacy=usesLegacyYears(),era=mathEra(Math.min(...selectedYears));
 var valid=era==='ab'?['A','B']:era==='gana'?['ga','na']:['prob','calc','geom'];
 var c=mathChoice();if(!valid.includes(c))c=valid[0];
 document.querySelectorAll('input[name="choice"]').forEach(function(r){r.checked=r.value===c;r.parentElement.classList.toggle('hidden',!valid.includes(r.value));});
 $('#choiceSetting').classList.remove('hidden');$('#currentComposition').classList.toggle('hidden',legacy);$('#legacyComposition').classList.toggle('hidden',!legacy);
 $('#compositionNote').textContent=legacy?'이전 체제는 같은 회차 30문항을 그대로 출제합니다.':'공통 22문항 + 선택 8문항 · 원래 문항 위치와 배점을 유지합니다.';
 $('#startHint').textContent=mode==='full'?'30문항 · 객관식 21 + 단답형 9 · 100분 · 100점':'선택 범주 1~30문항 · 공통 자료 보존 · 문항 수에 맞춰 시간 설정';
 $('#generate').textContent=mode==='full'?'수학 30문항 만들기':'맞춤 문제 만들기';
 document.querySelectorAll('#years .year').forEach(function(b){b.classList.toggle('on',selectedYears.has(Number(b.dataset.year)));});
 document.querySelectorAll('[data-math-era]').forEach(function(b){b.classList.toggle('on',b.dataset.mathEra===era);});
 window.dispatchEvent(new Event('math-selection-change'));
};
initYears=function(){
 var box=$('#years');box.textContent='';
 YEARS.slice().reverse().forEach(function(y){var b=document.createElement('button');b.type='button';b.className='year';b.dataset.year=y;b.textContent=y+'학년도';
 b.onclick=function(){if(mathEra(y)!==mathEra(Math.min(...selectedYears)))selectedYears=new Set([y]);else if(selectedYears.has(y)){if(selectedYears.size===1)return;selectedYears.delete(y);}else selectedYears.add(y);selectedCategories.clear();refreshYearModeUi();initCategories();};box.appendChild(b);});
 document.querySelectorAll('[data-math-era]').forEach(function(b){b.onclick=function(){selectedYears=new Set(YEARS.filter(y=>mathEra(y)===b.dataset.mathEra));selectedCategories.clear();refreshYearModeUi();initCategories();};});
 document.querySelectorAll('input[name="choice"]').forEach(function(r){r.onchange=function(){selectedCategories.clear();refreshYearModeUi();initCategories();};});
 refreshYearModeUi();
};
var mathCategoryRequest=0;
initCategories=async function(){
 var request=++mathCategoryRequest;try{
 var p=new URLSearchParams({years:[...selectedYears].join(','),choice:mathChoice()});var res=await fetch('/api/cbt/math/categories?'+p),data=await res.json();if(!res.ok)throw Error(data.error||'분류 로드 실패');if(request!==mathCategoryRequest)return;
 var box=$('#categoryGroups');box.textContent='';var valid=new Set();
 for(const group of data.groups||[]){var wrap=document.createElement('div');wrap.className='category-group';var title=document.createElement('div');title.className='category-name';title.textContent=group.area;var chips=document.createElement('div');chips.className='category-chips';
 for(const item of group.categories){valid.add(item.name);var b=document.createElement('button');b.type='button';b.className='cat'+(selectedCategories.has(item.name)?' on':'');b.dataset.category=item.name;b.innerHTML=esc(item.name)+'<small>'+item.unit_count+'문항</small>';b.onclick=function(){var c=this.dataset.category;if(selectedCategories.has(c)){selectedCategories.delete(c);this.classList.remove('on');}else{selectedCategories.add(c);this.classList.add('on');}};chips.appendChild(b);}wrap.append(title,chips);box.appendChild(wrap);}
 for(const c of selectedCategories)if(!valid.has(c))selectedCategories.delete(c);
 }catch(e){if(request===mathCategoryRequest)$('#categoryGroups').textContent=e.message;}
};
var mathOldSetMode=setMode;setMode=function(next){mathOldSetMode(next);refreshYearModeUi();};
examLabel=function(){return exam?(exam.mode==='full'?'수학 실전 30문항':'수학 맞춤 '+exam.question_count+'문항')+' · '+(MATH_TRACKS[exam.choice]||''):'수학 CBT'};
sourceEntry=function(set){return set?.render_meta||null};
safeSourceUrl=function(raw){try{var u=new URL(String(raw||''),location.origin);return ['http:','https:'].includes(u.protocol)&&['mysuneung.com','www.mysuneung.com',location.hostname].includes(u.hostname)&&(u.pathname.startsWith('/account-assets/math/')||u.pathname.startsWith('/cbt-data/'))?u.href:'';}catch{return'';}};
renderingPlan=function(set,q){var im=questionEntry(set,q);return{kind:'source',prompt:'',body:sourceFramesHtml(im?.full||[], '수학 '+q.original_no+'번 원문',canonicalOriginal(set)),numeric:true,score:q.points+'점'};};
renderReading=function(set){
 var host=$('#reading');var sig=set.id+'|math-note';if(host.dataset.mathNote===sig)return;
 host.dataset.mathNote=sig;host.innerHTML='<div class="math-notebook"><span class="math-note-label">풀이 노트</span></div>';
};
var mathOriginalRender=render;
render=function(){
 mathOriginalRender();var it=flat[current];if(!it)return;var q=it.q,set=it.set;
 $('#tag').textContent=set.source.section+' · 원문 '+q.original_no+'번';
 if(q.answer_type==='numeric'){
 var choices=$('#choices');choices.classList.remove('compact');choices.removeAttribute('role');choices.removeAttribute('aria-label');
 var chosen=Object.prototype.hasOwnProperty.call(answers,q.display_no)?answers[q.display_no]:'';
 choices.innerHTML='<div class="math-short-answer"><label for="math-answer">단답형 답안</label><div class="math-answer-row"><input id="math-answer" type="text" inputmode="numeric" pattern="[0-9]{1,3}" maxlength="3" autocomplete="off" aria-describedby="math-answer-help" value="'+esc(chosen)+'" '+(grading?'readonly':'')+'><button type="button" id="math-answer-clear" class="ghost" '+(grading?'disabled':'')+'>지우기</button></div><p id="math-answer-help">0~999 사이의 정수를 입력하세요.</p><p id="math-answer-error" role="status"></p></div>';
 var input=$('#math-answer');input.oninput=function(){var v=input.value;if(!/^[0-9]{0,3}$/.test(v)){$('#math-answer-error').textContent='숫자 0~9만 입력해 주세요.';input.setAttribute('aria-invalid','true');return;}input.removeAttribute('aria-invalid');$('#math-answer-error').textContent='';if(v==='')delete answers[q.display_no];else answers[q.display_no]=Number(v);persist();updatePalette();};
 $('#math-answer-clear').onclick=function(){input.value='';input.dispatchEvent(new Event('input'));input.focus();};
 }
 if(grading&&grading[q.display_no]?.selected===null){var tag=$('#qno .bad');if(tag)tag.textContent='미응답';}
 updatePalette();
};
var mathOriginalUpdatePalette=updatePalette;
updatePalette=function(){mathOriginalUpdatePalette();document.querySelectorAll('#pgrid button').forEach(function(b,i){if(!grading)b.classList.toggle('done',Object.prototype.hasOwnProperty.call(answers,flat[i]?.q.display_no));});};
var mathOriginalFinish=finish;
finish=async function(){var input=$('#math-answer');if(input?.getAttribute('aria-invalid')==='true'){input.focus();alert('단답형 답안을 숫자로 수정한 뒤 채점해 주세요.');return;}return mathOriginalFinish();};
