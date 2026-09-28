import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {DatabaseSync} from 'node:sqlite';
export const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url))),CBT='/Users/shbj/Downloads/mysuneung-cbt-worker',SOURCE='/Users/shbj/Downloads/CBT_구조화';
export const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export const catalog=readJSON(path.join(CBT,'legacy-build/catalog.json'));
export const answers=readJSON(path.join(CBT,'legacy-build/answers.json'));
export function makeDB(){
 const db=new DatabaseSync(':memory:');for(const m of fs.readdirSync(path.join(ROOT,'migrations')).filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join(ROOT,'migrations',m),'utf8'));
 class Stmt{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Stmt(this.sql,args);}first(){const r=db.prepare(this.sql).get(...this.args);return Promise.resolve(r?{...r}:null);}all(){return Promise.resolve({success:true,results:db.prepare(this.sql).all(...this.args).map(r=>({...r}))});}run(){const r=db.prepare(this.sql).run(...this.args);return Promise.resolve({success:true,results:[],meta:{changes:r.changes}});}}
 return {raw:db,prepare:s=>new Stmt(s),async batch(stmts){db.exec('BEGIN');try{const rs=stmts.map(s=>({success:true,results:db.prepare(s.sql).all(...s.args).map(r=>({...r}))}));db.exec('COMMIT');return rs;}catch(e){db.exec('ROLLBACK');throw e;}},exec:sql=>db.exec(sql)};
}
const mime=f=>f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css':f.endsWith('.js')?'application/javascript':f.endsWith('.json')?'application/json':f.endsWith('.png')?'image/png':f.endsWith('.pdf')?'application/pdf':'application/octet-stream';
export function makeEnv(origin='https://mysuneung.com'){
 const DB=makeDB();return {DB,SITE_ORIGIN:origin,FIREBASE_PROJECT_ID:'mysuneung',RATE_SALT:'test-only-not-deployed',ASSETS:{async fetch(req){const u=new URL(req.url),p=path.join(ROOT,'public',decodeURIComponent(u.pathname));if(!p.startsWith(path.join(ROOT,'public')+'/')||!fs.existsSync(p)||!fs.statSync(p).isFile())return new Response('Not found',{status:404});return new Response(fs.readFileSync(p),{headers:{'Content-Type':mime(p)}});}},CBT:{async get(key){
 let p;if(['catalog.json','categories.json','answers.json','question-types.json'].includes(key))p=path.join(CBT,'legacy-build',key);
 else if(key==='learning/question-types-20260927-v1.json')p=path.join(CBT,'legacy-build/question-types.json');
 else if(key==='app/cbt.html')p=path.join(ROOT,'cbt-account.html');
 else if(key.startsWith('originals/')){const row=catalog.find(r=>'originals/'+r.key.replace(/unit\.json$/,'original.png')===key);if(!row)return null;p=readJSON(path.join(SOURCE,row.key)).fallback_image;}
 else p=path.join(SOURCE,key);
 if(!p||!fs.existsSync(p))return null;const b=fs.readFileSync(p);return {body:b,text:async()=>b.toString('utf8'),httpEtag:'test-only',writeHttpMetadata:h=>h.set('Content-Type',mime(p))};
 }}};
}
export const identity=name=>({uid:'test-firebase-'+name,email:name+'@example.invalid',name:name==='alice'?'테스트 수험생':'다른 계정',provider:'google.com',auth_time:Math.floor(Date.now()/1000)});
export const sampleUniversity=(note='초기 조사 메모')=>({name:'테스트 대학',department:'소프트웨어학과',admission_year:2027,track:'정시',status:'조사 중',source_url:'https://example.edu/admissions',note,checked_at:Date.now(),created_at:Date.now()});
export const operation=(kind,id,data,base_version=0)=>({kind,id,data,base_version,mutation_id:crypto.randomUUID()});
