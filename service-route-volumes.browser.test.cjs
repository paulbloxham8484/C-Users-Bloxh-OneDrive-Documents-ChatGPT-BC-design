const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let ui=page,expo=false;
 const field=key=>ui.locator('[data-field="'+key+'"]');
 const expand=async id=>ui.locator(id).evaluate(el=>el.closest('details').open=true);
 async function edit(key,value){await field(key).fill(String(value));await field(key).press('Tab');}
 async function download(id){const waiting=page.waitForEvent('download');await ui.locator(id).click();return fs.readFile(await(await waiting).path(),'utf8');}
 async function workspace(){await page.locator('#bc-design-workspace, #designCanvas').waitFor();if(await page.locator('#bc-design-workspace').count()){expo=true;ui=await(await page.locator('#bc-design-workspace').elementHandle()).contentFrame();}await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);}
 try{
  await page.goto(process.env.BC_EXPO_URL||process.env.BC_TEST_URL||'http://127.0.0.1:4180/?expo=volumes40');await workspace();
  await ui.locator('#loadExampleButton').click();const model=await ui.evaluate(()=>clone(state.model)),ground=model.activeLevelId;
  model.schema=13;model.levels.push({id:'volume-upper',name:'Upper',elevation:3000});
  const section=(shape,width,height=100,roll=0)=>({shape,diameter:String(width),width:String(width),height:String(height),roll:String(roll),sourceRef:'Test cross-section drawing',notes:'Outside dimensions'});
  const item=(id,name,kind,x,z,width,depth,height)=>({id,name,kind,system:'water',levelId:ground,center:{x,y:7000},elevation:z,partType:'Test equipment',size:'',material:'',manufacturer:'',productCode:'',designRef:'Product drawing',notes:'',routeId:'',ports:[],envelope:{width:String(width),depth:String(depth),height:String(height),rotation:'0',left:'',right:'',front:'',back:'',below:'',above:'',sourceRef:'Test product drawing',clearanceRef:'',notes:''}});
  const enclosure=item('enclosure','Enclosure','fixture',9500,0,1000,800,600),valve=item('valve','Valve body','fitting',12500,100,400,400,500);
  enclosure.ports=[{id:'volume-port',name:'Recorded end',system:'water',offset:{x:-1000,y:450,z:300},size:'',maxConnections:'',designRef:'Point drawing',notes:''}];
  const route=(id,name,points,crossSection,level=ground)=>({id,name,system:'water',levelId:level,size:'DN text only',material:'',designRef:'Route drawing',notes:'',points:points.map(([x,y,z])=>({x,y,z})),connections:{start:null,end:null},crossSection});
  const round=route('round','Round water',[[8500,7450,300],[10500,7450,300]],section('round',200));round.connections.start={itemId:'enclosure',portId:'volume-port'};
  model.services=[round,route('duct','Rect duct',[[8500,7000,670],[10500,7000,670]],section('rectangular',200,100),'volume-upper'),route('riser','Riser',[[12500,7000,-100],[12500,7000,1000],[13000,7000,1000]],section('rectangular',100,80)),route('unknown','Unknown route',[[14000,8000,0],[15000,8000,0]],null)];
  model.serviceItems=[enclosure,valve,{...structuredClone(valve),id:'unknown-body',name:'Unknown body',center:{x:14500,y:9000},envelope:null}];
  await ui.locator('#fileInput').setInputFiles({name:'physical-volume.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
  await ui.waitForFunction(()=>state.model.services.length===4);await expand('#servicePhysicalSchedule');
  assert.equal(await ui.evaluate(()=>state.model.schema),30);
  assert.match(await ui.locator('#servicePhysicalSchedule').innerText(),/2 volume-overlap pairs/);assert.match(await ui.locator('#servicePhysicalSchedule').innerText(),/1 plan-only pairs/);assert.match(await ui.locator('#servicePhysicalSchedule').innerText(),/2 unassessed records/);
  assert.equal(await ui.evaluate(()=>serviceRouteBodyChecks().pairs.some(p=>p.route.id==='round')),false);
  assert.equal(await ui.evaluate(()=>servicePhysicalChecks().pairs.find(p=>p.route.id==='round').status),'Volume overlap');
  assert.match(await ui.locator('#servicePhysicalSchedule').innerText(),/entry may be intentional/);
  await expand('#serviceVolumeSchedule');await ui.locator('[data-volume-route="round"]').click();assert.equal(await field('section-diameter').inputValue(),'200');
  const quantities=await ui.evaluate(()=>JSON.stringify(quantityData()));await edit('section-diameter',80);
  assert.equal(await ui.evaluate(()=>servicePhysicalChecks().pairs.some(p=>p.route.id==='round')),false);await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>state.model.services[0].crossSection.diameter),'200');
  await ui.locator('#redoButton').click();await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>JSON.stringify(quantityData())),quantities);
  await expand('#serviceVolumeSchedule');await ui.locator('[data-volume-route="duct"]').click();await edit('section-roll',90);
  assert.equal(await ui.evaluate(()=>servicePhysicalChecks().pairs.filter(p=>p.status==='Volume overlap').length),3);await ui.locator('#undoButton').click();
  await expand('#serviceVolumeSchedule');await ui.locator('[data-volume-route="unknown"]').click();await ui.locator('[data-action="service-add-section"]').click();
  assert.equal(await ui.evaluate(()=>serviceVolumeGeometry(state.model.services[3]).segments.length),0);await field('section-shape').selectOption('rectangular');
  await edit('section-width',120);await edit('section-height',80);await edit('section-sourceRef','Project section S1');
  assert.equal(await ui.evaluate(()=>serviceVolumeGeometry(state.model.services[3]).volume),9600000);
  const beforeBad=await ui.evaluate(()=>JSON.stringify(state.model));await edit('section-width',-1);assert.equal(await ui.evaluate(()=>JSON.stringify(state.model)),beforeBad);assert.equal(await field('section-width').inputValue(),'120');
  await ui.locator('[data-action="service-remove-section"]').click();assert.equal(await ui.evaluate(()=>state.model.services[3].crossSection),null);await ui.locator('#undoButton').click();assert.equal(await ui.evaluate(()=>state.model.services[3].crossSection.width),'120');
  const unchanged=await ui.evaluate(()=>JSON.stringify([state.model,quantityData(),servicePhysicalChecks().pairs.map(p=>[p.key,p.status,p.segments.map(s=>s.status)])]));
  await ui.locator('#hideServiceOverlays').click();
  for(const mode of ['plan','3d']){
   await ui.locator('[data-mode="'+mode+'"]').click();const empty=await ui.locator('#designCanvas').screenshot();
   await ui.locator('[data-layer="serviceRouteVolumes"]').check();assert.ok(!empty.equals(await ui.locator('#designCanvas').screenshot()),mode+' physical volumes independently visible');
   await ui.locator('[data-layer="serviceRouteVolumes"]').uncheck();await ui.locator('[data-layer="servicePhysicalChecks"]').check();assert.ok(!empty.equals(await ui.locator('#designCanvas').screenshot()),mode+' checks independently visible');
   await ui.locator('[data-layer="servicePhysicalChecks"]').uncheck();assert.equal(await ui.evaluate(()=>JSON.stringify([state.model,quantityData(),servicePhysicalChecks().pairs.map(p=>[p.key,p.status,p.segments.map(s=>s.status)])])),unchanged);
  }
  await ui.locator('#showServiceOverlays').click();assert.equal(await ui.locator('[data-layer="serviceRouteVolumes"]').isChecked(),true);assert.equal(await ui.locator('[data-layer="servicePhysicalChecks"]').isChecked(),true);
  await ui.locator('#isolateServicePhysicalButton').click();assert.equal(await ui.locator('[data-layer="serviceRouteVolumes"]').isChecked(),false);assert.equal(await ui.locator('[data-layer="servicePhysicalChecks"]').isChecked(),true);
  await ui.locator('#levelVisibility').evaluate(el=>el.closest('details').open=true);await ui.locator('[data-visible-level="volume-upper"]').uncheck();
  assert.equal(await ui.evaluate(()=>servicePhysicalChecks().pairs.filter(p=>serviceRouteBodyPairVisible(p,true)).length),2);assert.equal(await ui.evaluate(()=>servicePhysicalChecks().pairs.length),3);await ui.locator('[data-visible-level="volume-upper"]').check();
  await ui.locator('#serviceOverlayOpacity').evaluate(el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await ui.evaluate(()=>state.serviceOverlayOpacity),.4);
  const csv=await download('#serviceVolumeCsvButton'),checks=await download('#servicePhysicalCsvButton');assert.match(csv,/Route total/);assert.match(csv,/Segment/);assert.match(csv,/Gross envelope mm3/);assert.match(csv,/Project section S1/);assert.match(checks,/Full segment gross envelope mm3/);assert.match(checks,/Plan overlap only/);assert.match(checks,/Not assessed/);
  const saved=JSON.parse(await download('#saveButton'));assert.equal(saved.schema,30);assert.equal(saved.services[3].crossSection.width,'120');
  await ui.locator('#fileInput').setInputFiles({name:'physical-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await ui.waitForFunction(()=>state.statusMessage==='Project JSON opened');
  const bad=structuredClone(saved);bad.services[0].crossSection.diameter='0';const beforeImport=await ui.evaluate(()=>JSON.stringify(state.model));
  await ui.locator('#fileInput').setInputFiles({name:'physical-invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await ui.waitForFunction(()=>state.statusMessage.startsWith('Open failed:'));assert.equal(await ui.evaluate(()=>JSON.stringify(state.model)),beforeImport);
  await ui.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Saved locally');await page.reload();await workspace();
  assert.deepEqual(await ui.evaluate(()=>state.model.services.map(s=>s.crossSection)),saved.services.map(s=>s.crossSection));assert.equal(await ui.evaluate(()=>servicePhysicalChecks().pairs.length),3);
  await ui.locator('[data-mode="3d"]').click();await ui.locator('#isolateServicePhysicalButton').click();await expand('#servicePhysicalSchedule');
  await ui.locator('#servicePhysicalSchedule [data-physical-type="item"]').first().click();assert.equal(await field('name').inputValue(),'Enclosure');assert.equal(await ui.evaluate(()=>state.mode),'3d');assert.match(await ui.locator('#selectionDetails').innerText(),/Physical volume \/ body review/);
  await ui.locator('#serviceOverlayOpacity').evaluate(el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await ui.locator('#servicePhysicalSchedule').evaluate(el=>el.closest('section').scrollIntoView({block:'start'}));await fs.mkdir(path.join(__dirname,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'test-results','service-volumes-3d.png')});await ui.locator('[data-mode="plan"]').click();await page.screenshot({path:path.join(__dirname,'test-results','service-volumes-plan.png')});
  assert.ok(await ui.locator('.inspector').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
  console.log('Physical route volume browser workflow passed'+(expo?' through Expo':'')+': editable round/rectangular sections, roll, thickness-only overlap, fitting/fixture checks, partial/invalid records, migration, undo/redo, independent Plan/3D layers, levels/group opacity, schedules/two CSVs, JSON rejection/save/reload; no page errors.');
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
