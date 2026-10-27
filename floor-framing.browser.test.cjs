const {prepareWorkspace}=require('./browser-workspace-navigation.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.BC_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  let ui = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:4173/');
    await page.locator('#bc-design-workspace, #designCanvas').waitFor();
    if (await page.locator('#bc-design-workspace').count()) ui = await (await page.locator('#bc-design-workspace').elementHandle()).contentFrame();
    await ui.locator('#designCanvas').waitFor();await prepareWorkspace(ui);
    await ui.locator('#loadExampleButton').click();
    await ui.waitForFunction(() => state.statusMessage.includes('Example house loaded'));
    assert.ok(await ui.evaluate(() => state.model.floorFraming.length > 50));
    assert.ok(await ui.evaluate(() => state.model.floorSupportReviews.length > 0));

    await ui.locator('#floorFramingSchedule').evaluate(element => element.closest('details').open = true);
    const first = ui.locator('#floorFramingSchedule [data-floor-framing-id]').first();
    await first.click();
    assert.match(await ui.locator('#selectionDetails').innerText(), /House floor framing/);
    const depth = ui.locator('#selectionDetails [data-floor-member="0"][data-floor-member-field="depth"]');
    await depth.fill('210');
    await depth.press('Tab');
    assert.equal(await ui.evaluate(() => state.model.floorFraming.find(member => member.id === state.floorFramingSelectedId).depth), 210);
    assert.match(await ui.locator('#selectionDetails').innerText(), /Support coordination/);

    await ui.locator('[data-action="add-floor-fit"]').click();
    const profile = ui.locator('[data-floor-fit-field="profile"]').last();
    await profile.fill('90 x 45 project profile');
    await profile.press('Tab');
    assert.equal(await ui.evaluate(() => state.model.floorFitDetails.length), 1);
    assert.equal(await ui.evaluate(() => state.model.floorFitDetails[0].profile), '90 x 45 project profile');
    await ui.locator('[data-action="add-floor-access"]').click();
    await ui.locator('[data-floor-access-field="status"]').last().selectOption('pending');
    await ui.locator('[data-floor-access-field="zone"]').last().fill('Subfloor east maintenance route');
    await ui.locator('[data-floor-access-field="zone"]').last().press('Tab');
    assert.equal(await ui.evaluate(() => state.model.floorAccessReviews.length), 1);
    assert.equal(await ui.evaluate(() => state.model.floorAccessReviews[0].zone), 'Subfloor east maintenance route');

    const csvWait = page.waitForEvent('download');
    await ui.locator('#floorFramingCsvButton').click();
    const csv = await fs.readFile(await (await csvWait).path(), 'utf8');
    assert.match(csv, /Support review count/);
    assert.match(csv, /Main floor joist|Floor member/);

    const fitCsvWait = page.waitForEvent('download');
    await ui.locator('[data-action="floor-fit-csv"]').last().click();
    const fitCsv = await fs.readFile(await (await fitCsvWait).path(), 'utf8');
    assert.match(fitCsv, /90 x 45 project profile|Subfloor east maintenance route/);

    const before = await ui.locator('#designCanvas').screenshot();
    await ui.locator('[data-layer="floorFraming"]').uncheck();
    const hidden = await ui.locator('#designCanvas').screenshot();
    assert.notDeepEqual(before, hidden);
    await ui.locator('[data-layer="floorFraming"]').check();

    await ui.locator('[data-mode="3d"]').click();
    await ui.locator('#fitButton').click();
    await ui.locator('[data-mode="plan"]').click();
    await fs.mkdir(path.join(__dirname, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, 'test-results', 'floor-framing-plan.png') });
    assert.deepEqual(errors, []);
    console.log('Floor framing browser workflow passed: example members/support reviews, fitted profile/access edits, CSV, Plan/3D visibility and no page errors.');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
