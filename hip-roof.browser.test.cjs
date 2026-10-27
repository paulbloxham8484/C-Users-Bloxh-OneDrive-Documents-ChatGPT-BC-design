const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let ui=page,expo=false;
 const field=key=>ui.locator('#roof-'+key),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 async function edit(key,value){await field(key).fill(String(value));await field(key).press('Tab');}
 async function workspace(){await page.locator('#bc-design-workspace, #designCanvas').waitFor();if(await page.locator('#bc-design-workspace').count()){expo=true;ui=await(await page.locator('#bc-design-workspace').elementHandle()).contentFrame();}await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);}
 async function select(){await ui.locator('#roofSchedule').evaluate(el=>el.closest('details').open=true);await ui.locator('#roofSchedule [data-roof-id]').first().click();}
 async function download(id){const waiting=page.waitForEvent('download');await ui.locator(id).click();return fs.readFile(await(await waiting).path(),'utf8');}
 const geometry=()=>ui.evaluate(()=>{const g=roofGeometry(state.model.roofs[0]);return {planes:g.planes.length,vertices:g.planes.map(p=>p.length),ridge:g.ridge,hips:g.hips,rise:g.rise,area:g.surfaceArea,volume:g.volume,ridgeLength:g.ridgeLength,hipLength:g.hipLength};});
 try{
  await page.goto(process.env.BC_EXPO_URL||process.env.BC_TEST_URL||'http://127.0.0.1:4180/?expo=hiproofs41');await workspace();await ui.locator('#loadExampleButton').click();await ui.evaluate(()=>{state.model.roofs=[makeRoof({x:0,y:0},{x:4000,y:6000},state.model.activeLevelId,2700)];state.model.roofJunctions=[];state.visibility.roofs=true;fitView();render();});await select();
  assert.equal(await field('form').inputValue(),'gable');await field('form').selectOption('hip');assert.equal((await geometry()).planes,4);
  await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>state.model.roofs[0].form),'gable');await ui.locator('#redoButton').click();await select();assert.equal(await field('form').inputValue(),'hip');
  await edit('overhang',0);await edit('width',4000);await edit('length',6000);await edit('rotation',0);await edit('pitch',45);
  let g=await geometry();assert.equal(g.planes,4);assert.equal(g.hips.length,4);near(g.rise,2000);near(g.ridgeLength,2000);near(g.area/1e6,24*Math.SQRT2);near(g.volume/1e9,3.6+56/3);
  assert.match(await ui.locator('#selectionDetails').innerText(),/4 hips/);assert.match(await ui.locator('#selectionDetails').innerText(),/7\.3\.2/);
  await edit('minPitch',50);assert.match(await ui.locator('#selectionDetails').innerText(),/below the entered product minimum/);await edit('minPitch','');
  await edit('width',6000);await edit('length',4000);g=await geometry();near(g.ridge[1].x-g.ridge[0].x,2000);near(g.ridge[0].y,g.ridge[1].y);
  await edit('width',4000);g=await geometry();assert.equal(g.ridge.length,0);assert.deepEqual(g.vertices,[3,3,3,3]);assert.match(await ui.locator('#selectionDetails').innerText(),/Pyramidal hip/);
  await edit('length',6000);await edit('overhang',500);await edit('rotation',90);g=await geometry();near(g.rise,2500);near(g.ridgeLength,2000);near(g.area/1e6,35*Math.SQRT2);
  const frozen=await ui.evaluate(()=>JSON.stringify([state.model,quantityData()]));
  for(const mode of ['plan','3d']){await ui.locator('[data-mode="'+mode+'"]').click();const shown=await ui.locator('#designCanvas').screenshot();await ui.locator('[data-layer="roofs"]').uncheck();assert.ok(!shown.equals(await ui.locator('#designCanvas').screenshot()),mode+' independent roof layer');await ui.locator('[data-layer="roofs"]').check();assert.equal(await ui.evaluate(()=>JSON.stringify([state.model,quantityData()])),frozen);}
  await select();assert.equal(await ui.evaluate(()=>state.mode),'3d');assert.equal(await field('form').inputValue(),'hip');
  const csv=await download('#roofCsvButton');assert.match(csv,/Ridge geometry length mm/);assert.match(csv,/Hip 3D geometry length mm/);assert.match(csv,/Hip endpoints XYZ JSON mm/);assert.match(csv,/"hip"/);
  const saved=JSON.parse(await download('#saveButton'));assert.equal(saved.roofs[0].form,'hip');assert.equal(saved.schema,30);
  await ui.locator('#fileInput').setInputFiles({name:'hip-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await ui.waitForFunction(()=>state.statusMessage==='Project JSON opened');assert.equal((await geometry()).planes,4);
  const invalid=structuredClone(saved);invalid.roofs[0].width=1e308;const before=await ui.evaluate(()=>JSON.stringify(state.model));
  await ui.locator('#fileInput').setInputFiles({name:'hip-invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await ui.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));assert.equal(await ui.evaluate(()=>JSON.stringify(state.model)),before);
  await ui.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');await page.reload();await workspace();assert.deepEqual(await ui.evaluate(()=>state.model.roofs),saved.roofs);
  await select();await ui.locator('[data-action="delete"]').click();assert.equal(await ui.evaluate((saved)=>state.model.roofs.length,saved.roofs.length-1),saved.roofs.length-1);await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>state.model.roofs[0].form),'hip');
  await select();await edit('width',5000);await edit('length',8000);await edit('rotation',90);await edit('pitch',30);await edit('overhang',450);await ui.locator('#fitButton').click();
  await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});await ui.locator('#selectionSection').scrollIntoViewIfNeeded();
  await ui.locator('[data-mode="3d"]').click();await page.screenshot({path:path.join(__dirname,'test-results','hip-roof-3d.png')});
  await ui.locator('[data-mode="plan"]').click();await page.screenshot({path:path.join(__dirname,'test-results','hip-roof-plan.png')});
  assert.ok(await ui.locator('.inspector').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
  console.log('Hip roof browser workflow passed'+(expo?' through Expo':'')+': form editing, gable/hip undo, equal-pitch planes, wide/long ridge, square pyramid, pitch evidence, overhang/rotation, Plan/3D layer, unchanged hidden totals, schedule/CSV, JSON/rejection/reload and deletion/undo; no page errors.');
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
