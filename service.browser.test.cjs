const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
// Isolated temporary browser context: never touches the user's browser profile or projects.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const field=(key)=>page.locator('[data-field="'+key+'"]');
  async function edit(key,value){await field(key).fill(String(value));await field(key).press('Tab');}
  async function tap(x,y){const box=await page.locator('#designCanvas').boundingBox();await page.mouse.click(box.x+box.width*x,box.y+box.height*y);}
  async function csv(button){const wait=page.waitForEvent('download');await page.locator(button).click();const d=await wait;return fs.readFile(await d.path(),'utf8');}
  async function showSchedule(id){await page.locator(id).evaluate(el=>el.closest('details').open=true);}
  try{
    await page.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:4180/workspace/index.html?build=clearances38');await prepareWorkspace(page);
    await page.locator('#loadExampleButton').click();
    const levelElevation=await page.evaluate(()=>activeLevel().elevation);
    await page.locator('[data-tool="service"]').click();
    const box=await page.locator('#designCanvas').boundingBox();
    await page.mouse.move(box.x+box.width*.75,box.y+box.height*.8);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.9,box.y+box.height*.8,{steps:10});await page.mouse.up();
    assert.equal(await page.evaluate(()=>state.model.services.length),1);
    await field('system').selectOption('drainage');await edit('endElevation',-2000);
    let g=await page.evaluate(()=>serviceGeometry(state.model.services[0]));assert.ok(g.length>g.plan);assert.equal(g.rise,-2000-levelElevation);

    // Route draft is not persisted/committed until Finish; Escape cancels.
    // Keep fixture clicks clear of the floating bottom-right zoom controls.
    await page.locator('[data-tool="service-route"]').click();await tap(.72,.45);await tap(.90,.45);await tap(.90,.70);
    assert.equal(await page.evaluate(()=>state.model.services.length),1);
    assert.equal(await page.locator('#finishDeckButton').innerText(),'Finish route');
    await page.locator('#finishDeckButton').click();
    assert.equal(await page.evaluate(()=>state.model.services[1].points.length),3);
    await edit('name','Stormwater run');await field('system').selectOption('drainage');
    await edit('point-1-z',-1000);await edit('endElevation',-2000);
    const routeId=await page.evaluate(()=>state.model.services[1].id);
    let points=await page.evaluate(()=>state.model.services[1].points);
    const measured=points.slice(1).reduce((n,b,i)=>n+Math.hypot(b.x-points[i].x,b.y-points[i].y,b.z-points[i].z),0);
    assert.equal(await page.evaluate(()=>serviceGeometry(state.model.services[1]).length),measured);
    await page.locator('[data-action="service-insert-point"][data-index="0"]').click();
    assert.equal(await page.evaluate(()=>state.model.services[1].points.length),4);
    await page.locator('[data-action="service-remove-point"][data-index="1"]').click();
    assert.equal(await page.evaluate(()=>state.model.services[1].points.length),3);
    await page.locator('[data-action="service-append"]').click();
    assert.equal(await page.evaluate(()=>state.model.services[1].points.length),4);
    await page.locator('#undoButton').click();await page.locator('#redoButton').click();await page.locator('#undoButton').click();
    assert.equal(await page.evaluate(()=>state.model.services[1].points.length),3);
    await page.locator('[data-tool="service-route"]').click();await tap(.5,.8);await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>state.serviceDraft.length),0);
    assert.equal(await page.evaluate(()=>state.model.services.length),2);

    await page.locator('[data-tool="service-fitting"]').click();await tap(.9,.65);
    await edit('name','Bend record');await field('system').selectOption('drainage');await edit('partType','Bend');
    await edit('elevation',-1000);await field('routeId').selectOption(routeId);
    await edit('manufacturer','Project supplier');await edit('productCode','TBC-01');await edit('designRef','Designer drawing pending');
    const fittingId=await page.evaluate(()=>state.model.serviceItems[0].id);
    await page.locator('[data-tool="service-fixture"]').click();await tap(.65,.9);
    await edit('name','Floor waste record');await field('system').selectOption('drainage');await edit('partType','Floor waste');
    await edit('elevation',-500);
    const fixtureId=await page.evaluate(()=>state.model.serviceItems[1].id);
    await showSchedule('#serviceSchedule');await showSchedule('#serviceItemSchedule');
    assert.match(await page.locator('#serviceSchedule').innerText(),/Stormwater run/);
    assert.match(await page.locator('#serviceItemSchedule').innerText(),/Bend record/);
    assert.match(await page.locator('#serviceItemSchedule').innerText(),/Floor waste/);
    assert.match(await csv('#serviceCsvButton'),/Segment count/);
    assert.match(await csv('#serviceSegmentCsvButton'),/Start elevation mm/);
    assert.match(await csv('#serviceItemCsvButton'),/TBC-01/);

    // Each of the six service layers is independent from counts and length totals.
    const totals=await page.evaluate(()=>JSON.stringify(serviceQuantityRows()));
    for(const mode of ['3d','plan']){
      await page.locator('[data-mode="'+mode+'"]').click();
      for(const layer of ['service-drainage','serviceFittings','serviceFixtures']){
        const visible=await page.locator('#designCanvas').screenshot();
        await page.locator('[data-layer="'+layer+'"]').uncheck();
        const hidden=await page.locator('#designCanvas').screenshot();
        assert.ok(!visible.equals(hidden),mode+' '+layer+' changes rendering');
        assert.equal(await page.evaluate(()=>JSON.stringify(serviceQuantityRows())),totals);
        await page.locator('[data-layer="'+layer+'"]').check();
      }
    }
    // Saved file and actual file-input round trip; invalid file must leave current data intact.
    const saved=JSON.parse(await csv('#saveButton'));
    assert.equal(saved.schema,30);assert.equal(saved.services[1].points.length,3);assert.equal(saved.serviceItems.length,2);
    await page.locator('#fileInput').setInputFiles({name:'service-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>state.model.serviceItems?.length===2&&state.model.services?.[1]?.points.length===3);
    assert.deepEqual(await page.evaluate(()=>state.model.services),saved.services);
    const invalid=structuredClone(saved);invalid.services[1].points[1]=invalid.services[1].points[0];
    const intact=await page.evaluate(()=>JSON.stringify(state.model));
    await page.locator('#fileInput').setInputFiles({name:'invalid-service.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
    await page.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));
    assert.equal(await page.evaluate(()=>JSON.stringify(state.model)),intact);
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');
    await page.reload();
    assert.deepEqual(await page.evaluate(()=>state.model.services),saved.services);
    assert.deepEqual(await page.evaluate(()=>state.model.serviceItems),saved.serviceItems);

    // Selection, item delete/undo/redo, and a route reference that survives deletion.
    await showSchedule('#serviceItemSchedule');
    await page.locator('[data-service-item-id="'+fixtureId+'"]').click();
    await page.locator('[data-action="delete"]').click();assert.equal(await page.evaluate(()=>state.model.serviceItems.length),1);
    await page.locator('#undoButton').click();await page.locator('#redoButton').click();await page.locator('#undoButton').click();
    assert.equal(await page.evaluate(()=>state.model.serviceItems.length),2);
    await showSchedule('#serviceSchedule');await page.locator('[data-service-id="'+routeId+'"]').click();
    await page.locator('[data-action="delete"]').click();
    assert.equal(await page.evaluate(()=>state.model.serviceItems.length),2);
    await page.locator('[data-service-item-id="'+fittingId+'"]').click();
    assert.match(await page.locator('#selectionDetails').innerText(),/Unresolved route reference/);
    await page.locator('#undoButton').click();
    assert.equal(await page.evaluate(()=>state.model.services.length),2);

    // Physical pen remains untested; simulated touch must not create fixture records.
    await page.locator('[data-mode="plan"]').click();await page.locator('[data-tool="service-fixture"]').click();
    const touchBox=await page.locator('#designCanvas').boundingBox();
    await page.touchscreen.tap(touchBox.x+touchBox.width/2,touchBox.y+touchBox.height/2);
    assert.equal(await page.evaluate(()=>state.model.serviceItems.length),2);
    await page.locator('[data-mode="3d"]').click();
    await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'test-results','service-routes-items-3d.png')});
    await page.locator('[data-mode="plan"]').click();
    await page.screenshot({path:path.join(__dirname,'test-results','service-routes-items-plan.png')});
    assert.deepEqual(errors,[]);
    console.log('Service browser test passed: straight/multi-route drawing, waypoint edits, items/properties/references, three CSVs, plan/3D layers, totals, real JSON save/open and atomic rejection, autosave/reload, delete/undo/redo; no page errors.');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
