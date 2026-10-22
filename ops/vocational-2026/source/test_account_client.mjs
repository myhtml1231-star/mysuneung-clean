import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=await fs.readFile(new URL('./release/data/vocational/20261023-v1/ui/account-store.js',import.meta.url),'utf8');
class Storage{data=new Map();get length(){return this.data.size;}getItem(k){return this.data.has(k)?this.data.get(k):null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}key(i){return [...this.data.keys()][i]??null;}}
const storage=new Storage(),server=new Map();let active='account-a',hold=false;
function record(id,slug,section){return {id,at:Date.now(),subject_key:slug,subject:slug==='lang-japanese'?'日本語':'농업 이해',mode:'custom',details:[{academic_year:2027,month:9,section_code:section,original_no:1,selected:2}],score:0,total:1,percent:0};}
server.set('account-a',[{kind:'attempt',id:'seed-a',version:1,updated_at:Date.now(),deleted:false,data:record('seed-a','lang-japanese','l16g3')}]);server.set('account-b',[]);
async function boot(){
 const listeners=new Map(),events=[];
 const window={localStorage:storage,addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>events.push(event.type)};
 const fakeFetch=async(url,options={})=>{
  if(url==='/api/account/session')return Response.json({ok:true,user:{id:active,name:active},csrf:'test'});
  const owner=options.headers?.['X-MSN-Account'];assert.equal(owner,active,'request must name current account');
  if(url.startsWith('/api/account/records?'))return Response.json({records:server.get(owner),cursor:1,has_more:false});
  if(url==='/api/account/records/batch'){
   if(hold)throw Error('offline test');
   const payload=JSON.parse(options.body),results=[];
   for(const op of payload.operations){const old=server.get(owner).find(r=>r.kind===op.kind&&r.id===op.id),saved={...op,version:(old?.version||0)+1,updated_at:Date.now()};server.set(owner,server.get(owner).filter(r=>r.kind!==op.kind||r.id!==op.id).concat(saved));results.push({kind:op.kind,id:op.id,mutation_id:op.mutation_id,status:'saved',record:saved});}
   return Response.json({results});
  }
  throw Error('Unexpected request '+url);
 };
 const document={visibilityState:'visible',addEventListener(){},title:'Test'};
 const context=vm.createContext({window,document,location:{href:'https://example.test/',reload(){}},navigator:{onLine:true},fetch:fakeFetch,Response,AbortSignal,URL,TextEncoder,crypto,Event,CustomEvent:class extends Event{constructor(type,init){super(type);this.detail=init?.detail;}},setTimeout:()=>1,clearTimeout(){},setInterval(){},Date,console});
 vm.runInContext(code,context);await window.MSNAccount.ready;return {window,listeners,events};
}
let a=await boot();assert.equal(a.window.MSNAccount.info().user.id,'account-a');
const hist='mysuneung-lang-japanese-cbt-learning-history-v2';
assert.equal(JSON.parse(a.window.MSNStorage.getItem(hist))[0].id,'seed-a');
assert.equal(JSON.parse(a.window.MSNStorage.getItem('mysuneung-cbt-learning-history-v2')).length,0);
const attempt=record('new-a','lang-japanese','l16g3');a.window.MSNStorage.setItem(hist,JSON.stringify([attempt]));await a.window.MSNAccount.sync();assert(server.get('account-a').some(r=>r.id==='new-a'));
const current='mysuneung-lang-japanese-cbt-current-v2',exam={id:'draft-a',subject:'일본어Ⅰ',subject_key:'lang-japanese',mode:'custom',time_limit_seconds:300,sections:[{section_code:'l16g3',source:{academic_year:2027,month:9},questions:[{original_no:1,display_no:1}]}]};
a.window.MSNStorage.setItem(current,JSON.stringify({exam,answers:{1:3},current:0,startedAt:Date.now(),session:{status:'paused',remaining_ms:123000}}));await a.window.MSNAccount.sync();assert.equal(server.get('account-a').find(r=>r.id==='draft-a').data.details[0].selected,3);
const annotation='mysuneung-lang-japanese-cbt-annotations-draft-a',unit='g3-2027-09-lang-japanese-q01';a.window.MSNStorage.setItem(annotation,JSON.stringify({[unit]:[{tool:'pen',color:'#000000',size:2,points:[{x:.1,y:.2}]}]}));await a.window.MSNAccount.sync();assert(server.get('account-a').some(r=>r.kind==='annotation'&&r.data.unit_id===unit));
hold=true;a.window.MSNStorage.setItem(hist,JSON.stringify([record('queued-a','lang-japanese','l16g3')]));assert(a.window.MSNAccount.info().pending>0);
active='account-b';await a.window.MSNAccount.refresh();assert(a.window.MSNAccount.info().locked);assert.equal(a.window.MSNStorage.getItem(hist),null);assert.throws(()=>a.window.MSNStorage.setItem(current,'{}'));
hold=false;const b=await boot();assert.equal(b.window.MSNAccount.info().user.id,'account-b');assert.equal(JSON.parse(b.window.MSNStorage.getItem(hist)).length,0);assert.equal(b.window.MSNStorage.getItem(current),null);assert.equal(b.window.MSNStorage.getItem(annotation),null);await b.window.MSNAccount.sync();assert.equal(server.get('account-b').length,0);assert(storage.getItem('msn:v1:account-a:pending:attempt:queued-a'));
active='account-a';a=await boot();await a.window.MSNAccount.sync();assert(server.get('account-a').some(r=>r.id==='queued-a'));assert.equal(server.get('account-b').length,0);
const report={history_sync:true,draft_sync:true,annotation_sync:true,separate_subject_projection:true,account_switch_locks_old_page:true,offline_queue_keeps_original_owner:true,other_account_receives_no_records:true};
await fs.writeFile(new URL('./release/account-client-verification.json',import.meta.url),JSON.stringify(report,null,2));console.log(report);
