(()=>{'use strict';
const $=s=>document.querySelector(s);
let rows=[],currentId=null,busy=false;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),1900);}
async function api(path,opt={}){
 const r=await fetch('/api/community/'+path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(opt.body!==undefined?{'Content-Type':'application/json'}:{})},method:opt.method||(opt.body===undefined?'GET':'POST'),body:opt.body===undefined?undefined:JSON.stringify(opt.body)});
 let d={};try{d=await r.json()}catch{}if(!r.ok){const e=Error(d.error||'요청을 처리하지 못했습니다.');e.code=d.code;throw e;}return d;
}
function fmt(ms){try{return new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium'}).format(new Date(ms));}catch{return'';}}
function render(){
 const box=$('#inquiryList');box.textContent='';
 if(!rows.length){const e=document.createElement('div');e.className='empty';e.textContent='아직 등록된 질문이 없습니다.';box.appendChild(e);return;}
 for(const q of rows){
  const card=document.createElement('article');card.className='item clickable';card.tabIndex=0;card.dataset.id=q.id;
  const main=document.createElement('div'),h=document.createElement('h3');h.textContent=q.title||'(제목 없음)';
  const meta=document.createElement('div');meta.className='meta';
  const author=document.createElement('span');author.textContent=q.author||'익명';const date=document.createElement('span');date.textContent=q.date||fmt(q.created_at);
  meta.append(author,date);
  if(q.privacy==='private'){const b=document.createElement('span');b.className='badge private';b.textContent='비공개';meta.appendChild(b);}
  const st=document.createElement('span');st.className='badge '+(q.answered?'done':'pending');st.textContent=q.answered?'답변완료':'답변대기';
  main.append(h,meta);card.append(main,st);card.onclick=()=>openDetail(q.id);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(q.id);}};box.appendChild(card);
 }
}
function showDetail(q,locked){
 $('#detailTitle').textContent=q.title||'문의';$('#detailMeta').textContent=(q.author||'익명')+' · '+(q.date||fmt(q.created_at));
 $('#detailLocked').classList.toggle('hidden',!locked);$('#detailOpen').classList.toggle('hidden',locked);$('#unlockError').textContent='';
 if(!locked){$('#detailBody').textContent=q.content||'';const a=$('#detailAnswer');a.textContent='';if(q.answer){const d=document.createElement('div');d.className='answer';d.textContent='관리자 답변\n'+q.answer;a.appendChild(d);}else{const d=document.createElement('div');d.className='hint';d.textContent='아직 답변이 없습니다.';a.appendChild(d);}}
}
async function openDetail(id){
 currentId=id;try{const d=await api('inquiries/'+encodeURIComponent(id));showDetail(d.inquiry,d.locked===true);$('#unlockPassword').value='';$('#detailDialog').showModal();}catch(e){toast(e.message);}
}
async function load(){
 try{const d=await api('inquiries?limit=100');rows=d.inquiries||[];render();}catch(e){toast(e.message);if(!rows.length){const box=$('#inquiryList');box.innerHTML='<div class="empty">문의 목록을 불러오지 못했습니다.</div>';}}
}
$('#openAsk').onclick=()=>{$('#askForm').reset();$('#passwordField').classList.add('hidden');$('#askError').textContent='';$('#askDialog').showModal();$('#title').focus();};
$('#privacy').onchange=()=>{const on=$('#privacy').value==='private';$('#passwordField').classList.toggle('hidden',!on);$('#password').required=on;if(!on)$('#password').value='';};
document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b){const d=document.getElementById(b.dataset.close);if(d?.open)d.close();}});
$('#unlockForm').onsubmit=async e=>{e.preventDefault();if(!currentId||busy)return;busy=true;$('#unlockError').textContent='';try{const d=await api('inquiries/'+encodeURIComponent(currentId)+'/open',{body:{password:$('#unlockPassword').value}});showDetail(d.inquiry,false);$('#unlockPassword').value='';}catch(x){$('#unlockError').textContent=x.message;}finally{busy=false;}};
$('#askForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('#askSubmit').disabled=true;$('#askError').textContent='';try{
 const privacy=$('#privacy').value;await api('inquiries',{body:{title:$('#title').value.trim(),author:$('#author').value.trim(),privacy,password:privacy==='private'?$('#password').value:'',content:$('#content').value.trim()}});
 $('#askDialog').close();toast('질문이 등록되었습니다.');await load();
 }catch(x){$('#askError').textContent=x.message;}finally{busy=false;$('#askSubmit').disabled=false;}};
load();setInterval(()=>{if(document.visibilityState==='visible'&&!busy)load();},15000);
})();