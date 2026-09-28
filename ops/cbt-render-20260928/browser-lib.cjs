const fs=require('fs'),path=require('path');
const ROOT='/Users/shbj/Downloads/mysuneung-cbt-worker',W=ROOT+'/work-20260928-content-r4',BASE='https://mysuneung.com';
const puppeteer=require(ROOT+'/node_modules/puppeteer-core');
const catalog=JSON.parse(fs.readFileSync(W+'/catalog-live.json')),cats=JSON.parse(fs.readFileSync(ROOT+'/legacy-build/categories.json')).units,types=JSON.parse(fs.readFileSync(ROOT+'/legacy-build/question-types.json')).questions;
function makeExam(id){
 const row=catalog.find(x=>x.id===id);if(!row)throw Error('no unit '+id);
 const raw=JSON.parse(fs.readFileSync(W+'/live-cache/'+row.key)),base=row.key.replace(/unit\.json$/,''),enc=p=>p.split('/').map(encodeURIComponent).join('/');
 const asset=a=>a?.file?{...a,url:'/cbt-data/'+enc(base+a.file)}:a;
 const qs=raw.questions.map((q,i)=>({...q,display_no:i+1,assets:(q.assets||[]).map(asset),question_type:types[row.year+'-'+String(row.month).padStart(2,'0')+'-'+row.section_code+'-'+String(q.original_no).padStart(2,'0')]?.type||'기타'}));
 const m=cats[id]||{};
 return {id:'ui-check-'+id,mode:'custom',choice:row.section_code,question_count:qs.length,time_limit_seconds:3600,sections:[{id,area:m.area||'',category:m.category||'',section_code:row.section_code,display_start:1,display_end:qs.length,passage:raw.passage,questions:qs,assets:(raw.assets||[]).map(asset),source:{academic_year:row.year,month:row.month,original_questions:qs.map(q=>q.original_no)},original_url:'/cbt-data/originals/'+enc(base+'original.png')}]}
}
async function browser(){return puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})}
async function page(b,width=1440,height=900,options={}){
 const p=await b.newPage();p.setDefaultTimeout(18000);await p.setViewport({width,height});p.testErrors=[];p.imageRequests=[];
 p.on('pageerror',e=>p.testErrors.push(String(e)));
 if(!options.live){await p.setRequestInterception(true);p.on('request',async r=>{
  try{const u=new URL(r.url());
   if(u.origin===BASE&&u.pathname==='/mixed-cbt')return r.respond({status:200,contentType:'text/html; charset=utf-8',body:fs.readFileSync(W+'/cbt-patched.html')});
   if(u.pathname.startsWith('/cbt-data/')){
    const key=decodeURIComponent(u.pathname.slice(10));let file=W+'/live-cache/'+key;
    if(key.startsWith('learning/render-20260928-r4/'))file=W+'/source-assets/'+path.basename(key);
    if(/\.(png|webp|jpg)$/.test(key)){p.imageRequests.push(key);if(options.failImages)return r.respond({status:404,body:'injected-failure'});}
    if(fs.existsSync(file))return r.respond({status:200,contentType:key.endsWith('.json')?'application/json':key.endsWith('.webp')?'image/webp':'image/png',body:fs.readFileSync(file)});
   }
   r.continue();
  }catch(e){p.testErrors.push('intercept '+e);r.abort()}
 })}
 await p.goto(BASE+'/mixed-cbt?accountReplay=1&renderCheck=20260928r2',{waitUntil:'domcontentloaded',timeout:25000});
 await p.waitForFunction(()=>typeof window.renderingPlan==='function'&&window.MSNAccount);await p.evaluate(()=>MSNAccount.ready);
 return p;
}
async function load(p,id,no){const e=makeExam(id);await p.evaluate(({e,no})=>{loadExam(e,false);const i=flat.findIndex(x=>x.q.original_no===no);if(i>=0)go(i)}, {e,no});return e}
async function images(p){await p.waitForFunction(()=>[...document.querySelectorAll('#reading .source-frame,#qassets .source-frame')].every(x=>['loaded','failed'].includes(x.dataset.sourceState)),{timeout:20000});await p.evaluate(()=>Promise.all([...document.querySelectorAll('.managed-source[src]')].map(i=>i.decode?.().catch(()=>{}))));}
async function metrics(p){return p.evaluate(()=>{
 const R=e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height,sw:e.scrollWidth,cw:e.clientWidth}};
 const ribbon=document.querySelector('#paintRibbon'),vis=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const tools=[...ribbon.querySelectorAll('button')].filter(vis).map(e=>({name:e.id||e.dataset.tool||e.title,rect:R(e)}));
 const rb=R(ribbon),bad=[];
 if(document.documentElement.scrollWidth>innerWidth+2)bad.push('document overflow');
 for(const sel of ['#questionPane','#reading','#stem','.exam-box'])for(const el of document.querySelectorAll(sel)){if(vis(el)&&el.scrollWidth>el.clientWidth+2)bad.push(sel+' overflow '+el.scrollWidth+'/'+el.clientWidth)}
 for(const b of tools){if(!ribbon.classList.contains('floating')&&(b.rect.l<rb.l-1||b.rect.r>rb.r+1))bad.push('toolbar '+b.name+' boundary');}
 for(let i=0;i<tools.length;i++)for(let j=i+1;j<tools.length;j++){const a=tools[i].rect,b=tools[j].rect;if(Math.min(a.r,b.r)-Math.max(a.l,b.l)>2&&Math.min(a.b,b.b)-Math.max(a.t,b.t)>2)bad.push('toolbar overlap '+tools[i].name+' '+tools[j].name)}
 const choices=[...document.querySelectorAll('#choices .choice')];if(choices.length!==5)bad.push('choices not 5');
 for(const el of choices){const r=R(el);if(r.sw>r.cw+2||r.r>innerWidth+1||r.l<0)bad.push('choice overflow')}
 const failed=[...document.querySelectorAll('.source-frame[data-source-state=failed]')].map(e=>e.dataset.sourceCandidates);
 const unloaded=[...document.querySelectorAll('.source-frame:not([data-source-state=loaded])')].map(e=>e.dataset.sourceState);
 return {bad,failed,unloaded,tools,ribbon:rb,passage:R(document.querySelector('#passagePane')),question:R(document.querySelector('#questionPane')),plan:window.lastRenderPlan,rows:[...document.querySelectorAll('.exam-box-row')].map(e=>({text:e.querySelector('.exam-box-text').innerText,label:e.querySelector('.exam-box-marker').innerText})),labelHidden:getComputedStyle(document.querySelector('.paint-source-label')).display==='none',canvasPixels:document.querySelector('#drawCanvas').width*document.querySelector('#drawCanvas').height};
})}
module.exports={ROOT,W,BASE,catalog,makeExam,browser,page,load,images,metrics};
