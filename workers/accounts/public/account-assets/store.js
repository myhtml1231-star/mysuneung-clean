/* Account-scoped offline queue. No identity token, session ID or refresh token is persisted here. */
(function(){
'use strict';if(window.MSNAccount)return;
const ls=window.localStorage,EVENT='msn-account-change',PREFIX='msn:v1:',HIST='mysuneung-cbt-learning-history-v2',CURRENT='mysuneung-cbt-current';
const sensitive=k=>k==='admissionFavoriteUniversities'||k==='admissionCompareUniversities'||k===CURRENT||k===HIST||k==='mysuneung-cbt-history'||k.startsWith('mysuneung-cbt-annotations-');
const stable=x=>JSON.stringify(sort(x));function sort(x){if(Array.isArray(x))return x.map(sort);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])]));return x;}
const clone=x=>JSON.parse(JSON.stringify(x));
function read(k,fallback=null){try{const s=ls.getItem(k);return s===null?fallback:JSON.parse(s);}catch{return fallback;}}
let initialized=false,user=null,csrf=null,status='connecting',lastSync=null,message='',locked=false,suppress=false,flushing=false,timer=null,readyResolve;
const ready=new Promise(r=>readyResolve=r);let channel=null;
const namespace=id=>PREFIX+(id||'guest')+':';
const active=()=>namespace(user?.id);
const scoped=k=>user&&sensitive(k)?active()+'cbt:'+k:k;
function emit(){window.dispatchEvent(new CustomEvent(EVENT,{detail:info()}));}
function info(){const uid=user?.id;return {user:clone(user),status,locked,pending:uid?pending(uid).length:0,conflicts:uid?conflicts(uid).length:0,lastSync,message};}
function setState(s,m=''){status=s;message=m;emit();}
function enumerate(prefix){const out=[];for(let i=0;i<ls.length;i++){const k=ls.key(i);if(k?.startsWith(prefix)){const d=read(k);if(d)out.push(d);}}return out;}
const cacheKey=(uid,kind,id)=>namespace(uid)+'record:'+kind+':'+id;
const opKey=(uid,kind,id)=>namespace(uid)+'pending:'+kind+':'+id;
const conflictKey=(uid,kind,id)=>namespace(uid)+'conflict:'+kind+':'+id;
const editSnapshots=new Set();
function beginEdit(kind,id){
 const uid=user?.id||null;if(locked)throw Error('계정을 다시 확인해 주세요.');
 const cached=read(cacheKey(uid,kind,id)),queued=uid&&read(opKey(uid,kind,id));
 const snapshot={owner:uid,kind,id,base_version:queued?.base_version??cached?.version??0};
 editSnapshots.add(snapshot);return snapshot;
}
function endEdit(snapshot){editSnapshots.delete(snapshot);}
function acknowledgeEdit(uid,kind,id,base,version){
 for(const s of editSnapshots)if(s.owner===uid&&s.kind===kind&&s.id===id&&s.base_version===base)s.base_version=version;
}
function saveEdit(snapshot,data){
 if(!snapshot||!editSnapshots.has(snapshot)||locked||(user?.id||null)!==snapshot.owner)throw Error('편집 중 계정이 바뀌었습니다. 원래 계정으로 다시 열어 주세요.');
 save(snapshot.kind,snapshot.id,data,false,snapshot.base_version);
 if(user)projectCBT();
}
const pending=uid=>enumerate(namespace(uid)+'pending:');
const conflicts=uid=>enumerate(namespace(uid)+'conflict:');
function list(kind){if(locked)return [];return enumerate(active()+'record:'+kind+':').filter(r=>!r.deleted).sort((a,b)=>(b.data.at||b.data.checked_at||b.updated_at||0)-(a.data.at||a.data.checked_at||a.updated_at||0));}
function putRaw(key,value){try{ls.setItem(key,JSON.stringify(value));}catch(e){setState('error','브라우저 저장 공간이 부족합니다. 기록을 내보내 보관해 주세요.');throw e;}}
function intent(kind,d){
 if(kind==='university_state')return {items:(d?.items||[]).map(x=>({code:x.code,name:x.name}))};
 if(kind==='attempt')return {id:d.id,at:d.at,mode:d.mode,choice:d.choice||null,details:(d.details||[]).map(r=>({academic_year:r.academic_year,month:r.month,section_code:r.section_code,original_no:r.original_no,selected:r.selected??null})),reasons:d.reasons||{}};
 return d;
}
function save(kind,id,data,deleted=false,expectedVersion){
 if(!['download','attempt','draft','university','annotation','university_state'].includes(kind)||!/^[-\w.:]{1,160}$/.test(id))throw Error('기록 번호가 올바르지 않습니다.');
 const uid=user?.id||null;if(locked)throw Error('계정을 다시 확인한 후 저장해 주세요.');
 const key=cacheKey(uid,kind,id),old=read(key),now=Date.now();
 if(old&&old.deleted===deleted&&stable(intent(kind,old.data))===stable(intent(kind,data)))return;
 if(uid){const prev=read(opKey(uid,kind,id));putRaw(opKey(uid,kind,id),{kind,id,data:clone(data),deleted,base_version:Number.isInteger(expectedVersion)?expectedVersion:(prev?.base_version??old?.version??0),mutation_id:crypto.randomUUID()});schedule();}
 putRaw(key,{kind,id,data:clone(data),version:old?.version||0,deleted,updated_at:now});
 emit();
}
async function api(path,body,method){
 const owner=user?.id;const h={'Accept':'application/json'};if(owner)h['X-MSN-Account']=owner;if(body!==undefined){h['Content-Type']='application/json';h['X-MSN-CSRF']=csrf||'';}
 const r=await fetch('/api/account/'+path,{method:method||(body===undefined?'GET':'POST'),credentials:'same-origin',headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const d=await r.json();if(!r.ok){const e=Error(d.error||'서버에 연결하지 못했습니다.');e.code=d.code;e.status=r.status;
  if((r.status===401||d.code==='ACCOUNT_CHANGED')&&owner===user?.id){user=null;csrf=null;locked=true;setState('locked','계정 연결이 끝났습니다. 저장 대기 기록은 원래 계정에 보관됩니다.');window.dispatchEvent(new Event('msn-account-locked'));}
  throw e;
 }
 if(owner&&owner!==user?.id)throw Error('요청 중 계정이 바뀌었습니다.');
 return d;
}
function acceptIncoming(uid,r){
 const op=read(opKey(uid,r.kind,r.id)),cached=read(cacheKey(uid,r.kind,r.id));
 if(op){
  if(r.version>op.base_version){
   if(r.mutation_id===op.mutation_id||(stable(intent(r.kind,r.data))===stable(intent(op.kind,op.data))&&r.deleted===op.deleted)){acknowledgeEdit(uid,r.kind,r.id,op.base_version,r.version);ls.removeItem(opKey(uid,r.kind,r.id));ls.removeItem(conflictKey(uid,r.kind,r.id));putRaw(cacheKey(uid,r.kind,r.id),r);}
   else putRaw(conflictKey(uid,r.kind,r.id),{kind:r.kind,id:r.id,local:op,remote:r});
  }
 }else if(!cached||r.version>=cached.version)putRaw(cacheKey(uid,r.kind,r.id),r);
}
function projectCBT(){
 if(!user)return;
 suppress=true;let historyChanged=false;
 try{
  const history=list('attempt').map(r=>r.data).sort((a,b)=>b.at-a.at).slice(0,30);
  const serialized=JSON.stringify(history);historyChanged=ls.getItem(scoped(HIST))!==serialized;
  if(historyChanged)ls.setItem(scoped(HIST),serialized);
  const grouped={};for(const r of list('annotation')){const a=r.data;if(!grouped[a.exam_id])grouped[a.exam_id]={};grouped[a.exam_id][a.unit_id]=a.strokes;}
  const projectionPrefix=active()+'cbt:mysuneung-cbt-annotations-';
  const stale=[];for(let i=0;i<ls.length;i++){const k=ls.key(i);if(k?.startsWith(projectionPrefix)&&!grouped[k.slice(projectionPrefix.length)])stale.push(k);}
  for(const k of stale)ls.removeItem(k);
  for(const [id,data] of Object.entries(grouped))ls.setItem(scoped('mysuneung-cbt-annotations-'+id),JSON.stringify(data));
  for(const [id,key] of [['favorites','admissionFavoriteUniversities'],['compare','admissionCompareUniversities']]){
   const state=list('university_state').find(r=>r.id===id);ls.setItem(scoped(key),JSON.stringify((state?.data?.items||[]).map(x=>x.code)));
  }
 }finally{suppress=false;}
 window.dispatchEvent(new Event('msn-university-state-updated'));
 if(historyChanged)window.dispatchEvent(new Event('msn-cbt-history-updated'));
}
async function pull(){
 if(!user)return;const uid=user.id;let cursor=read(namespace(uid)+'cursor',0),pages=0;
 for(;;){const d=await api('records?after='+cursor);if(user?.id!==uid)throw Error('계정이 바뀌었습니다.');for(const r of d.records)acceptIncoming(uid,r);cursor=d.cursor;putRaw(namespace(uid)+'cursor',cursor);pages++;if(!d.has_more)break;if(pages>150)throw Error('기록이 많아 나누어 동기화 중입니다. 다시 동기화해 주세요.');}
 projectCBT();
}
async function flush(){
 if(!user||locked||flushing||!navigator.onLine)return;
 const uid=user.id;
 const execute=async()=>{
  if(user?.id!==uid||locked||flushing)return;
  flushing=true;setState('syncing');
  try{
   await pull();let cycles=0;
   for(;;){const blocked=new Set(conflicts(uid).map(x=>x.kind+':'+x.id));const candidates=pending(uid).filter(x=>!blocked.has(x.kind+':'+x.id));const ops=[];for(const x of candidates){const size=new TextEncoder().encode(JSON.stringify({operations:ops.concat(x)})).length;if(size>480000){if(!ops.length)throw Error('필기 또는 메모가 너무 커서 동기화하지 못했습니다. 내보내기로 보관한 뒤 기록을 줄여 주세요.');break;}ops.push(x);if(ops.length===8)break;}if(!ops.length)break;
    const res=await api('records/batch',{operations:ops});if(user?.id!==uid)throw Error('계정이 바뀌었습니다.');
    for(const result of res.results){const k=opKey(uid,result.kind,result.id),current=read(k),sent=ops.find(x=>x.kind===result.kind&&x.id===result.id);
     if(result.status==='conflict'){putRaw(conflictKey(uid,result.kind,result.id),{kind:result.kind,id:result.id,local:current||sent,remote:result.record});continue;}
     acknowledgeEdit(uid,result.kind,result.id,sent.base_version,result.record.version);
     if(current?.mutation_id===result.mutation_id){ls.removeItem(k);ls.removeItem(conflictKey(uid,result.kind,result.id));putRaw(cacheKey(uid,result.kind,result.id),result.record);}
     else if(current){current.base_version=result.record.version;putRaw(k,current);const local=read(cacheKey(uid,result.kind,result.id));if(local)putRaw(cacheKey(uid,result.kind,result.id),{...local,version:result.record.version});}
    }
    cycles++;if(cycles>400)break;
   }
   await pull();lastSync=Date.now();putRaw(namespace(uid)+'last-sync',lastSync);setState(conflicts(uid).length?'conflict':pending(uid).length?'pending':'saved');
  }catch(e){if(user?.id===uid)setState(navigator.onLine?'error':'offline',e.message);}
  finally{flushing=false;emit();}
 };
 if(navigator.locks)await navigator.locks.request('msn-sync-'+uid,execute);else await execute();
}
function schedule(){if(!user)return;clearTimeout(timer);status=navigator.onLine?'pending':'offline';timer=setTimeout(flush,1200);}
async function refreshSession(){
 const previous=user?.id;
 const r=await fetch('/api/account/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});const d=await r.json();if(!r.ok)throw Error(d.error||'계정을 확인하지 못했습니다.');
 if(initialized&&(previous||null)!==(d.user?.id||null)){user=null;csrf=null;locked=true;window.dispatchEvent(new Event('msn-account-locked'));setState('locked','다른 계정으로 바뀌었거나 로그인이 끝났습니다. 페이지를 다시 열어 주세요.');return d;}
 user=d.user||null;csrf=d.csrf||null;locked=false;
 if(user){lastSync=read(namespace(user.id)+'last-sync');try{await flush();}catch(e){setState('offline',e.message);}}else setState('guest');return d;
}
async function init(){
 try{await refreshSession();}catch(e){if(user)setState('offline','계정은 확인했지만 동기화에 연결하지 못했습니다. 대기 기록은 같은 계정으로만 보냅니다.');else setState('offline','계정을 확인하지 못했습니다. 비로그인 기록은 이 기기에만 보관합니다.');}
 finally{initialized=true;readyResolve(info());emit();}
}
async function logout(all=false,clearLocal=true){
 if(!user)return;await flush();if(pending(user.id).length)throw Error('아직 저장 대기 기록이 있습니다. 동기화하거나 내보낸 뒤 로그아웃해 주세요.');const uid=user.id;await api('logout',{all});user=null;csrf=null;locked=true;
 if(clearLocal){const keys=[];for(let i=0;i<ls.length;i++){const k=ls.key(i);if(k?.startsWith(namespace(uid)))keys.push(k);}for(const k of keys)ls.removeItem(k);}
 channel?.postMessage({type:'auth-changed'});window.dispatchEvent(new Event('msn-account-locked'));setState('guest');
}
function resolve(kind,id,choice){
 if(!user)return;const uid=user.id,x=read(conflictKey(uid,kind,id));if(!x)return;
 if(choice==='remote'){ls.removeItem(opKey(uid,kind,id));if(x.remote)putRaw(cacheKey(uid,kind,id),x.remote);else ls.removeItem(cacheKey(uid,kind,id));}
 else if(choice==='local'){const op={...x.local,base_version:x.remote?.version||0,mutation_id:crypto.randomUUID()};putRaw(opKey(uid,kind,id),op);putRaw(cacheKey(uid,kind,id),{kind,id,data:op.data,version:op.base_version,deleted:op.deleted,updated_at:Date.now()});}
 else return;
 ls.removeItem(conflictKey(uid,kind,id));projectCBT();schedule();emit();
}
function legacyGuest(){
 let attempts=read(HIST);if(!Array.isArray(attempts))attempts=read('mysuneung-cbt-history',[]);if(!Array.isArray(attempts))attempts=[];
 return {attempts:attempts.filter(x=>x&&Array.isArray(x.details)).slice(0,100),downloads:enumerate(namespace(null)+'record:download:').filter(r=>!r.deleted),universities:enumerate(namespace(null)+'record:university:').filter(r=>!r.deleted),current:read(CURRENT)};
}
async function importGuest(selected){
 if(!user||locked)throw Error('로그인이 필요합니다.');const g=legacyGuest(),owner=user.id;
 await flush();if(user?.id!==owner)throw Error('계정을 다시 확인해 주세요.');
 function imported(kind,id,data){
  const remote=read(cacheKey(owner,kind,id));
  if(remote){
   if(!remote.deleted&&stable(intent(kind,remote.data))===stable(intent(kind,data)))return;
   putRaw(conflictKey(owner,kind,id),{kind,id,remote,local:{kind,id,data:clone(data),deleted:false,base_version:remote.version,mutation_id:crypto.randomUUID()}});return;
  }
  save(kind,id,data);
 }
 if(selected.attempts)for(const [i,a] of g.attempts.entries()){const id=/^[-\w.:]{1,160}$/.test(a.id||'')?a.id:'legacy-'+a.at+'-'+i;imported('attempt',id,{...a,id});}
 if(selected.downloads)for(const r of g.downloads)imported('download',r.id,r.data);
 if(selected.universities)for(const r of g.universities)imported('university',r.id,r.data);
 if(selected.current&&g.current?.exam)captureDraft(g.current,imported);
 const exams=new Set();if(selected.attempts)g.attempts.forEach(a=>a.id&&exams.add(a.id));if(selected.current&&g.current?.exam?.id)exams.add(g.current.exam.id);
 for(const id of exams){const drawings=read('mysuneung-cbt-annotations-'+id,{});for(const [unit_id,strokes] of Object.entries(drawings||{}))imported('annotation',id+'.'+unit_id,{exam_id:id,unit_id,strokes});}
 await flush();return info();
}
function captureDraft(x,saver=save){
 if(!x?.exam?.id||!x.exam.sections)return;const e=x.exam;
 const details=e.sections.flatMap(s=>(s.questions||[]).map(q=>({academic_year:s.source.academic_year,month:s.source.month,section_code:s.section_code,original_no:q.original_no,selected:x.answers?.[q.display_no]??null})));
 saver('draft',e.id,{id:e.id,at:Date.now(),mode:e.mode,choice:e.choice,details,current:x.current||0,startedAt:x.startedAt,time_limit_seconds:e.time_limit_seconds});
}
function onCBTWrite(key,value,previous){
 if(suppress||!user)return;
 try{
  if(key===HIST){const hs=JSON.parse(value);if(Array.isArray(hs))for(const a of hs)if(a?.id&&a.details)save('attempt',a.id,a);}
  else if(key===CURRENT){if(value!==null)captureDraft(JSON.parse(value));else {const x=previous&&JSON.parse(previous);if(x?.exam?.id){const r=read(cacheKey(user.id,'draft',x.exam.id));if(r)save('draft',x.exam.id,{},true);}}}
  else if(key.startsWith('mysuneung-cbt-annotations-')&&value!==null){const id=key.slice('mysuneung-cbt-annotations-'.length),units=JSON.parse(value);for(const [uid,strokes] of Object.entries(units||{}))save('annotation',id+'.'+uid,{exam_id:id,unit_id:uid,strokes:strokes.map(s=>({...s,points:s.points.map(p=>({x:Math.round(p.x*100000)/100000,y:Math.round(p.y*100000)/100000}))}))});}
 }catch(e){setState('error','기기에는 저장했지만 계정 동기화 대기 중입니다: '+e.message);}
}
const storage={getItem:k=>locked&&sensitive(k)?null:ls.getItem(scoped(k)),setItem(k,v){if(locked&&sensitive(k))throw Error('로그인이 만료되었습니다. 이전 계정 기록은 다른 계정으로 저장하지 않습니다.');const p=ls.getItem(scoped(k));ls.setItem(scoped(k),v);onCBTWrite(k,v,p);},removeItem(k){if(locked&&sensitive(k))throw Error('계정을 다시 확인해 주세요.');const p=ls.getItem(scoped(k));ls.removeItem(scoped(k));onCBTWrite(k,null,p);},key:i=>ls.key(i),get length(){return ls.length;}};
window.MSNStorage=storage;
window.MSNAccount={ready,info,list,save,beginEdit,endEdit,saveEdit,remove:(kind,id)=>save(kind,id,{},true),api,sync:flush,logout,resolve,conflicts:()=>user?conflicts(user.id):[],guest:legacyGuest,importGuest,refresh:refreshSession,
 exportData:()=>({version:1,exported_at:new Date().toISOString(),account:user?{id:user.id,name:user.name}:null,records:['download','attempt','draft','university','annotation','university_state'].flatMap(list),pending:user?pending(user.id):[],conflicts:user?conflicts(user.id):[]}),notify:emit};
try{channel=new BroadcastChannel('mysuneung-account-events');channel.onmessage=e=>{if(e.data?.type==='auth-changed')location.reload();};}catch{}
window.addEventListener('online',()=>{if(user)flush();else refreshSession().catch(()=>{});});
window.addEventListener('offline',()=>setState('offline','연결이 복구되면 같은 계정으로 다시 동기화합니다.'));
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&user)flush();});
setInterval(()=>{if(document.visibilityState==='visible'&&user&&navigator.onLine&&!locked)flush();},30000);
window.addEventListener('storage',e=>{if(user&&e.key?.startsWith(namespace(user.id))){emit();} });
// Only link activation is recorded; browsers do not disclose successful filesystem saves.
async function track(e){if(status==='connecting')await ready;if(locked)return;const owner=user?.id||null;const a=e.target.closest?.('a[href]');if(!a||a.dataset.noTrack!==undefined)return;let u;try{u=new URL(a.href,location.href);}catch{return;}
 if(!/\.(pdf|zip|mp3|png)(?:$)/i.test(u.pathname))return;
 if(!['mysuneung.com','www.mysuneung.com','wdown.ebsi.co.kr','ebsi.co.kr','www.ebsi.co.kr'].includes(u.hostname)&&!u.hostname.endsWith('.r2.dev'))return;
 try{const bytes=new TextEncoder().encode(u.href),digest=await crypto.subtle.digest('SHA-256',bytes);const id=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');if(locked||(user?.id||null)!==owner)return;save('download',id,{url:u.href,title:((a.textContent||'').trim().length>8?a.textContent:document.title+' · '+(a.textContent||'기출')).trim().slice(0,180),page:location.href,at:Date.now(),file_type:u.pathname.split('.').pop().toUpperCase()});}catch{}
}
document.addEventListener('click',track,true);document.addEventListener('auxclick',e=>{if(e.button===1)track(e);},true);
init();
})();
