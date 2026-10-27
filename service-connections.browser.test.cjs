const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
// Fresh Edge context only: never uses the user's browser profile or saved projects.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const field=key=>page.locator('[data-field="'+key+'"]');
  async function edit(key,value){await field(key).fill(String(value));await field(key).press('Tab');}
  async function schedule(id){await page.locator(id).evaluate(el=>el.closest('details').open=true);}
  async function tapWorld(p){const xy=await page.evaluate(p=>worldToScreen(p),p),box=await page.locator('#designCanvas').boundingBox();assert.ok(xy.x>0&&xy.x<box.width&&xy.y>0&&xy.y<box.height,'Test point must be in canvas');await page.mouse.click(box.x+xy.x,box.y+xy.y);}
  async function download(id){const wait=page.waitForEvent('download');await page.locator(id).click();const d=await wait;return fs.readFile(await d.path(),'utf8');}
  async function selectItem(id){await schedule('#serviceItemSchedule');await page.locator('[data-service-item-id="'+id+'"]').click();}
  async function selectRoute(id){await schedule('#serviceSchedule');await page.locator('[data-service-id="'+id+'"]').click();}
  try {
    await page.goto(process.env.BC_TEST_URL||'http://127.0.0.1:4180/workspace/index.html?build=clearances38');await prepareWorkspace(page);
    await page.locator('#loadExampleButton').click();
    await page.locator('[data-tool="service-fitting"]').click();await tapWorld({x:8000,y:7000});
    await edit('name','Drain junction');await field('system').selectOption('drainage');
    await edit('positionX',9000);await edit('positionY',8000);
    await page.locator('[data-action="service-add-port"]').click();
    await edit('port-0-name','Branch in');await edit('port-0-offsetX',-500);await edit('port-0-offsetZ',-500);
    await edit('port-0-maxConnections',2);await edit('port-0-designRef','Coordination drawing A1');
    const fitting=await page.evaluate(()=>({id:state.model.serviceItems[0].id,portId:state.model.serviceItems[0].ports[0].id}));
    await page.locator('[data-tool="service-fixture"]').click();await tapWorld({x:3000,y:7000});
    await edit('name','Floor waste');await field('system').selectOption('drainage');await edit('positionY',8000);
    await page.locator('[data-action="service-add-port"]').click();
    await edit('port-0-name','Waste outlet');await edit('port-0-offsetZ',-500);
    await edit('port-0-maxConnections',1);await edit('port-0-designRef','Coordination drawing A1');
    const fixture=await page.evaluate(()=>({id:state.model.serviceItems[1].id,portId:state.model.serviceItems[1].ports[0].id}));
    await page.locator('#fitButton').click();

    // Drawing to visible point locations chooses their system, snaps Z and records both links.
    await page.locator('[data-tool="service-route"]').click();
    await tapWorld({x:3000,y:8000});await tapWorld({x:5500,y:8500});await tapWorld({x:8500,y:8000});
    await page.locator('#finishDeckButton').click();await edit('name','Waste branch');
    const routeId=await page.evaluate(()=>state.model.services[0].id);
    assert.equal(await page.evaluate(()=>state.model.services[0].system),'drainage');
    assert.deepEqual(await page.evaluate(()=>state.model.services[0].connections),{start:{itemId:fixture.id,portId:fixture.portId},end:{itemId:fitting.id,portId:fitting.portId}});
    assert.deepEqual(await page.evaluate(()=>serviceConnectionRows().map(r=>r.status)),['Linked','Linked']);

    // A move updates geometry and length together, with one undo/redo step.
    await selectItem(fixture.id);await edit('positionX',3300);const levelElevation=await page.evaluate(()=>activeLevel().elevation);await edit('port-0-offsetZ',-600);
    assert.equal(await page.evaluate(()=>state.model.services[0].points[0].x),3300);
    assert.equal(await page.evaluate(()=>state.model.services[0].points[0].z),levelElevation-600);
    await page.locator('#undoButton').click();assert.equal(await page.evaluate(()=>state.model.services[0].points[0].z),levelElevation-500);
    await page.locator('#redoButton').click();assert.equal(await page.evaluate(()=>state.model.services[0].points[0].z),levelElevation-600);
    await selectRoute(routeId);await edit('endElevation',-400);
    assert.equal(await page.evaluate(()=>serviceConnectionRows()[1].gap),levelElevation-100);
    assert.ok((await page.locator('#selectionDetails').innerText()).includes('3D gap '+(levelElevation-100).toLocaleString('en-AU')));
    await page.locator('[data-action="service-resnap-end"]').click();
    assert.equal(await page.evaluate(()=>serviceConnectionRows()[1].gap),0);

    // Explicit selection links an existing route; a full port rejects assignments atomically.
    await page.locator('[data-tool="service-route"]').click();
    await tapWorld({x:5000,y:6500});await tapWorld({x:6500,y:7000});await page.locator('#finishDeckButton').click();
    await field('system').selectOption('drainage');
    const secondId=await page.evaluate(()=>state.model.services[1].id);
    await field('connection-end').selectOption(JSON.stringify([fitting.id,fitting.portId]));
    assert.equal(await page.evaluate(()=>servicePortUsers(state.model.serviceItems[0].id,state.model.serviceItems[0].ports[0].id).length),2);
    const before=await page.evaluate(()=>JSON.stringify(state.model.services[1]));
    await field('connection-start').selectOption(JSON.stringify([fixture.id,fixture.portId]));
    assert.equal(await page.evaluate(()=>JSON.stringify(state.model.services[1])),before);
    assert.match(await page.locator('#selectionDetails').innerText(),/maximum route ends/);
    await field('system').selectOption('electrical');
    assert.match(await page.locator('#selectionDetails').innerText(),/systems differ/);
    await field('system').selectOption('drainage');
    await selectItem(fitting.id);await edit('port-0-maxConnections',1);
    await schedule('#serviceConnectionSchedule');
    assert.match(await page.locator('#serviceConnectionSchedule').innerText(),/Maximum route ends exceeded/);
    await edit('port-0-maxConnections',2);

    // Independent connection symbols remain available when the item/route body layers are hidden.
    await page.locator('[data-layer="serviceFittings"]').uncheck();
    await page.locator('[data-layer="serviceFixtures"]').uncheck();
    await page.locator('[data-layer="service-drainage"]').uncheck();
    const immutable=await page.evaluate(()=>JSON.stringify([state.model,quantityData(),serviceConnectionRows().map(r=>r.status)]));
    for(const mode of ['3d','plan']) {
      await page.locator('[data-mode="'+mode+'"]').click();
      const visible=await page.locator('#designCanvas').screenshot();
      await page.locator('[data-layer="serviceConnections"]').uncheck();
      assert.ok(!visible.equals(await page.locator('#designCanvas').screenshot()),mode+' connection layer renders independently');
      await page.locator('[data-layer="serviceConnections"]').check();
      assert.equal(await page.evaluate(()=>JSON.stringify([state.model,quantityData(),serviceConnectionRows().map(r=>r.status)])),immutable);
    }
    await page.locator('[data-layer="serviceFittings"]').check();await page.locator('[data-layer="serviceFixtures"]').check();await page.locator('[data-layer="service-drainage"]').check();
    const beforeOverlay=await page.evaluate(()=>JSON.stringify([state.model,quantityData(),state.history.length]));
    await page.locator('#hideServiceOverlays').click();
    for(const layer of ['service-water','service-drainage','service-electrical','service-other','serviceFittings','serviceFixtures','serviceConnections'])assert.equal(await page.locator('[data-layer="'+layer+'"]').isChecked(),false);
    assert.equal(await page.locator('[data-layer="walls"]').isChecked(),true,'Building layers stay independent');
    await page.locator('#showServiceOverlays').click();
    const opaque=await page.locator('#designCanvas').screenshot();
    await page.locator('#serviceOverlayOpacity').focus();await page.locator('#serviceOverlayOpacity').press('Home');
    assert.equal(await page.evaluate(()=>state.serviceOverlayOpacity),.2);
    assert.equal(await page.locator('#serviceOverlayOpacityValue').innerText(),'20%');
    assert.ok(!opaque.equals(await page.locator('#designCanvas').screenshot()),'Opacity changes rendered overlays');
    assert.equal(await page.evaluate(()=>JSON.stringify([state.model,quantityData(),state.history.length])),beforeOverlay);
    await page.locator('#serviceOverlayOpacity').press('End');
    await schedule('#serviceConnectionSchedule');
    await page.locator('[data-connection-item="'+fitting.id+'"]').click();
    assert.equal(await field('port-0-name').inputValue(),'Branch in');

    // A deleted point is reported in both inspector and schedule; undo restores the same references.
    await page.locator('[data-action="service-delete-port"]').click();
    assert.match(await page.locator('#serviceConnectionSchedule').innerText(),/connection point is missing/);
    await page.locator('#undoButton').click();
    await selectRoute(routeId);assert.equal(await page.evaluate(()=>serviceConnectionRows()[1].status),'Linked');
    assert.ok(await page.locator('.inspector').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Long connection names must fit the inspector');
    const csv=await download('#serviceConnectionCsvButton');
    assert.match(csv,/3D gap mm/);assert.match(csv,/Waste outlet/);assert.match(csv,/Endpoint/);assert.match(csv,/Point/);
    const saved=JSON.parse(await download('#saveButton'));assert.equal(saved.schema,30);
    await page.locator('#fileInput').setInputFiles({name:'connections.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>state.statusMessage==='Project JSON opened');
    assert.deepEqual(await page.evaluate(()=>state.model.services),saved.services);
    assert.deepEqual(await page.evaluate(()=>state.model.serviceItems),saved.serviceItems);
    const invalid=structuredClone(saved);invalid.serviceItems[0].ports[0].offset.z=null;
    const beforeBad=await page.evaluate(()=>JSON.stringify(state.model));
    await page.locator('#fileInput').setInputFiles({name:'invalid-connection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
    await page.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));
    assert.equal(await page.evaluate(()=>JSON.stringify(state.model)),beforeBad);
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');
    await page.reload();assert.deepEqual(await page.evaluate(()=>state.model.services),saved.services);
    assert.deepEqual(await page.evaluate(()=>state.model.serviceItems),saved.serviceItems);

    await page.locator('[data-mode="3d"]').click();await schedule('#serviceConnectionSchedule');
    await page.locator('[data-connection-route="'+secondId+'"]').last().click();
    assert.equal(await page.evaluate(()=>state.mode),'3d','Connection schedule selects without leaving 3D');
    await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'test-results','service-connections-3d.png')});
    await page.locator('[data-mode="plan"]').click();
    await page.screenshot({path:path.join(__dirname,'test-results','service-connections-plan.png')});
    assert.deepEqual(errors,[]);
    console.log('Connection browser test passed: point editing, drawing snaps, endpoint assignment, linked moves/undo, gaps/repair, system/capacity checks, independent Plan/3D layer, schedule selection, CSV, JSON save/open/rejection and reload; no page errors.');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
