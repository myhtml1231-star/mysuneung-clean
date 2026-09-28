const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const D='/Users/shbj/Downloads/mysuneung-cbt-worker/work-20260928-results-r8';
const base=JSON.parse(fs.readFileSync(path.join(D,'dev-server.json'))).url;
const answers=JSON.parse(fs.readFileSync('/Users/shbj/Downloads/mysuneung-cbt-worker/learning-20260927/backup/answers.json'));
const taxonomy=JSON.parse(fs.readFileSync('/Users/shbj/Downloads/mysuneung-cbt-worker/learning-20260927/question-types-v2.json')).questions;
const ebs=JSON.parse(fs.readFileSync(path.join(D,'ebs-links.json'))).questions;
const groups={};for(const k of Object.keys(ebs)){const m=taxonomy[k];if(!m?.type_id)continue;(groups[m.type_id]??=[]).push(k);}
const chosen=Object.entries(groups).filter(([,a])=>a.length>=5).sort((a,b)=>b[1].length-a[1].length)[0];
if(!chosen)throw Error('No EBS type with >=5 questions');
const [typeId,keys]=chosen;const sample=keys.slice(0,Math.min(7,keys.length));
const details=sample.map((k,i)=>{const [y,m,sec,n]=k.split('-');return{academic_year:+y,month:+m,section_code:sec,original_no:+n,display_no:i+1,correct_answer:answers[k],selected:(answers[k]%5)+1};});
(async()=>{const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
try{
 await page.setViewport({width:1440,height:1000});await page.goto(base+'/mixed-cbt',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.CBTLearningUI);await page.evaluate(()=>CBTLearningUI.ready());
 await page.evaluate(details=>MSNStorage.setItem('mysuneung-cbt-learning-history-v2',JSON.stringify([{id:'r8-study-fixture',at:Date.now()-1000,mode:'custom',details,reasons:{}}])),details);
 await page.evaluate(()=>CBTLearningUI.openHistory());await page.click('#r5Tab-study');await page.waitForSelector('.r8-study-shell');
 const first=await page.evaluate(()=>({path:document.querySelectorAll('.r8-study-path button').length,oldSide:document.querySelectorAll('.r5-type-desktop').length,typeOptions:document.querySelectorAll('#r5TypeSelect option').length,reasonOpen:document.querySelector('.r8-reason')?.open,ebs:document.querySelector('.r5-ebs')?.innerText||'',transfer:!!document.querySelector('[data-r5-transfer]'),text:document.querySelector('#r5Panel-study').innerText,doc:document.documentElement.scrollWidth,vw:innerWidth}));
 assert.equal(first.path,3);assert.equal(first.oldSide,0);assert.ok(first.typeOptions>=1);assert.equal(first.reasonOpen,false);assert.ok(first.ebs.includes('EBS 공식 연계'),first.ebs);assert.ok(first.transfer);assert.ok(!first.text.includes('연계 자료는 아직 확인되지 않았습니다'));assert.ok(first.doc<=first.vw+2);
 await page.screenshot({path:path.join(D,'r8-study-1440.png'),fullPage:false});
 const reason=await page.$('.r8-reason');if(reason){await page.click('.r8-reason>summary');await page.select('.r8-reason .learn-reason-select','condition');const tip=await page.$eval('.r8-reason .r5-tip',e=>e.textContent);assert.ok(tip.length>4);}
 await page.setViewport({width:390,height:844});await new Promise(r=>setTimeout(r,120));const mobile=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,vw:innerWidth,wide:[...document.querySelectorAll('#r5Panel-study button,#r5Panel-study select,#r5Panel-study summary')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>innerWidth+2).length}));assert.ok(mobile.doc<=392&&mobile.wide===0,JSON.stringify(mobile));await page.screenshot({path:path.join(D,'r8-study-390.png'),fullPage:false});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(D,'r8-study-check.json'),JSON.stringify({ok:true,typeId,sample,first,mobile,errors},null,2));console.log('R8_STUDY_CHECK_PASS',typeId,sample.length,mobile);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});