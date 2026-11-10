'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),recovery=require('./project-recovery.js');
const store=()=>{const data=new Map();return{data,getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}};
test('checkpoint retention is bounded, newest first, and consecutive duplicates coalesce',()=>{
  const s=store();for(let i=0;i<12;i++)recovery.save(s,JSON.stringify({name:'Project '+i}), 'Manual',new Date(2026,0,1,0,i));
  const rows=recovery.list(s);assert.equal(rows.length,8);assert.equal(rows[0].name,'Project 11');assert.equal(rows[7].name,'Project 4');
  recovery.save(s,rows[0].raw,'Duplicate');assert.deepEqual(recovery.list(s),rows);
});
test('quota failure leaves all existing checkpoints intact',()=>{
  const s=store();recovery.save(s,'{"name":"Keep me"}','Manual');const before=s.getItem(recovery.key);s.setItem=()=>{throw Error('Quota exceeded')};
  assert.throws(()=>recovery.save(s,'{"name":"New"}','Manual'));assert.equal(s.getItem(recovery.key),before);
});
test('unreadable original data is preserved verbatim for export',()=>{
  const s=store(),raw='{\u0000 broken autosave';recovery.save(s,raw,'Previous autosave');assert.equal(recovery.list(s)[0].raw,raw);
});
test('corrupt checkpoint stores and oversized copies are never silently overwritten',()=>{
  const s=store();s.setItem(recovery.key,'{broken');assert.throws(()=>recovery.save(s,'{}','Manual'));assert.equal(s.getItem(recovery.key),'{broken');
  s.data.clear();recovery.save(s,'{"name":"Keep"}','Manual');const before=s.getItem(recovery.key);assert.throws(()=>recovery.save(s,'x'.repeat(1500000),'Manual'));assert.equal(s.getItem(recovery.key),before);
});
