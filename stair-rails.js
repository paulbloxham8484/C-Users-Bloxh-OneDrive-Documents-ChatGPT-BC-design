/* Project-entered top-reference lines and zero-thickness barrier envelopes.
   Flight heights follow the nosing pitch line, starting at the first tread. */
const STAIR_RAIL_TARGETS = { 'flight-1': 'First flight', 'flight-2': 'Second flight', 'landing-1': 'Landing edge 1', 'landing-2': 'Landing edge 2', 'landing-3': 'Landing edge 3', 'landing-4': 'Landing edge 4' };
const STAIR_RAIL_NUMBERS = ['height', 'offset', 'startInset', 'endInset', 'bottomGap'];
const STAIR_RAIL_TEXT = ['name', 'material', 'sectionReference', 'dimensionSource', 'drawingRef', 'designCriteria', 'loads', 'connections', 'openings', 'notes'];

function makeStairRail(kind = 'handrail') {
  return { endDetails:makeRailEnds(), members:makeStairMembers(), id: uid('stair-rail'), kind, target: 'flight-1', side: 'left', height: null, offset: 0, startInset: 0, endInset: 0, bottomGap: null, name: kind === 'barrier' ? 'Stair barrier' : 'Stair handrail', material: '', sectionReference: '', dimensionSource: '', drawingRef: '', designCriteria: '', loads: '', connections: '', openings: '', notes: '' };
}

function validateStairRails(runs) {
  if (runs === undefined) return;
  if (!Array.isArray(runs) || runs.length > 64) throw new Error('Stair rails must be a list of at most 64 runs per stair.');
  const ids = new Set();
  for (const run of runs) {
    if (!run || typeof run !== 'object' || Array.isArray(run) || typeof run.id !== 'string' || !run.id.trim() || ids.has(run.id)) throw new Error('Each stair rail needs a unique ID within its stair.');
    ids.add(run.id); validateStairMembers(run.members); validateRailEnds(run.endDetails,run.id);
    if (!['handrail', 'barrier'].includes(run.kind) || !Object.hasOwn(STAIR_RAIL_TARGETS, run.target) || !['left', 'right'].includes(run.side)) throw new Error('Choose a supported stair rail type, target and side.');
    for (const key of STAIR_RAIL_NUMBERS) {
      const value = run[key];
      if (value === undefined || value === null) continue;
      if (!Number.isFinite(value) || Math.abs(value) > 1e6 || (key === 'height' && value <= 0) || (key !== 'height' && key !== 'offset' && value < 0)) throw new Error(`${key} must be a valid project dimension within the 1,000,000 mm modelling limit, or blank.`);
    }
    if (run.kind === 'barrier' && run.height != null && run.bottomGap != null && run.bottomGap >= run.height) throw new Error('Barrier bottom gap must be less than its entered top height.');
  }
}

function normalizeStairRails(stair) {
  stair.railRuns = (stair.railRuns || []).map(raw => {
    const run = { ...makeStairRail(raw.kind), ...raw };
    for (const field of STAIR_RAIL_TEXT) run[field] = typeof raw[field] === 'string' ? raw[field].slice(0, 2000) : '';
    normalizeStairMembers(run); normalizeRailEnds(run); return run;
  });
}

function stairRailGeometry(stair, run) {
  const pending = status => ({ status, assessed: false, top: [], bottom: [], length: null, planLength: null, area: null });
  const geometry = stairGeometry(stair);
  let a, b, outward;
  if (run.target.startsWith('flight-')) {
    const flight = geometry.flights[Number(run.target.slice(-1)) - 1];
    if (!flight) return pending('Target flight unassessed or absent');
    const d = unit(sub(flight.b, flight.a));
    const sign = run.side === 'left' ? 1 : -1;
    outward = { x: d.y * sign, y: -d.x * sign }; // Plan +Y is down.
    // The first tread is one riser above the base; the upper nosing is the landing.
    a = { ...add(flight.a, scale(outward, flight.width / 2)), z: flight.elevation + flight.riser };
    b = { ...add(flight.b, scale(outward, flight.width / 2)), z: flight.top };
  } else {
    if (!geometry.landing) return pending('Target landing unassessed or absent');
    const index = Number(run.target.slice(-1)) - 1, points = geometry.landing.points;
    a = { ...points[index] }; b = { ...points[(index + 1) % 4] };
    const direction = unit(sub(b, a)), centre = scale(points.reduce((sum, p) => add(sum, p), { x: 0, y: 0 }), .25);
    outward = { x: direction.y, y: -direction.x };
    if ((centre.x - a.x) * outward.x + (centre.y - a.y) * outward.y > 0) outward = scale(outward, -1);
  }
  if (['height', 'offset', 'startInset', 'endInset'].some(key => run[key] == null)) return pending('Rail dimensions pending');
  const fullRun = lengthBetween(a, b), measuredRun = fullRun - run.startInset - run.endInset;
  if (measuredRun < 1) return pending('Setbacks leave less than 1 mm of run');
  const interpolate = distance => {
    const t = distance / fullRun;
    return { x: a.x + (b.x - a.x) * t + outward.x * run.offset, y: a.y + (b.y - a.y) * t + outward.y * run.offset, z: a.z + (b.z - a.z) * t };
  };
  const base = [interpolate(run.startInset), interpolate(fullRun - run.endInset)];
  const top = base.map(p => ({ ...p, z: p.z + run.height }));
  const bottom = run.kind === 'barrier' && run.bottomGap != null ? base.map(p => ({ ...p, z: p.z + run.bottomGap })) : [];
  return { assessed: true, status: run.kind === 'barrier' && !bottom.length ? 'Top line only; bottom gap pending' : 'Measured reference geometry', top, bottom, base, planLength: measuredRun, length: Math.hypot(top[1].x - top[0].x, top[1].y - top[0].y, top[1].z - top[0].z), area: bottom.length ? measuredRun * (run.height - run.bottomGap) : null };
}

