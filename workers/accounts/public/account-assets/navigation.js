(function(){
'use strict';
if(document.querySelector('[data-msn-account-nav]')||!window.MSNAccount)return;

const publicNav=document.querySelector('.header-bar nav.nav .nav-list');
const wrapper=publicNav?document.createElement('li'):null;
const host=document.createElement('span');
(wrapper||host).dataset.msnAccountNav='';
if(wrapper){wrapper.style.cssText='list-style:none;display:inline-flex;align-items:center;flex:none';wrapper.append(host);}
const sh=host.attachShadow({mode:'open'});

if(publicNav){
  sh.innerHTML='<style>:host{display:inline-flex;align-items:center;list-style:none;flex:none}a{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 12px;border:1px solid #e5e7eb;border-radius:9px;background:#fff;color:#374151;text-decoration:none;font:700 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;white-space:nowrap;box-sizing:border-box}a:hover{background:#fff9ec;border-color:#f0d698;color:#a75d08}a:focus-visible{outline:3px solid #f7d98b;outline-offset:2px}@media(max-width:640px){a{font-size:13px;padding:7px 10px}}</style><a href="/auth"><span>로그인</span></a>';
  publicNav.append(wrapper);
  // Account UI must not participate in the search / D-day flex group.
  // If that group wraps on desktop, keep the original search + D-day aligned right.
  const style=document.createElement('style');
  style.dataset.msnHeaderFix='';
  style.textContent='@media (min-width:1025px){.header-bar>.header-actions{margin-left:auto!important;justify-content:flex-end!important}}';
  document.head.append(style);
}else{
  sh.innerHTML='<style>:host{display:inline-flex;flex:none;max-width:100%;vertical-align:middle}a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#fff;border:1px solid #dfe4eb;color:#334155;border-radius:9px;font:700 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;padding:8px 12px;white-space:nowrap}a:hover{background:#f8fafc}a:focus-visible{outline:3px solid #b9d6ff;outline-offset:2px}</style><a href="/auth"><span>로그인</span></a>';
  if(document.querySelector('#app .bar')){
    document.querySelector('#app .bar').append(host);
    const start=document.querySelector('#start');
    if(start){
      const line=document.createElement('div');
      line.className='msn-account-start';
      line.innerHTML='<a href="/my">내 정보 →</a>';
      line.style.cssText='font-size:12px;margin:0 0 20px;text-align:right;color:#556a96';
      start.prepend(line);
    }
    const analysis=document.querySelector('.analysis-head');
    if(analysis){
      const link=document.createElement('a');
      link.href='/my#cbt';link.textContent='내 정보';
      link.style.cssText='font-size:12px;padding:8px 12px;color:#435b89';
      analysis.append(link);
    }
  }else{
    const parent=document.querySelector('.header-actions');
    if(parent)parent.append(host);
    else{
      const row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:8px 18px;background:#fff;border-bottom:1px solid #e9edf5;box-sizing:border-box;position:relative;z-index:1';
      row.append(host);document.body.prepend(row);
    }
  }
}

const a=sh.querySelector('a'),name=sh.querySelector('span');
function update(){
  const s=MSNAccount.info();
  a.href=s.user?'/my':'/auth?returnTo='+encodeURIComponent(location.pathname.startsWith('/mixed-cbt')?location.pathname+location.search:'/my');
  name.textContent=s.user?'내 정보':'로그인';
  a.title=s.user?(s.user.name+' · 내 정보'):'로그인';
}
window.addEventListener('msn-account-change',update);
MSNAccount.ready.then(update);
})();
