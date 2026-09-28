import assert from 'node:assert/strict';
import {handleVisit} from '../src/visits.mjs';
import {makeEnv} from './fixtures.mjs';

const env=makeEnv();
const k=new Date(Date.now()+9*3600000),day=k.getUTCFullYear()+'-'+String(k.getUTCMonth()+1).padStart(2,'0')+'-'+String(k.getUTCDate()).padStart(2,'0'),month=day.slice(0,7);
let state={lastUpdateDate:day,lastUpdateMonth:month,today:6,month:403},version=1,writes=0;
const mockFetch=async(url,init={})=>{
 assert.equal(String(url),'https://mysuneung-default-rtdb.firebaseio.com/visits.json');
 const method=init.method||'GET';
 if(method==='GET')return new Response(JSON.stringify(state),{status:200,headers:{'Content-Type':'application/json','ETag':'"v'+version+'"'}});
 if(method==='PUT'){
  const tag=new Headers(init.headers).get('If-Match');
  if(tag!=='"v'+version+'"')return new Response('',{status:412});
  state=JSON.parse(init.body);version++;writes++;return new Response(JSON.stringify(state),{status:200,headers:{ETag:'"v'+version+'"'}});
 }
 throw Error('unexpected firebase method');
};
const req=(origin,source,{ip='203.0.113.10',ua='TestBrowser/1',already=false,method='POST'}={})=>new Request('https://mysuneung.com/api/visit',{method,headers:{
 Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip,'User-Agent':ua,'Accept-Language':'ko-KR','Sec-CH-UA':'"Test";v="1"','Sec-CH-UA-Platform':'"macOS"'
},...(method==='POST'?{body:JSON.stringify({source,already_counted:already})}:{})});

let r=await handleVisit(req('https://mysuneung.com','main'),env,mockFetch),j=await r.json();
assert.equal(r.status,200);assert.equal(j.counted,true);assert.equal(j.today,7);assert.equal(j.month,404);assert.equal(writes,1);

r=await handleVisit(req('https://universitypredict.com','university'),env,mockFetch);j=await r.json();
assert.equal(j.counted,false);assert.equal(j.duplicate,true);assert.equal(j.today,7);assert.equal(writes,1);
assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://universitypredict.com');

r=await handleVisit(req('https://mysuneung.com','cbt',{ua:'AnotherBrowser/2'}),env,mockFetch);j=await r.json();
assert.equal(j.counted,true);assert.equal(j.today,8);assert.equal(j.month,405);assert.equal(writes,2);

r=await handleVisit(req('https://mysuneung.com','main',{ip:'203.0.113.20',ua:'LegacyBrowser/1',already:true}),env,mockFetch);j=await r.json();
assert.equal(j.counted,false);assert.equal(j.today,8);assert.equal(writes,2);
r=await handleVisit(req('https://universitypredict.com','university',{ip:'203.0.113.20',ua:'LegacyBrowser/1'}),env,mockFetch);j=await r.json();
assert.equal(j.counted,false);assert.equal(j.today,8);assert.equal(writes,2);

r=await handleVisit(req('https://universitypredict.com','university',{method:'OPTIONS'}),env,mockFetch);
assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://universitypredict.com');

r=await handleVisit(req('https://evil.example','main'),env,mockFetch);
assert.equal(r.status,403);

const rows=env.DB.raw.prepare('SELECT day,visitor_hash,first_source,counted FROM visitor_daily ORDER BY first_seen').all();
assert.equal(rows.length,3);assert.deepEqual(rows.map(x=>x.counted),[1,1,1]);
console.log('VISIT_PASS 14', {today:state.today,month:state.month,writes,rows:rows.length});
env.DB.raw.close();
