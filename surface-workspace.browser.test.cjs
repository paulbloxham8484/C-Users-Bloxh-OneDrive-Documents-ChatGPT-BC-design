'use strict';
// Run on an authorised browser-capable development machine before packaging.
// CDP pen/touch are emulation, not physical Surface acceptance.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BC_PLAYWRIGHT_MODULE||'playwright');
const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
(async()=>{
  const allowed=new Set(JSON.parse(fs.readFileSync(path.join(__dirname,'distribution/workspace-files.json'))));
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
  const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!allowed.has(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');fs.createReadStream(path.join(__dirname,file)).pipe(res);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch(process.env.BC_BROWSER_EXECUTABLE?{executablePath:process.env.BC_BROWSER_EXECUTABLE,headless:true}:{channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,acceptDownloads:true}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await prepareWorkspace(page);
    await page.evaluate(()=>newProject());await page.locator('[data-tool="wall"]').click();
    const box=await page.locator('#designCanvas').boundingBox(),cdp=await context.newCDPSession(page);
    const x=box.x+100,y=box.y+100;
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1,pointerType:'pen'});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+200,y,buttons:1,pointerType:'pen'});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+200,y,button:'left',buttons:0,clickCount:1,pointerType:'pen'});
    assert.equal(await page.evaluate(()=>state.model.walls.length),1);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>state.model.walls.length),0);
    await page.keyboard.press('Control+Shift+z');assert.equal(await page.evaluate(()=>state.model.walls.length),1);
    await page.locator('.drawing-input-menu > summary').click();await page.locator('#drawingInputMode').selectOption('draw');await page.locator('#drawingSnapGrid').selectOption('25');await page.locator('#drawingAngleLock').selectOption('90');
    await page.locator('.drawing-input-menu > summary').click();
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id,radiusX:3,radiusY:3,force:.5}))});
    await touch('touchStart',[[x,y+90,1]]);await touch('touchMove',[[x+200,y+90,1]]);await touch('touchEnd',[]);assert.equal(await page.evaluate(()=>state.model.walls.length),2);
    await page.locator('#projectRecoveryButton').click();await page.getByRole('button',{name:'Create checkpoint',exact:true}).click();await page.getByRole('button',{name:'Close',exact:true}).click();
    const walls=await page.evaluate(()=>JSON.stringify(state.model.walls));await page.evaluate(()=>persist());await page.reload();await prepareWorkspace(page);assert.equal(await page.evaluate(()=>JSON.stringify(state.model.walls)),walls);
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller);
    await context.setOffline(true);await page.reload();await prepareWorkspace(page);assert.equal(await page.evaluate(()=>JSON.stringify(state.model.walls)),walls);
    const pending=page.waitForEvent('download');await page.locator('#saveButton').click();const downloaded=JSON.parse(fs.readFileSync(await(await pending).path(),'utf8'));assert.equal(downloaded.walls.length,2);
    assert.deepEqual(errors,[]);console.log('Browser emulation passed: pen draw, keyboard history, finger draw, controls, checkpoint, autosave reload, offline reload and JSON download. Physical Surface acceptance remains pending.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
