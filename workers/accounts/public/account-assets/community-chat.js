(()=>{'use strict';
const $=s=>document.querySelector(s);
let user=null,messages=[],busy=false,lastSignature='';
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),1800);}
async function api(path,opt={}){
 const r=await fetch('/api/community/'+path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(opt.body!==undefined?{'Content-Type':'application/json'}:{})},method:opt.method||(opt.body===undefined?'GET':'POST'),body:opt.body===undefined?undefined:JSON.stringify(opt.body)});
 let d={};try{d=await r.json()}catch{}if(!r.ok){const e=Error(d.error||'요청을 처리하지 못했습니다.');e.code=d.code;e.status=r.status;throw e;}return d;
}
function fmt(ms){try{return new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit'}).format(new Date(ms));}catch{return'';}}
function updateSession(){
 $('#loginForm').classList.toggle('hidden',!!user);$('#chatForm').classList.toggle('hidden',!user);
 $('#currentUser').textContent=user?user.nickname:'';$('#chatState').textContent=user?user.nickname+'님으로 참여 중':'메시지는 누구나 볼 수 있고, 작성하려면 입장하세요.';
 if(user)setTimeout(()=>$('#messageInput').focus(),0);
}
function render(){
 const box=$('#messages'),sig=JSON.stringify(messages.map(x=>[x.id,x.created_at]));if(sig===lastSignature)return;lastSignature=sig;
 const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<120;box.textContent='';
 if(!messages.length){const e=document.createElement('div');e.className='empty';e.textContent='아직 메시지가 없습니다.';box.appendChild(e);return;}
 for(const m of messages){
  const mine=!!user&&m.user_id===user.id;const wrap=document.createElement('div');wrap.className='message '+(mine?'me':'other');
  const head=document.createElement('div');head.className='message-head';head.textContent=(m.author||'익명')+' · '+fmt(m.created_at);
  const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=m.content||'';wrap.append(head,bubble);box.appendChild(wrap);
 }
 if(nearBottom||!box.dataset.loaded)box.scrollTop=box.scrollHeight;box.dataset.loaded='1';
}
async function loadSession(){
 try{const d=await api('chat/session');user=d.user||null;updateSession();}catch(e){user=null;updateSession();$('#chatError').textContent=e.message;}
}
async function loadMessages(){
 try{const d=await api('chat/messages?limit=120');messages=d.messages||[];render();$('#chatError').textContent='';}catch(e){$('#chatError').textContent=e.message;}
}
$('#loginForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('#loginButton').disabled=true;$('#chatError').textContent='';try{
 const d=await api('chat/session',{body:{nickname:$('#nickname').value.trim(),password:$('#chatPassword').value}});
 user=d.user;$('#chatPassword').value='';updateSession();render();toast('채팅방에 입장했습니다.');
 }catch(x){$('#chatError').textContent=x.message;}finally{busy=false;$('#loginButton').disabled=false;}};
$('#logoutButton').onclick=async()=>{if(busy)return;busy=true;try{await api('chat/logout',{body:{}});}catch{}user=null;updateSession();render();busy=false;};
$('#sendForm').onsubmit=async e=>{e.preventDefault();if(busy||!user)return;const content=$('#messageInput').value.trim();if(!content)return;busy=true;$('#sendButton').disabled=true;$('#chatError').textContent='';try{
 const d=await api('chat/messages',{body:{content}});$('#messageInput').value='';messages.push(d.message);render();const box=$('#messages');box.scrollTop=box.scrollHeight;
 }catch(x){$('#chatError').textContent=x.message;if(x.code==='CHAT_LOGIN_REQUIRED'){user=null;updateSession();}}finally{busy=false;$('#sendButton').disabled=false;}};
Promise.all([loadSession(),loadMessages()]).then(()=>{const box=$('#messages');box.scrollTop=box.scrollHeight;});
setInterval(()=>{if(document.visibilityState==='visible'&&!busy)loadMessages();},3500);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadSession();loadMessages();}});
})();