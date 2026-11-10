'use strict';
// Code-level event simulations. These do not emulate a digitizer or certify palm rejection.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

function harness() {
  const noop = () => {}, captures = new Set(), storage = new Map(), listeners = [];
  const measure = new Proxy({ measureText: t => ({ width: String(t).length * 6 }) }, { get: (t, k) => t[k] || noop });
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, { value: '', style: {}, textContent: '', classList: { add: noop, remove: noop },
      getContext: () => measure, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0 }),
      setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) });
    return elements.get(key);
  };
  const context = vm.createContext({ console, document: { querySelector: element, querySelectorAll: () => [],
    addEventListener: (type, fn, capture) => { if (type === 'keydown') listeners.push({ type, fn, capture }); } },
    window: { clearTimeout: noop, setTimeout: noop }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } });
  const source = fs.readFileSync('app.js', 'utf8');
  const scripts = require('./node-workspace-scripts.cjs')();
  vm.runInContext(scripts.map(f => f === 'app.js' ? source.split('document.querySelectorAll("[data-tool]")')[0] : fs.readFileSync(f, 'utf8')).join('\n'), context);
  const run = s => vm.runInContext(s, context), get = s => JSON.parse(run(`JSON.stringify(${s})`));
  run('render=()=>{};state.model=normalizeModel(createEmptyModel());state.mode="plan";state.view.scale=.1;state.view.offsetX=0;state.view.offsetY=0;state.tool="wall";');
  const event = (method, type, id, x, y, extras = {}) => {
    context.event = { type: method === 'onPointerDown' ? 'pointerdown' : method === 'onPointerMove' ? 'pointermove' : 'pointerup',
      pointerType: type, pointerId: id, clientX: x, clientY: y, button: 0, buttons: method === 'onPointerUp' ? 0 : 1, ...extras };
    run(`${method}(event)`);
  };
  const draw = (type = 'pen', id = 1, tool = 'wall') => {
    run(`setTool('${tool}')`); event('onPointerDown', type, id, 100, 100); event('onPointerMove', type, id, 400, 100); event('onPointerUp', type, id, 400, 100);
  };
  const key = (value, extras = {}, editable = false) => {
    if (!listeners.length) vm.runInContext(source.split('\n').filter(line => line.startsWith('document.addEventListener("keydown"')).join('\n'), context);
    let stopped = false;
    const e = { key: value, target: { matches: () => editable }, preventDefault: noop, stopImmediatePropagation: () => { stopped = true; }, ...extras };
    for (const l of [...listeners].sort((a, b) => Number(!!b.capture) - Number(!!a.capture))) { if (!stopped) l.fn(e); }
  };
  return { run, get, event, draw, key, captures, storage };
}

test('pen and mouse draw measured walls, select, undo and redo', () => {
  for (const type of ['pen', 'mouse']) {
    const h = harness(); h.draw(type);
    assert.equal(h.run('state.model.walls.length'), 1); assert.equal(h.run('lengthBetween(state.model.walls[0].a,state.model.walls[0].b)'), 3000);
    h.run('setTool("select")'); h.event('onPointerDown', type, 1, 250, 100); h.event('onPointerUp', type, 1, 250, 100);
    assert.equal(h.run('state.selected.type'), 'wall'); h.key('z', { ctrlKey: true }); assert.equal(h.run('state.model.walls.length'), 0);
    h.key('z', { ctrlKey: true, shiftKey: true }); assert.equal(h.run('state.model.walls.length'), 1);
  }
});

test('pen dimensions record measured endpoints and permit editing', () => {
  const h = harness(); h.draw('pen', 1, 'dimension');
  assert.equal(h.run('dimensionGeometry(state.model.dimensions[0]).length'), 3000);
  h.run('updateSelectedField("endX","5000")'); assert.equal(h.run('dimensionGeometry(state.model.dimensions[0]).length'), 4000);
});

