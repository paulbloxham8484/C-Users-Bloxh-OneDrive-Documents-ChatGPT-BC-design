const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];let ui=page;
 page.on('pageerror',e=>errors.push(e.message));
 async function workspace(){await page.locator('#bc-design-workspace, #designCanvas').waitFor();if(await page.locator('#bc-design-workspace').count())ui=await(await page.locator('#bc-design-workspace').elementHandle()).contentFrame();await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);}
 const edit=async(selector,value)=>{await ui.locator(selector).fill(String(value));await ui.locator(selector).press('Tab');};
 const open=async(model)=>{await ui.locator('#fileInput').setInputFiles({name:'coordination.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});await ui.waitForFunction(()=>state.statusMessage==='Project JSON opened');};
 const select=async()=>{await ui.locator('#stairSchedule').evaluate(el=>el.closest('details').open=true);await ui.locator('#stairSchedule [data-stair-id]').first().click();};
 const download=async(id)=>{const d=page.waitForEvent('download');await ui.locator(id).click();return fs.readFile(await(await d).path(),'utf8');};
 try{
  await page.goto(process.env.BC_EXPO_URL||'http://127.0.0.1:4185/');await workspace();
  const fixture=await ui.evaluate(()=>{const m=createEmptyModel();m.name='Stair / floor datum review';m.levels.push({id:'upper-test',name:'Upper floor',elevation:2700});const stair=makeStair({x:0,y:0},{x:0,y:4200},m.activeLevelId);stair.rise=2700;stair.risers=15;stair.name='Level connection';m.stairs=[stair];m.floors=[{id:'target-floor',levelId:'upper-test',elevation:2600,thickness:100,points:[{x:-1200,y:4200},{x:1200,y:4200},{x:1200,y:6000},{x:-1200,y:6000}]}];return m;});
  await open(fixture);await select();assert.equal(await ui.locator('#sc-upper-target').inputValue(),'');
  await ui.locator('#sc-lower-target').selectOption('level:'+fixture.activeLevelId);await edit('#sc-lower-offset',0);
  await ui.locator('#sc-upper-target').selectOption('level:upper-test');assert.equal(await ui.locator('#sc-upper-offset').inputValue(),'');assert.match(await ui.locator('#selectionDetails').innerText(),/Finish offset pending/);
  await edit('#sc-upper-offset',0);await edit('#sc-source','Survey datum / drawing L-01');assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].delta),0);
  const original=await ui.evaluate(()=>JSON.stringify(stairGeometry(state.model.stairs[0])));
  await ui.locator('#levelDatumEditor').evaluate(el=>el.closest('details').open=true);await edit('[data-level-datum="upper-test"][data-level-field="elevation"]',3000);
  assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].delta),-300);assert.equal(await ui.evaluate(()=>JSON.stringify(stairGeometry(state.model.stairs[0]))),original);assert.equal(await ui.evaluate(()=>state.model.floors[0].elevation),2600);
  await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].delta),0);await ui.locator('#redoButton').click();assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].delta),-300);
  await edit('[data-level-datum="upper-test"][data-level-field="elevation"]','');assert.equal(await ui.locator('[data-level-datum="upper-test"][data-level-field="elevation"]').inputValue(),'3000');
  await select();await ui.locator('#sc-upper-target').selectOption('floor:target-floor');await edit('#sc-upper-offset',100);assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].delta),0);
  await ui.evaluate(()=>{state.selected={type:'floor',id:'target-floor'};render();});await edit('[data-field="elevation"]',2500);assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].delta),100);
  await ui.locator('#stairCoordinationSchedule').evaluate(el=>el.closest('details').open=true);await ui.locator('#stairCoordinationSchedule [data-coordination-stair]').last().click();assert.equal(await ui.locator('#sc-upper-target').inputValue(),'floor:target-floor');
  await ui.locator('[data-mode="plan"]').click();await ui.locator('#levelSelect').selectOption('upper-test');await ui.locator('#fitButton').click();
  assert.equal(await ui.evaluate(()=>coordinationVisible(stairCoordinationResults()[1],'plan')),true);
  const withChecks=await ui.locator('#designCanvas').screenshot();await ui.locator('[data-layer="stairCoordination"]').uncheck();assert.notDeepEqual(await ui.locator('#designCanvas').screenshot(),withChecks);await ui.locator('[data-layer="stairCoordination"]').check();
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/stair-coordination-plan.png'});
  await ui.locator('[data-mode="3d"]').click();await ui.locator('#fitButton').click();const with3d=await ui.locator('#designCanvas').screenshot();await ui.locator('[data-layer="stairCoordination"]').uncheck();assert.notDeepEqual(await ui.locator('#designCanvas').screenshot(),with3d);await ui.locator('[data-layer="stairCoordination"]').check();await page.screenshot({path:'test-results/stair-coordination-3d.png'});
  const csv=await download('#stairCoordinationCsvButton');assert.match(csv,/Stair minus target mm/);assert.match(csv,/"100","Elevation mismatch"/);assert.match(csv,/Survey datum/);
  const saved=JSON.parse(await download('#saveButton'));assert.equal(saved.schema,30);assert.equal(saved.stairs[0].coordination.upper.offset,100);
  const missing=structuredClone(saved);missing.floors=[];await open(missing);assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].status),'Missing floor reference');await select();assert.match(await ui.locator('#sc-upper-target').innerText(),/Missing saved floor/);
  await open(saved);const bad=structuredClone(saved);bad.stairs[0].coordination.upper.offset='bad';await ui.locator('#fileInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await ui.waitForFunction(()=>state.statusMessage.includes('reference offset'));assert.equal(await ui.evaluate(()=>state.model.stairs[0].coordination.upper.offset),100);
  await select();await ui.locator('#stairLayout').selectOption('straight');assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].status),'Upper stair geometry incomplete');await ui.locator('#undoButton').click();
  await ui.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');await page.reload();await workspace();assert.equal(await ui.evaluate(()=>stairCoordinationResults()[1].delta),100);assert.equal(await ui.evaluate(()=>state.model.levels[1].elevation),3000);assert.deepEqual(errors,[]);
  console.log('Stair coordination browser workflow passed: explicit level/floor links, blank offsets, datum/floor edits, unchanged stair geometry, independent Plan/3D markers on target level, schedule/CSV, missing references, JSON rejection, reload and undo/redo.');
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
