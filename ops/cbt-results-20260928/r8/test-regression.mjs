import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as L from './learning-core.mjs';
import worker from './worker-test.mjs';
import {env,taxonomy,answers,catalog,DIR} from './test-env.mjs';
const results=[];let genCount=0;
const test=(name,fn)=>{fn();results.push({name,pass:true});};
const req=async(route,body)=>{const r=await worker.fetch(new Request('https://mysuneung.com'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env);return {status:r.status,data:await r.json()};};
const detail=k=>{const [y,m,sec,n]=k.split('-');return {academic_year:+y,month:+m,section_code:sec,original_no:+n,selected:answers[k],correct_answer:answers[k]};};
const groups=new Map();for(const [k,m] of Object.entries(taxonomy))if(m.analysis_eligible){if(!groups.has(m.type_id))groups.set(m.type_id,[]);groups.get(m.type_id).push(k);}
const target='독서::내용일치',ks=groups.get(target).slice(0,7),now=Date.now();
const wrong=k=>({...detail(k),selected:answers[k]%5+1,is_correct:true});
const attempt={id:'test-attempt',at:now-1000,details:ks.slice(0,5).map(wrong)};
test('five distinct answered items enable reinforcement',()=>{const p=L.buildProfile([attempt],taxonomy,answers,now);assert.equal(p.types[0].answered,5);assert.equal(p.types[0].wrong,5);assert.ok(p.weights[target]>1);});
test('four items do not diagnose a weakness',()=>{assert.equal(Object.keys(L.buildProfile([{...attempt,details:attempt.details.slice(0,4)}],taxonomy,answers,now).weights).length,0);});
test('unanswered kept outside the error-rate denominator',()=>{const p=L.buildProfile([{...attempt,details:attempt.details.concat({...detail(ks[5]),selected:null})}],taxonomy,answers,now);assert.equal(p.types[0].answered,5);assert.equal(p.types[0].unanswered,1);assert.equal(p.types[0].error_rate,1);});
test('latest response wins without duplicate weighting',()=>{const p=L.buildProfile([attempt,{id:'later',at:now,details:[detail(ks[0])]}],taxonomy,answers,now);assert.equal(p.unique_questions,5);assert.equal(p.types[0].wrong,4);assert.equal(p.types[0].correct,1);});
test('same label is not merged across reading/literature',()=>{const lk=groups.get('문학::내용일치')[0];const p=L.buildProfile([{...attempt,details:[wrong(ks[0]),wrong(lk)]}],taxonomy,answers,now);assert.equal(p.types.length,2);});
test('pending types count in topics, not type profiles',()=>{const k=Object.keys(taxonomy).find(k=>!taxonomy[k].analysis_eligible);const p=L.buildProfile([{...attempt,details:[wrong(k)]}],taxonomy,answers,now);assert.equal(p.excluded_types,1);assert.equal(p.types.length,0);assert.equal(p.topics.length,1);});
test('no cognitive reason inferred from errors',()=>{const p=L.buildProfile([attempt],taxonomy,answers,now);assert.equal(p.reasons.length,0);});
test('self-report preserved with source, bounded note',()=>{const p=L.buildProfile([{...attempt,reasons:{[ks[0]]:{code:'condition',note:'x'.repeat(700),source:'auto'}}}],taxonomy,answers,now);assert.equal(p.reasons[0].code,'condition');assert.equal(p.details[0].reason.source,'self_report');assert.equal(p.details[0].reason.note.length,500);});
test('future/unknown reference/malformed history ignored',()=>{const p=L.buildProfile([{...attempt,at:now+600000},{id:'bad',at:now,details:[{selected:2}]}],taxonomy,answers,now);assert.equal(p.unique_questions,0);assert.equal(p.invalid,1);});
test('invalid and fractional selected answers are unanswered',()=>{for(const v of [0,6,1.5,true,null,'x',''])assert.equal(L.answerValue(v),null);assert.equal(L.answerValue('3'),3);});
test('exact subset never splits units or duplicates them',()=>{const rows=[{id:'a',question_count:3},{id:'b',question_count:4},{id:'c',question_count:6}];const got=L.exactSubset(rows,7);assert.equal(got.reduce((n,r)=>n+r.question_count,0),7);assert.equal(new Set(got.map(r=>r.id)).size,got.length);assert.equal(L.exactSubset(rows,5),null);});
test('weighted priority increases target selection reproducibly',()=>{let seed=31;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const rows=['a','b','c'].map(id=>({id,question_count:1}));let n=0;for(let i=0;i<3000;i++)if(L.exactSubset(rows,1,rng,r=>r.id==='a'?4:1)[0].id==='a')n++;assert.ok(n>1700&&n<2200,n);});
const meta=await req('/api/cbt/learning-meta');assert.equal(meta.status,200);assert.equal(Object.keys(meta.data.questions).length,1795);assert.ok(meta.data.questions[ks[0]].original_url);assert.equal(meta.data.questions[ks[0]].correct_answer,undefined);results.push({name:'metadata complete, versioned and contains no answers',pass:true});
function validate(e,body){
 const pairs=e.sections.flatMap(s=>s.questions.map(q=>({s,q})));const n=pairs.length;
 assert.equal(e.question_count,n);assert.deepEqual(pairs.map(x=>x.q.display_no),Array.from({length:n},(_,i)=>i+1));
 assert.equal(new Set(e.sections.map(s=>s.id)).size,e.sections.length);
 for(const {s,q} of pairs){assert.ok(body.years.includes(s.source.academic_year));assert.equal(q.choices.length,5);assert.ok(q.type_id);assert.equal(q.taxonomy_version,L.LEARNING_VERSION);assert.equal(q.analysis_eligible,taxonomy[q.question_key].analysis_eligible);}
 if(body.mode==='full'){
  assert.equal(n,45);if(!e.legacy_format){assert.equal(pairs.slice(0,34).filter(x=>x.s.area==='선택').length,0);assert.ok(pairs.slice(34).every(x=>x.s.category===(body.choice==='lm'?'언어와 매체':'화법과 작문')));
   if(body.choice==='lm'){assert.equal(pairs.slice(34).filter(x=>x.s.section_code==='full'||x.q.original_no<=39).length,5);assert.equal(pairs.slice(34).filter(x=>x.s.section_code==='lm'&&x.q.original_no>=40).length,6);}
  }else assert.deepEqual(pairs.map(x=>x.q.original_no),Array.from({length:45},(_,i)=>i+1));
 }
 return pairs;
}
for(let year=2017;year<=2027;year++)for(const choice of year<2022?['hw']:['hw','lm'])for(const strategy of ['balanced','weakness']){
 const body={mode:'full',choice,years:[year],strategy,recent_attempts:[attempt]},r=await req('/api/cbt/generate',body);assert.equal(r.status,200,JSON.stringify(r));validate(r.data.exam,body);genCount++;
}
for(const choice of ['hw','lm']){const body={mode:'full',choice,years:[2017,2022,2027],strategy:'weakness',recent_attempts:[attempt]},r=await req('/api/cbt/generate',body);assert.equal(r.status,200);validate(r.data.exam,body);genCount++;}
results.push({name:'36 full/legacy/mixed compositions incl language5+media6',pass:true,cases:genCount});
for(const id of groups.keys()){
 const cat=[...new Set(groups.get(id).map(k=>taxonomy[k].category))];const body={mode:'custom',years:[2017,2018,2019,2020,2021,2022,2023,2024,2025,2026,2027],categories:cat,set_count:3,type_ids:[id]},r=await req('/api/cbt/generate',body);assert.equal(r.status,200,id+JSON.stringify(r));const e=r.data.exam;validate(e,body);assert.ok(e.sections.every(s=>s.questions.some(q=>q.analysis_eligible&&q.type_id===id)),id);assert.equal(e.learning.strategy,'targeted');assert.ok(e.learning.matched_questions>0);genCount++;
}
results.push({name:'targeted practice preserves full passage sets for every supported type',pass:true,cases:groups.size});
let r=await req('/api/cbt/generate',{mode:'custom',years:[2017],categories:['독서론'],type_ids:['독서::어휘']});assert.equal(r.status,400);
r=await req('/api/cbt/generate',{mode:'full',years:[2023],strategy:'weakness'});assert.equal(r.status,200);assert.equal(r.data.exam.learning.strategy,'balanced');
r=await req('/api/cbt/generate',{mode:'custom',years:[2023],categories:['인문'],type_ids:['독서::made-up']});assert.equal(r.status,400);
results.push({name:'no silent unrelated-target fallback; cold start explained',pass:true});
const gen=await req('/api/cbt/generate',{mode:'full',years:[2027],choice:'lm',strategy:'weakness',recent_attempts:[attempt]});
const pairs=gen.data.exam.sections.flatMap(s=>s.questions.map(q=>({s,q})));const refs=pairs.map(({s,q})=>({display_no:q.display_no,academic_year:s.source.academic_year,month:s.source.month,section_code:s.section_code,original_no:q.original_no}));
const submitted=Object.fromEntries(refs.map(x=>[x.display_no,answers[L.questionKey(x)]]));r=await req('/api/cbt/submit',{refs,answers:submitted});assert.equal(r.data.correct_count,45);assert.equal(r.data.percent,100);assert.ok(r.data.details.every(d=>d.type_id&&d.question_key));
submitted[1]=1.5;r=await req('/api/cbt/submit',{refs,answers:submitted});assert.equal(r.data.unanswered_count,1);assert.equal(r.data.wrong_count,0);
const duplicates=[refs[0],{...refs[0],display_no:2}];r=await req('/api/cbt/submit',{refs:duplicates,answers:{1:1,2:1}});assert.equal(r.status,400);
results.push({name:'grading metadata, fractional-answer handling, duplicate-source rejection',pass:true});
const report={at:new Date().toISOString(),version:L.LEARNING_VERSION,tests:results.length,generation_cases:genCount,results};fs.writeFileSync(path.join(DIR,'test-learning-results.json'),JSON.stringify(report,null,2));
console.log('PASS',results.length,'test groups;',genCount,'generation cases');
