const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.BC_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const field = (key) => page.locator(`#detail-continuation-${key}`);
  const edit = async (key, value) => { await field(key).fill(String(value)); await field(key).press('Tab'); };
  const selectStair = async () => { await page.locator('#stairSchedule').locator('xpath=..').locator('summary').click(); await page.locator('#stairSchedule [data-stair-id]').first().click(); };

  try {
    await page.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:4180/workspace/index.html');await prepareWorkspace(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#designCanvas').waitFor();
    await page.locator('#loadExampleButton').click();await page.evaluate(()=>{const stair=makeStair({x:0,y:0},{x:0,y:1500},state.model.activeLevelId,0);Object.assign(stair,{width:1000,rise:900,risers:6});state.model.stairs=[stair];state.visibility.stairLandings=true;render();});
    await selectStair();

    assert.equal(await page.locator('[data-field="continuation-layout"]').inputValue(), 'none');
    await page.locator('[data-field="continuation-layout"]').selectOption('landing');
    assert.equal(await field('landingWidth').inputValue(), '');
    assert.match(await page.locator('#selectionDetails').innerText(), /Landing dimensions pending/);
    await edit('landingLength', 1200);
    await edit('landingWidth', 1200);
    await edit('landingThickness', 150);
    await edit('dimensionSource', 'Measured landing survey');
    let geometry = await page.evaluate(() => { const g = stairGeometry(selectedObject()); return { status: g.continuationStatus, area: g.landing.area, volume: g.landing.volume, flights: g.flights.length }; });
    assert.deepEqual(geometry, { status: 'Landing preview', area: 1440000, volume: 216000000, flights: 1 });
    assert.match(await page.locator('#selectionDetails').innerText(), /Landing top area/);

    await page.locator('[data-field="continuation-layout"]').selectOption('left');
    await edit('flightWidth', 900);
    await edit('flightRun', 1200);
    await edit('flightRise', 900);
    await edit('flightRisers', 5);
    await edit('flightRisers', 5.5);
    assert.equal(await field('flightRisers').inputValue(), '5');
    geometry = await page.evaluate(() => { const g = stairGeometry(selectedObject()); return { status: g.continuationStatus, flights: g.flights.length, totalRisers: g.totalRisers, top: g.top }; });
    assert.deepEqual(geometry, { status: 'Two-flight preview', flights: 2, totalRisers: 11, top: 1800 });

    await edit('flightRise', 1000);
    await page.locator('#undoButton').click();
    assert.equal(await page.evaluate(() => state.model.stairs[0].continuation.flightRise), 900);
    await page.locator('#redoButton').click();
    assert.equal(await page.evaluate(() => state.model.stairs[0].continuation.flightRise), 1000);
    await page.locator('#stairSchedule [data-stair-id]').first().click();
    await page.locator('[data-field="continuation-layout"]').selectOption('return-left');
    await edit('landingWidth', 2000);
    await edit('flightGap', 100);
    assert.equal(await page.evaluate(() => stairGeometry(selectedObject()).flights.length), 2);
    assert.ok(await page.evaluate(() => {
      const s=selectedObject(), g=stairGeometry(s), d=unit(sub(s.b,s.a));
      return g.flights[1].outline.every(p=>(p.x-s.b.x)*d.x+(p.y-s.b.y)*d.y<1e-6);
    }));
    await edit('landingWidth', 1800);
    assert.match(await page.locator('#selectionDetails').innerText(), /does not fit landing/);
    assert.equal(await page.evaluate(() => stairGeometry(selectedObject()).flights.length), 1);
    await edit('landingWidth', 2000);
    await edit('landingThickness', '');
    assert.match(await page.locator('#quantityTable').innerText(), /Stair landing volumes unassessed/);
    await edit('landingThickness', 150);
    assert.equal(await page.evaluate(() => stairQuantityRows().find(r=>r.label==='Stair landing area').net), 2.4);
    assert.equal(await page.evaluate(() => stairQuantityRows().find(r=>r.label==='Stair landing body volume').net), 0.36);

    await page.locator('[data-mode="plan"]').click();
    await page.locator('#fitButton').click();
    const landingVisible = await page.locator('[data-layer="stairLandings"]').isChecked();
    assert.equal(landingVisible, true);
    const withLanding = await page.locator('#designCanvas').screenshot();
    await page.locator('[data-layer="stairLandings"]').uncheck();
    const withoutLanding = await page.locator('#designCanvas').screenshot();
    assert.notDeepEqual(withoutLanding, withLanding);
    await page.locator('[data-layer="stairLandings"]').check();
    await fs.mkdir('test-results', {recursive:true});
    await page.screenshot({path:'test-results/stair-landings-plan.png'});
    await page.locator('[data-mode="3d"]').click();
    await page.locator('#fitButton').click();
    assert.equal(await page.evaluate(() => state.visibility.stairLandings), true);
    await page.locator('[data-layer="floors"]').uncheck();
    await page.locator('[data-layer="decks"]').uncheck();
    const landing3d=await page.locator('#designCanvas').screenshot();
    await page.locator('[data-layer="stairLandings"]').uncheck();
    assert.equal(await page.evaluate(() => state.visibility.stairLandings), false);
    await page.locator('[data-layer="stairLandings"]').check();
    await page.locator('[data-layer="floors"]').check();
    await page.locator('[data-layer="decks"]').check();
    await page.screenshot({path:'test-results/stair-landings-3d.png'});
    const csvDownload=page.waitForEvent('download');
    await page.locator('#stairCsvButton').click();
    const csv=await fs.readFile(await(await csvDownload).path(),'utf8');
    assert.match(csv,/Total measured rise mm/);
    assert.match(csv,/"return-left"/);
    assert.match(csv,/"2.4","0.36"/);

    const downloading = page.waitForEvent('download');
    await page.locator('#saveButton').click();
    const saved = JSON.parse(await fs.readFile(await (await downloading).path(), 'utf8'));
    assert.equal(saved.schema,30);
    assert.equal(saved.stairs[0].continuation.layout, 'return-left');
    assert.equal(saved.stairs[0].continuation.flightRise, 1000);
    assert.match(await page.locator('#quantityTable').innerText(), /Stair landing area/);

    await page.locator('#fileInput').setInputFiles({ name: 'stair-roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await page.waitForFunction(() => state.statusMessage === 'Project JSON opened');
    assert.equal(await page.evaluate(() => stairGeometry(state.model.stairs[0]).flights.length), 2);
    const bad=structuredClone(saved); bad.stairs[0].continuation.flightRisers=1;
    await page.locator('#fileInput').setInputFiles({name:'invalid-stair.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
    await page.waitForFunction(()=>state.statusMessage.includes('2–100'));
    assert.equal(await page.evaluate(()=>state.model.stairs[0].continuation.flightRisers),5);
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent === 'Saved locally');
    await page.reload();
    await page.locator('#designCanvas').waitFor();
    assert.equal(await page.evaluate(() => state.model.stairs[0].continuation.layout), 'return-left');
    assert.deepEqual(errors, []);
    console.log('Stair browser workflow passed: inspector landing/turn editing, quantities, independent Plan/3D landing layer, undo/redo, CSV/JSON round-trip, autosave reload and no page errors.');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
