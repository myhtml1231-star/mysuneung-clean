import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {EXTRA_PREFIX} from './extra-core.mjs';
import {sanitizeExtraRecord,reconstructExtraRecord,sanitizeExtraAnnotation} from './extra-account.mjs';
const root=new URL('./release/data/',import.meta.url),dir=new URL(EXTRA_PREFIX+'banks/',root);
const env={CBT:{async get(key){try{const bytes=await fs.readFile(new URL(key,root));return {text:async()=>bytes.toString(),body:bytes};}catch(error){if(error.code==='ENOENT')return null;throw error;}}}};
let count=0;
for(const name of await fs.readdir(dir)){
 const bank=JSON.parse(await fs.readFile(new URL(name,dir),'utf8'));
 for(const form of bank.forms){
  const details=form.question_keys.map(key=>({...bank.questions[key],selected:bank.questions[key].correct_answer,correct_answer:9,is_correct:false}));
  const record={subject_key:'forged',details,mode:'full',at:Date.now(),startedAt:Date.now(),time_limit_seconds:999999,current:form.question_count-1,session:{status:'paused',remaining_ms:10000,paused_at:Date.now()}};
  const attempt=await sanitizeExtraRecord('attempt',record,'test',env);assert.equal(attempt.subject_key,bank.subject);assert.equal(attempt.raw_score,50);assert.equal(attempt.score,form.question_count);assert(attempt.details.every(q=>q.correct_answer!==9&&q.is_correct));
  const draft=await sanitizeExtraRecord('draft',record,'test',env);assert(!JSON.stringify(draft).includes('correct_answer'));assert(!JSON.stringify(draft).includes('is_correct'));assert.equal(draft.time_limit_seconds,form.time_limit_seconds);assert.equal(draft.session.remaining_ms,10000);
  const replay=await reconstructExtraRecord({id:'test',kind:'draft',data:draft},env);assert.equal(replay.exam.question_count,form.question_count);assert.equal(replay.exam.time_limit_seconds,form.time_limit_seconds);
  await assert.rejects(()=>sanitizeExtraRecord('attempt',{...record,user_id:'other'},'test',env));
  if(count%25===0){const q=bank.questions[form.question_keys[0]],data={exam_id:'test',unit_id:q.unit_id,strokes:[{tool:'pen',color:'#111111',size:2,surface:'question',question_no:q.original_no,points:[{x:.1,y:.2}]}]};const stored=await sanitizeExtraAnnotation(data,env);assert.equal(stored.strokes.length,1);await assert.rejects(()=>sanitizeExtraAnnotation({...data,unit_id:q.unit_id+'-invalid'},env));await assert.rejects(()=>sanitizeExtraAnnotation({...data,strokes:[{...data.strokes[0],points:[{x:2,y:0}]}]},env));}
  count++;
 }
}
await fs.writeFile(new URL('./release/account-verification.json',import.meta.url),JSON.stringify({forms:count,server_side_record_grading:true,draft_answer_keys_removed:true,paused_time_preserved:true,reconstruction_verified:true,forged_owner_and_invalid_strokes_rejected:true},null,2));
console.log({forms:count,account_records_verified:true});
