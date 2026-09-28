const fs=require('fs'),{browser,page,makeExam,catalog,images,metrics,W}=require('./browser-lib.cjs');
const width=Number(process.argv[2]||1440),pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await browser();try{
 const p=await page(b,width,width<500?844:900);const checkpoint=W+'/question-audit-'+width+'-checkpoint.json';const saved=process.argv.includes('--resume')&&fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)):null;const issues=saved?.issues||[],inventory=saved?.inventory||[];let count=saved?.count||0;const modes=saved?.modes||{};const begin=saved?.nextUnit||0;const batch=Number(process.env.AUDIT_BATCH||100);
 for(let ri=begin;ri<Math.min(catalog.length,begin+batch);ri++){
  const row=catalog[ri],e=makeExam(row.id);await p.evaluate(e=>loadExam(e,false),e);
  for(let qi=0;qi<e.question_count;qi++){
   const q=e.sections[0].questions[qi];await p.evaluate(i=>{if(i!==current)go(i)},qi);
   await images(p);
   // Rendering checks run against decoded images, never just response status or element presence.
   const m=await metrics(p);let errors=m.bad.slice();if(m.failed.length)errors.push('source failed '+m.failed.join(','));if(m.unloaded.length)errors.push('source not decoded');
   const content=await p.evaluate(()=>{
    const q=flat[current].q,set=flat[current].set,plan=renderingPlan(set,q),split=splitStemForSource(set,q),entry=questionEntry(set,q);
    const norm=t=>String(t||'').replace(/[\s∙•◦·⋯…\.]/g,'');
    let preserved=true;
    if(plan.kind==='text'||plan.kind==='box'){
     let pieces=split.rows?(split.rows.intro||'')+split.rows.map(r=>r.text+r.label).join(''):split.detail;
     preserved=norm(split.prompt+pieces)===norm(q.stem);
     if(q.view_text)preserved=preserved&&[...document.querySelectorAll('#qassets .exam-box')].some(box=>norm([...box.children].filter(e=>e.tagName!=='LEGEND').map(e=>e.textContent).join(''))===norm(q.view_text));
    }
    const unsafe=/[\uE000-\uF8FF\uFFFD]/.test(document.querySelector('#app').innerText);
    const images=[...document.querySelectorAll('#reading .managed-source,#qassets .managed-source')].map(x=>({url:x.src,w:x.naturalWidth,h:x.naturalHeight,state:x.parentElement.dataset.sourceState}));
    return {plan:plan.kind,preserved,unsafe,images,hasSources:!!entry,boxRows:document.querySelectorAll('.exam-box-row').length,stemChars:document.querySelector('#stem').innerText.length};
   });
   if(!content.preserved)errors.push('word or label preservation mismatch');if(content.unsafe)errors.push('unsafe visible glyph');
   if(content.images.some(x=>!x.w||!x.h||x.state!=='loaded'))errors.push('undecoded image');
   if(errors.length)issues.push({unit_id:row.id,no:q.original_no,errors});
   inventory.push({unit_id:row.id,no:q.original_no,plan:content.plan,boxRows:content.boxRows,sourceCount:content.images.length,ok:!errors.length});modes[content.plan]=(modes[content.plan]||0)+1;count++;
  }
  fs.writeFileSync(checkpoint+'.tmp',JSON.stringify({nextUnit:ri+1,count,modes,issues,inventory}));fs.renameSync(checkpoint+'.tmp',checkpoint);
  if((ri+1)%25===0){console.log('PROGRESS',width,ri+1,'/',catalog.length,'questions',count,'issues',issues.length);fs.writeFileSync(W+'/all-questions-'+width+'-progress.json',JSON.stringify({units:ri+1,questions:count,issues}));}
 }
 const out={width,units:Math.min(catalog.length,begin+batch),questions:count,modes,issues,pageErrors:p.testErrors,inventory,imageRequestCount:p.imageRequests.length};
 fs.writeFileSync(W+'/all-questions-'+width+'.json',JSON.stringify(out,null,2));console.log('DONE',JSON.stringify({width,questions:count,modes,issues:issues.length,pageErrors:p.testErrors}));if(issues.length)console.log(JSON.stringify(issues.slice(0,40),null,2));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
