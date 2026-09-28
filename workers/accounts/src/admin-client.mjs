const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=ms=>ms?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(Number(ms)||ms)):'—';
const fmtDay=s=>{try{return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric'}).format(new Date(s+'T12:00:00+09:00'));}catch{return s;}};
const account=window.MSNAccount;
const state={view:'overview',accounts:{offset:0,limit:30,total:0,rows:[]},learning:null,inquiries:[],chat:[],reports:[],communityReady:false};
const viewMeta={
 overview:['운영 개요','가입·로그인·학습·커뮤니티 상태를 한눈에 확인합니다.'],
 accounts:['회원','가입 계정, 실제 로그인 이력과 이용 상태를 관리합니다.'],
 learning:['학습 분석','회원별 CBT 기록에서 근거가 충분한 취약 신호를 봅니다.'],
 inquiries:['문의','기존 문의를 확인하고 답변하거나 정리합니다.'],
 reports:['오류 신고','사이트 오류 신고의 처리 상태와 메모를 관리합니다.'],
 chat:['수험 채팅','기존 수험채팅방 메시지를 확인하고 관리합니다.'],
 audit:['운영 로그','관리자가 변경한 주요 조치를 확인합니다.']
};
let debounceTimer;

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2200);}
function empty(msg){return '<div class="empty">'+esc(msg)+'</div>';}
function qs(o){const p=new URLSearchParams();for(const [k,v] of Object.entries(o))if(v!==''&&v!==undefined&&v!==null)p.set(k,v);return p.toString();}
async function api(path,body){return account.api('admin/'+path,body);}
async function communityApi(path,extra){return extra===undefined?api(path):api(path,extra);}
function communityState(ok,msg){
 state.communityReady=ok;const el=$('#communityState');el.classList.toggle('ok',ok);el.classList.toggle('bad',!ok);el.querySelector('span').textContent=msg;
 $('#communityReconnect').classList.toggle('hidden',ok);
}
function gate(title,desc,action=''){
 $('#adminGate').classList.remove('hidden');$('#adminContent').classList.add('hidden');
 $('#adminGate .spinner').classList.add('hidden');$('#adminGate h2').textContent=title;$('#adminGate p').textContent=desc;
 $('#gateAction').innerHTML=action;
}
function showContent(){ $('#adminGate').classList.add('hidden');$('#adminContent').classList.remove('hidden');}
function go(view){
 if(!viewMeta[view])return;state.view=view;
 $$('.admin-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $$('.view').forEach(p=>p.classList.toggle('active',p.dataset.panel===view));
 $('#viewTitle').textContent=viewMeta[view][0];$('#viewDesc').textContent=viewMeta[view][1];
 loadView(view).catch(e=>toast(e.message));
}
function weakRows(rows,limit=8){
 if(!rows?.length)return empty('아직 충분한 학습 근거가 없습니다.');
 return rows.slice(0,limit).map(r=>`<div class="weak-row ${r.accuracy<60?'low':''}"><div><div class="name">${esc(r.label)}</div><div class="meta">첫 응답 ${r.total}문항 · 오답 ${r.wrong}</div></div><div class="bar"><i style="width:${Math.max(0,Math.min(100,r.accuracy))}%"></i></div><strong>${r.accuracy}%</strong></div>`).join('');
}
async function loadSummary(){
 const [s,a]=await Promise.all([api('summary'),api('activity?days=14')]);
 $('#metricAccounts').textContent=s.accounts;$('#metricDisabled').textContent=s.disabled?`이용 정지 ${s.disabled}명`:'모두 이용 중';
 $('#metricLoginsToday').textContent=s.logins_today;$('#metricLoginUsersToday').textContent=`${s.login_users_today}명 · 실제 로그인`;
 $('#metricLoginUsers7').textContent=s.login_users_7d;$('#metricSessions').textContent=s.active_sessions;$('#metricVisitorsToday').textContent=s.visitors_today;
 $('#metricAttempts7').textContent=s.attempts_7d;$('#metricAttempts').textContent=`전체 ${s.attempts}회`;
 $('#trackingHint').textContent=s.login_tracking_since?`로그인 이력 ${fmt(s.login_tracking_since)}부터 · 도입 당시 활성 세션 ${s.login_backfilled_sessions}건 이관`:'로그인 이력 수집 시작 전';
 $('#overviewWeakness').innerHTML=weakRows(s.priority_types,4);
 renderActivity(a.days||[]);
 await loadOverviewCommunity();
}
function renderActivity(days){
 const max=Math.max(1,...days.flatMap(d=>[d.logins||0,d.visitors||0,d.signups||0]));
 $('#activityChart').innerHTML=days.map(d=>`<div class="day-col" title="${esc(d.day)} · 로그인 ${d.logins} · 방문 ${d.visitors} · 가입 ${d.signups}"><div class="bars"><i class="visitor" style="height:${Math.max(2,(d.visitors/max)*100)}%"></i><i class="login" style="height:${Math.max(2,(d.logins/max)*100)}%"></i><i class="signup" style="height:${Math.max(2,(d.signups/max)*100)}%"></i></div><small>${esc(fmtDay(d.day))}</small></div>`).join('');
}
async function loadOverviewCommunity(){
 try{
  const [iq,ch]=await Promise.all([communityApi('community/inquiries?limit=20'),communityApi('community/chat?limit=5')]);
  state.inquiries=iq.inquiries||[];state.chat=ch.messages||[];communityState(true,'문의·채팅 서버 연결됨');
  const pending=state.inquiries.filter(x=>!x.answered).slice(0,4);
  $('#overviewInquiry').innerHTML=pending.length?pending.map(i=>`<button class="mini-item mini-button" data-inquiry="${esc(i.id)}"><b>${esc(i.title||'(제목 없음)')}</b><p>${esc((i.content||'').slice(0,90))}</p><span class="item-meta">${esc(i.author)} · ${esc(fmt(i.created_at))}</span></button>`).join(''):empty('답변을 기다리는 문의가 없습니다.');
  $('#overviewChat').innerHTML=state.chat.length?state.chat.slice(0,4).map(m=>`<div class="mini-item"><b>${esc(m.author)}</b><p>${esc((m.content||'').slice(0,110))}</p><span class="item-meta">${esc(fmt(m.created_at))}</span></div>`).join(''):empty('최근 채팅이 없습니다.');
 }catch(e){
  communityState(false,'커뮤니티 서버 연결 확인 필요');
  $('#overviewInquiry').innerHTML=empty('커뮤니티 서버 연결을 확인해 주세요.');$('#overviewChat').innerHTML=empty('커뮤니티 서버 연결을 확인해 주세요.');
 }
}
async function loadAccounts(){
 const q=$('#accountSearch').value.trim(),status=$('#accountStatus').value;
 const d=await api('accounts?'+qs({q,status,limit:state.accounts.limit,offset:state.accounts.offset}));
 state.accounts={...state.accounts,...d,rows:d.accounts||[]};$('#accountCount').textContent=`총 ${d.total}명`;
 $('#accountRows').innerHTML=state.accounts.rows.length?state.accounts.rows.map(a=>`<tr data-account="${esc(a.id)}"><td class="user-cell"><b>${esc(a.display_name||'이름 없음')}</b><span>${esc(a.email)}</span></td><td>${esc(fmt(a.created_at))}</td><td>${esc(fmt(a.last_login_at))}</td><td>${a.login_count}회</td><td>${a.attempt_count}회</td><td>${a.session_count}</td><td><span class="pill ${a.disabled?'off':''}">${a.disabled?'이용 정지':'이용 중'}</span></td></tr>`).join(''):empty('조건에 맞는 회원이 없습니다.');
 const page=Math.floor(d.offset/d.limit)+1,pages=Math.max(1,Math.ceil(d.total/d.limit));$('#accountsPage').textContent=`${page} / ${pages}`;
 $('#accountsPrev').disabled=d.offset<=0;$('#accountsNext').disabled=d.offset+d.limit>=d.total;
}
async function openAccount(id){
 const d=await api('accounts/'+encodeURIComponent(id)),a=d.account;
 $('#accountDetail').innerHTML=`<div class="detail-body"><div class="detail-head"><h2>${esc(a.display_name||'회원')}</h2><p>${esc(a.email)} · ${esc(a.auth_provider)}</p></div>
 <div class="detail-grid"><div class="detail-stat"><span>로그인</span><strong>${a.login_count||0}</strong></div><div class="detail-stat"><span>CBT</span><strong>${d.learning.attempts||0}</strong></div><div class="detail-stat"><span>서로 다른 문항</span><strong>${d.learning.distinct_questions||0}</strong></div></div>
 <section class="detail-section"><h3>계정 상태</h3><div class="action-row"><button data-account-status="${a.disabled?'enable':'disable'}" data-account-id="${esc(a.id)}" class="${a.disabled?'':'danger'}">${a.disabled?'이용 재개':'이용 정지'}</button><button data-account-logout="${esc(a.id)}">다른 기기 모두 로그아웃</button></div></section>
 <section class="detail-section"><h3>최근 로그인</h3><div class="attempt-list">${(d.logins||[]).slice(0,10).map(x=>`<div class="attempt-item"><span>${esc(x.device_label||'기기')}</span><b>${esc(fmt(x.logged_in_at))}</b></div>`).join('')||empty('로그인 이력이 없습니다.')}</div></section>
 <section class="detail-section"><h3>학습 현황</h3>${weakRows(d.learning.priority_types||[],6)}</section>
 <section class="detail-section"><h3>최근 CBT</h3><div class="attempt-list">${(d.recent_attempts||[]).slice(0,8).map(x=>`<div class="attempt-item"><span>${esc(fmt(x.at))} · ${esc(x.mode||'')}</span><b>${Number(x.percent||0).toFixed(1)}%</b></div>`).join('')||empty('CBT 기록이 없습니다.')}</div></section></div>`;
 $('#accountDialog').showModal();
}
async function loadLearning(){
 const d=state.learning=await api('learning');$('#learningTypes').innerHTML=weakRows(d.priority_types||[],12);
 $('#learningUsers').innerHTML=(d.users||[]).length?d.users.map(u=>`<tr data-account="${esc(u.account_id)}"><td class="user-cell"><b>${esc(u.name||'회원')}</b><span>${esc(u.email)}</span></td><td>${u.attempts}</td><td>${u.distinct_questions}</td><td>${u.recent_accuracy}%</td><td>${esc((u.weaknesses||[]).map(x=>x.question_type).join(', ')||'—')}</td><td>${esc(fmt(u.latest_at))}</td></tr>`).join(''):empty('학습 기록이 없습니다.');
}
function filterInquiries(){
 const q=$('#inquirySearch').value.trim().toLowerCase(),f=$('#inquiryFilter').value;
 const rows=state.inquiries.filter(x=>(f==='all'||(f==='pending'&&!x.answered)||(f==='answered'&&x.answered))&&(!q||[x.title,x.content,x.author,x.answer].some(v=>String(v||'').toLowerCase().includes(q))));
 $('#inquiryCount').textContent=rows.length;$('#inquiryList').innerHTML=rows.length?rows.map(i=>`<article class="community-item"><div><b>${esc(i.privacy==='private'?'🔒 비공개 문의':i.title||'(제목 없음)')}</b><p>${esc((i.content||'').slice(0,180))}</p><div class="item-meta"><span>${esc(i.author)}</span><span>${esc(fmt(i.created_at))}</span><span class="pill ${i.answered?'':'soft'}">${i.answered?'답변 완료':'답변 대기'}</span></div></div><button data-inquiry="${esc(i.id)}">열기</button></article>`).join(''):empty('해당 문의가 없습니다.');
}
async function loadInquiries(force=true){
 if(force){const d=await communityApi('community/inquiries?limit=100');state.inquiries=d.inquiries||[];communityState(true,'문의·채팅 서버 연결됨');}filterInquiries();
}
function openInquiry(id){
 const i=state.inquiries.find(x=>x.id===id);if(!i)return;
 $('#contentDetail').innerHTML=`<div class="detail-body"><div class="detail-head"><h2>${esc(i.title||'(제목 없음)')}</h2><p>${esc(i.author)} · ${esc(fmt(i.created_at))} · ${i.privacy==='private'?'비공개':'공개'}</p></div><div class="content-block">${esc(i.content||'')}</div><section class="detail-section answer-box"><h3>관리자 답변</h3><textarea id="inquiryAnswer" maxlength="5000" placeholder="답변을 입력하세요.">${esc(i.answer||'')}</textarea><div class="action-row"><button class="primary" data-inquiry-save="${esc(i.id)}">답변 저장</button><button class="danger" data-inquiry-delete="${esc(i.id)}">문의 삭제</button></div></section></div>`;$('#contentDialog').showModal();
}
function filterChat(){
 const q=$('#chatSearch').value.trim().toLowerCase(),rows=state.chat.filter(x=>!q||[x.author,x.content].some(v=>String(v||'').toLowerCase().includes(q)));
 $('#chatCount').textContent=rows.length;$('#chatList').innerHTML=rows.length?rows.map(m=>`<article class="community-item"><div><b>${esc(m.author)}</b><p>${esc(m.content||'')}</p><div class="item-meta">${esc(fmt(m.created_at))}</div></div><button class="danger" data-chat-delete="${esc(m.id)}">삭제</button></article>`).join(''):empty('해당 메시지가 없습니다.');
}
async function loadChat(force=true){if(force){const d=await communityApi('community/chat?limit=100');state.chat=d.messages||[];communityState(true,'문의·채팅 서버 연결됨');}filterChat();}
async function loadReports(){
 const d=await api('reports?'+qs({q:$('#reportSearch').value.trim(),status:$('#reportFilter').value}));state.reports=d.reports||[];$('#reportCount').textContent=d.stats?.total||state.reports.length;
 $('#reportList').innerHTML=state.reports.length?state.reports.map(r=>`<article class="community-item"><div><b>${esc(r.nickname||'익명')} · 오류 신고</b><p>${esc((r.content||'').slice(0,180))}</p><div class="item-meta"><span>${esc(fmt(r.created_at))}</span><span>${esc(r.source_page||'')}</span><span class="pill soft">${esc({pending:'대기',in_progress:'처리중',resolved:'해결'}[r.status]||r.status)}</span></div></div><button data-report="${r.id}">열기</button></article>`).join(''):empty('오류 신고가 없습니다.');
}
function openReport(id){
 const r=state.reports.find(x=>String(x.id)===String(id));if(!r)return;
 $('#contentDetail').innerHTML=`<div class="detail-body"><div class="detail-head"><h2>${esc(r.nickname||'익명')} · 오류 신고</h2><p>${esc(fmt(r.created_at))} · ${esc(r.source_page||'')}</p></div><div class="content-block">${esc(r.content||'')}</div><section class="detail-section answer-box"><h3>처리 상태</h3><select id="reportStatus"><option value="pending" ${r.status==='pending'?'selected':''}>대기</option><option value="in_progress" ${r.status==='in_progress'?'selected':''}>처리중</option><option value="resolved" ${r.status==='resolved'?'selected':''}>해결</option></select><h3>관리자 메모</h3><textarea id="reportNote" maxlength="2000">${esc(r.admin_note||'')}</textarea><div class="action-row"><button class="primary" data-report-save="${r.id}">저장</button><button class="danger" data-report-delete="${r.id}">삭제</button></div></section></div>`;$('#contentDialog').showModal();
}
async function loadAudit(){
 const d=await api('audit?limit=100');const labels={account_disable:'회원 이용 정지',account_enable:'회원 이용 재개',account_logout:'회원 세션 종료',inquiry_answer:'문의 답변',inquiry_delete:'문의 삭제',chat_delete:'채팅 삭제',report_update:'오류 신고 변경',report_delete:'오류 신고 삭제'};
 $('#auditList').innerHTML=(d.logs||[]).length?d.logs.map(x=>`<div class="audit-item"><time>${esc(fmt(x.created_at))}</time><div><b>${esc(labels[x.action]||x.action)}</b><div class="item-meta">${esc(x.target_email||x.detail?.document_id||x.detail?.report_id||'')}</div></div><span class="audit-action">${esc(x.admin_email||'관리자')}</span></div>`).join(''):empty('운영 로그가 없습니다.');
}
async function loadView(v){
 if(v==='overview')return loadSummary();if(v==='accounts')return loadAccounts();if(v==='learning')return loadLearning();if(v==='inquiries')return loadInquiries(true);if(v==='reports')return loadReports();if(v==='chat')return loadChat(true);if(v==='audit')return loadAudit();
}
async function refresh(){await loadView(state.view);toast('새로고침했습니다.');}
function debounce(fn){clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>fn().catch(e=>toast(e.message)),250);}
function bind(){
 $$('.admin-nav button').forEach(b=>b.onclick=()=>go(b.dataset.view));$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
 $('#refreshAll').onclick=()=>refresh().catch(e=>toast(e.message));$('#communityReconnect').onclick=()=>refresh().catch(e=>toast(e.message));
 $('#accountSearch').oninput=()=>{state.accounts.offset=0;debounce(loadAccounts)};$('#accountStatus').onchange=()=>{state.accounts.offset=0;loadAccounts().catch(e=>toast(e.message));};
 $('#accountsPrev').onclick=()=>{state.accounts.offset=Math.max(0,state.accounts.offset-state.accounts.limit);loadAccounts().catch(e=>toast(e.message));};
 $('#accountsNext').onclick=()=>{state.accounts.offset+=state.accounts.limit;loadAccounts().catch(e=>toast(e.message));};
 $('#accountRows').onclick=e=>{const tr=e.target.closest('[data-account]');if(tr)openAccount(tr.dataset.account).catch(x=>toast(x.message));};
 $('#learningUsers').onclick=e=>{const tr=e.target.closest('[data-account]');if(tr)openAccount(tr.dataset.account).catch(x=>toast(x.message));};
 $('#inquirySearch').oninput=filterInquiries;$('#inquiryFilter').onchange=filterInquiries;$('#inquiryList').onclick=e=>{const b=e.target.closest('[data-inquiry]');if(b)openInquiry(b.dataset.inquiry);};
 $('#overviewInquiry').onclick=e=>{const b=e.target.closest('[data-inquiry]');if(b){go('inquiries');setTimeout(()=>openInquiry(b.dataset.inquiry),0);}};
 $('#chatSearch').oninput=filterChat;$('#reportSearch').oninput=()=>debounce(loadReports);$('#reportFilter').onchange=()=>loadReports().catch(e=>toast(e.message));
 $('#reportList').onclick=e=>{const b=e.target.closest('[data-report]');if(b)openReport(b.dataset.report);};
 $('#accountDetail').onclick=async e=>{
  const status=e.target.closest('[data-account-status]'),logout=e.target.closest('[data-account-logout]');
  try{
   if(status){const disabled=status.dataset.accountStatus==='disable';if(disabled&&!confirm('이 회원의 로그인을 즉시 막고 현재 세션을 종료할까요?'))return;await api('accounts/'+encodeURIComponent(status.dataset.accountId)+'/status',{disabled,reason:'관리자 페이지에서 변경'});$('#accountDialog').close();await loadAccounts();toast(disabled?'이용을 정지했습니다.':'이용을 재개했습니다.');}
   if(logout){if(!confirm('이 회원의 로그인 세션을 모두 종료할까요?'))return;await api('accounts/'+encodeURIComponent(logout.dataset.accountLogout)+'/logout',{});$('#accountDialog').close();await loadAccounts();toast('세션을 종료했습니다.');}
  }catch(x){toast(x.message)}
 };
 $('#chatList').onclick=async e=>{const b=e.target.closest('[data-chat-delete]');if(!b||!confirm('이 채팅 메시지를 삭제할까요?'))return;try{await communityApi('community/chat/'+encodeURIComponent(b.dataset.chatDelete)+'/delete',{});await loadChat(true);toast('메시지를 삭제했습니다.');}catch(x){toast(x.message)}};
 $('#contentDetail').onclick=async e=>{
  try{
   const save=e.target.closest('[data-inquiry-save]'),del=e.target.closest('[data-inquiry-delete]'),rs=e.target.closest('[data-report-save]'),rd=e.target.closest('[data-report-delete]');
   if(save){const answer=$('#inquiryAnswer').value.trim();if(!answer)return toast('답변을 입력해 주세요.');await communityApi('community/inquiries/'+encodeURIComponent(save.dataset.inquirySave)+'/answer',{answer});$('#contentDialog').close();await loadInquiries(true);toast('답변을 저장했습니다.');}
   if(del){if(!confirm('이 문의를 삭제할까요? 되돌릴 수 없습니다.'))return;await communityApi('community/inquiries/'+encodeURIComponent(del.dataset.inquiryDelete)+'/delete',{});$('#contentDialog').close();await loadInquiries(true);toast('문의를 삭제했습니다.');}
   if(rs){await api('reports/'+rs.dataset.reportSave,{status:$('#reportStatus').value,admin_note:$('#reportNote').value});$('#contentDialog').close();await loadReports();toast('처리 상태를 저장했습니다.');}
   if(rd){if(!confirm('이 오류 신고를 삭제할까요?'))return;await api('reports/'+rd.dataset.reportDelete+'/delete',{});$('#contentDialog').close();await loadReports();toast('오류 신고를 삭제했습니다.');}
  }catch(x){toast(x.message)}
 };
}
async function boot(){
 bind();try{
  await account.ready;const info=account.info();
  if(!info.user){gate('로그인이 필요합니다.','관리자 계정으로 로그인한 뒤 다시 열어 주세요.','<a class="gate-link" href="/auth?returnTo=%2Fadmin">로그인</a>');return;}
  const me=await api('me');$('#adminName').textContent=(me.admin.name||'관리자')+'님';showContent();go('overview');
 }catch(e){
  if(e.code==='ADMIN_REQUIRED'||e.status===403)gate('관리자 권한이 없습니다.','이 계정에는 운영 관리자 권한이 부여되지 않았습니다.','<a class="gate-link" href="/">홈으로</a>');
  else gate('관리자 페이지를 열 수 없습니다.',e.message||'로그인 상태를 확인해 주세요.','<a class="gate-link" href="/auth?returnTo=%2Fadmin">다시 로그인</a>');
 }
}
boot();
