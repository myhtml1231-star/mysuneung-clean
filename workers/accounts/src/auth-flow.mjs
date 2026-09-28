// Production has no request-driven identity bypass. Adapters exist only at module-build boundaries.
export function mountAuthFlow({loadConfig,initialize,popup,loginEmail,registerEmail,sendVerification,refreshIdentity,resetPassword,clearIdentity,account,submitSession,navigate,notifyTabs}){
 const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),deleting=params.get('intent')==='delete';
 let config=null,configAt=0,identity=null,busy=false,stage='login',consented=false,resendAt=0,resendTimer=null;
 const labels={login:['다시 만나 반가워요','로그인하고 내 공부를 이어가요.','로그인'],register:['반가워요, 함께 시작해요','자주 쓰는 이메일로 가입해 주세요.','이메일로 가입하기'],consent:['거의 다 왔어요','처음 한 번만 확인해 주세요.','가입 완료하기'],verify:['메일함을 확인해 주세요','이메일을 인증하면 기록을 안전하게 보관할 수 있어요.',''],reset:['비밀번호를 잊었나요?','가입한 이메일로 변경 링크를 보내드릴게요.','변경 메일 받기'],resetSent:['메일함을 확인해 주세요','안내에 따라 새 비밀번호를 정해 주세요.',''],signed:['반가워요, 돌아왔네요','기록해 둔 공부를 이어가요.',''],delete:['계정을 삭제할까요?','가입한 방법으로 한 번 더 확인해 주세요.','이메일로 확인 후 삭제']};
 const errors={
  'auth/popup-blocked':'브라우저에서 팝업을 허용하고 다시 눌러 주세요.','auth/popup-closed-by-user':'로그인 창을 닫았어요. 다시 시작할 수 있어요.',
  'auth/cancelled-popup-request':'열려 있는 Google 로그인 창을 확인해 주세요.','auth/unauthorized-domain':'mysuneung.com에서 다시 로그인해 주세요.',
  'auth/network-request-failed':'인터넷 연결을 확인하고 다시 눌러 주세요.','auth/too-many-requests':'잠시 쉬었다가 다시 시도해 주세요.',
  'auth/user-disabled':'이 계정은 이용을 제한하고 있어요. 다른 계정으로 로그인해 주세요.',
  'auth/invalid-email':'이메일 주소를 확인해 주세요.','auth/invalid-credential':'이메일이나 비밀번호를 다시 확인해 주세요.',
  'auth/invalid-login-credentials':'이메일이나 비밀번호를 다시 확인해 주세요.','auth/user-not-found':'이메일이나 비밀번호를 다시 확인해 주세요.',
  'auth/wrong-password':'이메일이나 비밀번호를 다시 확인해 주세요.','auth/email-already-in-use':'이 이메일로 가입할 수 없어요. 기존 계정으로 로그인하거나 비밀번호를 찾아 주세요.',
  'auth/account-exists-with-different-credential':'이전에 가입한 방법으로 로그인해 주세요. 계정 기록은 임의로 합치지 않아요.',
  'auth/weak-password':'비밀번호를 10자 이상으로 다시 정해 주세요.','auth/password-does-not-meet-requirements':'보안 기준에 맞게 비밀번호를 더 길게 정해 주세요.',
  'auth/operation-not-allowed':'이메일 가입 연결을 확인하고 있어요. 지금은 Google 로그인을 이용해 주세요.',
  'RECENT_LOGIN_REQUIRED':'인증을 마쳤다면 비밀번호로 다시 로그인해 주세요. 기록은 그대로 이어져요.',
  'EMAIL_NOT_VERIFIED':'이메일 인증을 마친 뒤 다시 눌러 주세요.'
 };
 function say(s,target='#authMessage'){ $(target).textContent=s||''; }
 function destination(){try{const u=new URL(params.get('returnTo')||'/my',location.origin);if(u.origin===location.origin&&['/my','/mixed-cbt','/account/connect'].includes(u.pathname))return u.pathname+u.search+u.hash;}catch{}return '/my';}
 const show=(s,on)=>$(s).classList.toggle('hidden',!on);
 function clearErrors(){for(const id of ['email','password','passwordConfirm','consent'])$('#'+id+'Error').textContent='';for(const e of document.querySelectorAll('[aria-invalid]'))e.removeAttribute('aria-invalid');say('');say('','#verifyMessage');}
 function enable(){
  const locked=busy||!config;
  for(const e of document.querySelectorAll('#authForm input,#authForm button,#verificationPanel button,#resetSentPanel button,#authBack,#switchAccount,#openEmailSignup'))e.disabled=locked;
  const emailActive=['login','register','reset','delete'].includes(stage),passActive=['login','register','delete'].includes(stage),consentActive=['register','consent'].includes(stage);
  $('#email').disabled=locked||!emailActive;$('#password').disabled=locked||!passActive;$('#togglePassword').disabled=locked||!passActive;
  $('#passwordConfirm').disabled=locked||stage!=='register';
  for(const id of ['nickname','over14','privacyConsent'])$('#'+id).disabled=locked||!consentActive;
  $('#deleteConfirm').disabled=locked||stage!=='delete';$('#resendVerification').disabled=locked||Date.now()<resendAt;
  $('#authForm').setAttribute('aria-busy',String(busy));$('#emailSubmit').textContent=busy?'잠깐만 기다려 주세요':labels[stage]?.[2]||'계속하기';
 }
 function setStage(next,focus=false){
  stage=next;document.body.dataset.authStage=next;document.title=(next==='register'?'회원가입':next==='reset'?'비밀번호 찾기':'로그인')+' · 수능기출';
  const [title,description]=labels[next];$('#authTitle').textContent=title;$('#authDescription').textContent=description;
  show('#signedInPanel',next==='signed');show('#authForm',['login','register','consent','reset','delete'].includes(next));
  show('#emailFields',['login','register','reset','delete'].includes(next));show('#passwordFields',['login','register','delete'].includes(next));show('#passwordConfirmFields',next==='register');show('#passwordHint',next==='register');
  show('#signupFields',['register','consent'].includes(next));show('#signupIdentityChip',next==='consent');
  show('#deleteFields',next==='delete');show('#googleFields',['login','delete'].includes(next));
  show('#rememberFields',next==='login'||next==='register');show('#forgotPassword',next==='login');
  show('#loginBottom',next==='login');show('#authBack',!['login','signed','delete'].includes(next));
  show('#verificationPanel',next==='verify');show('#resetSentPanel',next==='resetSent');show('#publicComputerHint',['login','register','delete'].includes(next));
  $('#password').autocomplete=next==='register'?'new-password':'current-password';$('#password').type='password';$('#togglePassword').textContent='보기';$('#togglePassword').setAttribute('aria-pressed','false');
  $('#authButtonText').textContent=next==='delete'?'Google로 확인 후 삭제':'Google로 계속하기';
  enable();if(focus)$('#authTitle').focus();
 }
 function busyState(on){busy=on;enable();}
 function error(e,target){say(errors[e.code]||e.message||'잠시 후 다시 시도해 주세요.',target);}
 function safeSwitch(){if(account.info().user&&(account.info().pending||account.info().conflicts)){say('저장할 기록이 남아 있어요. 내 정보에서 동기화를 마친 뒤 계정을 바꿔 주세요.');return false;}return true;}
 async function reset(next='login'){
  if(busy||!safeSwitch())return;identity=null;consented=false;try{await clearIdentity();}catch{}
  $('#authForm').reset();clearErrors();setStage(next,true);
 }
 async function fresh(force=false){if(force||!config||Date.now()-configAt>8*60000){config=await loadConfig();configAt=Date.now();}return config;}
 async function finish(){identity=null;$('#password').value='';$('#passwordConfirm').value='';try{await clearIdentity();}catch{}notifyTabs();navigate(deleting?'/auth?deleted=1':destination());}
 async function exchange(accept){
  await fresh();const body={id_token:await identity.getToken(),remember:$('#remember').checked};
  if(accept)Object.assign(body,{name:$('#nickname').value.trim(),over14:$('#over14').checked,accept_privacy:$('#privacyConsent').checked,consent_version:config.consent_version});
  let result=await submitSession(body,config.login_csrf);
  if(result.code==='LOGIN_CSRF'){await fresh(true);if(accept)body.consent_version=config.consent_version;result=await submitSession(body,config.login_csrf);}
  if(result.code==='CONSENT_REQUIRED'){consented=false;$('#signupIdentity').textContent=identity.email;setStage('consent',true);return;}
  if(!result.ok){const e=new Error(result.error||'로그인을 마치지 못했어요.');e.code=result.code;throw e;}
  await finish();
 }
 function cooldown(){clearInterval(resendTimer);resendAt=Date.now()+60000;const tick=()=>{const n=Math.ceil((resendAt-Date.now())/1000);$('#resendVerification').textContent=n>0?'다시 받기 · '+n+'초':'인증 메일 다시 받기';$('#resendVerification').disabled=busy||n>0;if(n<=0)clearInterval(resendTimer);};tick();resendTimer=setInterval(tick,1000);}
 async function mail(){await sendVerification(identity);cooldown();say('인증 메일을 보냈어요. 스팸함도 확인해 주세요.','#verifyMessage');}
 function verification(){setStage('verify',true);$('#verifyAddress').textContent=identity.email;}
 async function removeAccount(){
  if($('#deleteConfirm').value!=='계정 삭제')throw Error('‘계정 삭제’를 정확하게 입력해 주세요.');
  await account.api('delete',{id_token:await identity.getToken(),confirm:'계정 삭제'});
  const uid=account.info().user?.id;if(uid){const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('msn:v1:'+uid+':'))keys.push(k);}keys.forEach(k=>localStorage.removeItem(k));}
  await finish();
 }
 function fieldError(id,msg){$('#'+id+'Error').textContent=msg;const input=$('#'+id);if(input){input.setAttribute('aria-invalid','true');input.focus();}return false;}
 function validate(){
  clearErrors();
  if(['login','register','reset','delete'].includes(stage)){
   $('#email').value=$('#email').value.trim();if(!$('#email').value||!$('#email').validity.valid)return fieldError('email','이메일 주소를 확인해 주세요.');
   if(stage!=='reset'&&!$('#password').value)return fieldError('password','비밀번호를 입력해 주세요.');
  }
  if(stage==='register'){
   if($('#password').value.length<10||$('#password').value.length>128)return fieldError('password','비밀번호는 10~128자로 입력해 주세요.');
   if($('#password').value!==$('#passwordConfirm').value)return fieldError('passwordConfirm','비밀번호가 달라요. 한 번 더 확인해 주세요.');
  }
  if(['register','consent'].includes(stage)&&(!$('#over14').checked||!$('#privacyConsent').checked)){say('필수 항목 두 가지를 확인해 주세요.','#consentError');$('#over14').focus();return false;}
  if(stage==='delete'&&$('#deleteConfirm').value!=='계정 삭제'){say('‘계정 삭제’를 정확하게 입력해 주세요.');$('#deleteConfirm').focus();return false;}
  return true;
 }
 $('#authForm').onsubmit=async e=>{
  e.preventDefault();if(busy||!config||!safeSwitch()||!validate())return;const from=stage;busyState(true);
  try{
   if(from==='consent'){if(!identity)throw Error('먼저 로그인 방법을 확인해 주세요.');await exchange(true);return;}
   if(from==='reset'){
    try{await resetPassword($('#email').value);}catch(e){if(!['auth/user-not-found','auth/email-not-found'].includes(e.code))throw e;}
    setStage('resetSent',true);return;
   }
   if(from==='register'){consented=true;identity=await registerEmail($('#email').value,$('#password').value);$('#password').value='';$('#passwordConfirm').value='';verification();await mail();return;}
   identity=await loginEmail($('#email').value,$('#password').value);$('#password').value='';
   if(from==='delete'){await removeAccount();return;}
   if(!identity.verified){verification();say('전에 받은 인증 메일을 확인해 주세요. 메일이 없다면 다시 받을 수 있어요.','#verifyMessage');return;}
   await exchange(false);
  }catch(e){error(e,stage==='verify'?'#verifyMessage':'#authMessage');}
  finally{busyState(false);}
 };
 $('#googleLogin').onclick=async()=>{
  if(busy||!config||!safeSwitch())return;
  if(deleting&&$('#deleteConfirm').value!=='계정 삭제'){say('‘계정 삭제’를 먼저 입력해 주세요.');$('#deleteConfirm').focus();return;}
  clearErrors();busyState(true);
  try{identity=await popup();if(deleting)await removeAccount();else await exchange(false);}
  catch(e){error(e);identity=null;try{await clearIdentity();}catch{}}
  finally{busyState(false);}
 };
 $('#checkVerification').onclick=async()=>{
  if(busy||!identity)return;busyState(true);say('','#verifyMessage');
  try{identity=await refreshIdentity(identity);if(!identity.verified){say('아직 인증 전이에요. 메일의 인증 버튼을 누른 뒤 다시 확인해 주세요.','#verifyMessage');return;}await exchange(consented);}
  catch(e){error(e,'#verifyMessage');if(e.code==='RECENT_LOGIN_REQUIRED'){const email=identity?.email;identity=null;try{await clearIdentity();}catch{}setStage('login',true);$('#email').value=email||'';error(e);}}
  finally{busyState(false);}
 };
 $('#resendVerification').onclick=async()=>{if(busy||!identity||Date.now()<resendAt)return;busyState(true);try{await mail();}catch(e){error(e,'#verifyMessage');}finally{busyState(false);}};
 $('#togglePassword').onclick=()=>{const open=$('#password').type==='password';$('#password').type=open?'text':'password';$('#togglePassword').textContent=open?'숨기기':'보기';$('#togglePassword').setAttribute('aria-label',open?'비밀번호 숨기기':'비밀번호 보기');$('#togglePassword').setAttribute('aria-pressed',String(open));};
 $('#openEmailSignup').onclick=()=>reset('register');$('#forgotPassword').onclick=()=>reset('reset');$('#authBack').onclick=()=>reset();$('#changeGoogle').onclick=()=>reset();$('#switchAccount').onclick=()=>reset();$('#verifyBack').onclick=()=>reset();$('#resetToLogin').onclick=()=>reset();$('#authRetry').onclick=()=>location.reload();
 async function boot(){
  busyState(true);try{await fresh(true);await initialize(config.firebase);await account.ready;
   if(deleting){if(!account.info().user){show('#loginRecovery',true);$('#loginRecovery').href='/auth?returnTo='+encodeURIComponent('/my#settings');throw Error('계정 삭제 전에 로그인해 주세요.');}setStage('delete');$('#email').value=account.info().user.email;}
   else if(account.info().user){const u=account.info().user;$('#signedName').textContent=u.name+'님';$('#signedEmail').textContent=u.email;$('#signedAvatar').textContent=u.name.slice(0,1);$('#signedContinue').href=destination();$('#signedContinue').textContent=destination().startsWith('/mixed-cbt')?'풀던 문제로 돌아가기':destination().startsWith('/account/connect')?'관심 대학 연결하기':'내 공부 보러 가기';setStage('signed');}
   else setStage(params.get('mode')==='signup'?'register':params.get('mode')==='reset'?'reset':'login');
   if(params.get('verified')==='1')say('이메일 인증을 마쳤다면 로그인해 주세요.');if(params.get('deleted')==='1')say('계정과 학습 기록을 삭제했어요.');
  }catch(e){config=null;error(e);show('#authRetry',true);}finally{busyState(false);}
 }
 window.addEventListener('pagehide',()=>{identity=null;clearInterval(resendTimer);$('#password').value='';$('#passwordConfirm').value='';});
 setStage('login');boot();return {stage:()=>stage};
}
