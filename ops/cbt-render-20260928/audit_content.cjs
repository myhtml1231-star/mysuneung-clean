const fs=require('fs'),{browser,page,makeExam,catalog,images,metrics,W}=require('./browser-lib.cjs');
const width=Number(process.argv[2]||1440),checkpoint=W+'/content-audit-'+width+'-checkpoint.json';
(async()=>{let saved=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)): {nextUnit:0,inventory:[],issues:[],modes:{},pageErrors:[]};const b=await browser();try{
 const p=await page(b,width,width<500?844:900);const stop=Math.min(catalog.length,saved.nextUnit+60);
 for(let ri=saved.nextUnit;ri<stop;ri++){
  const row=catalog[ri],e=makeExam(row.id);await p.evaluate(e=>loadExam(e,false),e);
  for(let qi=0;qi<e.question_count;qi++){
   const q=e.sections[0].questions[qi];await p.evaluate(i=>{if(i!==current)go(i)},qi);await images(p);const m=await metrics(p);
   const content=await p.evaluate(()=>{
    const q=prepareQuestion(flat[current].q),set=flat[current].set,plan=renderingPlan(set,q),split=splitStemForSource(set,q);
    const norm=t=>normalText(t).replace(/\[\s*[1-9]\s*점\s*\]/g,'').replace(/[\s∙•◦·⋯…\.]/g,'');
    const boxes=[...document.querySelectorAll('#qassets .exam-box')].map(box=>[...box.children].filter(e=>e.tagName!=='LEGEND').map(e=>e.textContent).join(''));
    const expected=norm(q.stem),actual=norm(split.prompt+split.detail);
    const imgs=[...document.querySelectorAll('#reading .managed-source,#qassets .managed-source')];
    return {plan:plan.kind,splitPreservesWords:expected===actual,unsafe:contentUnsafe(document.querySelector('#app').innerText),boxes,empty:boxes.some(t=>!meaningfulBox(t)),duplicate:new Set(boxes.map(norm)).size!==boxes.length,sourceCount:imgs.length,badSources:imgs.filter(i=>!i.complete||!i.naturalWidth||i.parentElement.dataset.sourceState!=='loaded').map(i=>i.src),oldSource:imgs.filter(i=>!i.src.includes('/learning/render-20260928-r4/')).map(i=>i.src),matrix:!!plan.matrix,missingView:!plan.body&&/<\s*보기\s*>/.test(q.stem)&&!q.view_text,toolbarRight:document.querySelector('#questionInkTools').getBoundingClientRect().right,canvas:document.querySelector('#questionCanvas').width*document.querySelector('#questionCanvas').height};
   });
   const errors=[...m.bad];if(m.failed.length||content.badSources.length)errors.push('source not decoded');if(content.oldSource.length)errors.push('unclean legacy image fallback');if(content.unsafe)errors.push('unsafe glyph');if(!content.splitPreservesWords)errors.push('split lost source words');if(content.empty)errors.push('empty or score-only box');if(content.duplicate)errors.push('duplicate view');if(content.missingView)errors.push('referenced view missing');if(content.toolbarRight>width+2)errors.push('question toolbar overflow');
   saved.inventory.push({unit_id:row.id,no:q.original_no,plan:content.plan,sourceCount:content.sourceCount,matrix:content.matrix,ok:!errors.length});saved.modes[content.plan]=(saved.modes[content.plan]||0)+1;
   if(errors.length){const issue={unit_id:row.id,no:q.original_no,errors};saved.issues.push(issue);console.log('ISSUE',JSON.stringify(issue))}
  }
  saved.nextUnit=ri+1;saved.pageErrors.push(...p.testErrors.splice(0));fs.writeFileSync(checkpoint+'.tmp',JSON.stringify(saved));fs.renameSync(checkpoint+'.tmp',checkpoint);
  if((ri+1)%20===0)console.log('PROGRESS',width,ri+1,saved.inventory.length,'issues',saved.issues.length);
 }
 fs.writeFileSync(W+'/content-audit-'+width+'.json',JSON.stringify(saved,null,2));console.log('BATCH',width,saved.nextUnit,saved.inventory.length,'issues',saved.issues.length);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
