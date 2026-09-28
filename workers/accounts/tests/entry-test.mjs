import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {createHandler} from '../reports/worker-check.mjs';
import {makeEnv,ROOT} from './fixtures.mjs';
const env=makeEnv(),handler=createHandler(),tests=[];
try{
 for(const path of ['/api/account/health','/api/account/config','/api/account/session','/auth','/my','/account/connect','/account/privacy','/account/terms','/account-assets/store.js?v=accounts-ui-20260927-r5']){
  const r=await handler.fetch(new Request('https://mysuneung.com'+path),env);assert.equal(r.status,200,path);
  if(path==='/api/account/health'){const d=await r.json();assert.equal(d.ready,true);assert.equal(d.client_revision,'accounts-ui-20260927-r5');}
  if(!path.startsWith('/account-assets/'))assert.match(r.headers.get('cache-control'),/no-store/);
  tests.push(path+' responds with expected privacy headers');
 }
 assert.ok(fs.readFileSync(path.join(ROOT,'public/account-assets/workspace.html'),'utf8').includes('store.js?v=accounts-ui-20260927-r5'));
 assert.ok(fs.readFileSync(path.join(ROOT,'cbt-account.html'),'utf8').includes('store.js?v=accounts-ui-20260927-r5'));
 tests.push('CBT and workspace share the same versioned account store');
}finally{env.DB.raw.close();}
fs.writeFileSync(path.join(ROOT,'reports/entry-tests.json'),JSON.stringify({scope:'isolated module tests',tests,errors:[]},null,2));
console.log('ENTRY_PASS',tests.length);
