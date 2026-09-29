// Applied to the existing CBT page before its normal initialization. No independent UI framework.
var MATH_TRACKS={A:'수학 A형',B:'수학 B형',ga:'수학 가형',na:'수학 나형',prob:'확률과 통계',calc:'미적분',geom:'기하'};
function mathEra(y){return y<=2016?'ab':y<=2021?'gana':'current'}
function mathChoice(){return document.querySelector('input[name="choice"]:checked')?.value||'prob'}
function mathSourceScope(){return document.querySelector('input[name="sourceFamily"]:checked')?.value||'all'}
window.mathChoice=mathChoice;window.mathSourceScope=mathSourceScope;
window.mathQuestionMatchesSelection=function(q){var source=mathSourceScope();return selectedYears.has(q.academic_year)&&(q.section_code==='mcommon'||q.section_code==='m'+mathChoice())&&(source==='all'||(q.exam_family||'kice')===source)};
refreshYearModeUi=function(){
 var legacy=usesLegacyYears(),era=mathEra(Math.min(...selectedYears));
 var valid=era==='ab'?['A','B']:era==='gana'?['ga','na']:['prob','calc','geom'];
 var c=mathChoice();if(!valid.includes(c))c=valid[0];
 document.querySelectorAll('input[name="choice"]').forEach(function(r){r.checked=r.value===c;r.parentElement.classList.toggle('hidden',!valid.includes(r.value));});
 var edu=document.querySelector('input[name="sourceFamily"][value="education_office"]'),canEdu=era==='current'&&[...selectedYears].some(y=>y>=2025);
 if(edu){edu.disabled=!canEdu;edu.parentElement.classList.toggle('disabled',!canEdu);if(!canEdu&&mathSourceScope()==='education_office')document.querySelector('input[name="sourceFamily"][value="all"]').checked=true;}
 var source=mathSourceScope(),hint=$('#sourceHint');if(hint)hint.textContent=source==='education_office'?'교육청 고3 전국연합만 출제 · 2025·2026학년도 3·5·7·10월 + 2027학년도 3·5·7월':source==='kice'?'평가원 6·9월과 수능만 출제합니다.':'평가원·수능과 수록된 교육청 기출을 함께 사용합니다.';
 $('#choiceSetting').classList.remove('hidden');$('#currentComposition').classList.toggle('hidden',legacy);$('#legacyComposition').classList.toggle('hidden',!legacy);
 $('#compositionNote').textContent=legacy?'이전 체제는 같은 회차 30문항을 그대로 출제합니다.':'공통 22문항 + 선택 8문항 · 원래 문항 위치와 배점을 유지합니다.';
 $('#startHint').textContent=mode==='full'?'30문항 · 객관식 21 + 단답형 9 · 100분 · 100점':'선택 범주 1~30문항 · 공통 자료 보존 · 문항 수에 맞춰 시간 설정';
 $('#generate').textContent=mode==='full'?(source==='education_office'?'교육청 30문항 만들기':'수학 30문항 만들기'):(source==='education_office'?'교육청 맞춤 문제 만들기':'맞춤 문제 만들기');
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
 document.querySelectorAll('input[name="sourceFamily"]').forEach(function(r){r.onchange=function(){selectedCategories.clear();refreshYearModeUi();initCategories();};});
 refreshYearModeUi();
};
var mathCategoryRequest=0;
initCategories=async function(){
 var request=++mathCategoryRequest;try{
 var p=new URLSearchParams({years:[...selectedYears].join(','),choice:mathChoice(),source_family:mathSourceScope()});var res=await fetch('/api/cbt/math/categories?'+p),data=await res.json();if(!res.ok)throw Error(data.error||'분류 로드 실패');if(request!==mathCategoryRequest)return;
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


// Math workspace v2: problem-first layout + movable notebook.
var mathNoteStrokes=[],mathNoteRedo=[],mathNoteSession=null,mathNoteFrame=0,mathNoteLoadedKey='',mathNoteResizeTimer=0;
function mathAccountScope(){try{return window.MSNAccount?.info()?.user?.id||'guest'}catch(e){return'guest'}}
function mathNoteStorageKey(){return exam?'mysuneung-math-note-v2:'+mathAccountScope()+':'+exam.id:''}
function mathNoteWindowKey(){return 'mysuneung-math-note-window-v2:'+mathAccountScope()}
function mathNoteCanvas(){return document.querySelector('#mathNoteCanvas')}
function mathNotePopup(){return document.querySelector('#mathNotePopup')}
function loadMathNote(){
 var key=mathNoteStorageKey();if(!key||mathNoteLoadedKey===key)return;mathNoteLoadedKey=key;mathNoteRedo=[];
 try{var x=JSON.parse(localStorage.getItem(key)||'[]');mathNoteStrokes=Array.isArray(x)?x.filter(s=>s&&Array.isArray(s.points)&&s.points.length):[]}catch(e){mathNoteStrokes=[]}
}
function saveMathNote(){var key=mathNoteStorageKey();if(!key)return;try{localStorage.setItem(key,JSON.stringify(mathNoteStrokes.slice(-700)))}catch(e){}}
function saveMathNoteWindow(){
 var p=mathNotePopup();if(!p||p.classList.contains('hidden'))return;var r=p.getBoundingClientRect();
 try{localStorage.setItem(mathNoteWindowKey(),JSON.stringify({left:r.left,top:r.top,width:r.width,height:r.height}))}catch(e){}
}
function restoreMathNoteWindow(){
 var p=mathNotePopup();if(!p)return;var state=null;try{state=JSON.parse(localStorage.getItem(mathNoteWindowKey())||'null')}catch(e){}
 var w=Math.min(innerWidth-16,Math.max(300,Number(state?.width)||520)),h=Math.min(innerHeight-16,Math.max(260,Number(state?.height)||470));
 var left=Number(state?.left),top=Number(state?.top);
 if(!Number.isFinite(left))left=Math.max(8,innerWidth-w-220);if(!Number.isFinite(top))top=84;
 left=Math.max(8,Math.min(innerWidth-w-8,left));top=Math.max(8,Math.min(innerHeight-h-8,top));
 p.style.width=w+'px';p.style.height=h+'px';p.style.left=left+'px';p.style.top=top+'px';
}
function resizeMathNoteCanvas(){
 var p=mathNotePopup(),c=mathNoteCanvas(),wrap=p?.querySelector('.math-note-canvas-wrap');if(!p||p.classList.contains('hidden')||!c||!wrap||wrap.clientWidth<1||wrap.clientHeight<1)return;
 fitInkCanvas(c,wrap.clientWidth,wrap.clientHeight,5000000);drawMathNote();
}
function drawMathNote(){
 var c=mathNoteCanvas();if(!c)return;var w=Number(c.dataset.cssWidth)||c.clientWidth,h=Number(c.dataset.cssHeight)||c.clientHeight;if(!w||!h)return;
 var ctx=c.getContext('2d'),dpr=Number(c.dataset.renderDpr)||1;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 mathNoteStrokes.forEach(s=>drawStroke(ctx,s,w,h));if(mathNoteSession?.stroke)drawStroke(ctx,mathNoteSession.stroke,w,h);
}
function queueMathNoteDraw(){if(!mathNoteFrame)mathNoteFrame=requestAnimationFrame(()=>{mathNoteFrame=0;drawMathNote()})}
function finishMathNoteStroke(){
 var s=mathNoteSession;if(!s)return;mathNoteSession=null;if(s.stroke?.points?.length){mathNoteStrokes.push(s.stroke);saveMathNote()}try{s.canvas.releasePointerCapture(s.id)}catch(e){}drawMathNote()
}
function undoMathNote(){finishMathNoteStroke();if(mathNoteStrokes.length){mathNoteRedo.push(mathNoteStrokes.pop());saveMathNote();drawMathNote()}}
function redoMathNote(){finishMathNoteStroke();if(mathNoteRedo.length){mathNoteStrokes.push(mathNoteRedo.pop());saveMathNote();drawMathNote()}}
function clearMathNote(){finishMathNoteStroke();if(mathNoteStrokes.length&&confirm('풀이 노트를 모두 지울까요?')){mathNoteStrokes=[];mathNoteRedo=[];saveMathNote();drawMathNote()}}
function closeMathNote(privateView){
 finishMathNoteStroke();var p=mathNotePopup();if(!p)return;if(!privateView)saveMathNoteWindow();p.classList.add('hidden');
 for(var id of ['mathNoteToggle','mathNoteToggleRibbon'])document.getElementById(id)?.setAttribute('aria-expanded','false');
}
function openMathNote(){
 if(!exam)return;var p=mathNotePopup();if(!p)return;if(!p.classList.contains('hidden')){closeMathNote(false);return}
 loadMathNote();p.classList.remove('hidden');restoreMathNoteWindow();
 for(var id of ['mathNoteToggle','mathNoteToggleRibbon'])document.getElementById(id)?.setAttribute('aria-expanded','true');
 mathNoteCanvas()?.classList.toggle('active',drawTool!=='hand');requestAnimationFrame(resizeMathNoteCanvas)
}
function installMathNoteButton(){
 var qt=document.querySelector('#questionInkTools');if(qt&&!document.querySelector('#mathNoteToggle')){
  var b=document.createElement('button');b.id='mathNoteToggle';b.type='button';b.className='ink-action math-note-button';b.title='이동식 풀이 노트';b.setAttribute('aria-label','이동식 풀이 노트 열기');b.setAttribute('aria-expanded','false');b.innerHTML='▤';b.onclick=openMathNote;
  var undo=document.querySelector('#questionUndo');qt.insertBefore(b,undo)
 }
 var ribbon=document.querySelector('#paintRibbon');if(ribbon&&!document.querySelector('#mathNoteToggleRibbon')){
  var b=document.createElement('button');b.id='mathNoteToggleRibbon';b.type='button';b.className='paint-source-btn math-note-ribbon-button';b.title='이동식 풀이 노트';b.setAttribute('aria-label','이동식 풀이 노트 열기');b.setAttribute('aria-expanded','false');
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg><span class="paint-source-label">풀이 노트</span>';b.onclick=openMathNote;
  document.querySelector('#showOriginal')?.before(b)
 }
}
function initMathNotePopup(){
 if(document.querySelector('#mathNotePopup'))return;installMathNoteButton();
 var p=document.createElement('section');p.id='mathNotePopup';p.className='math-note-popup hidden';p.setAttribute('role','dialog');p.setAttribute('aria-label','이동식 풀이 노트');
 p.innerHTML='<header class="math-note-header"><strong>풀이 노트</strong><div class="math-note-tools" role="toolbar" aria-label="노트 필기 도구"><button type="button" class="math-note-tool" data-note-tool="hand" title="손">✋</button><button type="button" class="math-note-tool" data-note-tool="pen" title="연필">✎</button><button type="button" class="math-note-tool" data-note-tool="highlight" title="형광펜">▰</button><button type="button" class="math-note-tool" data-note-tool="eraser" title="지우개">⌫</button><label class="math-note-color" title="색"><input id="mathNoteColor" type="color" value="#202020" aria-label="노트 필기 색"></label></div><div class="math-note-actions"><button type="button" id="mathNoteUndo" title="노트 실행 취소">↶</button><button type="button" id="mathNoteRedo" title="노트 다시 실행">↷</button><button type="button" id="mathNoteClear" title="노트 모두 지우기">지우기</button><button type="button" id="mathNoteClose" title="노트 닫기">×</button></div></header><div class="math-note-canvas-wrap"><canvas id="mathNoteCanvas" aria-label="풀이 노트 필기 영역"></canvas></div><div class="math-note-resize-hint">모서리를 드래그해 크기 조절</div>';
 document.body.appendChild(p);document.querySelectorAll('.math-note-tool').forEach(b=>b.onclick=function(){setDrawTool(this.dataset.noteTool);document.querySelectorAll('.math-note-tool').forEach(x=>x.classList.toggle('on',x.dataset.noteTool===drawTool))});var noteColor=document.querySelector('#mathNoteColor');noteColor.value=drawColor;noteColor.oninput=function(){drawColor=this.value;document.querySelectorAll('.paint-swatch').forEach(x=>x.classList.toggle('on',x.dataset.color===drawColor));var pc=document.querySelector('#paintCurrentColor');if(pc)pc.style.background=drawColor;updatePaintDock()};document.querySelector('#mathNoteUndo').onclick=undoMathNote;document.querySelector('#mathNoteRedo').onclick=redoMathNote;document.querySelector('#mathNoteClear').onclick=clearMathNote;document.querySelector('#mathNoteClose').onclick=()=>closeMathNote(false);
 var c=mathNoteCanvas();c.addEventListener('pointerdown',function(e){if(drawTool==='hand'||e.button>0||mathNoteSession)return;e.preventDefault();c.setPointerCapture(e.pointerId);mathNoteRedo=[];mathNoteSession={id:e.pointerId,canvas:c,stroke:{tool:drawTool,color:drawColor,size:drawSize,points:[canvasPoint(e,c)]}};queueMathNoteDraw()});
 c.addEventListener('pointermove',function(e){if(!mathNoteSession||mathNoteSession.id!==e.pointerId)return;e.preventDefault();var events=e.getCoalescedEvents?e.getCoalescedEvents():[e];if(!events.length)events=[e];for(var ev of events){var pt=canvasPoint(ev,c);if(mathNoteSession.stroke.tool==='underline')mathNoteSession.stroke.points=[mathNoteSession.stroke.points[0],{x:pt.x,y:mathNoteSession.stroke.points[0].y}];else mathNoteSession.stroke.points.push(pt)}if(mathNoteSession.stroke.points.length>2500)mathNoteSession.stroke.points=mathNoteSession.stroke.points.filter((_,i)=>i%2===0||i===mathNoteSession.stroke.points.length-1);queueMathNoteDraw()});
 for(var ev of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(ev,e=>{if(mathNoteSession?.id===e.pointerId)finishMathNoteStroke()});
 var header=p.querySelector('.math-note-header'),drag=null;header.addEventListener('pointerdown',function(e){if(e.target.closest('button'))return;var r=p.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};header.setPointerCapture(e.pointerId);e.preventDefault()});
 header.addEventListener('pointermove',function(e){if(!drag||drag.id!==e.pointerId)return;var w=p.offsetWidth,h=p.offsetHeight,left=Math.max(8,Math.min(innerWidth-w-8,drag.left+e.clientX-drag.x)),top=Math.max(8,Math.min(innerHeight-h-8,drag.top+e.clientY-drag.y));p.style.left=left+'px';p.style.top=top+'px'});
 function endDrag(e){if(!drag||drag.id!==e.pointerId)return;drag=null;try{header.releasePointerCapture(e.pointerId)}catch(x){}saveMathNoteWindow()}
 header.addEventListener('pointerup',endDrag);header.addEventListener('pointercancel',endDrag);
 new ResizeObserver(function(){clearTimeout(mathNoteResizeTimer);mathNoteResizeTimer=setTimeout(function(){resizeMathNoteCanvas();saveMathNoteWindow()},40)}).observe(p);
 window.addEventListener('resize',function(){if(!p.classList.contains('hidden')){restoreMathNoteWindow();resizeMathNoteCanvas()}});
 window.addEventListener('pagehide',function(){finishMathNoteStroke();saveMathNoteWindow()});window.addEventListener('msn-account-locked',function(){closeMathNote(true);mathNoteStrokes=[];mathNoteRedo=[];mathNoteLoadedKey=''});
}
function initMathWorkspaceLayout(){
 var ribbon=document.querySelector('#paintRibbon'),dock=document.querySelector('#paintDock');if(ribbon&&ribbon.parentElement!==document.body)document.body.appendChild(ribbon);if(dock&&dock.parentElement!==document.body)document.body.appendChild(dock);
 document.querySelector('#showOriginal')?.classList.add('hidden');initMathNotePopup();
}
var mathOldSavedPaintDockPosition=savedPaintDockPosition,mathOldSavePaintDockPosition=savePaintDockPosition;
savedPaintDockPosition=function(){try{var p=JSON.parse(localStorage.getItem('mysuneung-math-paint-dock-v2:'+mathAccountScope())||'null');if(p&&Number.isFinite(+p.left)&&Number.isFinite(+p.top))return{left:+p.left,top:+p.top}}catch(e){}return null};
savePaintDockPosition=function(left,top){try{localStorage.setItem('mysuneung-math-paint-dock-v2:'+mathAccountScope(),JSON.stringify({left:+left,top:+top}))}catch(e){}};
placePaintRibbonAtSaved=function(){
 var ribbon=$('#paintRibbon');if(!ribbon)return;var p=savedPaintDockPosition(),pane=$('#questionPane')?.getBoundingClientRect();if(!p)p={left:Math.max(8,(pane?.left||8)+18),top:Math.max(72,(pane?.top||64)+14)};
 ribbon.classList.add('floating','math-global-ribbon');ribbon.style.left=p.left+'px';ribbon.style.top=p.top+'px';ribbon.style.right='auto';ribbon.style.bottom='auto';requestAnimationFrame(function(){var c=clampPaintRibbon(p.left,p.top);ribbon.style.left=c.left+'px';ribbon.style.top=c.top+'px';savePaintDockPosition(c.left,c.top)})
};
placePaintDock=function(){var dock=$('#paintDock');if(!dock)return;var p=savedPaintDockPosition(),pane=$('#questionPane')?.getBoundingClientRect();if(!p)p={left:Math.max(8,(pane?.left||8)+18),top:Math.max(72,(pane?.top||64)+14)};p=clampPaintDock(p.left,p.top);dock.style.left=p.left+'px';dock.style.top=p.top+'px';dock.style.right='auto';dock.style.bottom='auto';savePaintDockPosition(p.left,p.top)};
var mathOldSetDrawTool=setDrawTool;setDrawTool=function(tool){mathOldSetDrawTool(tool);mathNoteCanvas()?.classList.toggle('active',tool!=='hand');document.querySelectorAll('.math-note-tool').forEach(x=>x.classList.toggle('on',x.dataset.noteTool===tool))};
var mathOldInitDrawing=initDrawing;initDrawing=function(){mathOldInitDrawing();initMathWorkspaceLayout()};
var mathOldInitPaintDock=initPaintDock;initPaintDock=function(){mathOldInitPaintDock();if(!paintCollapsed)setTimeout(placePaintRibbonAtSaved,0)};
var mathOldLoadExam=loadExam;loadExam=function(e,isNew){mathNoteLoadedKey='';closeMathNote(false);return mathOldLoadExam(e,isNew)};
renderReading=function(){};
