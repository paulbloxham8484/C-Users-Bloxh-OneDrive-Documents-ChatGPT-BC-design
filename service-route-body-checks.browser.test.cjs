const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let ui=page,expo=false;
 const expand=async id=>ui.locator(id).evaluate(el=>el.closest('details').open=true);
 const field=key=>ui.locator('[data-field="'+key+'"]');
 async function download(id){const waiting=page.waitForEvent('download');await ui.locator(id).click();return fs.readFile(await(await waiting).path(),'utf8');}
 async function workspace(){await page.locator('#bc-design-workspace, #designCanvas').waitFor();if(await page.locator('#bc-design-workspace').count()){expo=true;ui=await(await page.locator('#bc-design-workspace').elementHandle()).contentFrame();}await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);}
 try{
  await page.goto(process.env.BC_EXPO_URL||process.env.BC_TEST_URL||'http://127.0.0.1:4180/?expo=routebody39');await workspace();
  await ui.locator('#loadExampleButton').click();const model=await ui.evaluate(()=>clone(state.model)),ground=model.activeLevelId;
  model.levels.push({id:'upper-test',name:'Upper',elevation:3000});
  const item={id:'body-test',kind:'fixture',system:'other',name:'Test enclosure',levelId:ground,center:{x:9500,y:7000},elevation:0,partType:'Enclosure',size:'',material:'',manufacturer:'',productCode:'',designRef:'Product test drawing',notes:'',routeId:'',ports:[{id:'port-test',name:'Recorded end',system:'other',offset:{x:-1000,y:0,z:900},size:'',maxConnections:'',designRef:'Point test drawing',notes:''}],envelope:{width:'1000',depth:'800',height:'600',rotation:'0',left:'',right:'',front:'',back:'',below:'',above:'',sourceRef:'Product test drawing',clearanceRef:'',notes:''}};
  const route=(id,name,points,level=ground)=>({id,name,levelId:level,system:'other',size:'',material:'',designRef:'Route test drawing',notes:'',points:points.map(([x,y,z])=>({x,y,z})),connections:{start:null,end:null}});
  const through=route('through-test','Through enclosure',[[8500,7000,300],[10500,7000,300],[10500,7000,900],[8500,7000,900]]);through.connections.end={itemId:item.id,portId:'port-test'};
  model.services=[through,route('high-test','High route',[[8500,7000,1200],[10500,7000,1200]],'upper-test'),route('vertical-test','Vertical riser',[[9500,7000,-100],[9500,7000,700]])];
  model.serviceItems=[item,{...structuredClone(item),id:'unknown-test',name:'Unknown dimensions',center:{x:12500,y:7000},ports:[],envelope:null}];
  await ui.locator('#fileInput').setInputFiles({name:'route-body.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await ui.waitForFunction(()=>state.model.services.length===3);await expand('#serviceRouteBodySchedule');
  assert.match(await ui.locator('#serviceRouteBodySchedule').innerText(),/2 pairs with centreline entry/);
  assert.match(await ui.locator('#serviceRouteBodySchedule').innerText(),/1 plan-only pairs/);
  assert.match(await ui.locator('#serviceRouteBodySchedule').innerText(),/1 records not assessed/);
  assert.match(await ui.locator('#serviceRouteBodySchedule').innerText(),/entry may be intentional/);
  assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.find(p=>p.route.id==='through-test').length),1000);
  await ui.locator('#serviceRouteBodySchedule [data-route-body-select="item"]').first().click();
  assert.equal(await field('name').inputValue(),'Test enclosure');await field('elevation').fill('2000');await field('elevation').press('Tab');
  assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.filter(p=>p.length>0).length),1);
  assert.equal(await ui.evaluate(()=>state.model.services[0].points.at(-1).z),2900,'Linked endpoint follows the moved item');
  assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.find(p=>p.length>0).route.id),'through-test');await ui.locator('#undoButton').click();
  assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.filter(p=>p.length>0).length),2);await ui.locator('#redoButton').click();await ui.locator('#undoButton').click();
  await expand('#serviceRouteBodySchedule');await ui.locator('#serviceRouteBodySchedule [data-route-body-select="route"]').first().click();
  assert.equal(await field('name').inputValue(),'Through enclosure');await field('point-0-z').evaluate(el=>el.closest('details').open=true);await field('point-0-z').fill('100');await field('point-0-z').press('Tab');
  assert.ok(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.find(p=>p.route.id==='through-test').length>1000));await ui.locator('#undoButton').click();
  await ui.locator('#isolateServiceRouteBodyButton').click();
  const unchanged=await ui.evaluate(()=>JSON.stringify([state.model,quantityData(),serviceRouteBodyChecks()]));
  for(const mode of ['plan','3d']){
   await ui.locator('[data-mode="'+mode+'"]').click();const shown=await ui.locator('#designCanvas').screenshot();
   await ui.locator('[data-layer="serviceRouteBodyChecks"]').uncheck();assert.ok(!shown.equals(await ui.locator('#designCanvas').screenshot()),mode+' independent overlay');
   await ui.locator('[data-layer="serviceRouteBodyChecks"]').check();assert.equal(await ui.evaluate(()=>JSON.stringify([state.model,quantityData(),serviceRouteBodyChecks()])),unchanged);
  }
  await ui.locator('#levelVisibility').evaluate(el=>el.closest('details').open=true);await ui.locator('[data-visible-level="upper-test"]').uncheck();
  assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.filter(p=>serviceRouteBodyPairVisible(p,true)).length),2);
  assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.length),3);await ui.locator('[data-visible-level="upper-test"]').check();
  await ui.locator('#hideServiceOverlays').click();assert.equal(await ui.locator('[data-layer="serviceRouteBodyChecks"]').isChecked(),false);
  await ui.locator('#showServiceOverlays').click();assert.equal(await ui.locator('[data-layer="serviceRouteBodyChecks"]').isChecked(),true);
  await ui.locator('#serviceOverlayOpacity').evaluate(el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await ui.evaluate(()=>state.serviceOverlayOpacity),.4);
  const csv=await download('#serviceRouteBodyCsvButton');assert.match(csv,/Inside centreline mm/);assert.match(csv,/Plan crossing only/);assert.match(csv,/Not assessed/);assert.match(csv,/"1000"/);
  const saved=JSON.parse(await download('#saveButton'));assert.equal(saved.schema,30);
  await ui.locator('#fileInput').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await ui.waitForFunction(()=>state.statusMessage==='Project JSON opened');assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.length),3);
  const bad=structuredClone(saved);bad.serviceItems[0].envelope.width='0';const beforeBad=await ui.evaluate(()=>JSON.stringify(state.model));
  await ui.locator('#fileInput').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await ui.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));assert.equal(await ui.evaluate(()=>JSON.stringify(state.model)),beforeBad);
  await ui.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');await page.reload();await workspace();
  assert.deepEqual(await ui.evaluate(()=>state.model.serviceItems),saved.serviceItems);assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.length),3);
  await expand('#serviceRouteBodySchedule');await ui.locator('[data-mode="3d"]').click();await ui.locator('#isolateServiceRouteBodyButton').click();
  await ui.locator('#serviceRouteBodySchedule [data-route-body-select="route"]').first().click();assert.equal(await ui.evaluate(()=>state.mode),'3d');
  assert.match(await ui.locator('#selectionDetails').innerText(),/Route \/ body review/);
  await ui.locator('#serviceOverlayOpacity').evaluate(el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await ui.locator('#serviceRouteBodySchedule').evaluate(el=>el.closest('section').scrollIntoView({block:'start'}));
  await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'test-results','service-route-body-3d.png')});
  await ui.locator('[data-mode="plan"]').click();await page.screenshot({path:path.join(__dirname,'test-results','service-route-body-plan.png')});
  assert.ok(await ui.locator('.inspector').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
  console.log('Route/body browser workflow passed'+(expo?' through Expo':'')+': mixed/vertical/plan crossings, connected review, missing dimensions, editable inputs, undo/redo, Plan/3D isolation, levels/group opacity, CSV, JSON/rejection/autosave/reload and selection; no page errors.');
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
