(function(){
'use strict';
if(window.__mysuneungVisitClientLoaded)return;
window.__mysuneungVisitClientLoaded=true;
const script=document.currentScript;
const source=(script&&script.dataset.visitSource)||(
 location.hostname.endsWith('universitypredict.com')?'university':
 location.pathname.startsWith('/mixed-cbt')?'cbt':'main'
);
const DATE_KEY='visit-last-count-date',MONTH_KEY='visit-last-count-month';
function keys(){
 const d=new Date(Date.now()+9*3600000),y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,'0'),day=String(d.getUTCDate()).padStart(2,'0');
 return {day:y+'-'+m+'-'+day,month:y+'-'+m};
}
function render(d){
 const a=document.getElementById('visit-today'),b=document.getElementById('visit-month'),c=document.getElementById('visit-month-label');
 if(a)a.textContent=d.today;if(b)b.textContent=d.month;if(c)c.textContent=d.month_key+' 누적 방문';
}
async function ping(){
 const k=keys(),already=localStorage.getItem(DATE_KEY)===k.day;
 // Claim the day synchronously so legacy same-origin counters cannot race this request.
 if(!already)localStorage.setItem(DATE_KEY,k.day);
 try{
  const r=await fetch('https://mysuneung.com/api/visit',{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,already_counted:already})});
  if(!r.ok)throw Error('visit '+r.status);
  const d=await r.json();if(!d.ok)throw Error('visit failed');
  localStorage.setItem(DATE_KEY,d.day);localStorage.setItem(MONTH_KEY,d.month_key);render(d);
  window.dispatchEvent(new CustomEvent('mysuneung-visit',{detail:d}));
 }catch(e){
  if(!already&&localStorage.getItem(DATE_KEY)===k.day)localStorage.removeItem(DATE_KEY);
 }
}
function schedule(){
 const now=Date.now(),k=new Date(now+9*3600000);
 const next=Date.UTC(k.getUTCFullYear(),k.getUTCMonth(),k.getUTCDate()+1)-9*3600000;
 setTimeout(function(){ping().finally(schedule)},Math.max(1000,next-now+500));
}
ping();schedule();
})();
