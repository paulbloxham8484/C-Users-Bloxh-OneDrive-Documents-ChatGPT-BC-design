// Legacy technical workflows navigate the current tabs and menus through real UI clicks.
// No hidden elements are forced visible and no model, geometry or review status is changed.
const installed = new WeakSet();
async function prepareWorkspace(ui) {
  await ui.waitForFunction(()=>typeof createEmptyModel==='function' && !!window.BCWorkspace);
  if (!installed.has(ui)) {
    const locate = ui.locator.bind(ui);
    const chains = new Set(['first','last','nth','locator','filter','getByRole','getByText','getByLabel']);
    const actions = new Set(['click','dblclick','check','uncheck','setChecked','fill','selectOption','press','hover','scrollIntoViewIfNeeded']);
    async function reveal(target) {
      const first = target.first();
      await first.waitFor({state:'attached'});
      const panel = await first.evaluate(el => el.closest('.workspace-panel')?.id || '');
      if (panel) {
        const tab = locate('#workspace-tab-' + panel.replace('workspace-',''));
        if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') await tab.click();
      }
      // DOM order is outer-to-inner, so nested service group summaries are reachable.
      for (const details of await target.locator('xpath=ancestor::details[not(@open)]').all()) {
        await details.locator(':scope > summary').click();
      }
    }
    function wrap(target) {
      return new Proxy(target, {get(object,key) {
        const value=object[key];
        if (typeof value!=='function') return value;
        if (actions.has(key)) return async(...args)=>{await reveal(object);return value.apply(object,args);};
        if (chains.has(key)) return (...args)=>wrap(value.apply(object,args));
        return value.bind(object);
      }});
    }
    ui.locator=(...args)=>wrap(locate(...args));
    installed.add(ui);
  }
  // These workflows inspect technical layers; readable-plan mode has its own UI regression.
  await ui.locator('[data-mode="plan"]').click();
  const display=ui.locator('#planDisplayMode');
  if(await display.count()) await display.selectOption('coordination');
}
module.exports={prepareWorkspace};