function stairRailReview(stair, run, geometry = stairRailGeometry(stair, run)) {
  const issues = [];
  if (!geometry.assessed || (run.kind === 'barrier' && geometry.area == null)) issues.push(geometry.status);
  if (!run.dimensionSource || !run.drawingRef) issues.push('Record project dimensions and drawing revision.');
  if (!run.material || !run.sectionReference) issues.push('Record the selected material and exact section/product evidence; sizes are not inferred.');
  if (!run.designCriteria || !run.loads || !run.connections) issues.push('Design criteria, loading and anchorage need qualified project review.');
  if (run.kind === 'barrier' && !run.openings) issues.push('Openings, infill and climbability need project evidence.');
  if (run.target.startsWith('landing-')) issues.push('Review stair/floor access at this edge; a run can cross a flight opening. Setbacks are entered manually.');
  issues.push('Coverage, joints, end returns, extensions, graspability and compliance are not assessed.');
  return issues;
}

function stairRailResults() {
  return state.model.stairs.flatMap(stair => (stair.railRuns || []).map(run => ({ stair, run, geometry: stairRailGeometry(stair, run) })));
}
function stairRailBounds() { return stairRailResults().flatMap(({ geometry }) => [...geometry.top, ...geometry.bottom]); }
function stairRailVisible(run) { return state.visibility[run.kind === 'barrier' ? 'stairBarriers' : 'stairHandrails']; }

