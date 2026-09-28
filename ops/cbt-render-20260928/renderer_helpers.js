// Source-aware rendering: preserves exam wording; only layout is transformed.
var passageRatio=.44, splitDrag=null, lastReadingSignature='', renderSerial=0;
var sourceLoadStats={loaded:0,retried:0,failed:0}, sourceFrameSerial=0;
function safeDisplayText(v){return typeof v==='string'&&v.trim()!==''&&!hasUnsafeDisplayText(v)}
function sourceEntry(set){return set&&CBT_RENDER_DATA.units[set.id]||null}
function questionEntry(set,q){var e=sourceEntry(set);return e&&e.questions[String(q.original_no)]||null}
function safeSourceUrl(raw){
  try{var u=new URL(String(raw||''),location.origin);if(!['http:','https:'].includes(u.protocol)||!['mysuneung.com','www.mysuneung.com',location.hostname].includes(u.hostname)||!u.pathname.startsWith('/cbt-data/'))return '';return u.href}catch(e){return ''}
}
function canonicalOriginal(set){var e=sourceEntry(set);return safeSourceUrl(e&&e.original)||safeSourceUrl(set&&set.original_url)||''}
function sourceFramesHtml(list,alt,fallback){
 return (list||[]).map(function(d,i){
  var src=safeSourceUrl(d.src||d.url);if(!src)return '';
  var candidates=[src];if(fallback&&safeSourceUrl(fallback)!==src)candidates.push(safeSourceUrl(fallback));
  return '<figure class="source-frame" data-source-candidates="'+esc(JSON.stringify(candidates.filter(Boolean)))+'"><img class="managed-source" '+(d.w&&d.h?'width="'+Number(d.w)+'" height="'+Number(d.h)+'" ':'')+'alt="'+esc(alt+(list.length>1?' '+(i+1):''))+'" decoding="async"><div class="source-status" role="status">원문을 불러오는 중이에요.</div></figure>'
 }).join('')
}
function singleOriginalHtml(set,label){var u=canonicalOriginal(set);return u?sourceFramesHtml([{src:u}],label||'시험지 원문',''):'<div class="source-failed" role="status">연결된 원문을 찾지 못했어요. 잠시 후 다시 시도해 주세요.</div>'}
function hydrateSourceFrames(root){
 if(!root)return;
 root.querySelectorAll('.source-frame:not([data-source-bound])').forEach(function(frame){
  frame.dataset.sourceBound='1';
  var img=frame.querySelector('img'),status=frame.querySelector('.source-status'),urls=[],at=0,attempt=0,token=0,waitTimer=0;
  try{urls=JSON.parse(frame.dataset.sourceCandidates||'[]').map(safeSourceUrl).filter(Boolean)}catch(e){}
  function stop(){clearTimeout(waitTimer);waitTimer=0;img.onload=null;img.onerror=null}
  function finishError(){
   stop();token++;if(!frame.isConnected)return;
   sourceLoadStats.failed++;frame.dataset.sourceState='failed';img.hidden=true;img.removeAttribute('src');
   status.replaceChildren();var text=document.createElement('span');text.textContent='원문을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';status.append(text);
   var btn=document.createElement('button');btn.type='button';btn.textContent='다시 불러오기';btn.onclick=function(){at=0;attempt=0;load()};status.append(btn);scheduleCanvasResize();
  }
  function load(){
   stop();if(!frame.isConnected)return;if(!urls[at])return finishError();
   var thisToken=++token,url=urls[at],settled=false;
   frame.dataset.sourceState='loading';img.hidden=false;status.textContent='원문을 불러오는 중이에요.';
   if(attempt){var u=new URL(url);u.searchParams.set('image_retry','20260928-r3');url=u.href;sourceLoadStats.retried++}
   function success(){
    if(settled||thisToken!==token||!frame.isConnected)return;
    settled=true;stop();frame.dataset.sourceState='loaded';status.textContent='';sourceLoadStats.loaded++;scheduleCanvasResize();
   }
   function error(){
    if(settled||thisToken!==token||!frame.isConnected)return;
    settled=true;stop();
    if(attempt===0){attempt=1;load()}
    else if(at+1<urls.length){
     var host=frame.closest('#reading,#qassets');
     if(host&&host.querySelectorAll('.source-frame').length>1){token++;host.innerHTML=sourceFramesHtml([{src:urls[at+1]}],'시험지 원문','');hydrateSourceFrames(host);return}
     at++;attempt=0;load();
    }else finishError();
   }
   img.onload=function(){if(!img.naturalWidth)return error();if(img.decode)img.decode().then(success).catch(error);else success()};img.onerror=error;
   waitTimer=setTimeout(error,12000);img.src=url;
  }
  load();
 });
}
function questionSourceAssets(set,q){
 var a=(set.assets||[]).filter(function(x){return x&&x.target==='question'&&Number(x.question_no)===Number(q.original_no)}).concat(q.assets||[]),seen=new Set();
 return a.filter(function(x){var k=x&&x.url;if(!k||seen.has(k))return false;seen.add(k);return true})
}
function questionNeedsDirectSource(q){
 var bad=['empty_choice','low_pdf_match','nonexact_pdf_text','unsafe_glyph','low_view_pdf_match'];
 return hasUnsafeDisplayText(q.stem)||hasUnsafeDisplayText(q.view_text)||(q.qc_reasons||[]).some(function(x){return bad.includes(x)})||(q.choices||[]).some(function(c){return !safeDisplayText(c.text)})
}
function parseLeaderRows(text){
 var src=String(text||'').trim(),re=/([\s\S]*?)[·⋯…\.]{3,}\s*([ⓐ-ⓩ㉠-㉻])(?=\s|[∙•◦]|$)/g,m,last=0,rows=[];
 while((m=re.exec(src))){var body=m[1].trim().replace(/^[∙•◦]\s*/,'');if(!body)return null;rows.push({text:body,label:m[2]});last=re.lastIndex}
 if(rows.length<2||src.slice(last).trim()||new Set(rows.map(function(r){return r.label})).size!==rows.length)return null;
 var lead=rows[0].text.match(/^([\s\S]+?)\s+(학생\s*1\s*:[\s\S]+)$/);
 if(lead&&/^선생님\s*:/.test(lead[1])){rows.intro=lead[1];rows[0].text=lead[2]}
 else if(rows[0].text.startsWith('점검 항목 ')){rows.intro='점검 항목';rows[0].text=rows[0].text.slice(6).trim()}
 return rows
}
function splitStemForSource(set,q){
 var t=String(q.stem||'').trim(),m=t.match(/^([\s\S]*?(?:것은|것인가|하는가)[?？])(?:\s*(\[3점\]))?\s*([\s\S]+)$/);
 if(!m)return {prompt:t,detail:'',rows:null};
 return {prompt:m[1]+(m[2]?' '+m[2]:''),detail:m[3].trim(),rows:parseLeaderRows(m[3])}
}
function examBoxHtml(text,title,rows){
 if(!safeDisplayText(text))return '';
 rows=rows||parseLeaderRows(text);
 var contents=rows?(rows.intro?'<div class="exam-box-intro">'+esc(rows.intro)+'</div>':'')+'<div class="exam-box-rows">'+rows.map(function(r){return '<div class="exam-box-row"><span class="exam-box-text">'+esc(r.text)+'</span><span class="exam-box-leader" aria-hidden="true"></span><span class="exam-box-marker">'+esc(r.label)+'</span></div>'}).join('')+'</div>':'<div class="exam-box-copy">'+esc(text)+'</div>';
 return '<fieldset class="exam-box"><legend>'+esc(title||'보기')+'</legend>'+contents+'</fieldset>'
}
function renderingPlan(set,q){
 var parts=splitStemForSource(set,q),qe=questionEntry(set,q),hard=questionNeedsDirectSource(q),assets=questionSourceAssets(set,q),source=qe&&qe.full||[];
 if(hard){return {kind:'source',prompt:'',body:source.length?sourceFramesHtml(source,'문제 '+q.original_no+'번 원문',canonicalOriginal(set)):singleOriginalHtml(set,'문제 원문'),numeric:true}}
 var blocks='';
 if(parts.detail)blocks+=examBoxHtml(parts.detail,parts.rows?'문항 자료':'보기',parts.rows);
 if(q.view_text)blocks+=examBoxHtml(q.view_text,'보기');
 // Decorative PDF raster objects never stand in for a whole source box.
 if(assets.length&&!parts.rows){
  if(qe&&qe.material&&qe.material.length)return {kind:'material',prompt:parts.prompt,body:sourceFramesHtml(qe.material,'문항 자료 원문',canonicalOriginal(set)),numeric:false};
  return {kind:'source',prompt:'',body:source.length?sourceFramesHtml(source,'문제 원문',canonicalOriginal(set)):singleOriginalHtml(set,'문제 원문'),numeric:true}
 }
 return {kind:blocks?'box':'text',prompt:parts.prompt,body:blocks,numeric:false}
}
function passageIsRisky(set){
 var risks=['low_passage_pdf_match','complex_passage_assets','blank_visual_passage_part','passage_asset_order','passage_visual_asset','missing_passage_ref'];
 return hasUnsafeDisplayText(set.passage)||(set.questions||[]).some(function(q){return (q.qc_reasons||[]).some(function(r){return risks.includes(r)})})
}
function renderReading(set){
 var signature=set.id+'|'+CBT_RENDER_DATA.version,host=$('#reading');
 if(lastReadingSignature===signature)return;
 lastReadingSignature=signature;var entry=sourceEntry(set),parts=set.passage&&set.passage.sections||[],hasText=parts.some(function(p){return String(p.text||'').trim()});
 if(entry&&entry.passage.length)host.innerHTML=sourceFramesHtml(entry.passage,'지문 원문',canonicalOriginal(set));
 else if(passageIsRisky(set))host.innerHTML=singleOriginalHtml(set,'지문 원문');
 else if(hasText){host.innerHTML=parts.map(function(p){return '<div class="part">'+(p.label?'<div class="plabel">'+esc(p.label)+'</div>':'')+'<p>'+esc(p.text)+'</p></div>'}).join('');}
 else host.innerHTML='<div class="no-separate-passage">이 문항의 자료는 오른쪽 문제에 함께 나와요.</div>';
 hydrateSourceFrames(host);$('#passageScroll').scrollTop=0;
}
// The divider is a real adjustable separator, with keyboard equivalents.
function passageStateKey(){return 'mysuneung-cbt-pane-ratio-v2'}
function loadPassageState(){try{var v=Number(localStorage.getItem(passageStateKey()));if(v>=.15&&v<=.85)passageRatio=v}catch(e){}initPassageSplitter();applyPassageState()}
function splitterBounds(){
 var l=$('.layout'),palette=$('.palette'),r=l.getBoundingClientRect(),pw=getComputedStyle(palette).position==='fixed'?0:palette.getBoundingClientRect().width;
 var available=Math.max(0,r.width-pw-9);return {left:r.left,available:available,min:Math.min(280,available*.4),max:Math.max(280,available-380)}
}
function applyPassageState(){
 var l=$('.layout'),divider=$('#passageResizer');if(!l||!divider)return;
 var bar=$('#app .bar'),palette=$('.palette');document.documentElement.style.setProperty('--cbt-bar-height',bar?bar.getBoundingClientRect().height+'px':'64px');
 var fixed=getComputedStyle(palette).position==='fixed';document.documentElement.style.setProperty('--cbt-palette-height',fixed?palette.getBoundingClientRect().height+'px':'0px');
 l.classList.remove('passage-collapsed');
 if(innerWidth>960){var b=splitterBounds(),px=Math.max(b.min,Math.min(b.max,b.available*passageRatio));l.style.setProperty('--passage-width',Math.round(px)+'px');divider.setAttribute('aria-valuenow',Math.round(px/b.available*100));divider.setAttribute('aria-valuetext','지문 너비 '+Math.round(px)+'픽셀');divider.setAttribute('aria-valuemin',Math.round(b.min/b.available*100));divider.setAttribute('aria-valuemax',Math.round(b.max/b.available*100))}
 scheduleCanvasResize();updateToolbarLayout()
}
function setPassageWidth(x,save){var b=splitterBounds();passageRatio=Math.max(b.min,Math.min(b.max,x))/b.available;applyPassageState();if(save)try{localStorage.setItem(passageStateKey(),String(passageRatio))}catch(e){}}
function initPassageSplitter(){
 var d=$('#passageResizer');if(!d||d.dataset.bound)return;d.dataset.bound='1';
 d.addEventListener('pointerdown',function(e){if(innerWidth<=960||e.button!==0)return;e.preventDefault();splitDrag=e.pointerId;d.setPointerCapture(e.pointerId);document.body.classList.add('pane-resizing')});
 d.addEventListener('pointermove',function(e){if(splitDrag!==e.pointerId)return;setPassageWidth(e.clientX-splitterBounds().left,false)});
 function done(e){if(splitDrag!==e.pointerId)return;splitDrag=null;try{d.releasePointerCapture(e.pointerId)}catch(x){}document.body.classList.remove('pane-resizing');try{localStorage.setItem(passageStateKey(),String(passageRatio))}catch(x){}scheduleCanvasResize()}
 d.addEventListener('pointerup',done);d.addEventListener('pointercancel',done);d.addEventListener('lostpointercapture',done);
 d.ondblclick=function(){passageRatio=.44;applyPassageState();try{localStorage.setItem(passageStateKey(),'.44')}catch(e){}};
 d.onkeydown=function(e){var b=splitterBounds(),w=$('#passagePane').getBoundingClientRect().width;if(e.key==='ArrowLeft')w-=20;else if(e.key==='ArrowRight')w+=20;else if(e.key==='Home')w=b.min;else if(e.key==='End')w=b.max;else if(e.key==='Enter'){d.ondblclick();e.preventDefault();e.stopPropagation();return}else return;e.preventDefault();e.stopPropagation();setPassageWidth(w,true)};
 var observer=new ResizeObserver(function(){applyPassageState()});observer.observe($('.layout'));observer.observe($('#app .bar'));observer.observe($('.palette'));
 var ro=new ResizeObserver(updateToolbarLayout);ro.observe($('#paintRibbon'));
}
function updateToolbarLayout(){
 var r=$('#paintRibbon');if(!r||r.classList.contains('hidden'))return;var w=r.getBoundingClientRect().width;
 r.classList.toggle('toolbar-compact',w<670);r.classList.toggle('toolbar-narrow',w<435)
}
var canvasResizeTimer=0;
function scheduleCanvasResize(){clearTimeout(canvasResizeTimer);canvasResizeTimer=setTimeout(function(){if(typeof resizeDrawCanvas==='function')resizeDrawCanvas()},65)}
