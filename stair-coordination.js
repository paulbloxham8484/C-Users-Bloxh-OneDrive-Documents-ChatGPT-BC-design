/* Elevation coordination records compare immutable measured geometry to explicit
   level/floor references. They never resize stairs or translate saved floors. */
function makeStairCoordination() {
  return { lower: { kind: 'none', id: '', offset: null }, upper: { kind: 'none', id: '', offset: null }, source: '', notes: '' };
}
function validateStairCoordination(record) {
  if (record === undefined) return;
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Stair coordination must be an object.');
  for (const end of ['lower', 'upper']) {
    const ref = record[end];
    if (!ref || typeof ref !== 'object' || Array.isArray(ref) || !['none', 'level', 'floor'].includes(ref.kind) || typeof ref.id !== 'string' || ref.id.length > 200) throw new Error('Choose valid lower and upper stair reference records.');
    if (ref.offset !== null && ref.offset !== undefined && (!Number.isFinite(ref.offset) || Math.abs(ref.offset) > 1e6)) throw new Error('Stair reference offset must be blank or a finite number within ±1,000,000 mm.');
  }
}
function normalizeStairCoordination(stair) {
  const raw = stair.coordination, defaults = makeStairCoordination();
  stair.coordination = { lower: { ...defaults.lower, ...raw?.lower }, upper: { ...defaults.upper, ...raw?.upper }, source: typeof raw?.source === 'string' ? raw.source.slice(0, 2000) : '', notes: typeof raw?.notes === 'string' ? raw.notes.slice(0, 2000) : '' };
}
function validateCoordinationDatums(raw) {
  const ids = new Set();
  for (const level of raw.levels) {
    if (!level || typeof level !== 'object' || Array.isArray(level)) throw new Error('Each level needs a valid record.');
    if (level.elevation !== undefined && (!Number.isFinite(level.elevation) || Math.abs(level.elevation) > 1e9)) throw new Error('Level elevation must be finite and within ±1,000,000,000 mm.');
    if (level.id) { const id = String(level.id); if (ids.has(id)) throw new Error('Duplicate level ID.'); ids.add(id); }
  }
  // Existing floor omissions retain their legacy defaults, but non-finite values
  // must not become a false zero-elevation match during JSON cloning.
  for (const floor of raw.floors || []) if (floor?.elevation !== undefined && (!Number.isFinite(floor.elevation) || Math.abs(floor.elevation) > 1e9)) throw new Error('Floor elevation must be finite and within ±1,000,000,000 mm.');
  for (const stair of raw.stairs || []) for (const end of ['lower', 'upper']) {
    const ref = stair.coordination?.[end]; if (!ref || ref.kind === 'none' || !ref.id) continue;
    const target = (ref.kind === 'level' ? raw.levels : raw.floors || []).find(item => String(item.id) === ref.id);
    if (target && !Number.isFinite(target.elevation)) throw new Error('Referenced level/floor elevation is missing or invalid; supply its measured datum before coordination.');
  }
}
function stairCoordinationAnchor(stair, end) {
  if (end === 'lower') return { ...stair.a, z: stair.elevation };
  const g = stairGeometry(stair), layout = stair.continuation?.layout || 'none';
  if (layout === 'none') return { ...stair.b, z: g.flights[0].top };
  if (layout === 'landing') {
    if (!g.landing) return null;
    const [a, b] = [g.landing.points[1], g.landing.points[2]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: g.landing.top };
  }
  const final = g.flights[1]; return final ? { ...final.b, z: final.top } : null;
}
function stairCoordinationResult(stair, end, model = state.model) {
  const record = stair.coordination || makeStairCoordination(), reference = record[end], anchor = stairCoordinationAnchor(stair, end);
  const result = { stair, end, reference, anchor, target: null, targetName: '', targetLevelId: '', targetElevation: null, delta: null, status: 'Unassigned', assessed: false, source: record.source, notes: record.notes };
  if (reference.kind === 'none' || !reference.id) return result;
  const list = reference.kind === 'level' ? model.levels : model.floors;
  const matches = list.filter(item => item.id === reference.id);
  if (matches.length !== 1) { result.status = matches.length ? 'Ambiguous target ID' : `Missing ${reference.kind} reference`; return result; }
  const target = matches[0]; result.targetName = target.name || `Floor ${reference.id}`;
  result.targetLevelId = reference.kind === 'level' ? target.id : target.levelId;
  if (!Number.isFinite(target.elevation)) { result.status = 'Target elevation unassessed'; return result; }
  if (reference.offset == null) { result.status = 'Finish offset pending'; return result; }
  result.targetElevation = target.elevation + reference.offset;
  if (!anchor) { result.status = 'Upper stair geometry incomplete'; return result; }
  result.target = { x: anchor.x, y: anchor.y, z: result.targetElevation };
  result.delta = anchor.z - result.targetElevation;
  // This epsilon suppresses floating-point noise only. It is not a site/code tolerance.
  result.status = Math.abs(result.delta) <= 1e-6 ? 'Coincident elevations' : 'Elevation mismatch';
  result.assessed = true; return result;
}
function stairCoordinationResults() { return state.model.stairs.flatMap(stair => ['lower', 'upper'].map(end => stairCoordinationResult(stair, end))); }
function stairCoordinationBounds() { return stairCoordinationResults().flatMap(r => r.reference.kind === 'none' ? [] : [r.anchor, r.target].filter(Boolean)); }
function coordinationVisible(result, mode) {
  if (!state.visibility.stairCoordination || result.reference.kind === 'none' || !result.anchor) return false;
  return mode === '3d' ? isLevelVisible3d(result.stair) || (result.targetLevelId && isLevelVisible3d({ levelId: result.targetLevelId })) : [result.stair.levelId, result.targetLevelId].includes(state.model.activeLevelId);
}
function drawStairCoordination(mode) {
  for (const r of stairCoordinationResults().filter(r => coordinationVisible(r, mode))) {
    const project = mode === '3d' ? p => isoPoint(p, p.z) : worldToScreen, p = project(r.anchor);
    ctx.save(); ctx.strokeStyle = r.status === 'Coincident elevations' ? '#187e84' : '#bd6233'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2;
    if (mode === '3d' && r.target) { const target = project(r.target); ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(target.x, target.y); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(target.x - 7, target.y); ctx.lineTo(target.x + 7, target.y); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke(); ctx.font = '11px Segoe UI';
    const value = r.assessed ? `${r.delta > 0 ? '+' : ''}${formatNumber(r.delta, 2)} mm` : '?';
    ctx.fillText(`${r.end === 'lower' ? 'L' : 'U'} ${value}`, p.x + 9, p.y - 7);ctx.restore();
  }
}
function hitStairCoordination(point) {
  const row = stairCoordinationResults().reverse().find(r => coordinationVisible(r, 'plan') && lengthBetween(point, r.anchor) <= 10 / state.view.scale);
  return row ? { type: 'stair', id: row.stair.id } : null;
}
function updateStairCoordination(field, value) {
  if (state.selected?.type !== 'stair') return;
  const stair = selectedObject(), next = clone(stair.coordination || makeStairCoordination());
  if (['source', 'notes'].includes(field)) next[field] = value.slice(0, 2000);
  else {
    const [end, key] = field.split('-'); if (!['lower', 'upper'].includes(end)) return;
    if (key === 'target') { const colon = value.indexOf(':'); next[end].kind = colon < 0 ? 'none' : value.slice(0, colon); next[end].id = colon < 0 ? '' : value.slice(colon + 1); }
    else if (key === 'offset') next[end].offset = value.trim() ? Number(value) : null;
    else return;
  }
  try { validateStairCoordination(next); } catch (error) { state.statusMessage = error.message; render(); return; }
  withHistory(() => { stair.coordination = next; state.visibility.stairCoordination = true; });
}
function renderStairCoordinationDetails(stair) {
  const record = stair.coordination || makeStairCoordination();
  const ends = ['lower', 'upper'].map(end => {
    const ref = record[end], value = ref.kind === 'none' ? '' : `${ref.kind}:${ref.id}`, options = [['', 'Unassigned'], ...state.model.levels.map(l => [`level:${l.id}`, `Level: ${l.name} · ${formatNumber(l.elevation)} mm`]), ...state.model.floors.map(f => [`floor:${f.id}`, `Floor: ${f.name || f.id} · ${levelName(f.levelId)} · ${formatNumber(f.elevation)} mm`])];
    if (value && !options.some(([key]) => key === value)) options.push([value, `Missing saved ${ref.kind}: ${ref.id}`]);
    const r = stairCoordinationResult(stair, end);
    return `<label for="sc-${end}-target">${end === 'lower' ? 'Lower' : 'Upper'} finished reference</label><select id="sc-${end}-target" data-coordination-field="${end}-target">${options.map(([key, label]) => `<option value="${escapeHtml(key)}" ${key === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select><label for="sc-${end}-offset">Signed finish offset from reference (mm)</label><input id="sc-${end}-offset" type="number" step="any" data-coordination-field="${end}-offset" value="${escapeHtml(ref.offset ?? '')}" /><p class="overview-copy">${escapeHtml(r.status)}${r.assessed ? ` · stair ${formatNumber(r.anchor.z, 2)} mm; target ${formatNumber(r.targetElevation, 2)} mm; Δ ${formatNumber(r.delta, 2)} mm (stair − target)` : ''}</p>`;
  }).join('');
  return `<h3 class="reinforcement-heading">Stair / floor coordination</h3>${ends}<label for="sc-source">Drawing / survey / datum evidence</label><input id="sc-source" maxlength="2000" data-coordination-field="source" value="${escapeHtml(record.source)}" /><label for="sc-notes">Coordination notes</label><input id="sc-notes" maxlength="2000" data-coordination-field="notes" value="${escapeHtml(record.notes)}" /><p class="overview-copy">Comparisons use recorded absolute elevations in the common project datum. Enter 0 explicitly for no finish offset. Linking does not move floors or resize stairs. Lower reference uses the base before the first riser; upper uses the final flight's upper nosing, or the outer landing-edge midpoint for a landing-only stair. An incomplete continuation has no assessed upper endpoint.</p><p class="warning-note">Coincident elevations means numerical agreement only (1e−6 mm arithmetic epsilon). Floor outlines, access width, support connections, headroom, finish tolerances and compliance are not checked. Record the project's adopted NCC/standards and qualified design evidence.</p>`;
}
function renderCoordinationSchedule() {
  const el = document.querySelector('#stairCoordinationSchedule'); if (!el) return;
  el.innerHTML = stairCoordinationResults().map(r => `<button type="button" class="foundation-schedule-row" data-coordination-stair="${escapeHtml(r.stair.id)}"><strong>${escapeHtml(r.stair.name)} · ${r.end}</strong><span>${escapeHtml(r.targetName || r.reference.id || 'Unassigned')}</span><small>${escapeHtml(r.status)}${r.assessed ? ` · Δ ${formatNumber(r.delta, 2)} mm` : ''}</small></button>`).join('') || '<p class="overview-copy">Select a stair to assign lower and upper level/floor references.</p>';
}
function selectStairCoordination(id) {
  const stair = state.model.stairs.find(s => s.id === id); if (!stair) return;
  state.model.activeLevelId = stair.levelId; state.selected = { type: 'stair', id }; state.visibility.stairCoordination = true; render(); document.querySelector('#sc-lower-target')?.scrollIntoView?.({ block: 'nearest' });
}
function renderLevelDatums() {
  const el = document.querySelector('#levelDatumEditor'); if (!el) return;
  el.innerHTML = state.model.levels.map(l => `<div class="field-grid"><label>Level name<input aria-label="Level ${escapeHtml(l.id)} name" data-level-datum="${escapeHtml(l.id)}" data-level-field="name" maxlength="40" value="${escapeHtml(l.name)}" /></label><label>Datum elevation (mm)<input aria-label="Level ${escapeHtml(l.id)} elevation" data-level-datum="${escapeHtml(l.id)}" data-level-field="elevation" type="number" step="any" value="${l.elevation}" /></label></div>`).join('');
}
function updateLevelDatum(id, field, value) {
  const level = state.model.levels.find(l => l.id === id); if (!level || !['name', 'elevation'].includes(field)) return;
  const next = field === 'name' ? value.trim().slice(0, 40) : value.trim() ? Number(value) : NaN;
  if ((field === 'name' && !next) || (field === 'elevation' && (!Number.isFinite(next) || Math.abs(next) > 1e9))) { state.statusMessage = 'Enter a level name and finite datum elevation within ±1,000,000,000 mm.'; render(); return; }
  withHistory(() => { level[field] = next; });
}
function updateCoordinationFloorField(field, value) {
  if (state.selected?.type !== 'floor' || field !== 'elevation') return false;
  const number = value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number) || Math.abs(number) > 1e9) { state.statusMessage = 'Enter a finite floor elevation within ±1,000,000,000 mm.'; render(); return true; }
  const floor = selectedObject(); withHistory(() => { floor.elevation = number; }); return true;
}
function exportStairCoordinationCsv() {
  const rows = [['Stair ID', 'Stair', 'Owning level', 'Endpoint', 'Reference type', 'Reference ID', 'Reference name', 'Reference level', 'Finish offset mm', 'Stair elevation mm', 'Target elevation mm', 'Stair minus target mm', 'Status', 'Endpoint X mm', 'Endpoint Y mm', 'Evidence', 'Notes', 'Basis'], ...stairCoordinationResults().map(r => [r.stair.id, r.stair.name, levelName(r.stair.levelId), r.end, r.reference.kind, r.reference.id, r.targetName, r.targetLevelId ? levelName(r.targetLevelId) : '', r.reference.offset, r.anchor?.z, r.targetElevation, r.delta, r.status, r.anchor?.x, r.anchor?.y, r.source, r.notes, 'Absolute datum; elevation comparison only; no floor footprint, headroom, support or compliance check'])];
  const cell = value => { let text = String(value ?? ''); if (typeof value === 'string' && /^\s*[=+@-]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  download('bc-design-stair-level-coordination.csv', rows.map(row => row.map(cell).join(',')).join('\n'), 'text/csv');
}
