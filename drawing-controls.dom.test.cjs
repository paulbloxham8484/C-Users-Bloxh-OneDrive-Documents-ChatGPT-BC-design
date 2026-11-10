'use strict';
// DOM integration only: canvas pixels, native dialogs, layout and digitizer behavior are stubbed.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.BC_JSDOM_MODULE||'jsdom');
(async()=>{
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,errors=[];w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
  const noop=()=>{},gradient={addColorStop:noop};
  const ctx=new Proxy({measureText:t=>({width:String(t).length*6,actualBoundingBoxAscent:9,actualBoundingBoxDescent:2}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(t,k)=>t[k]||noop});
  w.HTMLCanvasElement.prototype.getContext=()=>ctx;
  w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,right:1100,bottom:750,width:1100,height:750});
  w.HTMLElement.prototype.scrollIntoView=noop;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.matchMedia=()=>({matches:false,addEventListener:noop,removeEventListener:noop});w.ResizeObserver=class{observe(){}disconnect(){}};
  const captured=new Set();w.HTMLCanvasElement.prototype.setPointerCapture=id=>captured.add(id);w.HTMLCanvasElement.prototype.hasPointerCapture=id=>captured.has(id);w.HTMLCanvasElement.prototype.releasePointerCapture=id=>captured.delete(id);
  const context=dom.getInternalVMContext();const run=s=>vm.runInContext(s,context);
  try {
    for(const file of require('./node-workspace-scripts.cjs')())vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
    await new Promise(r=>setImmediate(r));
    assert.deepEqual(errors,[]);assert.ok(w.document.body.classList.contains('workspace-ready'));
    const set=(id,value)=>{const el=w.document.getElementById(id);assert.ok(el,id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
    set('drawingInputMode','draw');set('drawingSnapGrid','25');set('drawingAngleLock','90');
    assert.equal(run('state.inputSettings.touchMode'),'draw');assert.equal(run('state.inputSettings.grid'),25);assert.equal(run('state.inputSettings.angle'),90);
    const large=w.document.getElementById('drawingLargeControls');large.checked=true;large.dispatchEvent(new w.Event('change'));assert.ok(w.document.querySelector('.workspace').classList.contains('workspace-touch'));
    w.document.getElementById('projectRecoveryButton').click();assert.equal(w.document.getElementById('projectRecoveryDialog').open,true);
    const buttons=()=>[...w.document.querySelectorAll('#projectRecoveryDialog button')];
    buttons().find(b=>b.textContent==='Create checkpoint').click();assert.equal(run('projectRecoveryEntries().length'),1);
    run('withHistory(()=>{state.model.name="Changed project";els.projectName.value="Changed project";});');
    buttons().find(b=>b.textContent==='Restore copy').click();assert.notEqual(run('state.model.name'),'Changed project');assert.equal(run('projectRecoveryEntries().length'),2);
    run('undo()');assert.equal(run('state.model.name'),'Changed project');
    // Use text nodes for project names, including an HTML-looking imported name.
    run('els.projectName.value="<img src=x onerror=alert(1)>";saveProjectCheckpoint();');w.document.getElementById('projectRecoveryButton').click();
    assert.equal(w.document.querySelectorAll('#projectRecoveryList img').length,0);
    buttons().find(b=>b.textContent==='Close').click();assert.equal(w.document.getElementById('projectRecoveryDialog').open,false);
    assert.deepEqual(errors,[]);
    console.log('DOM integration passed: complete source bootstrap, input controls, large targets, recovery create/restore/undo, dialog actions and escaped names. Canvas rendering/native browser behavior untested.');
  }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
