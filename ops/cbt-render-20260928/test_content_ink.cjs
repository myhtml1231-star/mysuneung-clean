const fs=require('fs'),assert=require('node:assert/strict');
const {browser,page,load,images,metrics,W}=require('./browser-lib.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function stroke(p,selector,tool='pen'){
 await p.evaluate(tool=>setDrawTool(tool),tool);await p.$eval(selector,e=>e.scrollIntoView({block:'center'}));await pause(90);
 const r=await (await p.$(selector)).boundingBox();await p.mouse.move(r.x+r.width*.25,r.y+r.height*.4);await p.mouse.down();await p.mouse.move(r.x+r.width*.62,r.y+r.height*.65,{steps:8});await p.mouse.up();await pause(90);
}
(async()=>{const b=await browser(),checks=[];try{
 const p=await page(b);await load(p,'2026-09-common-q01-03',3);await images(p);await pause(180);
 let v=await p.evaluate(()=>({boxes:[...document.querySelectorAll('.exam-box')].map(x=>x.innerText),score:document.querySelector('.question-score')?.innerText,errors:window.lastRenderPlan}));
 assert.ok(!v.boxes.some(x=>/^보기\s*\[3점\]$/.test(x)));assert.equal(v.score,'3점');checks.push('score badge and no score-only duplicate view');await p.screenshot({path:W+'/score-fixed.png'});
 await load(p,'2023-S-common-q04-09',8);await images(p);await pause(120);v=await p.evaluate(()=>document.querySelector('#questionBody').innerText);assert.ok(v.includes('『임원경제지』'));assert.ok(!/[\u{f0000}-\u{ffffd}]/u.test(v));checks.push('source-confirmed book quotation glyphs');await p.screenshot({path:W+'/book-fixed.png'});
 await load(p,'2026-06-common-q14-17',17);await images(p);await pause(120);v=await p.evaluate(()=>[...document.querySelectorAll('[data-box-layout=dialogue] .exam-labelled-row')].map(e=>e.innerText));assert.equal(v.length,3);checks.push('dialogue turns separated');await p.screenshot({path:W+'/dialogue-fixed.png'});
 await load(p,'2023-06-common-q14-17',15);await images(p);await pause(120);v=await p.evaluate(()=>({head:document.querySelector('#choiceMatrixHead').innerText,cells:[...document.querySelectorAll('.choice-cell')].map(e=>e.innerText)}));assert.equal(v.cells.length,10);assert.ok(v.head.includes('A')&&v.head.includes('B'));assert.equal(v.cells.join('|'),'클|클|클|작을|같을|클|작을|클|작을|작을');checks.push('A B choice columns preserve pairing');await p.screenshot({path:W+'/matrix-fixed.png'});
 await load(p,'2023-S-lm-q37-37',37);await images(p);await pause(120);assert.deepEqual((await metrics(p)).bad,[]);await p.screenshot({path:W+'/old-hangul-fixed.png'});checks.push('old Hangul decoded source');
 // Draw on a real answer choice: no answer selection in pen mode.
 await load(p,'2026-06-common-q14-17',17);await images(p);await pause(180);
 await stroke(p,'#choices .choice:nth-child(2)');
 v=await p.evaluate(()=>({strokes:annotationData[currentSetId],answer:answers[flat[current].q.display_no]||null}));assert.equal(v.answer,null);assert.equal(v.strokes.length,1);assert.equal(v.strokes[0].surface,'question');assert.equal(v.strokes[0].question_no,17);assert.equal(v.strokes[0].anchor.id,'choice-2');checks.push('real pointer drawing on choices does not select an answer');
 await p.evaluate(()=>{window.savedStroke=JSON.stringify(annotationData[currentSetId]);window.testExam=exam;window.savedSet=currentSetId});await p.evaluate(()=>undoInk('question'));assert.equal(await p.evaluate(()=>annotationData[currentSetId].length),0);await p.evaluate(()=>redoInk('question'));assert.equal(await p.evaluate(()=>JSON.stringify(annotationData[currentSetId])===savedStroke),true);checks.push('question-only undo redo');
 await p.evaluate(()=>{go(0)});assert.equal(await p.evaluate(()=> (annotationData[currentSetId]||[]).filter(s=>isSurfaceStroke(s,'question',inkQuestionNo())).length),0);await p.evaluate(()=>go(flat.findIndex(x=>x.q.original_no===17)));assert.equal(await p.evaluate(()=> (annotationData[currentSetId]||[]).filter(s=>isSurfaceStroke(s,'question',inkQuestionNo())).length),1);checks.push('question navigation isolates and restores ink');
 await p.evaluate(()=>loadAnnotationStore());assert.equal(await p.evaluate(()=>JSON.stringify(annotationData[currentSetId])===savedStroke),true);checks.push('local persisted ink round trip');
 await p.focus('#passageResizer');await p.keyboard.press('Home');await pause(180);assert.deepEqual((await metrics(p)).bad,[]);
 v=await p.evaluate(()=>{const s=annotationData[currentSetId][0],c=document.querySelector('#questionCanvas'),r=projectInkStroke(s,c).points[0],box=document.querySelector('.choice[data-v="2"]').getBoundingClientRect(),cr=c.getBoundingClientRect();return {x:cr.x+r.x*cr.width,y:cr.y+r.y*cr.height,l:box.left,r:box.right,t:box.top,b:box.bottom}});assert.ok(v.x>=v.l&&v.x<=v.r&&v.y>=v.t&&v.y<=v.b);checks.push('resizer keeps question ink anchored to its choice');
 await p.evaluate(()=>setDrawTool('hand'));await p.click('#choices .choice:nth-child(2)');assert.equal(await p.evaluate(()=>answers[flat[current].q.display_no]),2);checks.push('hand mode permits answer selection');
 await p.evaluate(()=>{document.querySelector('#questionPane').scrollTop=0;});await p.screenshot({path:W+'/question-ink.png'});
 await p.evaluate(()=>clearAllInkPrivateView());assert.equal(await p.evaluate(()=>Object.keys(annotationData).length),0);checks.push('private ink state cleared on account lock');
 assert.deepEqual(p.testErrors,[]);await p.close();
 for(const width of [1024,800,390,360]){const x=await page(b,width,width<500?844:900);await load(x,'2023-06-common-q14-17',15);await images(x);await pause(160);assert.deepEqual((await metrics(x)).bad,[]);const qtools=await x.$eval('#questionInkTools',e=>e.getBoundingClientRect().right);assert.ok(qtools<=width);checks.push('responsive question toolbar and matrix '+width);await x.close()}
 fs.writeFileSync(W+'/content-ink-test.json',JSON.stringify({ok:true,checks},null,2));console.log('PASS',checks.length,checks);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
