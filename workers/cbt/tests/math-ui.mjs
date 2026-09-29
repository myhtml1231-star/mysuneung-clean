import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {handleMath,loadMathBank,mathExamFromQuestions,mathGrade} from '../src/math-core.mjs';
const require=createRequire(import.meta.url),puppeteer=require('/Users/shbj/Downloads/mysuneung-cbt-worker/node_modules/puppeteer-core');
const repo=path.resolve(new URL('../../..',import.meta.url).pathname),app=path.join(repo,'workers/cbt/app/math.html'),assets=path.join(repo,'workers/accounts/public');
const out=path.join(repo,'ops/math-cbt-20260929/evidence');fs.mkdirSync(out,{recursive:true});const bank=loadMathBank();
const errors=[],requests=[];const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://localhost');let response;
 if(u.pathname.startsWith('/api/cbt/math/')){const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);response=await handleMath(new Request('https://mysuneung.com'+u.pathname+u.search,{method:req.method,headers:{'Content-Type':'application/json'},...(req.method==='POST'?{body}: {})}),{});}
 else if(u.pathname==='/api/account/session')response=Response.json({ok:true,user:null});
 else if(u.pathname==='/api/visit')response=Response.json({ok:true,today:0,month:0});
 else if(u.pathname==='/favicon.ico')response=new Response(null,{status:204});
 else{let file=u.pathname==='/mixed-cbt'?app:path.join(assets,decodeURIComponent(u.pathname));if(!file.startsWith(repo)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return;}const mime=file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.webp')?'image/webp':'text/css';response=new Response(fs.readFileSync(file),{headers:{'Content-Type':mime}});}
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){errors.push(String(e));res.writeHead(500);res.end('failed');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try{
 const p=await browser.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.accept());
 await p.setRequestInterception(true);p.on('request',async r=>{const u=new URL(r.url());requests.push(u.pathname);if(u.origin===base){r.continue();return;}if(u.hostname==='mysuneung.com'&&u.pathname.startsWith('/account-assets/')){const f=path.join(assets,u.pathname);if(fs.existsSync(f)){await r.respond({status:200,contentType:f.endsWith('.webp')?'image/webp':'application/javascript',body:fs.readFileSync(f)});return;}}r.abort();});
 await p.setViewport({width:1440,height:1000});await p.goto(base+'/mixed-cbt?subject=math',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>window.CBTLearningUI&&document.querySelectorAll('#years .year').length===14&&document.querySelectorAll('#categoryGroups .cat').length>0);
 console.log('INIT',await p.$eval('#startHint',e=>e.textContent));await p.screenshot({path:path.join(out,'math-start-1440.png')});
 await p.click('#generate');await p.waitForFunction(()=>window.flat?.length===30&&!document.querySelector('#app').classList.contains('hidden'));
 await p.waitForFunction(()=>{const i=document.querySelector('#qassets img');return i?.complete&&i.naturalWidth>0;});
 assert.equal(await p.evaluate(()=>exam.max_score),100);assert.equal(await p.evaluate(()=>exam.time_limit_seconds),6000);
 await p.screenshot({path:path.join(out,'math-full-1440.png')});
 await p.evaluate(()=>go(15));await p.waitForSelector('#math-answer');await p.type('#math-answer','0');
 assert.equal(await p.evaluate(()=>answers[16]),0);assert.equal(await p.$eval('#pgrid button:nth-child(16)',e=>e.classList.contains('done')),true);
 await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.flat?.length===30);await p.evaluate(()=>go(15));
 assert.equal(await p.$eval('#math-answer',e=>e.value),'0');
 // Fill known canonical answers in the test browser only; the generated exam must contain none.
 const data=await p.evaluate(()=>({exam,refs:flat.map(it=>({...it.q,academic_year:it.set.source.academic_year,month:it.set.source.month,section_code:it.set.section_code}))}));
 assert.ok(!JSON.stringify(data.exam).includes('correct_answer'));
 const answers=Object.fromEntries(data.refs.map(q=>[q.display_no,bank.questions[q.question_key].correct_answer]));
 answers[1]=answers[1]===5?1:answers[1]+1;delete answers[2];
 await p.evaluate(a=>{window.answers=a;render();},answers);await p.click('#submit');await p.waitForSelector('#modal:not(.hidden)');await p.click('#confirm');
 await p.waitForFunction(()=>document.querySelector('#r5Report')&&!document.querySelector('#analysis').classList.contains('hidden'));
 const grade=mathGrade(bank,data.refs,answers);const hero=await p.$eval('#r5Hero',e=>e.textContent);console.log('RESULT',hero);assert.ok(hero.includes(String(grade.raw_score)+'점'));assert.ok(hero.includes('28 / 30'));
 await p.screenshot({path:path.join(out,'math-results-1440.png')});
 await p.click('[data-r5-action="answers"]');await p.waitForSelector('.r5-ebs');const solution=await p.$eval('.r5-ebs a',e=>e.href);assert.match(solution,/wdown\.ebsi\.co\.kr/);
 await p.setViewport({width:390,height:844});await p.screenshot({path:path.join(out,'math-results-390.png')});
 const dims=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dims.scroll<=dims.width+2,JSON.stringify(dims));
 // Legacy shared-stem image and exact numeric parsing are exercised without changing the production bank.
 const legacy=bank.forms.find(f=>f.id==='2014-09-A');const selected=legacy.question_keys.filter(k=>k.endsWith('-13')||k.endsWith('-14')).map(k=>bank.questions[k]);
 const ex=mathExamFromQuestions(selected,{mode:'custom',choice:'A',years:[2014]});await p.evaluate(e=>loadExam(e,true),ex);await p.evaluate(()=>go(1));
 await p.waitForFunction(()=>{const im=document.querySelector('#qassets img');return im?.complete&&im.naturalWidth>0;});
 await p.screenshot({path:path.join(out,'math-legacy-shared-390.png')});
 const history=await p.evaluate(()=>JSON.parse(MSNStorage.getItem('mysuneung-math-cbt-learning-history-v2')||'[]'));
 assert.equal(history.length,1);assert.equal(history[0].subject,'수학');assert.equal(history[0].raw_score,grade.raw_score);
 assert.ok(!await p.evaluate(()=>MSNStorage.getItem('mysuneung-cbt-learning-history-v2')));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'math-ui.json'),JSON.stringify({passed:14,checks:['14-year settings','full generation','original formula images','100 points','100 minutes','numeric zero input','zero palette state','zero restore','no answers in exam','weighted grading','EBS official solutions','390px report no overflow','legacy shared stem','separate math history'],errors},null,2));
 console.log('MATH_UI_PASS 14');
}catch(e){console.error(e);console.log('PAGE_ERRORS',errors);process.exitCode=1;}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
