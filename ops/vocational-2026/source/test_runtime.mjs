import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {createHandler} from './release/workers/admin_base.mjs';
import cbt from './release/workers/mysuneung-cbt-api.mjs';
const db=new DatabaseSync(':memory:'),cache=new URL('./source-cache/',import.meta.url),data=new URL('./release/data/',import.meta.url);
for(const name of (await fs.readdir(cache)).filter(x=>/^\d.*\.sql$/.test(x)).sort())db.exec(await fs.readFile(new URL(name,cache),'utf8'));
class Stmt{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Stmt(this.sql,args);}async first(){const value=db.prepare(this.sql).get(...this.args);return value?{...value}:null;}async all(){return {success:true,results:db.prepare(this.sql).all(...this.args).map(x=>({...x}))};}async run(){const r=db.prepare(this.sql).run(...this.args);return {success:true,results:[],meta:{changes:r.changes}};}}
const DB={prepare:sql=>new Stmt(sql),async batch(rows){db.exec('BEGIN');try{const results=rows.map(row=>({success:true,results:db.prepare(row.sql).all(...row.args).map(x=>({...x}))}));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
const handler=createHandler({verifyIdentity:async token=>({uid:'local-test-'+token,email:token+'@example.invalid',name:token,provider:'google.com',auth_time:Math.floor(Date.now()/1000)}),fetch:async()=>new Response('{}')});
const env={DB,SITE_ORIGIN:'https://mysuneung.com',RATE_SALT:'isolated-local-test',FIREBASE_PROJECT_ID:'mysuneung',CBT:{async get(key,options){try{let bytes=await fs.readFile(new URL(key,data));if(options?.range)bytes=bytes.subarray(options.range.offset,options.range.offset+options.range.length);return {text:async()=>bytes.toString(),body:bytes};}catch(e){if(e.code==='ENOENT')return null;throw e;}}}};
env.ACCOUNTS={fetch:r=>handler.fetch(r,env)};
const jars={};
async function account(route,body,{who='alice',headers={},noAuth=false}={}){const h={Origin:env.SITE_ORIGIN,...headers},j=jars[who];if(j&&!noAuth){h.Cookie=j.cookie;h['X-MSN-Account']=j.id;h['X-MSN-CSRF']=j.csrf;}if(body!==undefined)h['Content-Type']='application/json';const r=await handler.fetch(new Request(env.SITE_ORIGIN+'/api/account/'+route,{method:body===undefined?'GET':'POST',headers:h,...body===undefined?{}:{body:JSON.stringify(body)}}),env);return {r,data:await r.json()};}
for(const who of ['alice','bob']){const config=await account('config',undefined,{noAuth:true}),nonce=config.r.headers.getSetCookie()[0].split(';')[0];const login=await account('session',{id_token:who,over14:true,accept_privacy:true,consent_version:config.data.consent_version},{noAuth:true,headers:{Cookie:nonce,'X-MSN-Login-CSRF':config.data.login_csrf}});assert.equal(login.r.status,200,JSON.stringify(login.data));jars[who]={cookie:login.r.headers.getSetCookie().find(x=>x.startsWith('__Host-msn-session=')).split(';')[0],id:login.data.user.id,csrf:login.data.csrf};}
const op=(kind,id,data)=>({kind,id,data,base_version:0,mutation_id:crypto.randomUUID()});
let tested=0;
for(const [subject,formId]of [['lang-japanese','g3-2027-09-lang-japanese'],['lang-japanese','g2-2026-10-lang-japanese'],['voc-career','g2-2026-10-voc-career'],['voc-agriculture','g3-2020-06-voc-agriculture']]){
 const bank=JSON.parse(await fs.readFile(new URL('vocational/20261023-v1/banks/'+subject+'.json',data),'utf8')),form=bank.forms.find(f=>f.id===formId);assert(form,formId);
 const route='/api/cbt/'+subject+'/generate',body={mode:'full',years:[form.academic_year],source_session:formId};
 const denied=await cbt.fetch(new Request(env.SITE_ORIGIN+route,{method:'POST',body:JSON.stringify(body)}),env);assert.equal(denied.status,401);
 const generated=await cbt.fetch(new Request(env.SITE_ORIGIN+route,{method:'POST',headers:{Cookie:jars.alice.cookie},body:JSON.stringify(body)}),env),result=await generated.json();assert.equal(generated.status,200,JSON.stringify(result));assert.equal(result.exam.question_count,form.question_count);assert.equal(result.exam.time_limit_seconds,form.time_limit_seconds);
 const details=form.question_keys.map((key,i)=>({...bank.questions[key],display_no:i+1,selected:bank.questions[key].correct_answer,correct_answer:9,is_correct:false})),base={id:formId,mode:'full',details,at:Date.now(),startedAt:Date.now(),time_limit_seconds:999999,current:form.question_count-1,session:{status:'paused',remaining_ms:123000}};
 for(const kind of ['attempt','draft']){const r=await account('records/batch',{operations:[op(kind,formId,base)]});assert.equal(r.r.status,200,JSON.stringify(r.data));const saved=r.data.results[0].record.data;assert.equal(saved.subject_key,subject);if(kind==='attempt')assert.equal(saved.raw_score,50);else{assert.equal(saved.time_limit_seconds,form.time_limit_seconds);assert(!JSON.stringify(saved).includes('correct_answer'));}
  const own=await account('replay/'+formId+'?kind='+kind);assert.equal(own.r.status,200,JSON.stringify(own.data));assert.equal(own.data.exam.question_count,form.question_count);assert.equal(own.data.exam.sections[0].questions[0].display_no,1);assert.equal(own.data.saved.details[0].selected,details[0].selected);assert.equal((await account('replay/'+formId+'?kind='+kind,undefined,{who:'bob'})).r.status,404);
 }
 const drawing={exam_id:formId,unit_id:details[0].unit_id,strokes:[{tool:'pen',color:'#112233',size:3,surface:'question',question_no:1,points:[{x:.1,y:.2}]}]};const ink=await account('records/batch',{operations:[op('annotation',formId+'.ink',drawing)]});assert.equal(ink.r.status,200,JSON.stringify(ink.data));
 const bogus=await account('records/batch',{operations:[op('attempt',formId+'.invalid',{...base,user_id:jars.bob.id})]});assert.equal(bogus.r.status,400);
 tested++;
}
for(const pathname of ['/mixed-cbt?subject=lang-japanese','/mixed-cbt?subject=voc-career'])assert.equal((await cbt.fetch(new Request(env.SITE_ORIGIN+pathname),env)).status,302);
for(const key of ['banks/lang-japanese.json','packs/g3-2027-09-lang-japanese.bin','ui/lang-japanese.html'])assert.equal((await cbt.fetch(new Request(env.SITE_ORIGIN+'/cbt-data/vocational/20261023-v1/'+key),env)).status,404);
assert.equal((await account('records',undefined,{who:'bob'})).data.records.length,0);
const report={representative_forms:tested,real_worker_api_and_sql_records:true,login_required:true,server_regrades_saved_attempts:true,draft_and_paused_time_restored:true,annotations_saved:true,cross_account_replay_denied:true,answer_banks_and_packs_not_public_via_worker:true};await fs.writeFile(new URL('./release/runtime-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(report);db.close();
