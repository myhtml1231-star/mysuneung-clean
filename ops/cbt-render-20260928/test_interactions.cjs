const fs=require('fs'),assert=require('node:assert/strict');
const {browser,page,load,images,metrics,W}=require('./browser-lib.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await browser(),results=[];try{
 const p=await page(b);await load(p,'2022-06-hw-q43-45',43);await images(p);await pause(180);
 let m=await metrics(p);assert.deepEqual(m.bad,[]);assert.deepEqual(m.failed,[]);assert.equal(m.rows.length,5);assert.equal(m.rows.map(x=>x.label).join(''),'ⓐⓑⓒⓓⓔ');results.push('handwriting box labels and boundaries');
 await p.evaluate(()=>{window.testReadingImage=document.querySelector('#reading img');window.testReadingHTML=document.querySelector('#reading').innerHTML;document.querySelector('#passageScroll').scrollTop=80});
 let requests=p.imageRequests.length;await p.click('#choices .choice:nth-child(3)');await pause(120);
 const select=await p.evaluate(()=>({same:window.testReadingImage===document.querySelector('#reading img'),sameHTML:testReadingHTML===document.querySelector('#reading').innerHTML,scroll:document.querySelector('#passageScroll').scrollTop,answer:answers[flat[current].q.display_no]}));
 assert.equal(select.same,true);assert.equal(select.sameHTML,true);assert.equal(select.answer,3);assert.equal(p.imageRequests.length,requests);assert.equal(select.scroll,80);results.push('answer selection preserves passage DOM / scroll / no image request');
 for(const width of [280,360,430,545,740]){
  const d=await p.$('#passageResizer'),r=await d.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+220);await p.mouse.down();await p.mouse.move(width,r.y+220,{steps:8});await p.mouse.up();await pause(160);
  m=await metrics(p);assert.deepEqual(m.bad,[],JSON.stringify({width,m}));assert.ok(m.question.w>=380);assert.ok(m.passage.w>=280);results.push('divider drag '+width);
 }
 await p.focus('#passageResizer');await p.keyboard.press('Home');await pause(130);m=await metrics(p);assert.ok(m.passage.w<=281);assert.ok(m.labelHidden);assert.deepEqual(m.bad,[]);results.push('divider keyboard min / narrow icon button');
 await p.screenshot({path:W+'/narrow-toolbar-test.png'});
 await p.keyboard.press('End');await pause(130);m=await metrics(p);assert.ok(m.question.w>=380);assert.deepEqual(m.bad,[]);assert.ok(!m.labelHidden);results.push('divider keyboard max / full label button');
 const ratio=await p.evaluate(()=>Number(localStorage.getItem(passageStateKey())));await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>typeof renderingPlan==='function');await p.evaluate(()=>MSNAccount.ready);await load(p,'2022-06-hw-q43-45',43);await pause(150);assert.ok(Math.abs((await p.evaluate(()=>passageRatio))-ratio)<.002);results.push('divider saved ratio restored');
 await p.focus('#passageResizer');await p.keyboard.press('Enter');await pause(120);assert.ok(Math.abs(await p.evaluate(()=>passageRatio)-.44)<.001);results.push('divider reset');
 await load(p,'2023-S-common-q27-30',28);await images(p);await pause(200);m=await metrics(p);assert.deepEqual(m.bad,[]);assert.deepEqual(m.failed,[]);assert.ok((await p.$$('#reading .source-frame')).length===2);assert.ok(m.canvasPixels<=16000000+1000);results.push('novel source decoded / canvas budget');
 await p.screenshot({path:W+'/novel-test.png'});
 // Existing drawing stroke storage must survive resizing and toolbar movement.
 await p.evaluate(()=>{annotationData[currentSetId]=[{tool:'pen',color:'#000000',size:3,points:[{x:.1,y:.03},{x:.2,y:.04}]}];window.strokeBefore=JSON.stringify(annotationData[currentSetId]);resizeDrawCanvas()});
 await p.click('.paint-tool[data-tool="pen"]');await p.click('#paintCollapse');await pause(100);assert.equal(await p.evaluate(()=>document.querySelector('#paintDock').classList.contains('hidden')),false);
 const dock=await p.$('#paintDock'),dr=await dock.boundingBox();await p.mouse.move(dr.x+dr.width/2,dr.y+dr.height/2);await p.mouse.down();await p.mouse.move(220,220,{steps:10});await p.mouse.up();await pause(100);await p.click('#paintDock');await pause(180);
 const floating=await p.evaluate(()=>{const r=document.querySelector('#paintRibbon').getBoundingClientRect();return {floating:document.querySelector('#paintRibbon').classList.contains('floating'),x:r.x,y:r.y,right:r.right,tool:document.querySelector('.paint-tool.on')?.dataset.tool,same:strokeBefore===JSON.stringify(annotationData[currentSetId])}});
 assert.ok(floating.floating&&floating.right<=1440);assert.equal(floating.tool,'pen');assert.ok(floating.same);results.push('drawing toolbar drag / reopen position / active tool / strokes');
 await p.click('#showOriginal');await p.waitForFunction(()=>[...document.querySelectorAll('#inlineOriginal .source-frame')].length&&[...document.querySelectorAll('#inlineOriginal .source-frame')].every(x=>x.dataset.sourceState==='loaded'));assert.equal(await p.$('#originalModal'),null);results.push('full original inline only');await p.close();
 for(const width of [1024,800,390,360]){
  const x=await page(b,width,width<500?844:900);await load(x,'2022-06-hw-q43-45',43);await images(x);await pause(180);
  if(width<=960){await x.click('#mobileToggle');await pause(100)}
  m=await metrics(x);assert.deepEqual(m.bad,[],JSON.stringify({width,bad:m.bad}));assert.deepEqual(m.failed,[]);if(width<500)await x.screenshot({path:W+'/mobile-'+width+'-test.png',fullPage:true});
  if(width<=960){await x.click('#mobileToggle');await pause(100)}
  const reachable=await x.evaluate(()=>{const last=document.querySelector('#choices .choice:last-child');last.scrollIntoView({block:'center'});return last.getBoundingClientRect().bottom<=innerHeight-document.querySelector('.palette').getBoundingClientRect().height});assert.ok(reachable,'last choice reachable '+width);
  assert.deepEqual(x.testErrors,[]);results.push('responsive / last choice reachable '+width);await x.close();
 }
 // Simulate both corrupt/missing originals: no broken img icon or silent blank.
 const f=await page(b,1440,900,{failImages:true});await load(f,'2023-S-common-q27-30',28);await images(f);await pause(120);m=await metrics(f);
 assert.ok(m.failed.length>0);const fail=await f.evaluate(()=>({visibleBroken:[...document.querySelectorAll('img')].some(i=>i.getClientRects().length&&getComputedStyle(i).visibility!=='hidden'&&i.hasAttribute('src')&&i.complete&&!i.naturalWidth),retry:[...document.querySelectorAll('.source-status button')].map(e=>e.innerText)}));assert.equal(fail.visibleBroken,false);assert.ok(fail.retry.length>0);await f.screenshot({path:W+'/failure-state-test.png'});results.push('injected image 404 / bounded retry / no broken icon / retry action');await f.close();
 assert.deepEqual(p.testErrors,[]);fs.writeFileSync(W+'/interaction-test.json',JSON.stringify({ok:true,checks:results},null,2));console.log('PASS',results.length,results);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
