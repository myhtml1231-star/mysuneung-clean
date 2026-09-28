// Results workspace: retained account-aware history and question/annotation renderer.
const S=window.CBTStudy,EBS=window.CBTEBS;
const R5={tab:'summary',identity:null,ds:[],evidence:null,type:null,key:null,filter:'all',page:0};
function r5Empty(title,copy){return '<div class="r5-empty"><span class="r5-empty-symbol" aria-hidden="true">✓</span><b>'+esc(title)+'</b>'+esc(copy)+'</div>';}
function r5Badge(r){return '<span class="r5-tag '+(r.state==='verified'?'ok':r.reinforce?'need':'')+'">'+(r.state==='verified'?'보완 확인':r.reinforce?'우선 보완':r.state==='checking'?'새 기출 확인 중':r.answered<5?'추가 확인':'복습 대상')+'</span>';}
function r5Date(at){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}).format(new Date(at));}
function r5History(){const h=readHistory();return currentAttempt&&!h.some(a=>a.id===currentAttempt.id)?[currentAttempt,...h].slice(0,30):h;}
function r5Types(){
 const types=(R5.evidence?.types||[]).filter(r=>r.had_errors),bad=new Set(R5.ds.filter(d=>d.selected!==null&&!d.is_correct&&d.analysis_eligible).map(d=>d.type_id));
 return types.slice().sort((a,b)=>Number(bad.has(b.key))-Number(bad.has(a.key))||Number(b.reinforce)-Number(a.reinforce)||Number(a.state==='verified')-Number(b.state==='verified')||b.wrong-a.wrong||a.key.localeCompare(b.key));
}
function mountResults(){
 if($('#r5Report'))return;
 const el=document.createElement('div');el.id='r5Report';el.innerHTML=`
 <div id="r5Alert" class="r5-alert" role="alert" hidden></div>
 <header class="r5-head"><div><div class="r5-eyebrow">학습 리포트</div><h1 id="r5Title">채점 결과</h1><p class="r5-muted" id="r5Meta"></p></div><div class="r5-actions"><button type="button" data-r5-action="history">누적 기록</button><button type="button" data-r5-action="new">새 시험</button></div></header>
 <div class="r5-hero" id="r5Hero"></div>
 <nav class="r5-tabs" role="tablist" aria-label="채점 결과 메뉴">${[['summary','채점 결과'],['questions','문항별'],['study','취약점 보완']].map(([id,name])=>'<button type="button" id="r5Tab-'+id+'" class="r5-tab" role="tab" aria-controls="r5Panel-'+id+'" aria-selected="'+(id==='summary')+'" tabindex="'+(id==='summary'?0:-1)+'" data-r5-tab="'+id+'">'+name+'</button>').join('')}</nav>
 ${['summary','questions','study'].map(id=>'<section id="r5Panel-'+id+'" role="tabpanel" aria-labelledby="r5Tab-'+id+'" tabindex="0"'+(id==='summary'?'':' hidden')+'></section>').join('')}
 <footer class="r5-footer"><details class="r5-fold"><summary>분석 기준 · 출처</summary><p id="r5Criteria"></p><p>보완 확인은 마지막 오답 이후 다른 회차의 새 문항을 3개 이상, 2개 회차 이상에서 맞히고 하루 뒤 확인까지 포함한 경우입니다. 서비스의 학습 기준이며, 완전한 숙달을 보장하는 진단이 아닙니다. 확인 뒤 3일 후 재점검을 제안합니다.</p><p>공부법은 유형별 풀이 절차이며 개별 문항의 공식 해설이 아닙니다. 오답 원인은 직접 선택한 내용만 반영합니다. EBS 연계는 공식 분석표의 해당 문항과 교재 위치를 확인한 항목만 표시합니다. 현재 확인 범위: 2026학년도 6월·9월·수능, 2027학년도 6월·9월의 129문항.</p><p>정답률은 정답 문항 수 ÷ 전체 문항 수입니다. 배점을 적용한 원점수·등급·백분위로 환산하지 않습니다.</p></details><button type="button" class="r5-quiet" data-r5-action="export">기록 내보내기 ↗</button></footer>`;
 $('#analysis .analysis-inner').append(el);
 el.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.r5Tab){r5Switch(b.dataset.r5Tab);return;}
  if(b.dataset.r5Jump){const target=$('#r5StudyDetail .r5-'+b.dataset.r5Jump);if(target){target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}return;}
  if(b.dataset.r5Type){R5.type=b.dataset.r5Type;R5.key=null;r5Switch('study');return;}
  if(b.dataset.r5Question){const scroll=$('#r5Panel-questions .r5-list')?.scrollTop||0;R5.key=b.dataset.r5Question;renderR5Questions();const list=$('#r5Panel-questions .r5-list');if(list)list.scrollTop=scroll;$('#r5Report [data-r5-question=\"'+CSS.escape(R5.key)+'\"]')?.focus({preventScroll:true});return;}
  if(b.dataset.r5Filter){R5.filter=b.dataset.r5Filter;R5.key=null;R5.page=0;renderR5Questions();return;}
  if(b.dataset.r5Page){R5.page+=Number(b.dataset.r5Page);renderR5Questions();return;}
  if(b.dataset.r5Transfer){practice(b.dataset.r5Transfer,false,b.dataset.r5Origin);return;}
  if(b.dataset.r5Ebs){const box=b.nextElementSibling;box.hidden=!box.hidden;b.setAttribute('aria-expanded',String(!box.hidden));return;}
  if(b.dataset.r5Action==='history')openHistory();
  if(b.dataset.r5Action==='new')$('#analysisNew').click();
  if(b.dataset.r5Action==='export')$('#learnExport').click();
  if(b.dataset.r5Action==='answers'){R5.filter='all';r5Switch('questions');}
 });
 el.addEventListener('change',e=>{if(e.target.id==='r5Example'){R5.key=e.target.value;renderR5Study();}if(e.target.id==='r5TypeSelect'){R5.type=e.target.value;R5.key=null;renderR5Study();}});
 el.addEventListener('keydown',e=>{const b=e.target.closest('[role="tab"]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const ids=['summary','questions','study'],i=ids.indexOf(b.dataset.r5Tab),next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;r5Switch(ids[next]);$('#r5Tab-'+ids[next]).focus();});
 el.addEventListener('error',e=>{if(e.target.matches?.('.r5-ebs-preview img')){e.target.hidden=true;const msg=e.target.nextElementSibling;if(msg)msg.hidden=false;}},true);
}
function notice(t){for(const id of ['#learnMessage','#learnStatus']){const el=$(id);if(el)el.textContent=t;}const box=$('#r5Alert');if(box){box.textContent=t;box.hidden=!t;}}
function drawAnalysis(data){
 mountResults();const h=readHistory();if(data&&!currentAttempt)currentAttempt=h.find(a=>a.id===window.exam?.id)||null;
 const identity=data?(currentAttempt?.id||window.exam?.id||'current'):'history';
 const fresh=R5.identity!==identity;R5.identity=identity;if(fresh)notice('');
 R5.evidence=S.studyEvidence(r5History(),meta.questions);
 R5.ds=data?S.gradedDetails(data.details||[],meta.questions).map(d=>({...d,attempt_id:currentAttempt?.id})):r5LatestDetails();
 if(fresh){R5.tab='summary';R5.type=null;R5.key=null;R5.page=0;R5.filter=R5.ds.some(d=>d.selected!==null&&!d.is_correct)?'wrong':R5.ds.some(d=>d.selected===null)?'blank':'all';}
 const types=r5Types(),top=types.find(r=>r.state!=='verified')||types[0];
 const {total,right,wrong,blank,percent}=S.gradingSummary(data,R5.ds);
 if(total!==R5.ds.length)notice('채점 결과는 유지했습니다. 일부 문항의 상세 정보를 확인하지 못했습니다.');
 $('#r5Title').textContent=data?'채점 결과':'누적 학습 기록';
 $('#r5Meta').textContent=data?'국어 · '+(window.exam?.mode==='full'?'실전 모의고사':'맞춤 풀이')+' · '+total+'문항':'최근 '+R5.evidence.attempts+'회 · 서로 다른 '+total+'문항의 최신 답변';
 const blankPill=blank?'<span>미응답 <b>'+blank+'</b></span>':'';
 $('#r5Hero').innerHTML='<div class="r8-score-only"><div><span class="r8-kicker">정답률</span><div class="r8-score-line"><b class="r8-score-number">'+(percent===null?'—':percent)+'<small>%</small></b><span class="r8-score-count">'+right+' / '+total+'문항</span></div></div><div class="r8-score-pills"><span>정답 <b>'+right+'</b></span><span class="wrong">오답 <b>'+wrong+'</b></span>'+blankPill+'</div><button type="button" class="r8-score-detail" data-r5-action="answers">문항별 보기 →</button></div>';
 $('#r5Criteria').textContent='최근 30회 안에서 문항별 첫 응답으로 보완 대상을 찾습니다. 첫 응답 5문항 이상 · 오답 2문항 이상 · 오답률 40% 이상일 때 우선 보완으로 표시합니다. 미응답은 오답률에서 제외합니다. 재풀이 '+R5.evidence.repeat_responses+'건은 새 문항 성과로 세지 않았으며, 분류 검토 중 '+r5LatestDetails().filter(d=>!d.analysis_eligible).length+'문항은 유형별 분석에서 제외했습니다.';
 if(currentAttempt?.persisted===false)notice('이번 결과를 기기에 저장하지 못했습니다. 기록 내보내기로 먼저 보관해 주세요.');
 r5Switch(R5.tab);if(fresh)window.scrollTo({top:0,behavior:'instant'});
}
function r5Switch(tab){
 if(!['summary','questions','study'].includes(tab)||!R5.evidence)return;R5.tab=tab;$('#r5Report').dataset.view=tab;
 for(const id of ['summary','questions','study']){const b=$('#r5Tab-'+id);b.setAttribute('aria-selected',String(tab===id));b.tabIndex=tab===id?0:-1;$('#r5Panel-'+id).hidden=tab!==id;if(tab!==id)$('#r5Panel-'+id).innerHTML='';}
 if(tab==='summary')renderR5Summary();else if(tab==='questions')renderR5Questions();else renderR5Study();
}
function renderR5Summary(){
 const types=r5Types(),active=types.filter(r=>r.state!=='verified'),top=active[0]||types[0],others=active.slice(1),topics={};
 for(const d of R5.ds){const g=d.type_group||'기타';if(!topics[g])topics[g]={total:0,right:0};topics[g].total++;if(d.is_correct)topics[g].right++;}
 const example=top?r5Examples(top.key)[0]:null,hasEbs=!!(example&&EBS?.questions?.[example.question_key]),recent=types.filter(r=>r.due_at&&r.due_at<=Date.now());
 const route=top?'<div class="r8-route"><div><span>1</span><b>틀린 근거 확인</b><small>내 답과 정답이 갈린 지점만 다시 봅니다.</small></div><div><span>2</span><b>'+(hasEbs?'EBS 연계 확인':'같은 유형 정리')+'</b><small>'+(hasEbs?'확인된 연계 자료만 바로 연결합니다.':'유형별 풀이 순서를 짧게 다시 확인합니다.')+'</small></div><div><span>3</span><b>새 기출에 적용</b><small>같은 문제 재풀이가 아닌 다른 회차로 확인합니다.</small></div></div>':'';
 const topicRows=Object.entries(topics).map(([g,t])=>'<div class="r8-topic-row"><span>'+esc(g)+'</span><b>'+t.right+' / '+t.total+'</b><i><em style="width:'+Math.round(t.right/t.total*100)+'%"></em></i></div>').join('');
 $('#r5Panel-summary').innerHTML='<div class="r8-summary-grid"><section class="r5-surface r8-today"><div class="r8-section-label">오늘 할 것</div>'+(top?'<div class="r8-today-head"><div><span class="r5-tag">'+esc(top.group)+'</span> '+r5Badge(top)+'<h2>'+esc(top.label)+'</h2><p class="r5-muted">첫 응답 '+top.answered+'문항 · 오답 '+top.wrong+'문항</p></div><button type="button" class="r5-primary" data-r5-type="'+esc(top.key)+'">복습 시작 →</button></div>'+route:r5Empty('지금 바로 보완할 유형은 없어요','문항별 채점에서 틀린 근거만 확인해 주세요.'))+'</section><aside class="r5-surface r8-result-mini"><div class="r8-section-label">이번 결과</div><div class="r8-mini-stats"><div><b>'+R5.ds.filter(d=>d.selected!==null&&!d.is_correct).length+'</b><span>오답</span></div><div><b>'+R5.ds.filter(d=>d.selected===null).length+'</b><span>미응답</span></div><div><b>'+active.length+'</b><span>확인할 유형</span></div></div><button type="button" data-r5-tab="questions">문항별 채점 보기</button>'+(recent.length?'<button type="button" class="r8-due" data-r5-tab="study">재점검 '+recent.length+'개 →</button>':'')+'</aside></div><div class="r8-secondary">'+(others.length?'<details class="r8-fold"><summary>다른 보완 유형 <b>'+others.length+'개</b></summary><div class="r8-weak-list">'+others.slice(0,8).map(r=>'<button type="button" data-r5-type="'+esc(r.key)+'"><span><small>'+esc(r.group)+'</small><b>'+esc(r.label)+'</b></span><em>오답 '+r.wrong+' / '+r.answered+'</em></button>').join('')+'</div></details>':'')+(topicRows?'<details class="r8-fold"><summary>영역별 정답 보기</summary><div class="r8-topic-list">'+topicRows+'</div></details>':'')+'</div>';
}
function r5Status(d){return d.selected===null?['blank','—','미응답']:d.is_correct?['right','O','정답']:['wrong','X','오답'];}
function renderR5Questions(){
 let ds=R5.ds.filter(d=>R5.filter==='all'||(R5.filter==='wrong'&&d.selected!==null&&!d.is_correct)||(R5.filter==='blank'&&d.selected===null)||(R5.filter==='right'&&d.is_correct));
 const max=Math.max(0,Math.ceil(ds.length/45)-1);R5.page=Math.max(0,Math.min(max,R5.page));const page=ds.slice(R5.page*45,(R5.page+1)*45);
 if(!page.some(d=>d.question_key===R5.key))R5.key=page[0]?.question_key||null;
 const selected=page.find(d=>d.question_key===R5.key);
 $('#r5Panel-questions').innerHTML='<div class="r5-question-layout"><aside class="r5-surface"><div class="r5-section-head"><h2>문항별 채점</h2><span class="r5-muted">'+ds.length+'문항</span></div><div class="r5-filters" aria-label="채점 결과 필터">'+[['all','전체'],['wrong','오답'],['blank','미응답'],['right','정답']].map(([id,name])=>'<button type="button" class="r5-filter" data-r5-filter="'+id+'" aria-pressed="'+(R5.filter===id)+'">'+name+'</button>').join('')+'</div><div class="r5-list">'+(page.map(d=>{const st=r5Status(d);return '<button type="button" class="r5-qrow" data-r5-question="'+esc(d.question_key)+'" aria-pressed="'+(R5.key===d.question_key)+'" aria-label="'+esc(sourceName(d)+' '+st[2])+'"><strong>'+String(latest?d.display_no:d.original_no).padStart(2,'0')+'</strong><span><b>'+esc(d.type_group+' · '+(d.analysis_eligible?d.question_type:'분류 검토 중'))+'</b><small>'+esc(sourceName(d))+'</small></span><span class="r5-mark '+st[0]+'" aria-hidden="true">'+st[1]+'</span></button>';}).join('')||'<p class="r5-empty">해당 문항이 없습니다.</p>')+'</div>'+(max?'<div class="r5-pagination"><button type="button" data-r5-page="-1" '+(R5.page===0?'disabled':'')+'>←</button><span class="r5-muted">'+(R5.page+1)+' / '+(max+1)+'</span><button type="button" data-r5-page="1" '+(R5.page===max?'disabled':'')+'>→</button></div>':'')+'</aside><div class="r5-surface" id="r5QuestionDetail">'+(selected?r5Detail(selected,false):r5Empty('해당하는 문항이 없어요','다른 필터를 선택해 주세요.'))+'</div></div>';
}
function r5Examples(type){
 const all=[...R5.ds.filter(d=>d.type_id===type&&!d.is_correct),...R5.evidence.events.filter(d=>d.type_id===type&&d.selected!==null&&!d.is_correct).sort((a,b)=>b.at-a.at)];
 const seen=new Set();return all.filter(d=>{if(seen.has(d.question_key))return false;seen.add(d.question_key);return true;});
}
function renderR5Study(){
 const types=r5Types();
 if(!types.length){$('#r5Panel-study').innerHTML='<div class="r5-surface">'+r5Empty('보완할 유형을 확인하고 있어요','확인된 오답 유형이 없습니다. 미응답은 문항별 채점에서 먼저 확인하세요.')+'<div class="r5-actions"><button type="button" data-r5-tab="questions">문항별 채점 보기</button></div></div>';return;}
 if(!types.some(r=>r.key===R5.type))R5.type=types[0].key;
 const row=types.find(r=>r.key===R5.type),examples=r5Examples(R5.type);
 if(!examples.some(d=>d.question_key===R5.key))R5.key=examples[0]?.question_key;
 const d=examples.find(d=>d.question_key===R5.key),hasEbs=!!EBS?.questions?.[d?.question_key];
 const evidence=row.answered<5?'아직 확인 단계 · 첫 응답 '+row.answered+'문항 중 '+row.wrong+'문항 오답':'첫 응답 '+row.answered+'문항 중 '+row.wrong+'문항 오답'+(row.repeat_wrong?' · 반복 오답 '+row.repeat_wrong+'회':'');
 const typeSelect='<label class="r8-study-switch"><span>다른 유형</span><select id="r5TypeSelect">'+types.map(r=>'<option value="'+esc(r.key)+'"'+(r.key===R5.type?' selected':'')+'>'+esc(r.group+' · '+r.label)+'</option>').join('')+'</select></label>';
 const exampleSelect=examples.length>1?'<label class="r8-example-switch" for="r5Example"><span>다른 오답</span><select id="r5Example">'+examples.map(q=>'<option value="'+esc(q.question_key)+'"'+(q.question_key===R5.key?' selected':'')+'>'+esc(sourceName(q))+'</option>').join('')+'</select></label>':'';
 const path='<div class="r8-study-path" aria-label="보완 학습 순서"><button type="button" data-r5-jump="method"><b>1</b><span><strong>틀린 근거 정리</strong><small>다음에 확인할 기준만 남깁니다.</small></span></button>'+(hasEbs?'<button type="button" data-r5-jump="ebs"><b>2</b><span><strong>EBS 연계 복습</strong><small>확인된 공식 연계 자료만 봅니다.</small></span></button>':'<button type="button" data-r5-jump="transfer"><b>2</b><span><strong>새 기출에 적용</strong><small>같은 유형을 다른 회차에서 확인합니다.</small></span></button>')+(hasEbs?'<button type="button" data-r5-jump="transfer"><b>3</b><span><strong>새 기출에 적용</strong><small>같은 문제 재풀이와 분리합니다.</small></span></button>':'<button type="button" data-r5-jump="progress"><b>3</b><span><strong>다시 확인</strong><small>새 문항 결과로 보완 여부를 봅니다.</small></span></button>')+'</div>';
 $('#r5Panel-study').innerHTML='<div class="r8-study-shell"><header class="r8-study-head"><div><div class="r8-section-label">우선 보완</div><span class="r5-tag">'+esc(row.group)+'</span> '+r5Badge(row)+'<h2>'+esc(row.label)+'</h2><p>'+esc(evidence)+'</p></div>'+typeSelect+'</header>'+path+'<section class="r5-surface r8-study-card" id="r5StudyDetail">'+exampleSelect+(d?r5Detail(d,true):r5Empty('복습 문항을 확인하지 못했습니다.','새 풀이 기록에서 다시 확인해 주세요.'))+r5Progress(row)+'</section></div>';
}
function r5Progress(r){
 if(!r?.had_errors)return '';
 return '<div class="r5-progress"><strong>'+(r.state==='verified'?'새 기출에서 보완을 확인했어요':r.verification_correct?'보완 효과를 확인하고 있어요':'다른 회차에서도 풀리는지 확인해요')+'</strong>마지막 오답 이후 새 문항 '+r.verification_correct+'개 정답 · '+r.verification_exams+'개 회차'+(r.verification_correct&&!r.verification_delayed?' · 하루 뒤 확인 필요':'')+'<br>'+(r.due_at<=Date.now()?'오늘 다시 확인하기':'다음 확인 권장일 '+r5Date(r.due_at))+'</div>';
}
function r5SafeEbs(url){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='ebsi.co.kr'||u.hostname.endsWith('.ebsi.co.kr'))?u.href:null;}catch{return null;}}
function r5Ebs(d,quiet){
 const link=EBS?.questions?.[d.question_key];if(!link)return quiet?'':'<p class="r5-muted" style="margin-top:20px;font-size:12px">'+(EBS?.coverage?.includes(d.question_key.slice(0,7))?'공식 연계표에 표시된 연계 교재가 없습니다.':'이 문항의 EBS 연계 자료는 아직 확인되지 않았습니다.')+'</p>';
 const url=r5SafeEbs(link.source_url);if(!url)return '';
 const imgs=(link.previews||[]).filter(i=>r5SafeEbs(i.url));
 return '<div class="r5-ebs"><span class="r5-tag">EBS 공식 연계</span><h3>'+esc(link.book)+'</h3><p>'+esc(link.location)+'</p>'+(imgs.length?'<button type="button" data-r5-ebs="'+esc(d.question_key)+'" aria-expanded="false">연계 지문 바로 보기 <span aria-hidden="true">⌄</span></button><div class="r5-ebs-preview" hidden>'+imgs.map(i=>'<figure style="margin:16px 0"><figcaption class="r5-muted">'+esc(i.label)+'</figcaption><img loading="lazy" referrerpolicy="no-referrer" src="'+esc(i.url)+'" alt="'+esc(i.label)+'" style="max-width:100%;height:auto;display:block;margin-top:10px"><p hidden>미리보기를 불러오지 못했습니다. 아래 EBS 공식 자료에서 확인해 주세요.</p></figure>').join('')+'<p>공식 분석에 실린 교재 발췌입니다. 교재 전체와 정답 해설이 포함된 자료는 아닙니다.</p></div>':'')+'<p style="margin:12px 0 0"><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">EBS 연계표·출처 확인 ↗</a></p></div>';
}
function r5Detail(d,study){
 const owner=d.attempt_id||currentAttempt?.id,reason=reasonFor(d,owner),method=S.studyMethod(d.type_id,reason.code,d.analysis_eligible),st=r5Status(d),m=meta.questions[d.question_key];
 const title=d.analysis_eligible?d.question_type:'문항 근거 확인';
 const savedOwner=owner&&!!m&&readHistory().some(a=>a.id===owner);
 return '<header class="r5-detail-head"><div><span class="r5-tag">'+esc(d.type_group)+'</span> <span class="r5-tag '+(d.is_correct?'ok':'')+'">'+st[2]+'</span><h2>'+esc(study?'틀린 문제 확인':title)+'</h2><p class="r5-muted">'+esc(sourceName(d))+'</p></div><button type="button" data-learn-review="'+esc(d.question_key)+'">문제 원문 ↗</button></header><div class="r5-answer"><span>내 답 <b>'+(d.selected===null?'—':d.selected)+'</b></span><span>정답 <b class="right">'+d.correct_answer+'</b></span></div>'+(d.selected===null?'<p class="r5-muted">미응답만으로 개념 부족이나 시간 부족을 판단하지 않습니다.</p>':'')+'<section class="r5-method"><h3>'+(study?'이렇게 공부해 보세요':'다시 볼 때 확인할 순서')+'</h3><ol class="r5-steps">'+method.steps.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol></section>'+(!d.is_correct&&savedOwner?'<details class="r8-reason"><summary>왜 틀렸는지 기록'+(reason.code&&reason.code!=='unknown'?' · '+esc(L.REASONS.find(x=>x[0]===reason.code)?.[1]||'기록 있음'):'')+'</summary><div class="learn-reason-editor" data-attempt="'+esc(owner)+'" data-key="'+esc(d.question_key)+'"><label>가장 가까운 이유<select class="learn-select learn-reason-select" aria-label="내가 확인한 오답 이유">'+L.REASONS.map(([k,v])=>'<option value="'+k+'"'+(reason.code===k?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label><div class="r5-tip" role="status">'+esc(method.tip)+'</div><details class="r5-fold"><summary>복습 메모'+(reason.note?' · 기록 있음':'')+'</summary><textarea class="learn-reason-note" maxlength="500" aria-label="복습 메모" placeholder="놓친 근거와 다음에 확인할 행동 한 가지">'+esc(reason.note)+'</textarea><button type="button" data-learn-save="1">메모 저장</button></details><span class="learn-save-state" role="status"></span></div></details>':'')+r5Ebs(d,study)+(d.analysis_eligible?'<section class="r5-transfer"><h3>같은 유형, 다른 기출</h3><p>다른 회차의 새 지문 최대 2개 · 최근 30회 풀이 제외. 지문에 딸린 문항도 함께 풉니다.</p><button type="button" class="r5-primary" data-r5-transfer="'+esc(d.type_id)+'" data-r5-origin="'+esc(d.question_key)+'">새 기출로 보완하기 →</button></section>':'<p class="r5-muted" style="margin-top:20px">유형 분류 검토 중으로 자동 보완 출제에서 제외합니다.</p>')+'<details class="r5-fold"><summary>문항 분류 근거</summary><p>'+esc(reviewNames[m?.review_status]||'분류 검토 중')+' · '+esc(m?.review_note||'추가 검토 필요')+'</p></details>';
}
function renderReasonStats(){
 document.querySelectorAll('#r5Report .learn-reason-editor').forEach(editor=>{const d=meta.questions[editor.dataset.key],code=editor.querySelector('select').value;editor.querySelector('.r5-tip').textContent=S.studyMethod(d?.type_id,code,d?.analysis_eligible).tip;});
}
async function practice(id,full,origin){
 if(busy)return;busy=true;$('#loading').classList.remove('hidden');
 try{
  await ensureMeta();const row=r5Types().find(r=>r.state!=='verified');id=id||row?.key;if(!id)throw new Error('보완할 유형을 먼저 선택해 주세요.');
  const example=origin||r5Examples(id)[0]?.question_key;if(!example)throw new Error('보완의 기준이 될 원문 문항을 확인하지 못했습니다.');
  if(!meta.study_version)throw new Error('보완 출제 정보를 새로 불러온 뒤 다시 시도해 주세요.');
  const body={mode:'custom',years:[2017,2018,2019,2020,2021,2022,2023,2024,2025,2026,2027],strategy:'weakness',practice_mode:'transfer',source_question_keys:[example],type_ids:[id],set_count:2,recent_attempts:recentPayload(),categories:[...new Set(Object.values(meta.questions).filter(m=>m.type_id===id).map(m=>m.category))]};
  const r=await fetch('/api/cbt/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw new Error(d.error||'보완 문제 생성 실패');
  if(d.exam?.learning?.practice_mode!=='transfer')throw new Error('새 기출 조건을 확인하지 못해 시작하지 않았습니다.');
  notice('');window.loadExam(d.exam,true);
 }catch(e){notice(e.message);}finally{busy=false;$('#loading').classList.add('hidden');}
}
async function showLearningAnalysis(data){
 latest=data;historyView=false;$('#app').classList.add('hidden');$('#analysis').classList.remove('hidden');$('#analysisReview').disabled=false;mountResults();
 try{await ensureMeta();drawAnalysis(data);}catch(e){
  R5.evidence=null;R5.identity=null;for(const id of ['summary','questions','study'])$('#r5Panel-'+id).innerHTML='';
  $('#r5Hero').innerHTML='<div class="r5-surface r8-analysis-fallback"><b>채점은 완료되었어요.</b><span>상세 분석을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</span></div>';
  notice('채점은 완료되었습니다. 분석 정보를 불러오지 못했습니다. '+e.message);
 }
}

// Clear this private view when the existing account adapter locks the session.
window.addEventListener('msn-account-locked', function resetPrivateResults() {
 R5.ds = [];
 R5.evidence = null;
 R5.identity = null;
 R5.type = null;
 R5.key = null;
 latest = null;
 currentAttempt = null;
 const report = document.getElementById('r5Report');
 if (report) report.remove();
});

function r5LatestDetails(){
 const result=new Map(),now=Date.now();
 const ordered=r5History().filter(a=>Number.isFinite(Number(a.at))&&Number(a.at)>0&&Number(a.at)<=now+300000).sort((a,b)=>Number(b.at)-Number(a.at)).slice(0,30);
 for(const a of ordered)for(const d of S.gradedDetails((a.details||[]).slice(0,45),meta.questions)){
  if(!result.has(d.question_key))result.set(d.question_key,{...d,attempt_id:a.id,at:a.at});
 }
 return [...result.values()];
}
