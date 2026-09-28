const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const D='/Users/shbj/Downloads/mysuneung-cbt-worker/work-20260928-results-r8';
const base=JSON.parse(fs.readFileSync(path.join(D,'dev-server.json'))).url;
const answers=JSON.parse(fs.readFileSync('/Users/shbj/Downloads/mysuneung-cbt-worker/learning-20260927/backup/answers.json'));
const taxonomy=JSON.parse(fs.readFileSync('/Users/shbj/Downloads/mysuneung-cbt-worker/learning-20260927/question-types-v2.json')).questions;
const keys=Object.keys(taxonomy).filter(k=>k.startsWith('2026-11-')).slice(0,45);
const details=keys.map((k,i)=>{const [y,m,sec,n]=k.split('-');return {academic_year:+y,month:+m,section_code:sec,original_no:+n,display_no:i+1,correct_answer:answers[k],selected:i>=43?null:(i%3===0?(answers[k]%5)+1:answers[k])};});
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.setViewport({width:1440,height:1000});
  await page.goto(base+'/mixed-cbt',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.CBTLearningUI);
  await page.evaluate(()=>CBTLearningUI.ready());
  await page.evaluate(details=>{MSNStorage.setItem('mysuneung-cbt-learning-history-v2',JSON.stringify([{id:'r8-ui-fixture',at:Date.now()-1000,mode:'full',details,reasons:{}}]));},details);
  await page.evaluate(()=>CBTLearningUI.openHistory());
  await page.waitForSelector('#r5Panel-summary .r8-summary-grid');
  const desktop=await page.evaluate(()=>({
    title:document.querySelector('#r5Title')?.textContent,
    score:document.querySelector('.r8-score-number')?.textContent,
    route:document.querySelectorAll('.r8-route>div').length,
    folds:[...document.querySelectorAll('.r8-fold')].map(x=>x.open),
    visibleText:document.querySelector('#r5Panel-summary')?.innerText,
    doc:document.documentElement.scrollWidth,vw:innerWidth
  }));
  assert.equal(desktop.title,'누적 학습 기록');
  assert.ok(desktop.score);
  assert.equal(desktop.route,3);
  assert.ok(desktop.folds.every(x=>x===false));
  assert.ok(desktop.doc<=desktop.vw+2,JSON.stringify(desktop));
  assert.ok(!/최근 30회 첫 응답 기준/.test(desktop.visibleText));
  await page.screenshot({path:path.join(D,'r8-summary-1440.png'),fullPage:false});
  await page.setViewport({width:390,height:844});await new Promise(r=>setTimeout(r,100));
  const mobile=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,vw:innerWidth,wide:[...document.querySelectorAll('#r5Report button,#r5Report summary')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>innerWidth+2).length}));
  assert.ok(mobile.doc<=392&&mobile.wide===0,JSON.stringify(mobile));
  await page.screenshot({path:path.join(D,'r8-summary-390.png'),fullPage:false});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(D,'r8-ui-check.json'),JSON.stringify({ok:true,desktop,mobile,errors},null,2));
  console.log('R8_UI_CHECK_PASS',desktop.score,desktop.route,mobile);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});