function drawStairRails(mode) {
  const project = mode === '3d' ? p => isoPoint(p, p.z) : worldToScreen;
  const rows = stairRailResults().filter(({ stair, run, geometry }) => geometry.assessed && stairRailVisible(run) && (mode === '3d' ? isLevelVisible3d(stair) : stair.levelId === state.model.activeLevelId));
  rows.sort((a, b) => a.geometry.top[0].x + a.geometry.top[0].y - b.geometry.top[0].x - b.geometry.top[0].y);
  for (const { stair, run, geometry } of rows) {
    const selected = state.selected?.type === 'stair' && state.selected.id === stair.id;
    ctx.save();
    const colour = selected ? '#ed1c24' : run.kind === 'barrier' ? '#84589e' : '#147d83';
    if (mode === '3d' && geometry.bottom.length) polygon([geometry.bottom[0], geometry.bottom[1], geometry.top[1], geometry.top[0]].map(project), 'rgba(145,115,170,.22)', colour);
    const [a, b] = geometry.top.map(project);
    ctx.strokeStyle = colour; ctx.lineWidth = selected ? 3 : 2;
    if (run.kind === 'barrier') ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    for (const point of [a, b]) { ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
}

function hitStairRails(stair, point) {
  const tolerance = 8 / state.view.scale;
  return (stair.railRuns || []).some(run => {
    if (!stairRailVisible(run)) return false;
    const g = stairRailGeometry(stair, run); if (!g.assessed) return false;
    const [a, b] = g.top, dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= tolerance;
  });
}

function stairRailAction(action, index) {
  if (state.selected?.type !== 'stair') return;
  const stair = selectedObject();
  if (['add-stair-handrail', 'add-stair-barrier'].includes(action)) {
    const run = makeStairRail(action === 'add-stair-barrier' ? 'barrier' : 'handrail');
    try { validateStairRails([...(stair.railRuns || []), run]); } catch (error) { state.statusMessage = error.message; render(); return; }
    withHistory(() => { (stair.railRuns ||= []).push(run); state.visibility[run.kind === 'barrier' ? 'stairBarriers' : 'stairHandrails'] = true; });
  } else if (action === 'remove-stair-rail' && Number.isInteger(index) && stair.railRuns?.[index]) withHistory(() => stair.railRuns.splice(index, 1));
}

function updateStairRail(index, field, value) {
  if (state.selected?.type !== 'stair') return;
  const stair = selectedObject(), current = stair.railRuns?.[index]; if (!current) return;
  if (![...STAIR_RAIL_NUMBERS, ...STAIR_RAIL_TEXT, 'target', 'side'].includes(field)) return;
  const next = { ...current, [field]: STAIR_RAIL_NUMBERS.includes(field) ? (value.trim() ? Number(value) : null) : value.slice(0, 2000) };
  try { validateStairRails(stair.railRuns.map((run, i) => i === index ? next : run)); } catch (error) { state.statusMessage = error.message; render(); return; }
  withHistory(() => Object.assign(current, next));
}

function renderStairRailDetails(stair) {
  const controls = (run, index) => {
    const input = (field, label, numeric = true) => `<div class="inspector-field"><label for="sr-${index}-${field}">${escapeHtml(label)}</label><input id="sr-${index}-${field}" data-stair-rail="${index}" data-stair-rail-field="${field}" type="${numeric ? 'number' : 'text'}" ${numeric ? 'step="any"' : 'maxlength="2000"'} value="${escapeHtml(run[field] ?? '')}" /></div>`;
    const select = (field, label, options) => `<div class="inspector-field"><label for="sr-${index}-${field}">${label}</label><select id="sr-${index}-${field}" data-stair-rail="${index}" data-stair-rail-field="${field}">${Object.entries(options).map(([value, title]) => `<option value="${value}" ${run[field] === value ? 'selected' : ''}>${title}</option>`).join('')}</select></div>`;
    return input('name', 'Run name', false) + select('target', 'Attached edge', STAIR_RAIL_TARGETS) + (run.target.startsWith('flight-') ? select('side', 'Side walking up', { left: 'Left', right: 'Right' }) : '') + input('height', 'Top height vertically (mm)') + input('offset', 'Outward offset (mm; negative inward)') + input('startInset', 'Start setback in plan (mm)') + input('endInset', 'End setback in plan (mm)') + (run.kind === 'barrier' ? input('bottomGap', 'Bottom gap vertically (mm)') : '') + [['material', 'Material'], ['sectionReference', 'Section / exact product reference'], ['dimensionSource', 'Dimension source / URL'], ['drawingRef', 'Drawing / revision'], ['designCriteria', 'NCC edition / design criteria'], ['loads', 'Loading design evidence'], ['connections', 'Anchorage / connections'], ['openings', 'Infill / openings / climbability'], ['notes', 'Notes']].map(([field, label]) => input(field, label, false)).join('');
  };
  return `<h3 class="reinforcement-heading">Attached handrails and barriers</h3><button type="button" class="link-button" data-action="add-stair-handrail">Add handrail</button> <button type="button" class="link-button" data-action="add-stair-barrier">Add stair barrier</button><p class="overview-copy">Enter project-designed heights; none are supplied automatically. Each run follows its selected flight or landing edge when the stair changes. Positive offsets move outward. Setbacks shorten the run in plan. Flight reference heights follow the first tread nosing to the upper nosing; landing reference heights follow its horizontal top.</p>${(stair.railRuns || []).map((run, i) => { const g = stairRailGeometry(stair, run); return `<details open id="stair-rail-${i}"><summary>${escapeHtml(run.name)} · ${run.kind}</summary><div class="field-grid">${controls(run, i)}</div>${renderStairMemberDetails(stair,run,i)}${renderRailEndDetails(stair,run,i)}<p class="overview-copy">${escapeHtml(g.status)}${g.assessed ? ` · ${formatLength(g.length)} top reference length${g.area == null ? '' : ` · ${formatArea(g.area)} gross envelope area`}` : ''}</p><p class="warning-note">${stairRailReview(stair, run, g).map(escapeHtml).join('<br>')}</p><button type="button" class="delete-button" data-action="remove-stair-rail" data-index="${i}">Remove run</button></details>`; }).join('')}<p class="overview-copy">Handrails are top-reference lines; barriers are zero-thickness envelopes, not specified infill panels. Optional section/post outer envelopes have their own layer. Optional end returns and connection reviews have separate layers; brackets and fabricated joints are not generated. Landing edges 1–4 follow the perimeter point order; choose and check the displayed edge and use setbacks to preserve access. These measurements are not a product order or proof of fall protection.</p>`;
}

function renderStairRailSchedule() {
  const element = document.querySelector('#stairRailSchedule'); if (!element) return;
  element.innerHTML = stairRailResults().map(({ stair, run, geometry }) => `<button type="button" class="foundation-schedule-row" data-stair-rail-owner="${escapeHtml(stair.id)}" data-stair-rail-id="${escapeHtml(run.id)}"><strong>${escapeHtml(run.name)} · ${run.kind}</strong><span>${escapeHtml(stair.name)} · ${escapeHtml(levelName(stair.levelId))} · ${STAIR_RAIL_TARGETS[run.target]}</span><small>${escapeHtml(geometry.status)}${geometry.assessed ? ` · ${formatLength(geometry.length)}` : ''}</small></button>`).join('') || '<p class="overview-copy">Select a stair to add project-defined handrail or barrier runs.</p>';
}
function selectStairRail(owner, id) {
  const stair = state.model.stairs.find(s => s.id === owner), index = stair?.railRuns?.findIndex(r => r.id === id);
  if (!stair || index == null || index < 0) return;
  state.model.activeLevelId = stair.levelId; state.selected = { type: 'stair', id: stair.id };
  state.visibility[stair.railRuns[index].kind === 'barrier' ? 'stairBarriers' : 'stairHandrails'] = true;
  render(); document.querySelector(`#stair-rail-${index}`)?.scrollIntoView?.({ block: 'nearest' });
}

function stairRailQuantityRows() {
  const results = stairRailResults(); if (!results.length) return [];
  const rows = [];
  for (const kind of ['handrail', 'barrier']) {
    const runs = results.filter(r => r.run.kind === kind && r.geometry.assessed), net = runs.reduce((sum, r) => sum + r.geometry.length, 0) / 1000;
    if (runs.length) rows.push({ label: `Stair ${kind} top reference length`, net, waste: 0, order: net, unit: 'm', basis: 'Measured sloping reference lines; duplicate runs are included; excludes sections, joints, returns, fixings and waste; not a material order' });
  }
  const panels = results.filter(r => r.geometry.area != null), area = panels.reduce((sum, r) => sum + r.geometry.area, 0) / 1e6;
  if (panels.length) rows.push({ label: 'Stair barrier envelope area', net: area, waste: 0, order: area, unit: 'm²', basis: 'Zero-thickness gross vertical envelopes; no deductions for openings, overlap or posts; not an infill order' });
  const pending = results.filter(r => !r.geometry.assessed || (r.run.kind === 'barrier' && r.geometry.area == null)).length;
  if (pending) rows.push({ label: 'Stair rail records partly/unassessed', net: pending, waste: 0, order: pending, unit: 'count', basis: 'Missing dimensions or absent target; unknown components excluded from measured quantities' });
  return rows;
}

function exportStairRailCsv() {
  const rows = [['Stair ID', 'Stair', 'Level', 'Run ID', 'Name', 'Type', 'Target', 'Side', 'Top height mm', 'Outward offset mm', 'Start setback mm', 'End setback mm', 'Bottom gap mm', 'Status', 'Plan length m', 'Top reference length m', 'Gross envelope area m2', 'Start X mm', 'Start Y mm', 'Start top Z mm', 'End X mm', 'End Y mm', 'End top Z mm', 'Material', 'Section/product reference', 'Dimension source', 'Drawing revision', 'Design criteria', 'Loads', 'Connections', 'Openings', 'Notes', 'Review'], ...stairRailResults().map(({ stair, run, geometry: g }) => [stair.id, stair.name, levelName(stair.levelId), run.id, run.name, run.kind, run.target, run.target.startsWith('flight-') ? run.side : '', run.height, run.offset, run.startInset, run.endInset, run.bottomGap, g.status, g.planLength == null ? '' : g.planLength / 1000, g.length == null ? '' : g.length / 1000, g.area == null ? '' : g.area / 1e6, g.top[0]?.x, g.top[0]?.y, g.top[0]?.z, g.top[1]?.x, g.top[1]?.y, g.top[1]?.z, run.material, run.sectionReference, run.dimensionSource, run.drawingRef, run.designCriteria, run.loads, run.connections, run.openings, run.notes, stairRailReview(stair, run, g).join('; ')])];
  const cell = value => { let text = String(value ?? ''); if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  download('bc-design-stair-rails.csv', rows.map(row => row.map(cell).join(',')).join('\n'), 'text/csv');
}
