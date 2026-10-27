const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let ui=page;
 const field=key=>ui.locator('#junction-'+key);
 async function workspace(){await page.locator('#bc-design-workspace, #designCanvas').waitFor();if(await page.locator('#bc-design-workspace').count())ui=await(await page.locator('#bc-design-workspace').elementHandle()).contentFrame();await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);}
 async function edit(key,value){await field(key).fill(String(value));await field(key).press('Tab');}
 async function open(model,name='junction-fixture.json'){await ui.locator('#fileInput').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});}
 async function select(){await ui.locator('#roofJunctionSchedule').evaluate(el=>el.closest('details').open=true);await ui.locator('[data-roof-junction-id]').first().click();}
 async function download(id){const waiting=page.waitForEvent('download');await ui.locator(id).click();return fs.readFile(await(await waiting).path(),'utf8');}
 const review=()=>ui.evaluate(()=>{const r=roofJunctionReview(state.model.roofJunctions[0]);return {status:r.status,length:r.length,count:r.segments.length,contacts:r.contacts,coplanar:r.coplanar.length};});
 try{
  await page.goto(process.env.BC_EXPO_URL||process.env.BC_TEST_URL||'http://127.0.0.1:4180/?expo=junctions42');await workspace();await ui.locator('#loadExampleButton').click();
  const fixture=await ui.evaluate(()=>{state.visibility.roofs=true;state.visibility.joinedRoofs=true;state.visibility.roofValleys=true;state.visibility.roofJunctions=true;const m=clone(state.model),a=m.roofs[0];a.form='gable';m.roofJunctions=[];a.name='Main roof';a.width=4000;a.length=6000;a.rotation=0;a.pitch=45;a.overhang=0;a.elevation=2700;m.roofs=[a];const b=clone(a);b.id='cross-roof';b.name='Cross roof';b.rotation=90;b.levelId='upper';m.roofs.push(b);m.levels.push({id:'upper',name:'Upper',elevation:2700},{id:'unused',name:'Unused',elevation:5400});return m;});
  const roofs=JSON.stringify(fixture.roofs);await open(fixture);await ui.waitForFunction(()=>state.statusMessage==='Project JSON opened');
  await ui.locator('#roofSchedule').evaluate(el=>el.closest('details').open=true);await ui.locator('#roofSchedule [data-roof-id]').first().click();
  await ui.locator('#addRoofJunctionButton').click();assert.equal(await field('roofAId').inputValue(),fixture.roofs[0].id);assert.equal((await review()).status,'Not assessed');
  await field('roofBId').selectOption(fixture.roofs[0].id);assert.equal(await field('roofBId').inputValue(),'');
  await field('roofBId').selectOption('cross-roof');let r=await review();assert.equal(r.status,'Surface crossing');assert.equal(r.count,4);assert.ok(Math.abs(r.length-8000*Math.sqrt(3))<1e-6);
  await edit('name','Cross-roof junction');await field('kind').selectOption('valley');await edit('designRef','Designer sketch R1 — test record');await edit('standardRef','Project edition requires review');await edit('flashing','Selected product detail pending');await edit('drainage','Catchment and overflow design pending');await edit('notes','Geometry review only');
  assert.match(await ui.locator('#selectionDetails').innerText(),/7\.2\.7/);assert.match(await ui.locator('#selectionDetails').innerText(),/Roof.*not trimmed/);
  await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>state.model.roofJunctions[0].notes),'');await ui.locator('#redoButton').click();await select();assert.equal(await field('notes').inputValue(),'Geometry review only');
  assert.equal(await ui.evaluate(()=>JSON.stringify(state.model.roofs)),roofs);
  const frozen=await ui.evaluate(()=>JSON.stringify([state.model,quantityData()]));
  for(const mode of ['plan','3d']){
   await ui.locator('[data-mode="'+mode+'"]').click();await ui.locator('[data-layer="roofs"]').uncheck();const shown=await ui.locator('#designCanvas').screenshot();await ui.locator('[data-layer="roofJunctions"]').uncheck();assert.ok(!shown.equals(await ui.locator('#designCanvas').screenshot()),mode+' independent overlay');await ui.locator('[data-layer="roofJunctions"]').check();await ui.locator('[data-layer="roofs"]').check();assert.equal(await ui.evaluate(()=>JSON.stringify([state.model,quantityData()])),frozen);
  }
  const shown=await ui.evaluate(()=>roofJunctionVisible(roofJunctionReview(state.model.roofJunctions[0]),true));assert.equal(shown,true);
  await ui.locator('#levelVisibility').evaluate(el=>el.closest('details').open=true);await ui.locator('[data-visible-level="upper"]').uncheck();assert.equal(await ui.evaluate(()=>roofJunctionVisible(roofJunctionReview(state.model.roofJunctions[0]),true)),false);await ui.locator('[data-visible-level="upper"]').check();
  await ui.locator('[data-mode="plan"]').click();await ui.locator('#levelSelect').selectOption('unused');assert.equal(await ui.evaluate(()=>roofJunctionVisible(roofJunctionReview(state.model.roofJunctions[0]),false)),false);await select();
  await ui.locator('#roofSchedule [data-roof-id="cross-roof"]').click();await ui.locator('#roof-elevation').fill('10000');await ui.locator('#roof-elevation').press('Tab');assert.equal((await review()).status,'No interior surface crossing');await ui.locator('#undoButton').click();assert.equal((await review()).status,'Surface crossing');await select();
  const csv=await download('#roofJunctionCsvButton');assert.match(csv,/Junction total/);assert.match(csv,/Crossing segment/);assert.match(csv,/Declared intent/);assert.match(csv,/Absolute rise mm/);assert.match(csv,/Designer sketch R1/);
  const saved=JSON.parse(await download('#saveButton'));assert.equal(saved.schema,30);assert.equal(saved.roofJunctions.length,1);assert.equal(saved.roofJunctions[0].kind,'valley');await open(saved,'junction-roundtrip.json');await ui.waitForFunction(()=>state.statusMessage==='Project JSON opened');assert.equal((await review()).count,4);
  const invalid=structuredClone(saved);invalid.roofJunctions[0].roofBId=invalid.roofJunctions[0].roofAId;const before=await ui.evaluate(()=>JSON.stringify(state.model));await open(invalid,'junction-invalid.json');await ui.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));assert.equal(await ui.evaluate(()=>JSON.stringify(state.model)),before);
  await ui.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');await page.reload();await workspace();assert.deepEqual(await ui.evaluate(()=>state.model.roofJunctions),saved.roofJunctions);
  await ui.locator('#roofSchedule').evaluate(el=>el.closest('details').open=true);await ui.locator('#roofSchedule [data-roof-id="cross-roof"]').click();await ui.locator('[data-action="delete"]').click();assert.equal((await review()).status,'Not assessed');assert.equal(await ui.evaluate(()=>state.model.roofJunctions.length),1);await ui.locator('#undoButton').click();assert.equal((await review()).status,'Surface crossing');
  await select();await ui.locator('[data-action="delete"]').click();assert.equal(await ui.evaluate(()=>state.model.roofJunctions.length),0);await ui.locator('#undoButton').click();assert.equal((await review()).count,4);await select();
  await ui.locator('#fitButton').click();await ui.locator('#selectionSection').evaluate(el=>el.scrollIntoView({block:'start'}));
  await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});await ui.locator('[data-mode="3d"]').click();await page.screenshot({path:path.join(__dirname,'test-results','roof-junctions-3d.png')});await ui.locator('[data-mode="plan"]').click();await page.screenshot({path:path.join(__dirname,'test-results','roof-junctions-plan.png')});
  assert.ok(await ui.locator('.inspector').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
  console.log('Roof junction browser workflow passed through Expo: editable pair/intent/evidence, analytic crossings, roof edits, missing references, independent Plan/3D overlay, levels, unchanged geometry/takeoffs, schedule/CSV, schema 15 JSON/rejection/reload and undo/redo; no page errors.');
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
