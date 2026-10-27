const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
// Fresh Edge context; runs against the standalone workspace or the Expo shell.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let ui=page,expoShell=false;
  const field=key=>ui.locator('[data-field="'+key+'"]');
  async function edit(key,value){await field(key).fill(String(value));await field(key).press('Tab');}
  async function expand(id){await ui.locator(id).evaluate(el=>el.closest('details').open=true);}
  async function download(id){const wait=page.waitForEvent('download');await ui.locator(id).click();const d=await wait;return fs.readFile(await d.path(),'utf8');}
  async function enter(){
    await page.goto(process.env.BC_EXPO_URL||process.env.BC_TEST_URL||'http://127.0.0.1:4180/?build=clearances38');
    await page.locator('#bc-design-workspace, #designCanvas').waitFor();
    if(await page.locator('#bc-design-workspace').count()){expoShell=true;ui=await(await page.locator('#bc-design-workspace').elementHandle()).contentFrame();assert.ok(ui);await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);assert.equal(await ui.evaluate(()=>window.BC_DESIGN_EMBEDDED),true);}
    await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);
  }
  try {
    await enter();await ui.locator('#loadExampleButton').click();const model=await ui.evaluate(()=>clone(state.model));
    const ground=model.activeLevelId;model.levels.push({id:'test-upper',name:'Upper',elevation:3000});
    function item(id,x,z,level=ground,complete=true){return {id,levelId:level,kind:'fixture',system:'other',name:id,center:{x,y:7000},elevation:z,partType:'Test enclosure',size:'',material:'',manufacturer:'',productCode:'',designRef:'',notes:'',routeId:'',ports:[],envelope:complete?{width:'1000',depth:'800',height:'600',rotation:'0',left:'0',right:'0',front:'0',back:'0',below:'0',above:'0',sourceRef:'Test product drawing',clearanceRef:'Test clearance drawing',notes:''}:null};}
    model.serviceItems=[item('Box A',9500,0),item('Box B',10000,200),item('Box C',9500,1000,'test-upper'),item('No dimensions',12500,0,ground,false)];
    await ui.locator('#fileInput').setInputFiles({name:'clearance-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
    await ui.waitForFunction(()=>state.model.serviceItems.length===4);await expand('#serviceClearanceSchedule');
    assert.match(await ui.locator('#serviceClearanceSchedule').innerText(),/1 volume overlaps/);
    assert.match(await ui.locator('#serviceClearanceSchedule').innerText(),/2 plan-only overlaps/);
    assert.match(await ui.locator('#serviceClearanceSchedule').innerText(),/1 items not assessed/);
    assert.match(await ui.locator('#serviceClearanceSchedule').innerText(),/No dimensions/);
    assert.equal(await ui.evaluate(()=>serviceClearanceChecks().pairs.find(p=>p.status==='Volume overlap').volume),160000000);
    await ui.locator('#serviceClearanceSchedule .foundation-schedule-row').filter({hasText:'Volume overlap'}).locator('button').last().click();
    assert.equal(await field('name').inputValue(),'Box B');
    await edit('elevation',2300);assert.equal(await ui.evaluate(()=>serviceClearanceChecks().pairs.filter(p=>p.status==='Volume overlap').length),0);
    await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>serviceClearanceChecks().pairs.filter(p=>p.status==='Volume overlap').length),1);
    await ui.locator('#redoButton').click();await ui.locator('#undoButton').click();
    for(const layer of ['serviceEnvelopes','serviceClearances','serviceFixtures','serviceConnections'])await ui.locator('[data-layer="'+layer+'"]').uncheck();
    const unchanged=await ui.evaluate(()=>JSON.stringify([state.model,quantityData(),serviceClearanceChecks().pairs.map(p=>[p.status,p.area,p.height,p.gap,p.volume])]));
    for(const mode of ['plan','3d']){
      await ui.locator('[data-mode="'+mode+'"]').click();
      const visible=await ui.locator('#designCanvas').screenshot();await ui.locator('[data-layer="serviceClearanceChecks"]').uncheck();
      assert.ok(!visible.equals(await ui.locator('#designCanvas').screenshot()),mode+' overlap overlay is independently visible');
      await ui.locator('[data-layer="serviceClearanceChecks"]').check();
      assert.equal(await ui.evaluate(()=>JSON.stringify([state.model,quantityData(),serviceClearanceChecks().pairs.map(p=>[p.status,p.area,p.height,p.gap,p.volume])])),unchanged);
    }
    await ui.locator('#levelVisibility').evaluate(el=>el.closest('details').open=true);
    await ui.locator('[data-visible-level="test-upper"]').uncheck();assert.equal(await ui.evaluate(()=>serviceClearanceChecks().pairs.length),3);
    await ui.locator('[data-visible-level="test-upper"]').check();
    await expand('#serviceClearanceSchedule');await ui.locator('#serviceClearanceSchedule .foundation-schedule-row').filter({hasText:'Volume overlap'}).locator('button').last().click();
    assert.equal(await ui.evaluate(()=>state.mode),'3d');assert.match(await ui.locator('#selectionDetails').innerText(),/Volume overlap/);
    const csv=await download('#serviceClearanceCsvButton');assert.match(csv,/160000000/);assert.match(csv,/Plan overlap only/);assert.match(csv,/Not assessed/);
    await expand('#materialReferenceList');assert.equal(await ui.locator('#materialReferenceList a').count(),13);
    for(const code of ['8032264','0390072','0710090'])await ui.locator('[data-add-material="'+code+'"]').click();
    assert.deepEqual(await ui.evaluate(()=>(state.model.specifications||[]).filter(s=>s.productCode).map(s=>s.productCode)),['8032264','0390072','0710090']);
    const saved=JSON.parse(await download('#saveButton'));
    await ui.locator('#fileInput').setInputFiles({name:'clearance-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await ui.waitForFunction(()=>state.statusMessage==='Project JSON opened');assert.equal(await ui.evaluate(()=>serviceClearanceChecks().pairs.length),3);
    const bad=structuredClone(saved);bad.serviceItems[0].envelope.left='-1';const beforeBad=await ui.evaluate(()=>JSON.stringify(state.model));
    await ui.locator('#fileInput').setInputFiles({name:'invalid-clearance.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
    await ui.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));assert.equal(await ui.evaluate(()=>JSON.stringify(state.model)),beforeBad);
    await ui.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');
    await page.reload();if(expoShell){await page.locator('#bc-design-workspace').waitFor();ui=await(await page.locator('#bc-design-workspace').elementHandle()).contentFrame();}
    await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);assert.equal(await ui.evaluate(()=>serviceClearanceChecks().pairs.length),3);
    assert.deepEqual(await ui.evaluate(()=>state.model.serviceItems),saved.serviceItems);
    await ui.locator('[data-mode="3d"]').click();await expand('#serviceClearanceSchedule');
    await ui.locator('#isolateServiceClearanceChecksButton').click();
    assert.equal(await ui.locator('[data-layer="serviceEnvelopes"]').isChecked(),false);
    assert.equal(await ui.locator('[data-layer="serviceClearanceChecks"]').isChecked(),true);
    assert.equal(await ui.evaluate(()=>serviceClearanceChecks().pairs.length),3);
    await ui.locator('#serviceClearanceSchedule').evaluate(el=>el.closest('section').scrollIntoView({block:'start'}));
    await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});
    const suffix=expoShell?'-expo':'';await page.screenshot({path:path.join(__dirname,'test-results','service-clearances-3d'+suffix+'.png')});
    await ui.locator('[data-mode="plan"]').click();await page.screenshot({path:path.join(__dirname,'test-results','service-clearances-plan'+suffix+'.png')});
    assert.ok(await ui.locator('.inspector').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
    console.log('Clearance browser test passed'+(expoShell?' through Expo':'')+': volume/plan-only/missing results, edits/undo, independent overlays, level checks, schedule selection, CSV, new Bunnings references, JSON and reload; no page errors.');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
