const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
// Isolated profile: product dimensions below are test geometry, not a supplied product recommendation.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const field=key=>page.locator('[data-field="'+key+'"]');
  async function edit(key,value){await field(key).fill(String(value));await field(key).press('Tab');}
  async function expand(id){await page.locator(id).evaluate(el=>el.closest('details').open=true);}
  async function download(id){const wait=page.waitForEvent('download');await page.locator(id).click();const d=await wait;return fs.readFile(await d.path(),'utf8');}
  try {
    await page.goto(process.env.BC_TEST_URL||'http://127.0.0.1:4180/workspace/index.html?build=clearances38');await prepareWorkspace(page);
    await page.locator('#loadExampleButton').click();await page.locator('[data-tool="service-fixture"]').click();
    const box=await page.locator('#designCanvas').boundingBox();await page.mouse.click(box.x+box.width*.85,box.y+box.height*.7);
    await edit('name','Plant enclosure — test geometry');await edit('positionX',10500);await edit('positionY',6500);
    await field('system').selectOption('other');
    const before=await page.evaluate(()=>JSON.stringify(quantityData()));
    await page.locator('[data-action="service-add-envelope"]').click();
    assert.equal(await page.evaluate(()=>serviceEnvelopeGeometry(state.model.serviceItems[0]).body),null);
    for(const [key,value] of Object.entries({width:1200,depth:900,height:1800,rotation:30,left:200,right:400,front:600,back:100,below:0,above:300}))await edit('envelope-'+key,value);
    await edit('envelope-sourceRef','Test product drawing A1');await edit('envelope-clearanceRef','Test clearance drawing C1');
    assert.equal(await page.evaluate(()=>Boolean(serviceEnvelopeGeometry(state.model.serviceItems[0]).clearance)),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(quantityData())),before);
    await edit('envelope-width',-1);assert.equal(await field('envelope-width').inputValue(),'1200');
    await page.locator('#fitButton').click();
    await expand('#serviceEnvelopeSchedule');assert.match(await page.locator('#serviceEnvelopeSchedule').innerText(),/1200 × 900 × 1800/);
    const itemId=await page.evaluate(()=>state.model.serviceItems[0].id);
    // Envelopes and clearance overlays remain independent of the item symbol and connection layer.
    await page.locator('[data-layer="serviceFixtures"]').uncheck();await page.locator('[data-layer="serviceConnections"]').uncheck();
    for(const mode of ['plan','3d']) {
      await page.locator('[data-mode="'+mode+'"]').click();
      for(const layer of ['serviceEnvelopes','serviceClearances']) {
        const visible=await page.locator('#designCanvas').screenshot();await page.locator('[data-layer="'+layer+'"]').uncheck();
        assert.ok(!visible.equals(await page.locator('#designCanvas').screenshot()),mode+' '+layer+' renders');
        assert.equal(await page.evaluate(()=>JSON.stringify(quantityData())),before);
        await page.locator('[data-layer="'+layer+'"]').check();
      }
    }
    await page.locator('[data-envelope-item="'+itemId+'"]').click();
    assert.equal(await field('envelope-width').inputValue(),'1200');
    const csv=await download('#serviceEnvelopeCsvButton');assert.match(csv,/Test product drawing A1/);assert.match(csv,/clearanceRef/);
    await page.locator('[data-action="service-remove-envelope"]').click();assert.equal(await page.evaluate(()=>state.model.serviceItems[0].envelope),null);
    await page.locator('#undoButton').click();assert.equal(await page.evaluate(()=>state.model.serviceItems[0].envelope.width),'1200');
    await page.locator('#redoButton').click();await page.locator('#undoButton').click();
    // Actual supplier reference copy, exact source link, duplicate gate, undo and persisted audit trail.
    await expand('#materialReferenceList');
    assert.equal(await page.locator('#materialReferenceList a').count(),13);
    const supplierUrl=await page.locator('#materialReferenceList a[href$="_p0731415"]').getAttribute('href');assert.match(supplierUrl,/_p0731415$/);
    await page.locator('[data-add-material="0731415"]').click();
    assert.equal(await page.evaluate(()=>state.model.specifications.at(-1).productCode),'0731415');
    assert.match(await page.evaluate(()=>state.model.specifications.at(-1).notes),/length 2400 mm; width 1200 mm; thickness 10 mm/);
    await page.locator('[data-add-material="0731415"]').click();assert.equal(await page.evaluate(()=>state.model.specifications.filter(s=>s.productCode==='0731415').length),1);
    await page.locator('#undoButton').click();assert.equal(await page.evaluate(()=>(state.model.specifications||[]).filter(s=>s.productCode==='0731415').length),0);
    await page.locator('#redoButton').click();
    const saved=JSON.parse(await download('#saveButton'));assert.equal(saved.schema,30);
    await page.locator('#fileInput').setInputFiles({name:'envelope.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>state.statusMessage==='Project JSON opened');
    assert.deepEqual(await page.evaluate(()=>state.model.serviceItems),saved.serviceItems);
    const bad=structuredClone(saved);bad.serviceItems[0].envelope.left='-5';const stable=await page.evaluate(()=>JSON.stringify(state.model));
    await page.locator('#fileInput').setInputFiles({name:'invalid-envelope.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
    await page.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));assert.equal(await page.evaluate(()=>JSON.stringify(state.model)),stable);
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');await page.reload();
    assert.deepEqual(await page.evaluate(()=>state.model.serviceItems),saved.serviceItems);
    assert.equal(await page.evaluate(()=>state.model.specifications.find(s=>s.productCode==='0731415')?.productCode),'0731415');
    await page.locator('[data-mode="3d"]').click();await expand('#serviceEnvelopeSchedule');await page.locator('[data-envelope-item="'+itemId+'"]').click();
    assert.ok(await page.locator('.inspector').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});await page.screenshot({path:path.join(__dirname,'test-results','service-envelopes-3d.png')});
    await page.locator('[data-mode="plan"]').click();await page.screenshot({path:path.join(__dirname,'test-results','service-envelopes-plan.png')});
    assert.deepEqual(errors,[]);
    console.log('Envelope browser test passed: editable dimensions/clearances, independent Plan/3D overlays, unchanged counts, schedule/CSV, undo/redo, Bunnings reference/source copy, JSON save/open/rejection and reload; no page errors.');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