test('wall and foundation include final pointer-up coordinates', () => {
  for (const tool of ['wall', 'foundation']) {
    const h = harness(); h.run(`setTool('${tool}')`);
    h.event('onPointerDown', 'pen', 1, 100, 100); h.event('onPointerMove', 'pen', 1, 300, 100); h.event('onPointerUp', 'pen', 1, 400, 100);
    assert.equal(h.run(`state.model.${tool === 'wall' ? 'walls' : 'foundations'}[0].b.x`), 4000);
  }
});

test('touch navigation does not create geometry and single touch pans', () => {
  const h = harness(), before = h.get('state.model'); h.event('onPointerDown', 'touch', 2, 100, 100); h.event('onPointerMove', 'touch', 2, 130, 140); h.event('onPointerUp', 'touch', 2, 130, 140);
  assert.equal(h.run('state.view.offsetX'), 30); assert.equal(h.run('state.view.offsetY'), 40); assert.deepEqual(h.get('state.model'), before);
});

test('touch movement during a pen stroke cannot pan or alter its geometry', () => {
  const h = harness(); h.event('onPointerDown', 'pen', 1, 100, 100); h.event('onPointerMove', 'pen', 1, 400, 100);
  h.event('onPointerDown', 'touch', 2, 600, 100); h.event('onPointerMove', 'touch', 2, 650, 150); h.event('onPointerUp', 'touch', 2, 650, 150);
  h.event('onPointerUp', 'pen', 1, 400, 100);
  assert.equal(h.run('state.view.offsetX'), 0); assert.equal(h.run('state.view.offsetY'), 0);
  assert.equal(h.run('lengthBetween(state.model.walls[0].a,state.model.walls[0].b)'), 3000);
});

test('pen takes priority over a pre-existing touch until a fresh touch starts', () => {
  const h = harness(); h.event('onPointerDown', 'touch', 2, 600, 100); h.event('onPointerDown', 'pen', 1, 100, 100);
  h.event('onPointerMove', 'touch', 2, 650, 150); h.event('onPointerMove', 'pen', 1, 400, 100); h.event('onPointerUp', 'pen', 1, 400, 100);
  h.event('onPointerMove', 'touch', 2, 700, 200); h.event('onPointerUp', 'touch', 2, 700, 200);
  assert.equal(h.run('state.view.offsetX'), 0); assert.equal(h.run('state.view.offsetY'), 0); assert.equal(h.run('state.touchPointers.size'), 0);
});

test('cancellation of another pointer does not cancel an active pen stroke', () => {
  const h = harness(); h.event('onPointerDown', 'pen', 1, 100, 100); h.event('onPointerMove', 'pen', 1, 400, 100);
  h.event('onPointerUp', 'touch', 2, 500, 100, { type: 'pointercancel' }); h.event('onPointerUp', 'pen', 1, 400, 100);
  assert.equal(h.run('state.model.walls.length'), 1);
});

test('unrelated pointers cannot overwrite a drawing or move its preview', () => {
  const h = harness(); h.event('onPointerDown', 'pen', 1, 100, 100); h.event('onPointerMove', 'pen', 1, 400, 100);
  const preview = h.get('state.drawing'); h.event('onPointerMove', 'mouse', 8, 800, 500); assert.deepEqual(h.get('state.drawing'), preview);
  h.event('onPointerDown', 'mouse', 8, 800, 500); assert.deepEqual(h.get('state.drawing'), preview);
});

test('right-click and pen eraser/barrel contact cannot draw walls', () => {
  for (const [type, button] of [['mouse', 2], ['pen', 2], ['pen', 5]]) {
    const h = harness(); h.event('onPointerDown', type, 1, 100, 100, { button }); h.event('onPointerMove', type, 1, 400, 100, { button }); h.event('onPointerUp', type, 1, 400, 100, { button });
    assert.equal(h.run('state.model.walls.length'), 0);
  }
});

