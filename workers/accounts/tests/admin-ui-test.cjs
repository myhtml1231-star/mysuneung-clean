const http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const puppeteer=require('/Users/shbj/Downloads/mysuneung-cbt-worker/node_modules/puppeteer-core');
const ROOT=path.resolve(__dirname,'..'),PUB=path.join(ROOT,'public'),shots=path.join(ROOT,'reports');
fs.mkdirSync(shots,{recursive:true});
const now=Date.now();
function json(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
const api={
 '/api/account/session':{ok:true,user:{id:'admin1',name:'관리자',email:'admin@example.invalid'},csrf:'csrf',expires_at:now+3600000},
 '/api/account/admin/me':{ok:true,admin:{id:'admin1',name:'관리자',email:'admin@example.invalid'}},
 '/api/account/admin/summary':{ok:true,accounts:3,disabled:1,active_sessions:2,attempts:17,attempts_7d:8,logins_today:4,login_users_today:3,login_users_7d:3,visitors_today:26,login_tracking_since:now-86400000,login_backfilled_sessions:1,priority_types:[{label:'독서 · <보기> 적용',total:8,wrong:4,accuracy:50}]},
 '/api/account/admin/activity?days=14':{ok:true,days:Array.from({length:14},(_,i)=>({day:new Date(now-(13-i)*86400000).toISOString().slice(0,10),logins:i%5,users:i%4,signups:i%3===0?1:0,visitors:8+i}))},
 '/api/account/admin/learning':{ok:true,priority_types:[{label:'독서 · <보기> 적용',total:8,wrong:4,accuracy:50}],users:[{account_id:'u1',name:'학생',email:'u@example.invalid',attempts:5,distinct_questions:40,recent_accuracy:72,weaknesses:[{question_type:'<보기> 적용'}],latest_at:now}]},
 '/api/account/admin/audit?limit=100':{ok:true,logs:[{id:1,action:'account_disable',target_email:'u@example.invalid',admin_email:'admin@example.invalid',detail:{reason:'test'},created_at:now}]},
 '/api/account/admin/reports':{ok:true,reports:[{id:1,nickname:'테스터',content:'버튼 오류가 있습니다.',source_page:'/mixed-cbt',status:'pending',admin_note:'',created_at:new Date(now).toISOString()}],stats:{total:1,pending:1,in_progress:0,resolved:0}},
 '/api/account/admin/community/inquiries?limit=20':{ok:true,inquiries:[{id:'q1',title:'기존 문의',author:'학생',content:'기존 문의 내용',privacy:'private',answered:false,created_at:now-30000}]},
 '/api/account/admin/community/chat?limit=5':{ok:true,messages:[{id:'c1',author:'채팅학생',content:'기존 채팅 내용',created_at:now-20000}]},
 '/api/account/admin/community/inquiries?limit=100':{ok:true,inquiries:[{id:'q1',title:'기존 문의',author:'학생',content:'기존 문의 내용',privacy:'private',answered:false,created_at:now-30000}]},
 '/api/account/admin/community/chat?limit=100':{ok:true,messages:[{id:'c1',author:'채팅학생',content:'기존 채팅 내용',created_at:now-20000}]}
};
const accountList={ok:true,total:2,limit:30,offset:0,accounts:[
 {id:'u1',email:'u@example.invalid',display_name:'학생',auth_provider:'password',disabled:false,created_at:now-7*86400000,last_login_at:now-10000,login_count:4,attempt_count:5,session_count:1},
 {id:'u2',email:'v@example.invalid',display_name:'다른 학생',auth_provider:'google.com',disabled:true,created_at:now-10*86400000,last_login_at:now-86400000,login_count:2,attempt_count:1,session_count:0}
]};
const detail={ok:true,account:{...accountList.accounts[0]},counts:[],sessions:[{created_at:now-10000,expires_at:now+3600000,device_label:'Chrome · Mac'}],logins:[{logged_in_at:now-10000,device_label:'Chrome · Mac'}],learning:{attempts:5,distinct_questions:40,recent_accuracy:72,priority_types:[{label:'독서 · <보기> 적용',total:5,wrong:3,accuracy:40}]},recent_attempts:[{at:now-10000,mode:'full',percent:72}]};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(u.pathname==='/api/account/records')return json(res,{ok:true,records:[],cursor:0,has_more:false});
 if(u.pathname==='/api/account/admin/accounts')return json(res,accountList);
 if(u.pathname==='/api/account/admin/accounts/u1')return json(res,detail);
 const key=u.pathname+(u.search||'');if(api[key])return json(res,api[key]);if(api[u.pathname])return json(res,api[u.pathname]);
 let file=u.pathname==='/admin'?path.join(PUB,'account-assets/admin.html'):path.join(PUB,decodeURIComponent(u.pathname));
 if(!file.startsWith(PUB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('not found');}
 const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream';
 res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 const errors=[];try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Firebase'))errors.push('console:'+m.text())});
  await page.setRequestInterception(true);page.on('request',r=>{if(new URL(r.url()).origin!==base)r.abort();else r.continue();});
  await page.setViewport({width:1440,height:960});await page.goto(base+'/admin',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('#adminContent').classList.contains('hidden'));
  assert.equal(await page.$eval('#metricAccounts',e=>e.textContent),'3');assert.equal(await page.$$eval('.admin-nav button',x=>x.length),7);assert.equal(await page.$eval('#metricLoginsToday',e=>e.textContent),'4');
  await page.screenshot({path:path.join(shots,'admin-fullservice-1440.png'),fullPage:false});
  await page.click('[data-view="accounts"]');await page.waitForFunction(()=>document.querySelectorAll('#accountRows tr').length===2);await page.click('#accountRows tr');await page.waitForFunction(()=>document.querySelector('#accountDialog').open);assert.match(await page.$eval('#accountDetail',e=>e.textContent),/최근 로그인/);await page.keyboard.press('Escape');
  await page.click('[data-view="inquiries"]');await page.waitForFunction(()=>document.querySelectorAll('#inquiryList .community-item').length===1);assert.match(await page.$eval('#inquiryList',e=>e.textContent),/기존 문의/);
  await page.click('[data-view="chat"]');await page.waitForFunction(()=>document.querySelectorAll('#chatList .community-item').length===1);assert.match(await page.$eval('#chatList',e=>e.textContent),/기존 채팅 내용/);
  await page.click('[data-view="reports"]');await page.waitForFunction(()=>document.querySelectorAll('#reportList .community-item').length===1);assert.match(await page.$eval('#reportList',e=>e.textContent),/버튼 오류/);
  await page.setViewport({width:390,height:844});await page.click('[data-view="overview"]');await new Promise(r=>setTimeout(r,100));const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,w:innerWidth}));assert.ok(size.doc<=392&&size.body<=392,JSON.stringify(size));
  await page.screenshot({path:path.join(shots,'admin-fullservice-390.png'),fullPage:false});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(shots,'admin-ui-tests.json'),JSON.stringify({passed:8,tests:['overview metrics and seven views render','real login metric renders','account list and detail render','migrated inquiry renders without Firebase reauth','migrated chat renders without Firebase reauth','error reports render','390px no document overflow','no page errors'],shots:['admin-fullservice-1440.png','admin-fullservice-390.png']},null,2));
  console.log('ADMIN_UI_PASS 8');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
