function paintDrawingPreview(){
 if(!drawing)return;const r=drawing,select=$('#drawingSurfaceSelect'),value=select.value;
 const strokes=(r.data.strokes||[]).filter(s=>value==='passage'?s.surface!=='question':s.surface==='question'&&Number(s.question_no)===Number(value.slice(1)));
 const c=$('#drawingCanvas'),ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);
 for(const s of strokes){ctx.save();ctx.beginPath();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=/^#[\da-f]{6}$/i.test(s.color)?s.color:'#202020';ctx.globalAlpha=s.tool==='highlight'?.28:1;ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.lineWidth=s.tool==='eraser'?Math.max(18,(s.size||3)*6):s.tool==='highlight'?Math.max(12,(s.size||3)*4):Math.max(1,Math.min(30,s.size||3));for(let i=0;i<s.points.length;i++){const p=s.points[i],x=p.x*c.width,y=p.y*c.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}if(s.points.length===1)ctx.lineTo(s.points[0].x*c.width+.05,s.points[0].y*c.height+.05);ctx.stroke();ctx.restore()}
 $('#drawingSource').textContent=drawingLabel(r.data)+' · '+(value==='passage'?'지문':value.slice(1)+'번 문제')+' 필기 '+strokes.length+'개';
 const related=find('attempt',r.data.exam_id)||find('draft',r.data.exam_id);$('#drawingReplay').classList.toggle('hidden',!related);
 if(related)$('#drawingReplay').href=replay(related,related.data.details?.find(q=>q.unit_id===r.data.unit_id&&(value==='passage'||Number(q.original_no)===Number(value.slice(1))))?.question_key);
}
function openDrawing(id){
 const r=find('annotation',id);if(!r)return;drawing=r;
 let select=$('#drawingSurfaceSelect');if(!select){select=document.createElement('select');select.id='drawingSurfaceSelect';select.setAttribute('aria-label','필기 영역 선택');select.style.cssText='width:100%;padding:10px 12px;margin:10px 0;border:1px solid #dce4ef;border-radius:10px;background:#fff;color:#273446';$('#drawingCanvas').before(select);select.onchange=paintDrawingPreview;}
 const surfaces=[];if((r.data.strokes||[]).some(s=>s.surface!=='question'))surfaces.push(['passage','지문 필기']);
 for(const no of [...new Set((r.data.strokes||[]).filter(s=>s.surface==='question').map(s=>s.question_no))].sort((a,b)=>a-b))surfaces.push(['q'+no,'원문 '+no+'번 문제 필기']);
 if(!surfaces.length)surfaces.push(['passage','지문 필기']);select.replaceChildren(...surfaces.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o}));
 paintDrawingPreview();$('#drawingDialog').showModal();
}