test('two-to-one touch transition rebases its center without a jump', () => {
  const h = harness(); h.event('onPointerDown', 'touch', 2, 100, 100); h.event('onPointerDown', 'touch', 3, 300, 100); h.event('onPointerUp', 'touch', 3, 300, 100);
  h.event('onPointerMove', 'touch', 2, 110, 100); assert.equal(h.run('state.view.offsetX'), 10);
});

test('3D touch drag orbits, two fingers pan/pinch, without changing model', () => {
  const h = harness(); h.run('state.mode="3d"'); const before = h.get('state.model'), yaw = h.run('state.view.orbitYaw');
  h.event('onPointerDown', 'touch', 2, 100, 100); h.event('onPointerMove', 'touch', 2, 130, 100); assert.notEqual(h.run('state.view.orbitYaw'), yaw);
  h.event('onPointerDown', 'touch', 3, 330, 100); const z = h.run('state.view.isoScale');
  h.event('onPointerMove', 'touch', 3, 370, 120); assert.ok(h.run('state.view.isoScale') > z); assert.notEqual(h.run('state.view.orbitX'), 0);
  assert.deepEqual(h.get('state.model'), before);
});

test('owner cancellation or lost capture discards only the unfinished stroke', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const h = harness(); h.draw(); const before = h.get('state.model');
    h.event('onPointerDown', 'pen', 1, 100, 200); h.event('onPointerMove', 'pen', 1, 400, 200); h.event('onPointerUp', 'pen', 1, 400, 200, { type });
    assert.deepEqual(h.get('state.model'), before); assert.equal(h.run('state.drawing'), null);
    h.draw('mouse'); assert.equal(h.run('state.model.walls.length'), 2);
  }
});

test('keyboard tools, Escape, and editable-field shortcut isolation', () => {
  const h = harness(); h.key('p'); assert.equal(h.run('state.tool'), 'pan'); h.key('w'); assert.equal(h.run('state.tool'), 'wall');
  h.event('onPointerDown', 'pen', 1, 100, 100); h.event('onPointerMove', 'pen', 1, 400, 100); h.key('Escape'); h.event('onPointerUp', 'pen', 1, 400, 100); assert.equal(h.run('state.model.walls.length'), 0);
  h.draw(); h.key('z', { ctrlKey: true }, true); h.key('p', {}, true); assert.equal(h.run('state.model.walls.length'), 1); assert.equal(h.run('state.tool'), 'wall');
});

test('autosave and restore retain the synthetic drawing and dimension', () => {
  const h = harness(); h.draw(); h.draw('pen', 1, 'dimension'); h.run('els.projectName.value="Surface acceptance fixture";persist()'); const before = h.get('state.model');
  h.run('state.model=createEmptyModel()'); assert.equal(h.run('restoreSaved()'), true);
  const after = h.get('state.model'); delete before.metadata.updatedAt; delete after.metadata.updatedAt; assert.deepEqual(after, before);
});

test('finger drawing and selection are opt-in and preserve pen workflows', () => {
  const h = harness(); h.run('setInputSetting("touchMode","draw")'); h.draw('touch');
  assert.equal(h.run('state.model.walls.length'), 1);
  h.run('setTool("select")'); h.event('onPointerDown', 'touch', 2, 250, 100); assert.equal(h.run('state.selected'), null);
  h.event('onPointerUp', 'touch', 2, 250, 100); assert.equal(h.run('state.selected.type'), 'wall');
  h.draw('touch', 2, 'dimension'); assert.equal(h.run('state.model.dimensions.length'), 1);
  h.draw('pen'); assert.equal(h.run('state.model.walls.length'), 2);
});

