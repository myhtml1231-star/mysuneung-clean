import {build} from 'esbuild';
await build({entryPoints:['src/auth-client.mjs'],bundle:true,minify:true,format:'iife',platform:'browser',target:['es2022'],outfile:'public/account-assets/auth.js',legalComments:'none'});
await build({entryPoints:['src/index.mjs'],bundle:true,format:'esm',platform:'neutral',target:['es2022'],outfile:'reports/worker-check.mjs',conditions:['workerd','worker','browser']});
console.log('ACCOUNT_CLIENT_AND_WORKER_BUILT');
