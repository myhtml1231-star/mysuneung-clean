(function(){
'use strict';
if(document.querySelector('[data-msn-account-nav]')||!window.MSNAccount)return;

const publicNav=document.querySelector('.header-bar nav.nav .nav-list');
const wrapper=publicNav?document.createElement('li'):null;
const host=document.createElement('span');
(wrapper||host).dataset.msnAccountNav='';
if(wrapper){wrapper.style.cssText='list-style:none;display:inline-flex;align-items:center;flex:none';wrapper.append(host);}
const sh=host.attachShadow({mode:'open'});
const buttonStyle='display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;text-decoration:none;background:transparent;border:0;color:#334155;border-radius:0;font:700 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;padding:0;white-space:nowrap';
const states='a:hover{color:#b06a08}a:focus-visible{outline:3px solid #b9d6ff;outline-offset:2px}';
sh.innerHTML='<style>:host{display:inline-flex;flex:none;max-width:100%;vertical-align:middle}@media(max-width:640px){:host{top:4px!important}}a{'+buttonStyle+'}'+states+'</style><a href="/auth"><span>로그인</span></a>';
const secondary=[];
function accountButton(destination,setup=false){const link=document.createElement('a');link.className='msn-account-button';link.href=destination;link.textContent='내 정보';link.style.cssText=buttonStyle;if(setup)link.style.removeProperty('font-size');secondary.push({link,destination});return link;}
const style=document.createElement('style');style.textContent='.msn-account-button:hover{color:#b06a08!important}.msn-account-button:focus-visible{outline:3px solid #b9d6ff;outline-offset:2px}';document.head.append(style);

if(publicNav){
  wrapper.className='nav-item account-nav-item';
  host.style.cssText='font:inherit;color:inherit;display:inline-flex;align-items:center';
  sh.querySelector('style').textContent=':host{display:inline-flex;font:inherit;color:inherit}a{display:inline-flex;align-items:center;font:inherit;color:inherit;text-decoration:none;background:transparent;border:0;border-radius:0;padding:0;white-space:nowrap}a:hover{color:inherit}a:focus-visible{outline:3px solid #b9d6ff;outline-offset:4px}';

  let menu=publicNav.querySelector('[data-other-exams]');
  if(!menu){menu=document.createElement('li');menu.dataset.otherExams='';publicNav.append(menu);}
  menu.className='nav-item';menu.dataset.name='다양한 기출';
  menu.innerHTML='<button type="button" class="nav-btn" aria-expanded="false" aria-controls="panel-other-exams">다양한 기출</button><div class="dropdown-panel" id="panel-other-exams" aria-hidden="true"><a href="/other-exams?source=academy">사관학교</a><a href="/other-exams?source=leet">리트</a></div>';
  const menuButton=menu.querySelector('button'),menuPanel=menu.querySelector('.dropdown-panel');
  let menuTimer;
  function closeMenu(){menu.classList.remove('open');menuPanel.setAttribute('aria-hidden','true');menuButton.setAttribute('aria-expanded','false');}
  function openMenu(){clearTimeout(menuTimer);publicNav.querySelectorAll('.nav-item.open').forEach(n=>{if(n===menu)return;n.classList.remove('open');n.querySelector('.nav-btn')?.setAttribute('aria-expanded','false');n.querySelector('.dropdown-panel')?.setAttribute('aria-hidden','true');});menu.classList.add('open');menuPanel.setAttribute('aria-hidden','false');menuButton.setAttribute('aria-expanded','true');}
  menuButton.addEventListener('click',openMenu);
  menu.addEventListener('mouseenter',openMenu);menu.addEventListener('mouseleave',()=>{menuTimer=setTimeout(closeMenu,120);});
  menu.addEventListener('focusout',e=>{if(!menu.contains(e.relatedTarget))closeMenu();});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();menuButton.focus();}if(e.key==='ArrowDown'&&e.target===menuButton){e.preventDefault();openMenu();menuPanel.querySelector('a').focus();}});
  document.addEventListener('click',e=>{if(!menu.contains(e.target))closeMenu();});
  publicNav.append(wrapper);
}else{
  if(document.querySelector('#app .bar')){
    document.querySelector('#app .bar').append(host);
    const start=document.querySelector('#start');
    if(start){
      const line=document.createElement('div');
      line.className='msn-account-start';
      line.append(accountButton('/my',true));
      line.style.cssText='display:inline-flex;align-items:center;margin:0';
      const header=start.querySelector('.sf-header-right');
      if(header)header.append(line);else start.prepend(line);
    }
    const analysis=document.querySelector('.analysis-head');
    if(analysis){
      analysis.append(accountButton('/my#cbt'));
    }
  }else{
    const parent=document.querySelector('.header-actions');
    if(parent)parent.append(host);
    else{
      host.style.cssText='position:absolute;top:18px;right:22px;z-index:10';
      document.body.prepend(host);
    }
  }
}

const a=sh.querySelector('a'),name=sh.querySelector('span');
function update(){
  const s=MSNAccount.info();
  a.href=s.user?'/my':'/auth?returnTo='+encodeURIComponent(location.pathname.startsWith('/mixed-cbt')?location.pathname+location.search:'/my');
  name.textContent=s.user?'내 정보':'로그인';
  a.title=s.user?(s.user.name+' · 내 정보'):'로그인';
  for(const {link,destination} of secondary){link.href=s.user?destination:'/auth?returnTo='+encodeURIComponent(destination);link.textContent=s.user?'내 정보':'로그인';link.title=a.title;}
}
window.addEventListener('msn-account-change',update);
MSNAccount.ready.then(update);
})();
