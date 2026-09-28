import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gradedDetails,gradingSummary,studyEvidence} from '../src/study-core.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../data/question-types.json',import.meta.url)));
const taxonomy=raw.questions||raw,answers=JSON.parse(fs.readFileSync(new URL('../data/answers.json',import.meta.url)));
const tests=[],test=(name,fn)=>{fn();tests.push({name,pass:true});};
const keys=Object.keys(taxonomy).filter(k=>taxonomy[k].analysis_eligible&&taxonomy[k].type_id==='독서::내용일치');
const detail=(k,ok=true)=>{const [y,m,s,n]=k.split('-');return {academic_year:+y,month:+m,section_code:s,original_no:+n,selected:ok?answers[k]:answers[k]%5+1,correct_answer:answers[k],display_no:+n,is_correct:!ok};};
const first=keys[0],ds=[detail(first,false),detail(keys[1])],partial={...taxonomy};delete partial[first];
test('missing classification keeps graded question and recalculates correctness',()=>{
 const rows=gradedDetails(ds,partial);assert.equal(rows.length,2);assert.equal(rows[0].is_correct,false);assert.equal(rows[0].analysis_eligible,false);assert.equal(rows[0].type_id,null);
 assert.equal(gradingSummary(null,rows).percent,50);
});
test('authoritative grade totals survive unavailable detailed rows',()=>{
 const s=gradingSummary({total_count:5,correct_count:3,wrong_count:1,unanswered_count:1},[]);
 assert.deepEqual([s.total,s.right,s.wrong,s.blank,s.percent],[5,3,1,1,60]);
});
test('invalid summary counts do not override valid detail counts',()=>{
 const s=gradingSummary({total_count:5,correct_count:8,wrong_count:0,unanswered_count:0},gradedDetails(ds,partial));
 assert.equal(s.authoritative,false);assert.equal(s.total,2);assert.equal(s.percent,50);
});
test('missing or invalid answer is never synthesized',()=>{
 assert.deepEqual(gradedDetails([{...ds[0],correct_answer:null}],{}),[]);
 assert.deepEqual(gradedDetails([null,{},'bad'],{}),[]);
});
const now=Date.now(),DAY=86400000,origin=first,novel=[],unitSet=new Set();
for(const k of keys){
 if(k.slice(0,7)===origin.slice(0,7)||unitSet.has(taxonomy[k].unit_id))continue;
 const sibling=Object.keys(taxonomy).find(s=>s!==k&&taxonomy[s].unit_id===taxonomy[k].unit_id);
 if(sibling){novel.push({k,sibling});unitSet.add(taxonomy[k].unit_id);}
 if(novel.length===3&&new Set(novel.map(n=>n.k.slice(0,7))).size>=2)break;
}
assert.ok(novel.length>=3);const extra=[novel[0],novel.find(x=>x.k.slice(0,7)!==novel[0].k.slice(0,7))];extra.push(novel.find(x=>!extra.includes(x)));assert.ok(extra.every(Boolean));
const a={id:'origin',at:now-5*DAY,details:[detail(origin,false)]},b={id:'check',at:now-DAY,details:extra.map(x=>detail(x.k))};
test('new passages across two other exam sessions still verify improvement',()=>{
 const r=studyEvidence([b,a],taxonomy,answers,now).types.find(r=>r.key===taxonomy[origin].type_id);assert.equal(r.state,'verified');
});
test('unanswered sibling exposes passage and prevents false new-passage mastery',()=>{
 const prime={id:'previous-passage',at:now-10*DAY,details:extra.map(x=>({...detail(x.sibling),selected:null}))};
 const r=studyEvidence([b,a,prime],taxonomy,answers,now).types.find(r=>r.key===taxonomy[origin].type_id);
 assert.equal(r.verification_correct,0);assert.notEqual(r.state,'verified');
});
console.log('SAFETY_PASS',tests.length);
