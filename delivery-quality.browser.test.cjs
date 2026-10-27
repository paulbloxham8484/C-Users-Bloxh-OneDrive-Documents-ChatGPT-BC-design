const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
(async()=>{
 const url=process.env.BC_TEST_URL||'http://127.0.0.1:4197/',label=/^https:/.test(url)?'live':'local',out=path.join(__dirname,'test-results','quality87',label);await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 const download=async(selector,name,binary=false)=>{const event=page.waitForEvent('download',{timeout:45000});await page.locator(selector).click();const item=await event;await item.saveAs(path.join(out,name));const bytes=await fs.readFile(await item.path());return binary?bytes:bytes.toString('utf8');};
 try{
  await page.goto(url);await prepareWorkspace(page);await page.locator('#loadExampleButton').click();
  assert.equal(await page.evaluate(()=>state.model.rooms.filter(r=>r.use==='Bedroom').length),3);assert.equal(await page.evaluate(()=>state.model.takeoffGroups[0].items.length),49);checks.push('Complete example and site allowances load');
  await page.locator('[data-mode="site"]').click();assert.equal(await page.evaluate(()=>state.visibility.siteConcepts),true);await page.screenshot({path:path.join(out,'site.png')});
  await page.locator('#siteWalkthroughButton').click();assert.ok(await page.evaluate(()=>state.view.isoScale)>.008);await page.screenshot({path:path.join(out,'site-3d.png')});
  await page.locator('[data-mode="quantities"]').click();assert.match(await page.locator('#quantityCards').innerText(),/112\.50 m³/);assert.match(await page.locator('#quantityCards').innerText(),/240\.00 m²/);await page.screenshot({path:path.join(out,'takeoffs.png')});
  const csv=await download('#exportCompleteTakeoffButton','complete-takeoff.csv');for(const term of ['112.5','118.13','11.52','0.432','Resilience','Lime Tuff','Little Jess','1982','250'])assert.ok(csv.includes(term),term);checks.push('Actual complete takeoff CSV, all requested pool details, plant lines and drawing reconciliation');
  await page.locator('#interiorPlanButton').click();const before=await page.evaluate(()=>JSON.stringify({model:state.model,history:state.history,view:state.view,visibility:state.visibility}));
  await page.locator('#renderedDrawingsButton').click();await page.waitForFunction(()=>[...document.querySelectorAll('#realisticRenderGallery img')].length===3&&[...document.querySelectorAll('#realisticRenderGallery img')].every(image=>image.complete&&image.naturalWidth>0));
  assert.equal(await page.locator('#renderedDrawingGallery img').count(),5);assert.equal(await page.evaluate(()=>JSON.stringify({model:state.model,history:state.history,view:state.view,visibility:state.visibility})),before);
  for(const id of ['exterior','cutaway','structure','site','landscape']){const png=await download(`[data-render-export="${id}"]`,id+'.png',true);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),2400);assert.equal(png.readUInt32BE(20),1600);assert.ok(png.length>30000);}
  checks.push('All five model-study PNGs download; three realistic images load; project and camera preserved');
  await page.locator('#closeRenderedDrawings').click();await page.locator('.top-actions .workspace-menu summary').click();await page.locator('#planSheetButton').click();await page.locator('#planSheetScale').fill('200');
  const pdf=await download('#planSheetPdf','plan.pdf',true);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');await page.waitForFunction(()=>!vectorPdfBusy);await page.locator('#planSheetClose').click();checks.push('Direct vector PDF downloads from this exact workspace');
  await page.locator('.top-actions .workspace-menu summary').click();await page.locator('#siteSheetButton').click();const sitePdf=await download('#siteSheetPdf','site.pdf',true);assert.equal(sitePdf.subarray(0,5).toString(),'%PDF-');await page.waitForFunction(()=>!vectorPdfBusy);await page.locator('#siteSheetClose').click();checks.push('Site PDF downloads with scale and external annotations');
  const saved=JSON.parse(await download('#saveButton','project.json'));await page.locator('#fileInput').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});assert.equal(await page.evaluate(()=>state.model.walls.length),24);await page.evaluate(()=>persist());await page.reload();await page.locator('#designCanvas').waitFor();assert.equal(await page.evaluate(()=>state.model.takeoffGroups[0].items.length),49);checks.push('JSON transfer and autosave/reload retain site and building records');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({url,checked:new Date().toISOString(),passed:true,checks,errors},null,2));console.log(JSON.stringify({url,passed:true,checks,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