test('second finger converts an unfinished stroke or tap to navigation without geometry', () => {
  for (const tool of ['wall', 'dimension', 'floor', 'deck', 'pad', 'pier']) {
    const h = harness(); h.run(`setInputSetting('touchMode','draw');setTool('${tool}')`); const before = h.get('state.model');
    h.event('onPointerDown', 'touch', 2, 100, 100); h.event('onPointerMove', 'touch', 2, 300, 100); h.event('onPointerDown', 'touch', 3, 500, 100);
    h.event('onPointerMove', 'touch', 3, 550, 100); h.event('onPointerUp', 'touch', 3, 550, 100); h.event('onPointerMove', 'touch', 2, 350, 100); h.event('onPointerUp', 'touch', 2, 350, 100);
    assert.deepEqual(h.get('state.model'), before); assert.equal(h.run('state.floorDraft.length+state.deckDraft.length'), 0);
  }
});

test('pen-only mode ignores touch while mouse middle-drag pans', () => {
  const h = harness(); h.run('setInputSetting("touchMode","disabled")'); const view = h.get('state.view');
  h.event('onPointerDown', 'touch', 2, 100, 100); h.event('onPointerMove', 'touch', 2, 300, 100); h.event('onPointerUp', 'touch', 2, 300, 100); assert.deepEqual(h.get('state.view'), view);
  h.event('onPointerDown', 'mouse', 1, 100, 100, {button:1}); h.event('onPointerMove', 'mouse', 1, 130, 100); h.event('onPointerUp', 'mouse', 1, 130, 100);
  assert.equal(h.run('state.view.offsetX'), 30); assert.equal(h.run('state.model.walls.length'), 0);
});

test('exact length is not rounded to the snap grid and angle locks remain exact', () => {
  for (const tool of ['wall', 'foundation']) {
    const h = harness(); h.run('els.exactLength.value="1234";setInputSetting("angle",45)'); h.draw('pen', 1, tool);
    assert.ok(Math.abs(h.run(`lengthBetween(state.model.${tool === 'wall' ? 'walls' : 'foundations'}[0].a,state.model.${tool === 'wall' ? 'walls' : 'foundations'}[0].b)`) - 1234) < 1e-7);
  }
  const h = harness(); h.run('setInputSetting("grid",25)'); assert.deepEqual(h.get('snapPoint({x:113,y:162})'), {x:125,y:150});
  h.run('setInputSetting("grid",0)'); assert.deepEqual(h.get('snapPoint({x:113,y:162})'), {x:113,y:162});
  h.run('setInputSetting("angle",90)'); const snapped=h.get('snapPoint({x:1800,y:200},{x:0,y:0})'); assert.equal(snapped.y,0);
});

test('a checkpoint restore is undoable and malformed copies never replace a drawing', () => {
  const h=harness();h.draw();h.run('state.projectReady=true;els.projectName.value="One wall";const checkpointId=saveProjectCheckpoint().id;');h.draw('pen',1,'foundation');
  const before=h.get('state.model');assert.equal(h.run('restoreProjectCheckpoint(checkpointId)'),true);assert.equal(h.run('state.model.foundations.length'),0);
  h.run('undo()');const undone=h.get('state.model');delete undone.metadata.updatedAt;delete before.metadata.updatedAt;assert.deepEqual(undone,before);
  const bad=h.run('BCProjectRecovery.save(localStorage,"{bad json","Corruption test").id');const intact=h.get('state.model');assert.throws(()=>h.run(`restoreProjectCheckpoint('${bad}')`));assert.deepEqual(h.get('state.model'),intact);
});

test('unreadable autosave bytes survive recovery and a storage failure blocks replacement', () => {
  const h=harness();h.run('localStorage.setItem(STORAGE_KEY,"{broken");restoreSaved();persist()');
  assert.equal(h.run('projectRecoveryEntries().some(e=>e.raw==="{broken")'),true);
  h.run('state.projectReady=true;localStorage.setItem=()=>{throw Error("Quota exceeded")};');const before=h.get('state.model');h.run('newProject()');assert.deepEqual(h.get('state.model'),before);assert.match(h.run('state.statusMessage'),/Project unchanged/);
});
