'use strict';
// Service-worker logic with an in-memory Cache API. Real browser offline restart is a separate gate.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  const scope='https://example.test/bc-design/',cacheData=new Map(),handlers={},deleted=[];
  const absolute=r=>new URL(typeof r==='string'?r:r.url,scope).href;
  const caches={keys:async()=>[...cacheData.keys()],delete:async key=>{deleted.push(key);return cacheData.delete(key);},open:async name=>{
    if(!cacheData.has(name))cacheData.set(name,new Map());const data=cacheData.get(name);
    return{addAll:async files=>{for(const f of files){const url=new URL(f,scope),file=url.pathname.slice('/bc-design/'.length)||'index.html';assert.ok(fs.existsSync(file),'Offline asset missing: '+file);data.set(absolute(f),{ok:true,text:fs.readFileSync(file,'utf8')});}},match:async r=>data.get(absolute(r)),put:async(r,value)=>data.set(absolute(r),value)};
  }};
  const context=vm.createContext({URL,caches,self:{registration:{scope},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){},clients:{claim(){}}},fetch:async()=>{throw Error('Simulated offline');}});
  vm.runInContext(fs.readFileSync('sw.js','utf8'),context);const name=vm.runInContext('CACHE_NAME',context),prefix=vm.runInContext('CACHE_PREFIX',context);
  let pending;handlers.install({waitUntil:p=>pending=p});await pending;
  cacheData.set(prefix+'old',new Map());cacheData.set('another-app',new Map());handlers.activate({waitUntil:p=>pending=p});await pending;
  assert.deepEqual(deleted,[prefix+'old']);assert.ok(cacheData.has('another-app'));
  const request=async(url,mode='cors')=>{let response;handlers.fetch({request:{url,method:'GET',mode},respondWith:p=>response=p,waitUntil(){}});return response;};
  assert.ok((await request(scope,'navigate')).text.includes('BC Design'));
  for(const [,asset] of fs.readFileSync('index.html','utf8').matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^" ]+)?)"/g))assert.ok((await request(new URL(asset,scope).href))?.text,asset);
  assert.equal(await request('https://other.test/project.json'),undefined);assert.equal(await request(scope+'private-project.json'),undefined);
  assert.ok(cacheData.has(name));console.log('Offline shell simulation passed: installed assets, cached navigation/scripts/styles with network unavailable, scoped cleanup, unrelated requests untouched. Browser offline restart untested.');
})().catch(e=>{console.error(e);process.exitCode=1;});
