// Content transformations preserve the exam's wording; only source-confirmed glyphs/layout change.
function normalText(value){return String(value==null?'':value).replace(/\u{f0854}/gu,'『').replace(/\u{f0855}/gu,'』')}
function contentUnsafe(value){
 if(typeof value==='string')return /[\ue000-\uf8ff\ufffd\u{f0000}-\u{ffffd}\u{100000}-\u{10fffd}]/u.test(normalText(value));
 if(Array.isArray(value))return value.some(contentUnsafe);
 return value&&typeof value==='object'?Object.values(value).some(contentUnsafe):false;
}
function safeDisplayText(v){return typeof v==='string'&&v.trim()!==''&&!contentUnsafe(v)}
function prepareQuestion(q){return {...q,stem:normalText(q.stem),view_text:normalText(q.view_text),choices:(q.choices||[]).map(c=>({...c,text:normalText(c.text)}))}}
function stripBoxMeta(v){return normalText(v).replace(/^\s*(?:<\s*보기\s*>|〈\s*보기\s*〉)\s*/,'').trim()}
function meaningfulBox(v){var t=stripBoxMeta(v);return !!t&&!/^(?:\[\s*[1-9]\s*점\s*\]|보기|자료|학습 활동)\s*$/.test(t)}
function splitStemForSource(set,q){
 var t=normalText(q.stem).trim(),m=t.match(/^([\s\S]*?(?:것은|것인가|하는가)[?？])\s*([\s\S]*)$/);
 if(!m)return {prompt:t,detail:'',rows:null,score:''};
 var rest=m[2].trim(),score='';var sm=rest.match(/^\[\s*([1-9])\s*점\s*\]\s*/);
 if(sm){score=sm[1]+'점';rest=rest.slice(sm[0].length).trim()}
 return {prompt:m[1],detail:meaningfulBox(rest)?stripBoxMeta(rest):'',rows:parseLeaderRows(rest),score:score};
}
function labelledRows(text){
 var t=normalText(text).trim(),re=/(^|\s)([ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ])\.\s*/g,marks=[...t.matchAll(re)];
 if(marks.length<2||marks[0].index!==0||new Set(marks.map(m=>m[2])).size!==marks.length)return null;
 return marks.map((m,i)=>({label:m[2]+'.',text:t.slice(m.index+m[0].length,i+1<marks.length?marks[i+1].index:t.length).trim()}));
}
function dialogueRows(text){
 var t=normalText(text).trim(),re=/(^|\s)([가-힣]{1,8}(?:\s*\d{1,2})?)\s*:\s*/g,marks=[...t.matchAll(re)];
 if(marks.length<2||marks[0].index!==0)return null;
 return marks.map((m,i)=>({label:m[2].trim()+':',text:t.slice(m.index+m[0].length,i+1<marks.length?marks[i+1].index:t.length).trim()}));
}
function examBoxHtml(text,title,rows){
 text=stripBoxMeta(text);if(!meaningfulBox(text)||!safeDisplayText(text))return '';
 rows=rows||parseLeaderRows(text);var kind='copy',contents='';
 if(rows){kind='leaders';contents=(rows.intro?'<p class="exam-box-intro">'+esc(normalText(rows.intro))+'</p>':'')+'<div class="exam-box-rows">'+rows.map(r=>'<div class="exam-box-row"><span class="exam-box-text">'+esc(normalText(r.text))+'</span><span class="exam-box-leader" aria-hidden="true"></span><span class="exam-box-marker">'+esc(r.label)+'</span></div>').join('')+'</div>'}
 else {
  var items=labelledRows(text)||dialogueRows(text);
  if(items){kind=labelledRows(text)?'items':'dialogue';contents='<div class="exam-paragraphs">'+items.map(r=>'<p class="exam-labelled-row"><span class="exam-row-label">'+esc(r.label)+'</span><span>'+esc(r.text)+'</span></p>').join('')+'</div>'}
  else contents='<div class="exam-box-copy">'+esc(text)+'</div>';
 }
 return '<fieldset class="exam-box" data-box-layout="'+kind+'"><legend>'+esc(title||'보기')+'</legend>'+contents+'</fieldset>';
}
function choiceMatrix(q,parts){
 var text=(q.view_text||parts.detail||''),m=normalText(text).match(/\s+(A\s+B(?:\s+C)?(?:\s+D)?)\s*$/);
 if(!m)return null;
 var columns=m[1].trim().split(/\s+/);var values=(q.choices||[]).map(c=>normalText(c.text).trim().split(/\s+/));
 if(values.length!==5||values.some(v=>v.length!==columns.length))return {unresolved:true,columns};
 return {columns,values,tail:m[0]};
}
function questionNeedsDirectSource(q){
 var bad=['empty_choice','low_pdf_match','nonexact_pdf_text','unsafe_glyph','low_view_pdf_match'];
 return contentUnsafe(q.stem)||contentUnsafe(q.view_text)||(q.qc_reasons||[]).some(x=>bad.includes(x))||(q.choices||[]).some(c=>!safeDisplayText(c.text));
}
function renderingPlan(set,q){
 q=prepareQuestion(q);var parts=splitStemForSource(set,q),qe=questionEntry(set,q),hard=questionNeedsDirectSource(q),assets=questionSourceAssets(set,q),source=qe&&qe.full||[],matrix=choiceMatrix(q,parts);
 function sourcePlan(){return {kind:'source',prompt:'',body:source.length?sourceFramesHtml(source,'문제 '+q.original_no+'번 원문',canonicalOriginal(set)):singleOriginalHtml(set,'문제 원문'),numeric:true,score:''}}
 if(hard||(matrix&&matrix.unresolved))return sourcePlan();
 if(qe&&qe.layoutCritical){if(qe.material?.length)return {kind:'material',prompt:parts.prompt,body:sourceFramesHtml(qe.material,'문항 자료 원문',canonicalOriginal(set)),numeric:false,score:parts.score};return sourcePlan()}
 var detail=parts.detail,view=q.view_text||'';
 if(matrix&&!matrix.unresolved){if(view)view=view.slice(0,-matrix.tail.length).trim();else detail=detail.slice(0,-matrix.tail.length).trim()}
 var blocks='',seen=new Set();
 function add(text,title,rows){if(!meaningfulBox(text))return;var key=stripBoxMeta(text).replace(/\s/g,'');if(seen.has(key))return;seen.add(key);blocks+=examBoxHtml(text,title,rows)}
 add(detail,parts.rows?'문항 자료':'보기',matrix?null:parts.rows);add(view,'보기');
 if(assets.length&&!parts.rows){
  if(qe&&qe.material?.length)return {kind:'material',prompt:parts.prompt,body:sourceFramesHtml(qe.material,'문항 자료 원문',canonicalOriginal(set)),numeric:false,score:parts.score,matrix:matrix};
  return sourcePlan();
 }
 return {kind:blocks?'box':'text',prompt:parts.prompt,body:blocks,numeric:false,score:parts.score,matrix:matrix};
}
function singleOriginalHtml(set,label){
 var e=sourceEntry(set),parts=e&&e.originalParts;
 if(parts&&parts.length)return sourceFramesHtml(parts,label||'시험지 원문','');
 var u=canonicalOriginal(set);return u?sourceFramesHtml([{src:u}],label||'시험지 원문',''):'<div class="source-failed" role="status">연결된 원문을 찾지 못했어요. 잠시 후 다시 시도해 주세요.</div>';
}
function fallbackOriginalHtml(url){
 var wanted=safeSourceUrl(url),entry=Object.values(CBT_RENDER_DATA.units).find(e=>safeSourceUrl(e.original)===wanted);
 return entry&&entry.originalParts?.length?sourceFramesHtml(entry.originalParts,'시험지 원문',''):sourceFramesHtml([{src:url}],'시험지 원문','');
}
function renderReading(set){
 var signature=set.id+'|'+CBT_RENDER_DATA.version,host=$('#reading');if(lastReadingSignature===signature)return;
 lastReadingSignature=signature;var entry=sourceEntry(set),parts=set.passage&&set.passage.sections||[],hasText=parts.some(p=>String(p.text||'').trim());
 if(entry&&entry.passage.length)host.innerHTML=sourceFramesHtml(entry.passage,'지문 원문',canonicalOriginal(set));
 else if(passageIsRisky(set))host.innerHTML=singleOriginalHtml(set,'지문 원문');
 else if(hasText)host.innerHTML=parts.map(p=>'<div class="part">'+(p.label?'<div class="plabel">'+esc(normalText(p.label))+'</div>':'')+'<p>'+esc(normalText(p.text))+'</p></div>').join('');
 else host.innerHTML='<div class="no-separate-passage">이 문항의 자료는 오른쪽 문제에 함께 나와요.</div>';
 hydrateSourceFrames(host);$('#passageScroll').scrollTop=0;
}
