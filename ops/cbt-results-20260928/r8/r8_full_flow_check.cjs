const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const D='/Users/shbj/Downloads/mysuneung-cbt-worker/work-20260928-results-r8';
const base=JSON.parse(fs.readFileSync(path.join(D,'dev-server.json'))).url;
const answers=JSON.parse(fs.readFileSync('/Users/shbj/Downloads/mysuneung-cbt-worker/learning-20260927/backup/answers.json'));
(async()=>{const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();page.setDefaultTimeout(20000);const errors=[];const generated=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.setViewport({width:1440,height:1000});await page.setRequestInterception(true);page.on('request',r=>{if(r.url().includes('/api/cbt/generate'))generated.push(r.postData()||'');r.continue();});
 await page.goto(base+'/mixed-cbt',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.CBTLearningUI);await page.evaluate(()=>CBTLearningUI.ready());
 await page.evaluate(()=>{setMode('full');selectedYears.clear();selectedYears.add(2026);document.querySelector('input[name="choice"][value="hw"]').checked=true;});
 await page.click('#generate');await page.waitForFunction(()=>window.exam&&exam.question_count===45);
 const originalExam=await page.evaluate(()=>JSON.parse(JSON.stringify(exam)));
 const items=originalExam.sections.flatMap(s=>s.questions.map(q=>({display:q.display_no,key:q.question_key||[s.source.academic_year,String(s.source.month).padStart(2,'0'),s.section_code,String(q.original_no).padStart(2,'0')].join('-')})));
 const choices=items.filter(x=>x.display<44).map(x=>({...x,value:x.display%3===0?(answers[x.key]%5)+1:answers[x.key]}));
 await page.evaluate(items=>{for(const x of items){document.querySelectorAll('#pgrid .qb')[x.display-1].click();document.querySelector('.choice[data-v="'+x.value+'"]').click();}document.querySelector('#submit').click();},choices);
 await page.click('#confirm');await page.waitForFunction(()=>!document.querySelector('#analysis').classList.contains('hidden')&&document.querySelector('.r8-score-number'));
 const score=await page.$eval('.r8-score-number',e=>e.textContent.trim()),pills=await page.$$eval('.r8-score-pills b',a=>a.map(x=>Number(x.textContent)));
 assert.equal(score,'64.4%');assert.deepEqual(pills,[29,14,2]);assert.equal(await page.$eval('#r5Title',e=>e.textContent),'채점 결과');
 assert.equal(await page.$$eval('#r5Panel-summary .r8-today',a=>a.length),1);assert.ok((await page.$$eval('.r8-fold',a=>a.filter(x=>x.open).length))===0);
 // Question-specific review reason still works after being collapsed.
 await page.click('#r5Tab-questions');await page.click('[data-r5-filter="wrong"]');await page.waitForSelector('#r5QuestionDetail .r8-reason');
 await page.click('#r5QuestionDetail .r8-reason>summary');await page.select('#r5QuestionDetail .learn-reason-select','condition');const tip=await page.$eval('#r5QuestionDetail .r5-tip',e=>e.textContent);assert.ok(tip.length>4);
 const key=await page.$eval('#r5QuestionDetail .learn-reason-editor',e=>e.dataset.key);await page.click('#r5QuestionDetail .r5-fold summary');await page.type('#r5QuestionDetail textarea','조건을 먼저 표시하고 근거 문장을 다시 확인한다.');await page.click('#r5QuestionDetail [data-learn-save]');await page.waitForFunction(()=>document.querySelector('#r5QuestionDetail .learn-save-state').textContent.includes('저장'));
 const saved=await page.evaluate(()=>JSON.parse(MSNStorage.getItem('mysuneung-cbt-learning-history-v2')));assert.ok(saved[0].reasons[key].note.includes('조건을 먼저'));
 // Study screen is focused and transfer generates unseen past exam.
 await page.click('#r5Tab-study');await page.waitForSelector('.r8-study-shell');assert.equal(await page.$$eval('.r5-type-desktop',a=>a.length),0);assert.equal(await page.$$eval('.r8-study-path button',a=>a.length),3);assert.ok(await page.$('[data-r5-transfer]'));
 const origin=await page.$eval('[data-r5-transfer]',e=>e.dataset.r5Origin),type=await page.$eval('[data-r5-transfer]',e=>e.dataset.r5Transfer),oldId=originalExam.id;
 await page.click('[data-r5-transfer]');await page.waitForFunction(id=>window.exam?.id!==id&&!document.querySelector('#app').classList.contains('hidden'),{},oldId);
 const nextExam=await page.evaluate(()=>JSON.parse(JSON.stringify(exam)));assert.equal(nextExam.learning.practice_mode,'transfer');const oldSets=new Set(originalExam.sections.map(s=>s.id));for(const sec of nextExam.sections){assert.ok(!oldSets.has(sec.id));assert.ok(sec.questions.some(q=>q.type_id===type&&q.analysis_eligible));}
 assert.ok(generated.every(x=>!x.includes('조건을 먼저')&&!x.includes('reasons')),'private review notes leaked to generation payload');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(D,'r8-full-flow-check.json'),JSON.stringify({ok:true,score,pills,origin,type,nextExam:nextExam.id,generated:generated.length,errors},null,2));
 console.log('R8_FULL_FLOW_PASS',{score,pills,transferSections:nextExam.sections.length,generated:generated.length});
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});