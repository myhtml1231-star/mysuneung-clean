/* My information: account-scoped views only. No new account credentials or database ownership fields. */
(function(){
'use strict';
const A=window.MSNAccount,$=s=>document.querySelector(s);if(!A)return;
const KINDS=['download','attempt','draft','annotation','university','university_state'];
const kindNames={download:'기출 링크',attempt:'CBT 풀이',draft:'진행 중 CBT',annotation:'필기',university:'관심 대학',university_state:'대학 목록'};
const REASONS=[['unknown','아직 모르겠음'],['condition','조건 누락'],['target','대상 혼동'],['causality','인과관계 혼동'],['category','범주 혼동'],['sequence','선후관계 혼동'],['over_inference','과도한 추론'],['concept','개념·어휘 부족'],['application','보기 적용 어려움'],['prompt','발문 오독'],['time','시간 부족'],['selection','선택 실수'],['other','기타']];
const labels={overview:['내 공부',''],downloads:['기출 보관함','찾아 둔 기출, 여기서 바로 열어봐요.'],cbt:['풀었던 문제','풀던 곳부터 이어 풀고, 지난 답안도 다시 봐요.'],review:['오답노트','헷갈린 한 문제를 내 것으로 만들어요.'],universities:['관심 대학','가고 싶은 대학과 나에게 맞는 전형을 모아봐요.'],data:['모든 기록','내 공부 기록을 한곳에서 관리해요.'],settings:['설정','내 계정과 기록을 안전하게 관리해요.']};
const panels={overview:'Overview',downloads:'Downloads',cbt:'Cbt',review:'Review',universities:'Universities',data:'Data',settings:'Settings'};
const states={connecting:'연결 중',guest:'이 기기에 저장',syncing:'동기화 중',saved:'동기화됨',pending:'저장 대기',offline:'오프라인',conflict:'충돌 확인',locked:'로그인 필요',error:'저장 확인'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{const d=new Date(Number(v));return !v||Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'});};
const fullDate=v=>v?new Date(v).toLocaleString('ko-KR'):'아직 없음';
const normalize=v=>String(v||'').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
const key=r=>r.kind+'|'+r.id;
const time=r=>Number(r.updated_at||r.data.at||r.data.checked_at||0);
const options=selected=>REASONS.map(([code,name])=>'<option value="'+code+'"'+(selected===code?' selected':'')+'>'+name+'</option>').join('');
const reasonName=c=>REASONS.find(x=>x[0]===c)?.[1]||'아직 모르겠음';
const href=s=>{try{const u=new URL(s,location.origin);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'#';}catch{return '#';}};
let tab='overview',cbtFilter='all',reviewFilter='wrong',timer=null,profileDirty=false,initialized=false,notice='',reviewEdit=null,researchEdit=null,drawing=null,deleteIntent=null,deleting=false;
const pages={downloads:1,cbt:1,review:1,universities:1,data:1},selection=new Set();let pageData=[];
const pageSize=20;
const rendered=new WeakMap();
function html(id,content){
 const e=$(id);if(!e||rendered.get(e)===content)return;
 const selected=document.activeElement?.matches?.('[data-select]')&&e.contains(document.activeElement)?document.activeElement.dataset.select:null;
 e.innerHTML=content;rendered.set(e,content);
 if(selected){const next=[...e.querySelectorAll('[data-select]')].find(x=>x.dataset.select===selected);next?.focus({preventScroll:true});}
}
function find(kind,id){return A.list(kind).find(r=>r.id===id);}
function say(s){notice=s||'';showNotice();}
function showNotice(){const i=A.info(),problem=['error','offline','locked','conflict'].includes(i.status);const text=problem?(i.message||states[i.status]):notice;$('#workspaceMessage').dataset.state=problem?'warning':'info';$('#workspaceMessage').textContent=text;$('#workspaceMessage').classList.toggle('hidden',!text);}
function empty(title,link='',action=''){return '<div class="empty"><div class="empty-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 9h8M8 13h5"/></svg></div><h3>'+esc(title)+'</h3>'+(link?'<a class="button" href="'+esc(link)+'">'+esc(action)+'</a>':'')+'</div>';}
function source(d){return d.academic_year+'학년도 '+(Number(d.month)===11?'수능':d.month+'월')+' · '+d.original_no+'번';}
function examTitle(d){const ys=(d.years||[]);const y=ys.length>2?Math.min(...ys)+'–'+Math.max(...ys):ys.join('·');return (y?y+'학년도 · ':'')+(d.details?.length||d.total||0)+'문항'+(d.choice?' · '+(d.choice==='lm'?'언매':'화작'):'');}
function drawingLabel(d){const m=String(d?.unit_id||'').match(/^(20\d{2})-(S|\d{2})-(common|hw|lm|full)-q(\d+)-(\d+)$/);if(!m)return '저장한 필기';const range=Number(m[4])===Number(m[5])?Number(m[4])+'번':Number(m[4])+'–'+Number(m[5])+'번';return m[1]+'학년도 '+(m[2]==='S'?'수능':Number(m[2])+'월')+' · '+({common:'공통',hw:'화작',lm:'언매',full:'국어'}[m[3]])+' '+range;}
function title(r){const d=r.data||{};return r.kind==='download'?d.title||'기출 자료':r.kind==='attempt'||r.kind==='draft'?examTitle(d):r.kind==='university'?d.name:r.kind==='university_state'?(r.id==='favorites'?'관심 대학':'비교 대학'):drawingLabel(d)+' 필기';}
function replay(r,q){return '/mixed-cbt?accountReplay='+encodeURIComponent(r.id)+'&kind='+r.kind+(q?'&question='+encodeURIComponent(q):'');}
function downloadJSON(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
function slice(list,name){const total=Math.max(1,Math.ceil(list.length/pageSize));pages[name]=Math.max(1,Math.min(pages[name],total));const start=(pages[name]-1)*pageSize;const host=$('#'+name+'Pages');
 if(host)host.innerHTML=list.length>pageSize?'<button class="button" type="button" data-page="'+name+'" data-step="-1"'+(pages[name]===1?' disabled':'')+'>이전</button><span>'+pages[name]+' / '+total+'</span><button class="button" type="button" data-page="'+name+'" data-step="1"'+(pages[name]===total?' disabled':'')+'>다음</button>':'';
 return list.slice(start,start+pageSize);
}
function menu(open,restoreFocus=false){
 const b=$('#mobileMenu'),side=$('.sidebar');side.classList.toggle('menu-open',!!open);b.setAttribute('aria-expanded',String(!!open));
 b.setAttribute('aria-label',open?'내 정보 메뉴 접기':'내 정보 전체 메뉴');
 $('#openAllMenu').setAttribute('aria-expanded',String(!!open));$('#closeAllMenu').hidden=!open;if(restoreFocus)$('#openAllMenu').focus({preventScroll:true});
}
function choose(next){notice='';if(!labels[next])next='overview';tab=next;document.body.dataset.view=next;if(location.hash!=='#'+next)history.replaceState(null,'','#'+next);$('#breadcrumb').textContent=next==='overview'?'내 공부':labels[next][0];$('#pageTitle').textContent=labels[next][0];$('#pageDescription').textContent=labels[next][1];$('#pageDescription').classList.toggle('hidden',!labels[next][1]);
 for(const [k,v] of Object.entries(panels))$('#view'+v).classList.toggle('hidden',k!==next);
 for(const b of document.querySelectorAll('.side-nav [data-tab],.mobile-dock [data-tab]')){b.classList.toggle('active',b.dataset.tab===next);if(b.dataset.tab===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 const nav=$('.side-nav'),active=nav?.querySelector('[aria-current=page]');if(active&&matchMedia('(max-width:640px)').matches)nav.scrollLeft=Math.max(0,active.offsetLeft-nav.clientWidth/2+active.clientWidth/2);
 const wasOpen=$('.sidebar').classList.contains('menu-open');menu(false);render();if(next==='settings')loadSettings();if(wasOpen)$('#pageTitle').focus({preventScroll:true});
}
function rowDownload(r,compact=false){const d=r.data;return '<article class="record-row'+(compact?' compact':'')+'"><span class="record-icon file-icon" aria-hidden="true">'+esc(d.file_type||'FILE')+'</span><div class="record-main"><h3>'+esc(d.title||'기출 자료')+'</h3><div class="record-meta"><span>'+date(d.at)+'</span>'+(d.subject?'<span>'+esc(d.subject)+'</span>':'')+'</div></div><div class="record-actions"><a class="button" href="'+esc(href(d.url))+'" target="_blank" rel="noopener noreferrer">열기 ↗</a>'+(compact?'':'<button class="icon-button subtle" type="button" data-remove="download" data-id="'+esc(r.id)+'" aria-label="'+esc(d.title||'기출')+' 삭제">×</button>')+'</div></article>';}
function rowCBT(r,compact=false){const d=r.data,isDraft=r.kind==='draft',n=d.details?.length||0,answered=(d.details||[]).filter(q=>q.selected!==null).length;const wrong=(d.details||[]).filter(q=>q.selected!==null&&!q.is_correct).length;return '<article class="record-row'+(compact?' compact':'')+'"><span class="record-icon '+(isDraft?'draft-icon':'done-icon')+'" aria-hidden="true">'+(isDraft?'···':'✓')+'</span><div class="record-main"><h3>'+esc(examTitle(d))+'</h3><div class="record-meta"><span class="badge '+(isDraft?'in-progress':'')+'">'+(isDraft?'진행 중':'풀이 완료')+'</span><span>'+date(d.at)+'</span><span>'+(isDraft?answered+' / '+n+' 응답':'오답 '+wrong+' · 미응답 '+(d.unanswered||0))+'</span></div></div>'+(isDraft?'':'<span class="score">'+(d.percent??Math.round((d.score||0)/Math.max(1,n)*100))+'<small>%</small></span>')+'<div class="record-actions"><a class="button" href="'+replay(r)+'">'+(isDraft?'이어서 풀기':'복습')+'</a>'+(compact?'':'<button class="icon-button subtle" data-remove="'+r.kind+'" data-id="'+esc(r.id)+'" aria-label="CBT 기록 삭제">×</button>')+'</div></article>';}
function universityCard(r,compact=false){const d=r.data;return '<article class="university-card'+(compact?' compact':'')+'"><div class="university-head"><h3>'+esc(d.name)+'</h3><span class="university-status">'+esc(({관심:'마음에 들어요','조사 중':'알아보는 중','지원 검토':'지원하고 싶어요','비교 완료':'비교했어요'})[d.status]||'마음에 들어요')+'</span></div><p class="department">'+esc(d.department||'학과 미정')+'</p><div class="university-meta"><span>'+esc(d.admission_year||'')+'학년도</span><span>'+esc(d.track||'전형 미정')+'</span></div>'+(d.note?'<p class="university-note">'+esc(compact?d.note.slice(0,100):d.note)+'</p>':'')+'<div class="record-meta">기록한 날짜 · '+date(d.checked_at)+'</div><div class="record-actions">'+(d.source_url?'<a class="button" href="'+esc(href(d.source_url))+'" target="_blank" rel="noopener noreferrer">모집요강·출처 ↗</a>':'')+'<button class="text-button" data-edit-university="'+esc(r.id)+'">'+(compact?'메모 보기':'메모 고치기')+'</button>'+(compact?'':'<button class="text-button muted" data-remove="university" data-id="'+esc(r.id)+'">삭제</button>')+'</div></article>';}
function getReviews(attempts){const out=[];for(const r of attempts)for(const q of r.data.details||[]){const note=r.data.reasons?.[q.question_key]||{},hasNote=!!String(note.note||'').trim()||!!note.code&&note.code!=='unknown';if(!q.is_correct||hasNote)out.push({r,q,note,hasNote});}return out.sort((a,b)=>time(b.r)-time(a.r)||a.q.display_no-b.q.display_no);}
function rowReview(x){const {r,q,note}=x;return '<article class="record-row review-row"><span class="record-icon '+(q.selected===null?'draft-icon':q.is_correct?'done-icon':'wrong-icon')+'" aria-hidden="true">'+(q.selected===null?'—':q.is_correct?'✓':'!')+'</span><div class="record-main"><h3>'+esc(source(q))+'</h3><div class="record-meta"><span>'+esc((q.type_group||q.area)+' · '+q.question_type)+'</span><span>'+(q.selected===null?'미응답':(q.is_correct?'맞힌 문항 · ':'')+'내 답 '+q.selected)+' / 정답 '+q.correct_answer+'</span>'+(note.code&&note.code!=='unknown'?'<span class="badge">'+esc(reasonName(note.code))+'</span>':'')+'</div>'+(note.note?'<p class="note-preview">'+esc(note.note)+'</p>':'')+'</div><div class="record-actions"><button class="button" type="button" data-edit-review="'+esc(r.id)+'" data-question="'+esc(q.question_key)+'">'+(x.hasNote?'메모 수정':'메모 추가')+'</button><a class="text-button" href="'+replay(r,q.question_key)+'">문항 보기 →</a></div></article>';}
function rowDrawing(r){const d=r.data,related=find('attempt',d.exam_id)||find('draft',d.exam_id);return '<article class="record-row"><span class="record-icon drawing-icon" aria-hidden="true">↗</span><div class="record-main"><h3>'+esc(drawingLabel(d))+'</h3><div class="record-meta"><span>필기 '+(d.strokes?.length||0)+'개</span><span>'+date(r.updated_at)+'</span><span>'+(related?'풀이 연결됨':'연결된 풀이 없음')+'</span></div></div><div class="record-actions"><button class="button" type="button" data-view-drawing="'+esc(r.id)+'">필기 보기</button><button class="icon-button subtle" type="button" data-remove="annotation" data-id="'+esc(r.id)+'" aria-label="필기 삭제">×</button></div></article>';}
function collections(){const records=A.list('university_state');$('#universityCollections').innerHTML=[['favorites','관심 대학'],['compare','비교 대학']].map(([id,label])=>{const r=records.find(r=>r.id===id),items=r?.data.items||[];return '<div><h3>'+label+' <span class="muted">'+items.length+'</span></h3><div class="collection-chips">'+items.map(x=>'<span class="collection-chip"><a href="https://universitypredict.com/?university='+esc(x.code)+'#schools">'+esc(x.name||x.code)+' ↗</a><button type="button" data-remove-collection="'+id+'" data-code="'+esc(x.code)+'" aria-label="'+esc(x.name||x.code)+' 목록에서 빼기">×</button></span>').join('')+'</div>'+(!items.length?'<p class="hint">마음에 드는 대학을 담아보세요.</p>':'')+'</div>';}).join('');}

// A useful next action, not a fabricated recommendation. Only saved records are used.
function renderFocus(attempts,drafts){
 const sorted=attempts.slice().sort((a,b)=>Number(b.data.at||0)-Number(a.data.at||0));
 const latest=new Map();for(const r of sorted)for(const q of r.data.details||[])if(q.question_key&&!latest.has(q.question_key))latest.set(q.question_key,{r,q});
 const wrong=[...latest.values()].filter(x=>x.q.selected!==null&&!x.q.is_correct),unanswered=[...latest.values()].filter(x=>x.q.selected===null);
 const draft=drafts.slice().sort((a,b)=>time(b)-time(a))[0];
 const book='<span class="focus-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="6" y="3" width="22" height="26" rx="5" fill="#70B0FF"/><path d="M10 5v23" stroke="#2B79DE" stroke-width="2"/><rect x="14" y="9" width="9" height="8" rx="2" fill="white"/><path d="M15 22h7" stroke="white" stroke-width="2" stroke-linecap="round"/></svg></span>';
 const pencil='<span class="focus-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="m8 20 13-15a4 4 0 0 1 6 5L14 25l-8 2 2-7Z" fill="#F4B35E"/><path d="m8 20 6 5-8 2 2-7Z" fill="#F9D9A4"/><path d="m21 5 6 5" stroke="white" stroke-width="3"/></svg></span>';
 const n=draft?.data.details?.length||0,done=(draft?.data.details||[]).filter(q=>q.selected!==null).length;
 html('#focusStudy','<div class="focus-top"><span class="focus-tag">'+(draft?'이어서 풀기':'가볍게 시작하기')+'</span>'+book+'</div><h3>'+(draft?'풀던 문제, 이어서 할까요?':'오늘의 한 세트, 시작해요')+'</h3><p>'+(draft?esc(examTitle(draft.data))+'<br>'+done+' / '+n+'문항 답했어요.': '부담 없이 한 지문부터 풀어봐요.<br>답안과 필기는 이어서 볼 수 있어요.')+'</p><a class="focus-action" href="'+(draft?replay(draft):'/mixed-cbt')+'">'+(draft?'풀던 곳으로 가기':'문제 고르기')+' <span aria-hidden="true">→</span></a>');
 const first=wrong[0]||unanswered[0];
 html('#focusReview','<div class="focus-top"><span class="focus-tag">다시 보면 내 것이 돼요</span>'+pencil+'</div><h3>'+(wrong.length?'다시 볼 오답 '+wrong.length+'문제':unanswered.length?'아직 안 푼 '+unanswered.length+'문제':'한 번 더 보면 든든해요')+'</h3><p>'+(first?'최근 답변 기준'+(unanswered.length?' · 미응답 '+unanswered.length+'문제':''):'남겨 둔 메모와 필기를 꺼내 봐요.')+'</p>'+(first?'<a class="focus-action" href="'+replay(first.r,first.q.question_key)+'">한 문제 복습하기 <span aria-hidden="true">→</span></a>':'<button class="focus-action" type="button" data-tab="review" data-subfilter="notes">메모 보기 <span aria-hidden="true">→</span></button>'));
 const recent=sorted.filter(r=>Number(r.data.at)>Date.now()-7*86400000&&Number(r.data.at)<=Date.now()+300000),keys=new Set();
 for(const r of recent)for(const q of r.data.details||[])if(q.selected!==null&&q.question_key)keys.add(q.question_key);
 html('#weekSummary','<div><strong>'+recent.length+'</strong><span>번의 풀이</span></div><div><strong>'+keys.size+'</strong><span>문제에 답했어요</span></div>');
}
function render(){if(!initialized)return;const i=A.info(),signed=!!i.user,downloads=A.list('download'),attempts=A.list('attempt'),drafts=A.list('draft'),universities=A.list('university'),drawings=A.list('annotation'),coll=A.list('university_state'),reviews=getReviews(attempts),notes=reviews.filter(x=>x.hasNote);
 $('#guestBanner').classList.toggle('hidden',signed||i.locked);$('#loginLink').classList.toggle('hidden',signed);$('#loginLink').href='/auth?returnTo='+encodeURIComponent('/my#'+tab);$('#guestBanner a').href=$('#loginLink').href;$('#userMenu').classList.toggle('hidden',!signed);$('#userMenu').textContent='내 정보';$('#userMenu').title=i.user?.name||'내 정보';
 $('#syncState').dataset.state=i.status;$('#syncState span').textContent=states[i.status]||'확인 중';showNotice();
 const all=[...downloads,...attempts,...drafts,...drawings,...universities,...coll];
 for(const [k,n] of Object.entries({downloads:downloads.length,cbt:attempts.length+drafts.length,review:reviews.length+drawings.length,universities:universities.length,data:all.length}))$('#navCount'+k[0].toUpperCase()+k.slice(1)).textContent=n||'';
 $('#overviewName').textContent=signed?(i.user.name+'님, 오늘도 반가워요'):'오늘은 어디부터 시작할까요?';$('#overviewEmail').textContent=signed?i.user.email:'로그인 전 · 이 기기';$('#overviewAvatar').textContent=(i.user?.name||'M').slice(0,1);
 for(const [id,n,unit] of [['downloadCount',downloads.length,'개'],['attemptCount',attempts.length,'회'],['reviewCount',notes.length,'개'],['universityCount',universities.length,'개']])$('#'+id).innerHTML=n+'<small>'+unit+'</small>';
 const g=A.guest(),gn=g.attempts.length+g.downloads.length+g.universities.length+(g.current?.exam?1:0);$('#importBanner').classList.toggle('hidden',!signed||!gn);$('#importCounts').textContent='기출 '+g.downloads.length+' · CBT '+g.attempts.length+' · 관심 대학 '+g.universities.length+(g.current?.exam?' · 진행 중 1':'');
 for(const [id,n] of [['importAttempts',g.attempts.length],['importDownloads',g.downloads.length],['importUniversities',g.universities.length],['importCurrent',g.current?.exam?1:0]])$('#'+id).textContent=n+'개';
 if(tab==='overview'){
  renderFocus(attempts,drafts);
  const recent=[...drafts,...attempts].sort((a,b)=>time(b)-time(a)).slice(0,3);html('#recentLearning',recent.length?recent.map(r=>rowCBT(r,true)).join(''):empty('첫 문제를 풀면 여기에 모여요.','/mixed-cbt','문제 풀기'));
  html('#recentDownloads',downloads.length?downloads.slice(0,3).map(r=>rowDownload(r,true)).join(''):empty('기출을 찾아보고 여기서 다시 열어요.','/','기출 찾기'));
  html('#recentUniversities',universities.length?universities.slice(0,2).map(r=>universityCard(r,true)).join(''):empty('마음에 둔 대학을 적어볼까요?')+'<button class="text-button empty-action" id="emptyNewUniversity">입시 메모 쓰기</button>');
  $('#dataSummary').innerHTML=[['진행 중 CBT',drafts.length,'cbt','draft'],['오답 기록',reviews.filter(x=>x.q.selected!==null&&!x.q.is_correct).length,'review','wrong'],['복습 메모',notes.length,'review','notes'],['저장한 필기',drawings.length,'review','drawings'],['관심 · 비교 대학',coll.reduce((n,r)=>n+(r.data.items?.length||0),0),'universities','']].map(([name,n,t,f])=>'<button type="button" class="summary-row" data-tab="'+t+'"'+(f?' data-subfilter="'+f+'"':'')+'><span>'+name+'</span><b>'+n+' <span aria-hidden="true">›</span></b></button>').join('');
 }
 if(tab==='downloads'){const q=normalize($('#downloadSearch').value),xs=downloads.filter(r=>normalize(JSON.stringify(r.data)).includes(q));$('#downloadTotal').textContent='전체 '+xs.length+'개';html('#downloadList',xs.length?slice(xs,'downloads').map(r=>rowDownload(r)).join(''):empty(q?'다른 검색어로 다시 찾아볼까요?':'기출을 찾아보고 여기서 다시 열어요.'));if(!xs.length)slice([],'downloads');}
 if(tab==='cbt'){const q=normalize($('#cbtSearch').value),pool=cbtFilter==='draft'?drafts:cbtFilter==='completed'?attempts:cbtFilter==='wrong'?attempts.filter(r=>(r.data.details||[]).some(q=>q.selected!==null&&!q.is_correct)):[...drafts,...attempts];const xs=pool.filter(r=>normalize(title(r)+JSON.stringify(r.data)).includes(q)).sort((a,b)=>time(b)-time(a));$('#cbtTotal').textContent=xs.length+'개';html('#cbtList',xs.length?slice(xs,'cbt').map(r=>rowCBT(r)).join(''):empty('아직 여기에 모인 문제가 없어요.','/mixed-cbt','문제 풀기'));if(!xs.length)slice([],'cbt');}
 if(tab==='universities'){collections();const q=normalize($('#universitySearch').value),xs=universities.filter(r=>normalize(JSON.stringify(r.data)).includes(q));$('#universityTotal').textContent='입시 메모 '+xs.length+'개';html('#universityList',xs.length?slice(xs,'universities').map(r=>universityCard(r)).join(''):empty(q?'다른 검색어로 다시 찾아볼까요?':'마음에 둔 대학을 적어볼까요?'));if(!xs.length)slice([],'universities');}
 if(tab==='review'){
  const q=normalize($('#reviewSearch').value),reason=$('#reviewReason').value;$('#reviewReason').disabled=reviewFilter==='drawings';let xs;
  if(reviewFilter==='drawings'){xs=drawings.filter(r=>normalize(title(r)).includes(q));html('#reviewList',xs.length?slice(xs,'review').map(rowDrawing).join(''):empty('문제를 풀며 남긴 필기가 여기에 모여요.'));}
  else {xs=reviews.filter(x=>reviewFilter==='notes'?x.hasNote:reviewFilter==='unanswered'?x.q.selected===null:x.q.selected!==null&&!x.q.is_correct).filter(x=>(!reason||(x.note.code||'unknown')===reason)&&normalize(source(x.q)+JSON.stringify(x.q)+JSON.stringify(x.note)).includes(q));html('#reviewList',xs.length?slice(xs,'review').map(rowReview).join(''):empty('지금은 다시 볼 기록이 없어요.'));}
  $('#reviewTotal').textContent=xs.length+'개';if(!xs.length)slice([],'review');
 }
 if(tab==='data')renderData(all);
 for(const b of document.querySelectorAll('#viewSettings button'))b.disabled=!signed;$('#exportRecords').disabled=false;$('#lastSync').textContent=fullDate(i.lastSync);$('#pendingCount').textContent=i.pending+'개';
 if(!profileDirty){$('#profileName').value=i.user?.name||'';$('#profileEmail').value=i.user?.email||'';}
 if(!signed){$('#sessionList').innerHTML='<p class="hint">로그인하면 확인할 수 있어요.</p>';$('#storageUsage').textContent='로그인 전';}
 const conflicts=A.conflicts();$('#conflictPanel').classList.toggle('hidden',!conflicts.length);
 if(tab==='settings')html('#conflictList',conflicts.map(conflictCard).join(''));
}
function renderData(all){const q=normalize($('#dataSearch').value),kind=$('#dataKind').value,days=Number($('#dataPeriod').value)||0,sort=$('#dataSort').value,valid=new Set(all.map(key));for(const k of selection)if(!valid.has(k))selection.delete(k);
 const xs=all.filter(r=>(!kind||r.kind===kind)&&(!days||time(r)>=Date.now()-days*86400000)&&normalize(title(r)+JSON.stringify(r.data)).includes(q)).sort((a,b)=>sort==='name'?title(a).localeCompare(title(b),'ko'):sort==='old'?time(a)-time(b):time(b)-time(a));
 pageData=slice(xs,'data');const ex=A.exportData(),pending=new Set(ex.pending.map(key)),conflicts=new Set(ex.conflicts.map(key));$('#dataTotal').textContent=xs.length+'개'+(selection.size?' · '+selection.size+'개 선택':'');
 html('#dataList',pageData.length?'<div class="data-table-head"><span></span><span>기록</span><span>수정일</span><span>상태</span><span>관리</span></div>'+pageData.map(r=>'<article class="data-row"><label class="record-select"><input type="checkbox" data-select="'+esc(key(r))+'"'+(selection.has(key(r))?' checked':'')+' aria-label="'+esc(title(r))+' 선택"></label><div class="record-main"><span class="data-kind">'+esc(kindNames[r.kind])+'</span><h3>'+esc(title(r))+'</h3>'+(r.kind==='attempt'?'<small>복습 메모 '+Object.values(r.data.reasons||{}).filter(x=>String(x.note||'').trim()||x.code&&x.code!=='unknown').length+'개 포함</small>':'')+'</div><span class="data-date">'+date(time(r))+'</span><span class="data-status '+(conflicts.has(key(r))?'conflict':pending.has(key(r))?'pending':'')+'">'+(conflicts.has(key(r))?'충돌 확인':pending.has(key(r))?'저장 대기':A.info().user?'저장됨':'기기 기록')+'</span><div class="record-actions"><button class="text-button" data-open-record="'+esc(key(r))+'">보기</button><button class="text-button muted" data-remove="'+r.kind+'" data-id="'+esc(r.id)+'">삭제</button></div></article>').join(''):empty('조건에 맞는 기록이 없어요.'));
 $('#selectPage').checked=!!pageData.length&&pageData.every(r=>selection.has(key(r)));$('#selectPage').indeterminate=pageData.some(r=>selection.has(key(r)))&&!$('#selectPage').checked;$('#selectPage').disabled=!pageData.length;$('#clearSelection').classList.toggle('hidden',!selection.size);$('#exportSelected').disabled=!selection.size;$('#deleteSelected').disabled=!selection.size||deleting;
}
function conflictContent(kind,record){
 if(!record||record.deleted)return '<p class="conflict-deleted">삭제된 기록</p>';
 const d=record.data||{},lines=[];
 if(kind==='university')lines.push(d.name,d.department,d.track,d.note);
 else if(kind==='download')lines.push(d.title,d.url);
 else if(kind==='annotation')lines.push(drawingLabel(d),'필기 '+(d.strokes?.length||0)+'개');
 else if(kind==='university_state')lines.push(...(d.items||[]).map(x=>x.name||x.code));
 else{lines.push(examTitle(d));for(const [k,r] of Object.entries(d.reasons||{})){if(r.note||r.code!=='unknown')lines.push(k.split('-').pop()+'번 · '+reasonName(r.code)+(r.note?' · '+r.note:''));}}
 return '<div class="conflict-preview">'+lines.filter(Boolean).slice(0,5).map(x=>'<p>'+esc(String(x).slice(0,400))+'</p>').join('')+'</div><details class="conflict-raw"><summary>전체 내용 확인</summary><pre>'+esc(JSON.stringify(d,null,2))+'</pre></details>';
}
function conflictCard(x){return '<article class="conflict-card"><h3>'+esc(x.local?.data?.name||x.local?.data?.title||kindNames[x.kind])+'</h3><div class="conflict-cols"><div><b>이 기기에서 수정</b>'+conflictContent(x.kind,x.local)+'</div><div><b>계정에 저장됨</b>'+conflictContent(x.kind,x.remote)+'</div></div><div class="toolbar-actions"><button class="button" data-resolve="local" data-kind="'+esc(x.kind)+'" data-id="'+esc(x.id)+'">이 기기 내용 사용</button><button class="button" data-resolve="remote" data-kind="'+esc(x.kind)+'" data-id="'+esc(x.id)+'">계정 내용 사용</button></div></article>';}
async function loadSettings(){const id=A.info().user?.id;if(!id)return;try{const [sum,sessions]=await Promise.all([A.api('summary'),A.api('sessions')]);if(A.info().user?.id!==id)return;$('#storageUsage').textContent=(sum.bytes/1048576).toFixed(2)+' / '+Math.round(sum.byte_limit/1048576)+' MB';$('#sessionList').innerHTML=sessions.sessions.map(s=>'<div class="session-row"><b>'+esc(s.device)+'</b>'+(s.current?'<span class="badge">현재 기기</span>':'')+'<small>'+fullDate(s.created_at)+' 로그인</small></div>').join('');}catch(e){say(e.message);}}
function openUniversity(id){if(researchEdit)A.endEdit(researchEdit);const r=find('university',id),d=r?.data||{},editId=r?.id||crypto.randomUUID();researchEdit=A.beginEdit('university',editId);$('#universityId').value=editId;$('#universityName').value=d.name||'';$('#universityDepartment').value=d.department||'';$('#admissionYear').value=d.admission_year||2027;$('#researchStatus').value=d.status||'관심';$('#admissionTrack').value=d.track||'';$('#researchSource').value=d.source_url||'';$('#researchNote').value=d.note||'';$('#universityFormMessage').textContent='';$('#universityDialogTitle').textContent=r?'입시 메모 고치기':'입시 메모 쓰기';$('#universityDialog').showModal();$('#universityName').focus();}
function openReview(id,k){const r=find('attempt',id),q=r?.data.details.find(q=>q.question_key===k);if(!r||!q)return;if(reviewEdit)A.endEdit(reviewEdit.snapshot);reviewEdit={snapshot:A.beginEdit('attempt',id),key:k,data:structuredClone(r.data)};const n=r.data.reasons?.[k]||{};$('#reviewSource').textContent=source(q)+' · '+q.question_type;$('#editReason').innerHTML=options(n.code||'unknown');$('#editNote').value=n.note||'';$('#reviewFormMessage').textContent='';$('#reviewDialog').showModal();$('#editNote').focus();}
async function saveReview(clear=false){if(!reviewEdit)return;try{const d=structuredClone(reviewEdit.data);d.reasons={...(d.reasons||{})};if(clear)delete d.reasons[reviewEdit.key];else d.reasons[reviewEdit.key]={code:$('#editReason').value,note:$('#editNote').value.slice(0,500),source:'self_report'};A.saveEdit(reviewEdit.snapshot,d);$('#reviewDialog').close();await A.sync();say(A.conflicts().length?'다른 기기에서도 바꾼 기록이 있어요. 설정에서 사용할 내용을 골라 주세요.':A.info().pending?'이 기기에 저장했어요. 연결되면 계정에도 보관해요.':'메모를 저장했어요.');render();}catch(e){$('#reviewFormMessage').textContent=e.message;}}
function paintDrawingPreview(){
 if(!drawing)return;const r=drawing,select=$('#drawingSurfaceSelect'),value=select.value;
 const strokes=(r.data.strokes||[]).filter(s=>value==='passage'?s.surface!=='question':s.surface==='question'&&Number(s.question_no)===Number(value.slice(1)));
 const c=$('#drawingCanvas'),ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);
 for(const s of strokes){ctx.save();ctx.beginPath();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=/^#[\da-f]{6}$/i.test(s.color)?s.color:'#202020';ctx.globalAlpha=s.tool==='highlight'?.28:1;ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.lineWidth=s.tool==='eraser'?Math.max(18,(s.size||3)*6):s.tool==='highlight'?Math.max(12,(s.size||3)*4):Math.max(1,Math.min(30,s.size||3));for(let i=0;i<s.points.length;i++){const p=s.points[i],x=p.x*c.width,y=p.y*c.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}if(s.points.length===1)ctx.lineTo(s.points[0].x*c.width+.05,s.points[0].y*c.height+.05);ctx.stroke();ctx.restore()}
 $('#drawingSource').textContent=drawingLabel(r.data)+' · '+(value==='passage'?'지문':value.slice(1)+'번 문제')+' 필기 '+strokes.length+'개';
 const related=find('attempt',r.data.exam_id)||find('draft',r.data.exam_id);$('#drawingReplay').classList.toggle('hidden',!related);
 if(related)$('#drawingReplay').href=replay(related,related.data.details?.find(q=>q.unit_id===r.data.unit_id&&(value==='passage'||Number(q.original_no)===Number(value.slice(1))))?.question_key);
}
function openDrawing(id){
 const r=find('annotation',id);if(!r)return;drawing=r;
 let select=$('#drawingSurfaceSelect');if(!select){select=document.createElement('select');select.id='drawingSurfaceSelect';select.setAttribute('aria-label','필기 영역 선택');select.style.cssText='width:100%;padding:10px 12px;margin:10px 0;border:1px solid #dce4ef;border-radius:10px;background:#fff;color:#273446';$('#drawingCanvas').before(select);select.onchange=paintDrawingPreview;}
 const surfaces=[];if((r.data.strokes||[]).some(s=>s.surface!=='question'))surfaces.push(['passage','지문 필기']);
 for(const no of [...new Set((r.data.strokes||[]).filter(s=>s.surface==='question').map(s=>s.question_no))].sort((a,b)=>a-b))surfaces.push(['q'+no,'원문 '+no+'번 문제 필기']);
 if(!surfaces.length)surfaces.push(['passage','지문 필기']);select.replaceChildren(...surfaces.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o}));
 paintDrawingPreview();$('#drawingDialog').showModal();
}

function requestDelete(records){if(deleting||!records.length)return;if(records.length>100){say('한 번에 100개까지 삭제할 수 있습니다.');return;}if(deleteIntent)deleteIntent.items.forEach(x=>A.endEdit(x.snapshot));deleteIntent={owner:A.info().user?.id||null,items:records.map(r=>({r:structuredClone(r),snapshot:A.beginEdit(r.kind,r.id)}))};$('#deleteDescription').textContent=records.length+'개 기록을 보관함에서 삭제합니다.';$('#deleteItems').innerHTML=records.slice(0,5).map(r=>'<div><span>'+esc(kindNames[r.kind])+'</span><b>'+esc(title(r))+'</b></div>').join('')+(records.length>5?'<small>외 '+(records.length-5)+'개</small>':'');$('#deleteMessage').textContent='';$('#confirmDelete').disabled=false;$('#deleteDialog').showModal();}
async function confirmDelete(e){e.preventDefault();if(deleting||!deleteIntent)return;deleting=true;$('#confirmDelete').disabled=true;try{if(A.info().locked||(A.info().user?.id||null)!==deleteIntent.owner)throw Error('계정이 바뀌었습니다. 기록을 다시 선택해 주세요.');
 for(const {r,snapshot} of deleteIntent.items){if(!deleteIntent.owner&&JSON.stringify(find(r.kind,r.id)?.data)!==JSON.stringify(r.data))throw Error('기록이 수정되었습니다. 다시 선택해 주세요.');A.save(r.kind,r.id,{},true,snapshot.base_version);selection.delete(key(r));}
 await A.sync();const i=A.info();say(i.conflicts?'변경된 기록이 있어 일부 삭제를 보류했습니다. 계정 설정에서 확인해 주세요.':i.pending?'삭제 요청을 보관했어요. 연결되면 계정에 반영해요.':'선택한 기록을 삭제했어요.');$('#deleteDialog').close();render();
 }catch(e){$('#deleteMessage').textContent=e.message;}finally{deleting=false;$('#confirmDelete').disabled=false;}}
function allRecords(){return KINDS.flatMap(k=>A.list(k));}
function manage(kind){$('#dataKind').value=kind||'';$('#dataSearch').value='';selection.clear();pages.data=1;choose('data');}
function openRecord(k){const [kind,id]=k.split('|'),r=find(kind,id);if(!r)return;if(kind==='download')window.open(href(r.data.url),'_blank','noopener,noreferrer');else if(kind==='attempt'||kind==='draft')location.assign(replay(r));else if(kind==='university')openUniversity(id);else if(kind==='annotation')openDrawing(id);else choose('universities');}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-tab],[data-close],[data-remove],[data-edit-university],[data-resolve],[data-remove-collection],[data-edit-review],[data-view-drawing],[data-open-record],[data-manage],[data-page],#emptyNewUniversity');if(!b||b.disabled)return;try{
 if(b.dataset.tab){if(b.dataset.subfilter){if(b.dataset.tab==='review')setReviewFilter(b.dataset.subfilter,false);if(b.dataset.tab==='cbt')setCBTFilter(b.dataset.subfilter,false);}choose(b.dataset.tab);return;}
 if(b.dataset.close){$('#'+b.dataset.close).close();return;}
 if(b.dataset.page){pages[b.dataset.page]+=Number(b.dataset.step);render();return;}
 if(b.dataset.manage!==undefined){manage(b.dataset.manage);return;}
 if(b.dataset.openRecord){openRecord(b.dataset.openRecord);return;}
 if(b.dataset.editReview){openReview(b.dataset.editReview,b.dataset.question);return;}
 if(b.dataset.viewDrawing){openDrawing(b.dataset.viewDrawing);return;}
 if(b.dataset.remove){const r=find(b.dataset.remove,b.dataset.id);if(r)requestDelete([r]);return;}
 if(b.dataset.removeCollection){const r=find('university_state',b.dataset.removeCollection);if(r){A.save('university_state',r.id,{items:r.data.items.filter(x=>x.code!==b.dataset.code)});await A.sync();render();}return;}
 if(b.dataset.resolve){A.resolve(b.dataset.kind,b.dataset.id,b.dataset.resolve);await A.sync();render();return;}
 if(b.dataset.editUniversity){openUniversity(b.dataset.editUniversity);return;}if(b.id==='emptyNewUniversity')openUniversity();
 }catch(e){say(e.message);}});
function setCBTFilter(f,draw=true){cbtFilter=f;pages.cbt=1;document.querySelectorAll('[data-cbt-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.cbtFilter===f);b.setAttribute('aria-pressed',String(b.dataset.cbtFilter===f));});if(draw)render();}
function setReviewFilter(f,draw=true){reviewFilter=f;pages.review=1;document.querySelectorAll('[data-review-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.reviewFilter===f);b.setAttribute('aria-pressed',String(b.dataset.reviewFilter===f));});if(draw)render();}
for(const b of document.querySelectorAll('[data-cbt-filter]'))b.onclick=()=>setCBTFilter(b.dataset.cbtFilter);
for(const b of document.querySelectorAll('[data-review-filter]'))b.onclick=()=>setReviewFilter(b.dataset.reviewFilter);
for(const [id,p] of [['downloadSearch','downloads'],['cbtSearch','cbt'],['reviewSearch','review'],['universitySearch','universities'],['dataSearch','data']])$('#'+id).oninput=()=>{pages[p]=1;if(p==='data')selection.clear();render();};
$('#reviewReason').innerHTML='<option value="">모든 오답 이유</option>'+options('');$('#reviewReason').onchange=()=>{pages.review=1;render();};
for(const id of ['dataKind','dataSort','dataPeriod'])$('#'+id).onchange=()=>{pages.data=1;selection.clear();render();};
$('#dataList').onchange=e=>{if(!e.target.dataset.select)return;const k=e.target.dataset.select;e.target.checked?selection.add(k):selection.delete(k);render();};
$('#selectPage').onchange=e=>{for(const r of pageData)e.target.checked?selection.add(key(r)):selection.delete(key(r));render();};
$('#clearSelection').onclick=()=>{selection.clear();render();};
$('#exportSelected').onclick=()=>downloadJSON({version:1,exported_at:new Date().toISOString(),records:allRecords().filter(r=>selection.has(key(r)))},'mysuneung-selected-'+new Date().toISOString().slice(0,10)+'.json');
$('#deleteSelected').onclick=()=>requestDelete(allRecords().filter(r=>selection.has(key(r))));$('#deleteForm').onsubmit=confirmDelete;
$('#deleteDialog').addEventListener('close',()=>{deleteIntent?.items.forEach(x=>A.endEdit(x.snapshot));deleteIntent=null;});
$('#reviewDialog').addEventListener('close',()=>{if(reviewEdit)A.endEdit(reviewEdit.snapshot);reviewEdit=null;});$('#reviewForm').onsubmit=e=>{e.preventDefault();saveReview();};$('#clearReview').onclick=()=>{if(confirm('이 문항의 복습 메모와 오답 이유만 지울까요? 풀이와 점수는 유지됩니다.'))saveReview(true);};
$('#drawingDialog').addEventListener('close',()=>{drawing=null;const c=$('#drawingCanvas');c.getContext('2d').clearRect(0,0,c.width,c.height);});$('#exportDrawing').onclick=()=>{if(drawing)downloadJSON({version:1,record:drawing},'mysuneung-drawing.json');};
$('#universityDialog').addEventListener('close',()=>{if(researchEdit)A.endEdit(researchEdit);researchEdit=null;});$('#newUniversity').onclick=()=>openUniversity();$('#userMenu').onclick=()=>choose('overview');
$('#universityForm').onsubmit=async e=>{e.preventDefault();try{const id=$('#universityId').value,old=find('university',id)?.data,sourceURL=$('#researchSource').value.trim();if(sourceURL&&href(sourceURL)==='#')throw Error('공개된 HTTPS 주소를 입력해 주세요.');if(!researchEdit||researchEdit.id!==id)throw Error('노트를 다시 열어 주세요.');A.saveEdit(researchEdit,{university_code:old?.university_code||null,name:$('#universityName').value.trim(),department:$('#universityDepartment').value.trim(),admission_year:Number($('#admissionYear').value),status:$('#researchStatus').value,track:$('#admissionTrack').value.trim(),source_url:sourceURL,note:$('#researchNote').value,checked_at:Date.now(),created_at:old?.created_at||Date.now(),tags:old?.tags||[]});$('#universityDialog').close();choose('universities');await A.sync();say(A.conflicts().length?'다른 기기에서도 바꾼 기록이 있어요. 설정에서 사용할 내용을 골라 주세요.':'입시 메모를 저장했어요.');}catch(e){$('#universityFormMessage').textContent=e.message;}};
$('#profileName').oninput=()=>profileDirty=true;$('#profileForm').onsubmit=async e=>{e.preventDefault();try{await A.api('profile',{name:$('#profileName').value},'PATCH');profileDirty=false;await A.refresh();say('이름을 바꿨어요.');}catch(e){say(e.message);}};
$('#syncNow').onclick=async()=>{await A.sync();await loadSettings();};$('#exportRecords').onclick=()=>downloadJSON(A.exportData(),'mysuneung-account-'+new Date().toISOString().slice(0,10)+'.json');
$('#logout').onclick=async()=>{try{await A.logout(false,true);location.assign('/auth');}catch(e){say(e.message);}};$('#logoutAll').onclick=async()=>{if(!confirm('모든 기기에서 로그아웃할까요?'))return;try{await A.logout(true,true);location.assign('/auth');}catch(e){say(e.message);}};
$('#openImport').onclick=()=>{$('#importForm').reset();$('#importMessage').textContent='';$('#importDialog').showModal();};
$('#importForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;if(!f.elements.owner.checked)return;const selected=Object.fromEntries(['attempts','current','downloads','universities'].map(k=>[k,f.elements[k].checked]));if(!Object.values(selected).some(Boolean)){$('#importMessage').textContent='가져올 기록을 선택해 주세요.';return;}try{$('#importMessage').textContent='가져오는 중…';const s=await A.importGuest(selected);if(s.conflicts||s.pending)throw Error('저장 대기 또는 충돌 기록이 있습니다. 계정 설정에서 확인해 주세요.');$('#importDialog').close();say('기록을 가져왔어요. 원래 이 기기에 있던 기록도 그대로예요.');render();}catch(e){$('#importMessage').textContent=e.message;}};
window.addEventListener('msn-account-change',()=>{clearTimeout(timer);timer=setTimeout(render,120);});
function wipePrivateDOM(){
 profileDirty=false;notice='';selection.clear();pageData=[];menu(false);
 for(const d of document.querySelectorAll('dialog[open]'))d.close();
 for(const id of ['focusStudy','focusReview','weekSummary','recentLearning','recentDownloads','recentUniversities','dataSummary','downloadList','cbtList','reviewList','universityList','universityCollections','dataList','sessionList','conflictList','deleteItems']){
  const e=$('#'+id);if(e){e.replaceChildren();rendered.delete(e);}
 }
 for(const f of document.querySelectorAll('dialog form,#profileForm'))f.reset();
 for(const id of ['profileName','profileEmail','universityName','universityDepartment','researchNote','researchSource','editNote'])if($('#'+id))$('#'+id).value='';
 for(const id of ['reviewSource','drawingSource','deleteDescription','universityFormMessage','reviewFormMessage'])if($('#'+id))$('#'+id).textContent='';
 for(const id of ['drawingReplay'])$('#'+id)?.removeAttribute('href');
 for(const id of ['downloadSearch','cbtSearch','reviewSearch','universitySearch','dataSearch'])$('#'+id).value='';
 for(const k in pages)pages[k]=1;deleting=false;reviewEdit=null;researchEdit=null;drawing=null;deleteIntent=null;
 render();
}
window.addEventListener('msn-account-locked',wipePrivateDOM);
$('#openAllMenu').onclick=()=>menu(!$('.sidebar').classList.contains('menu-open'));$('#closeAllMenu').onclick=()=>menu(false,true);
$('#mobileMenu').onclick=()=>menu($('#mobileMenu').getAttribute('aria-expanded')!=='true');
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.sidebar').classList.contains('menu-open')){e.preventDefault();menu(false,true);}});
 document.addEventListener('click',e=>{if(!e.target.closest('.sidebar,.mobile-dock')&&$('.sidebar').classList.contains('menu-open'))menu(false);});
 matchMedia('(max-width:640px)').addEventListener('change',()=>menu(false));
window.addEventListener('hashchange',()=>{const t=location.hash.slice(1);if(labels[t]&&t!==tab)choose(t);});
A.ready.then(()=>{initialized=true;choose(location.hash.slice(1));});
})();
