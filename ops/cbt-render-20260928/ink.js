// Backward-compatible per-unit stroke arrays: legacy strokes are passage ink.
var inkSurface='passage',inkSession=null,inkFrame=0;
function inkCanvas(surface){return $(surface==='question'?'#questionCanvas':'#drawCanvas')}
function inkQuestionNo(){return Number(flat[current]&&flat[current].q.original_no)||0}
function isSurfaceStroke(s,surface,no){return (s.surface||'passage')===surface&&(surface!=='question'||Number(s.question_no)===Number(no))}
function inkHistoryKey(surface){return currentSetId+'|'+surface+'|'+(surface==='question'?inkQuestionNo():0)}
function inkAnchorElements(){
 var out=[{id:'stem',el:$('#stem')}];
 $('#qassets')?.querySelectorAll('.exam-box').forEach((el,i)=>out.push({id:'box-'+i,el}));
 $('#qassets')?.querySelectorAll('.source-frame').forEach((el,i)=>out.push({id:'source-'+i,el}));
 $('#choices')?.querySelectorAll('.choice').forEach(el=>out.push({id:'choice-'+el.dataset.v,el}));
 return out.filter(a=>a.el&&a.el.getClientRects().length);
}
function anchorBox(el,canvas){var r=el.getBoundingClientRect(),c=canvas.getBoundingClientRect();return {x:(r.left-c.left)/c.width,y:(r.top-c.top)/c.height,w:r.width/c.width,h:r.height/c.height}}
function captureInkAnchor(e,c){
 var candidates=inkAnchorElements().filter(a=>{var r=a.el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom});
 if(!candidates.length)return null;var a=candidates[candidates.length-1],b=anchorBox(a.el,c);
 if(b.w<=0||b.h<=0||b.x<0||b.y<0||b.x+b.w>1.001||b.y+b.h>1.001)return null;
 return {id:a.id,x:Math.max(0,b.x),y:Math.max(0,b.y),w:Math.min(1,b.w),h:Math.min(1,b.h)};
}
function projectInkStroke(stroke,c){
 var a=stroke.anchor;if(!a||stroke.surface!=='question')return stroke;
 var target=inkAnchorElements().find(x=>x.id===a.id);if(!target||a.w<=0||a.h<=0)return stroke;
 var b=anchorBox(target.el,c);
 return {...stroke,points:stroke.points.map(p=>({x:b.x+(p.x-a.x)/a.w*b.w,y:b.y+(p.y-a.y)/a.h*b.h}))};
}
function setDrawTool(tool){
 finishActiveInk();drawTool=tool;
 document.querySelectorAll('.paint-tool[data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===tool));
 for(var surface of ['passage','question'])inkCanvas(surface)?.classList.toggle('active',tool!=='hand');
 $('#questionInkTools')?.setAttribute('data-mode',tool);updatePaintDock();
}
function fitInkCanvas(canvas,w,h,budget){
 if(!canvas||w<1||h<1)return;
 var dpr=Math.min(2,window.devicePixelRatio||1,Math.sqrt(budget/(w*h)),16384/Math.max(w,h));
 var bw=Math.max(1,Math.round(w*dpr)),bh=Math.max(1,Math.round(h*dpr));canvas.style.width=w+'px';canvas.style.height=h+'px';
 if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh}
 canvas.dataset.cssWidth=w;canvas.dataset.cssHeight=h;canvas.dataset.renderDpr=dpr;
}
function resizeDrawCanvas(){
 if(!currentSetId)return;
 var stage=$('#readingStage'),canvas=$('#drawCanvas'),qstage=$('#questionStage'),body=$('#questionBody');
 if(stage&&stage.clientWidth>0){var h=Math.max(100,$('#reading').scrollHeight);stage.style.minHeight=h+'px';fitInkCanvas(canvas,stage.clientWidth,h,8000000)}
 if(qstage&&body&&qstage.clientWidth>0)fitInkCanvas($('#questionCanvas'),qstage.clientWidth,Math.max(100,body.offsetHeight),8000000);
 drawAll();
}
function drawStroke(ctx,stroke,w,h){
 if(!stroke?.points?.length)return;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';var size=Number(stroke.size)||3,color=stroke.color||'#202020';
 if(stroke.tool==='eraser'){ctx.globalCompositeOperation='destination-out';ctx.lineWidth=Math.max(18,size*6)}
 else if(stroke.tool==='highlight'){ctx.globalAlpha=.28;ctx.strokeStyle=color;ctx.lineWidth=Math.max(12,size*4)}
 else {ctx.strokeStyle=color;ctx.lineWidth=stroke.tool==='underline'?Math.max(1.5,size*.85):size}
 ctx.beginPath();stroke.points.forEach((p,i)=>{var x=p.x*w,y=p.y*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
 if(stroke.points.length===1){var p=stroke.points[0];ctx.lineTo(p.x*w+.05,p.y*h+.05)}ctx.stroke();ctx.restore();
}
function drawAll(){
 for(var surface of ['passage','question']){
  var c=inkCanvas(surface);if(!c)continue;var w=Number(c.dataset.cssWidth)||c.clientWidth,h=Number(c.dataset.cssHeight)||c.clientHeight;if(!w||!h)continue;
  var ctx=c.getContext('2d'),dpr=Number(c.dataset.renderDpr)||1;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  (annotationData[currentSetId]||[]).filter(s=>isSurfaceStroke(s,surface,inkQuestionNo())).forEach(s=>drawStroke(ctx,projectInkStroke(s,c),w,h));
  if(inkSession&&inkSession.surface===surface&&inkSession.setId===currentSetId&&activeStroke)drawStroke(ctx,projectInkStroke(activeStroke,c),w,h);
 }
}
function queueInkDraw(){if(!inkFrame)inkFrame=requestAnimationFrame(()=>{inkFrame=0;drawAll()})}
function canvasPoint(e,canvas){var c=canvas||$('#drawCanvas'),r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
function finishActiveInk(){
 if(!inkSession||!activeStroke)return;
 var session=inkSession,stroke=activeStroke;inkSession=null;activeStroke=null;
 (annotationData[session.setId]||(annotationData[session.setId]=[])).push(stroke);
 try{session.canvas.releasePointerCapture(session.id)}catch(e){}
 saveAnnotationStore();drawAll();
}
function undoInk(surface){
 finishActiveInk();inkSurface=surface||inkSurface;var a=annotationData[currentSetId]||[],no=inkQuestionNo();
 for(var i=a.length-1;i>=0;i--)if(isSurfaceStroke(a[i],inkSurface,no)){var s=a.splice(i,1)[0],k=inkHistoryKey(inkSurface);(redoData[k]||(redoData[k]=[])).push(s);saveAnnotationStore();drawAll();break}
}
function redoInk(surface){finishActiveInk();inkSurface=surface||inkSurface;var r=redoData[inkHistoryKey(inkSurface)]||[];if(r.length){(annotationData[currentSetId]||(annotationData[currentSetId]=[])).push(r.pop());saveAnnotationStore();drawAll()}}
function clearInk(surface){
 finishActiveInk();inkSurface=surface||inkSurface;
 if(!confirm(inkSurface==='question'?'이 문제의 필기를 모두 지울까요?':'현재 지문의 필기를 모두 지울까요?'))return;
 var no=inkQuestionNo();annotationData[currentSetId]=(annotationData[currentSetId]||[]).filter(s=>!isSurfaceStroke(s,inkSurface,no));redoData[inkHistoryKey(inkSurface)]=[];saveAnnotationStore();drawAll();
}
function initDrawing(){
 for(const surface of ['passage','question']){
  const c=inkCanvas(surface);if(!c)continue;
  c.addEventListener('pointerdown',e=>{
   if(drawTool==='hand'||e.button>0||inkSession||!currentSetId)return;e.preventDefault();inkSurface=surface;c.setPointerCapture(e.pointerId);
   var p=canvasPoint(e,c);activeStroke={tool:drawTool,color:drawColor,size:drawSize,points:[p]};
   if(surface==='question'){activeStroke.surface='question';activeStroke.question_no=inkQuestionNo();var a=captureInkAnchor(e,c);if(a)activeStroke.anchor=a}
   inkSession={id:e.pointerId,surface,setId:currentSetId,canvas:c};redoData[inkHistoryKey(surface)]=[];queueInkDraw();
  });
  c.addEventListener('pointermove',e=>{
   if(!activeStroke||inkSession?.id!==e.pointerId||inkSession.canvas!==c)return;e.preventDefault();
   var events=e.getCoalescedEvents?e.getCoalescedEvents():[e];if(!events.length)events=[e];
   for(const event of events){var p=canvasPoint(event,c);if(activeStroke.tool==='underline')activeStroke.points=[activeStroke.points[0],{x:p.x,y:activeStroke.points[0].y}];else activeStroke.points.push(p)}
   if(activeStroke.points.length>2000)activeStroke.points=activeStroke.points.filter((_,i)=>i%2===0||i===activeStroke.points.length-1);
   queueInkDraw();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(event,e=>{if(inkSession?.id===e.pointerId)finishActiveInk()});
 }
 document.querySelectorAll('.paint-tool[data-tool]').forEach(b=>b.onclick=()=>setDrawTool(b.dataset.tool));
 document.querySelectorAll('.paint-swatch').forEach(b=>b.onclick=()=>{drawColor=b.dataset.color;$('#paintCurrentColor').style.background=drawColor;document.querySelectorAll('.paint-swatch').forEach(x=>x.classList.toggle('on',x===b));updatePaintDock()});
 $('#undoDraw').onclick=()=>undoInk();$('#redoDraw').onclick=()=>redoInk();$('#clearDraw').onclick=()=>clearInk();
 $('#questionUndo').onclick=()=>undoInk('question');$('#questionRedo').onclick=()=>redoInk('question');$('#questionClear').onclick=()=>clearInk('question');
 $('#paintCurrentColor').style.background=drawColor;
 var observer=new ResizeObserver(()=>scheduleCanvasResize());observer.observe($('#questionBody'));
 window.addEventListener('resize',scheduleCanvasResize);window.addEventListener('pagehide',finishActiveInk);
 window.clearAllInkPrivateView=function(){inkSession=null;activeStroke=null;annotationData={};redoData={};for(const s of ['passage','question']){var c=inkCanvas(s);c?.getContext('2d')?.clearRect(0,0,c.width,c.height)}};
}
