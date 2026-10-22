import fs from 'node:fs/promises';import vm from 'node:vm';
const dir=new URL('./release/data/vocational/20261023-v1/ui/',import.meta.url);let html=0,scripts=0;
for(const name of await fs.readdir(dir)){if(!name.endsWith('.html'))continue;const source=await fs.readFile(new URL(name,dir),'utf8');for(const match of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(/application\/json|src=/.test(match[1]))continue;new vm.Script(match[2],{filename:name});scripts++;}html++;}
console.log({html,scripts,syntax_verified:true});
