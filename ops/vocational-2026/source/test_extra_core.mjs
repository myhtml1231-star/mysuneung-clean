import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {EXTRA_PREFIX,EXTRA_VERSION,extraReferenceKey,extraSubjectForKey,gradeExtra,extraExam,generateExtra,extraLearningMeta,handleExtraAPI,extraImageResponse} from './extra-core.mjs';
const root=new URL('./release/data/',import.meta.url),dir=new URL(EXTRA_PREFIX+'banks/',root);
let forms=0,questions=0;
const env={CBT:{async get(key,options){try{let data=await fs.readFile(new URL(key,root));if(options?.range)data=data.subarray(options.range.offset,options.range.offset+options.range.length);return {text:async()=>data.toString(),body:data};}catch(e){if(e.code==='ENOENT')return null;throw e;}}}};
for(const name of await fs.readdir(dir)){
 const bank=JSON.parse(await fs.readFile(new URL(name,dir),'utf8'));assert.equal(bank.version,EXTRA_VERSION);
 for(const form of bank.forms){
  const exam=generateExtra(bank,{mode:'full',years:[form.academic_year],source_session:form.id});assert.equal(exam.question_count,form.question_count);assert.equal(exam.max_score,50);assert.equal(exam.time_limit_seconds,form.time_limit_seconds);
  assert(!JSON.stringify(exam).includes('correct_answer'));assert(!JSON.stringify(exam).includes('offset'));
  exam.sections.forEach((unit,i)=>{assert.equal(unit.display_start,i+1);assert.equal(unit.display_end,i+1);assert.equal(unit.questions[0].display_no,i+1);});
  const refs=form.question_keys.map((key,i)=>({question_key:key,display_no:i+1})),answers=Object.fromEntries(form.question_keys.map((key,i)=>[String(i+1),bank.questions[key].correct_answer]));
  const full=gradeExtra(bank,refs,answers);assert.equal(full.raw_score,50);assert.equal(full.correct_count,form.question_count);assert.equal(gradeExtra(bank,refs,{}).unanswered_count,form.question_count);
  for(const key of form.question_keys){assert.equal(extraReferenceKey(bank.questions[key]),key);assert.equal(extraSubjectForKey(key),bank.subject);}
  assert.throws(()=>gradeExtra(bank,[refs[0],refs[0]],{}));assert.throws(()=>gradeExtra(bank,[refs[0]],{'1':6}));
  if(forms%25===0){
   const image=bank.questions[form.question_keys[0]].image;const response=await extraImageResponse(new Request('https://example.test'+image.src),env);assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,image.bytes);
  }
  forms++;questions+=form.question_count;
 }
 const response=await handleExtraAPI(new Request('https://example.test/api/cbt/'+bank.subject+'/generate',{method:'POST',body:JSON.stringify({mode:'custom',years:bank.years,count:1})}),env,bank.subject);assert.equal(response.status,200);assert.equal((await response.json()).exam.question_count,1);
 assert.equal(Object.keys(extraLearningMeta(bank).questions).length,Object.keys(bank.questions).length);
}
await fs.writeFile(new URL('./release/core-verification.json',import.meta.url),JSON.stringify({forms,questions,server_grading_verified:true,answer_keys_not_exposed_in_exam:true,image_range_reads_checked:true,invalid_and_duplicate_answers_rejected:true},null,2));
console.log({forms,questions,passed:true});
