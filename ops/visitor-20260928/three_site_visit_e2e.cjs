const puppeteer=require('/Users/shbj/Downloads/mysuneung-cbt-worker/node_modules/puppeteer-core');
const FB='https://mysuneung-default-rtdb.firebaseio.com/visits.json';
const k=new Date(Date.now()+9*3600000),day=k.getUTCFullYear()+'-'+String(k.getUTCMonth()+1).padStart(2,'0')+'-'+String(k.getUTCDate()).padStart(2,'0');
(async()=>{
 const before=await fetch(FB,{cache:'no-store'}).then(r=>r.json());
 const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 const out=[];
 try{
  for(const [name,url] of [['main','https://mysuneung.com/?visit-e2e='+Date.now()],['cbt','https://mysuneung.com/mixed-cbt?visit-e2e='+Date.now()],['university','https://universitypredict.com/?visit-e2e='+Date.now()]]){
   const p=await b.newPage();const reqs=[],visitorErrors=[];
   await p.evaluateOnNewDocument(d=>{try{localStorage.setItem('visit-last-count-date',d)}catch(e){}},day);
   p.on('request',r=>{if(r.url().includes('/api/visit'))reqs.push({url:r.url(),method:r.method(),body:r.postData()});});
   p.on('console',m=>{if(/visit|Content Security|CORS/i.test(m.text())&&m.type()==='error')visitorErrors.push(m.text())});
   await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
   await new Promise(r=>setTimeout(r,3500));
   const state=await p.evaluate(()=>({date:localStorage.getItem('visit-last-count-date'),scripts:[...document.scripts].map(s=>({src:s.src,source:s.dataset.visitSource})).filter(x=>x.source||x.src.includes('visit.js'))}));
   out.push({name,reqs,state,visitorErrors});
   await p.close();
  }
 } finally {await b.close();}
 const after=await fetch(FB,{cache:'no-store'}).then(r=>r.json());
 console.log(JSON.stringify({day,before,after,out},null,2));
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('visitor totals changed during seeded E2E');
 for(const x of out){
  const posts=x.reqs.filter(r=>r.method==='POST');
  if(posts.length!==1)throw Error(x.name+' visit POST count '+posts.length);
  const body=JSON.parse(posts[0].body||'{}');
  if(body.source!==x.name)throw Error(x.name+' source '+body.source);
  if(body.already_counted!==true)throw Error(x.name+' seeded visit not marked already counted');
  if(x.name==='university'&&!x.reqs.some(r=>r.method==='OPTIONS'))throw Error('university CORS preflight missing');
  if(x.visitorErrors.length)throw Error(x.name+' visitor console error '+x.visitorErrors.join(' | '));
 }
 console.log('THREE_SITE_VISITOR_E2E_NO_INCREMENT_OK');
})().catch(e=>{console.error(e);process.exit(1)});