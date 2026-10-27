/* Entered house floor framing and support coordination geometry.
   This records project inputs; it does not size members, apply span tables or certify connections. */
const FLOOR_FRAMING_ROLES = ['joist', 'bearer', 'ledger', 'rim-joist'];
const FLOOR_FRAMING_TARGETS = ['pad', 'pier', 'foundation', 'wall'];
const FLOOR_FRAMING_EPS = 1e-6;

function validateFloorFraming(raw) {
  if (raw.floorFraming !== undefined) {
    if (!Array.isArray(raw.floorFraming) || raw.floorFraming.length > 2000) throw new Error('Floor framing must be a list of at most 2,000 members.');
    const ids = new Set();
    for (const member of raw.floorFraming) {
      if (!member || typeof member !== 'object' || Array.isArray(member) || typeof member.id !== 'string' || !member.id.trim() || member.id.length > 200) throw new Error('Floor framing members need unique non-empty IDs.');
      if (ids.has(member.id)) throw new Error('Floor framing member IDs must be unique.');
      ids.add(member.id);
      if (typeof member.floorId !== 'string' || typeof member.levelId !== 'string' || !FLOOR_FRAMING_ROLES.includes(member.role)) throw new Error('Floor framing needs a floor, level and supported member role.');
      if (![member.ax, member.ay, member.bx, member.by, member.width, member.depth, member.elevation].every(Number.isFinite) || Math.hypot(member.bx - member.ax, member.by - member.ay) < 1 || member.width <= 0 || member.depth <= 0) throw new Error('Floor framing needs finite endpoints/elevation, positive section dimensions and a non-zero length.');
      if ([member.ax, member.ay, member.bx, member.by, member.elevation].some(value => Math.abs(value) > 1e9) || member.width > 1e6 || member.depth > 1e6) throw new Error('Floor framing coordinates or dimensions exceed the modelling limits.');
      for (const key of ['name', 'material', 'design', 'fixings', 'drawingRef', 'notes']) if (member[key] !== undefined && (typeof member[key] !== 'string' || member[key].length > 2000)) throw new Error('Floor framing design records must be text up to 2,000 characters.');
    }
  }
  if (raw.floorSupportReviews !== undefined) {
    if (!Array.isArray(raw.floorSupportReviews) || raw.floorSupportReviews.length > 5000) throw new Error('Floor support reviews must be a list of at most 5,000 records.');
    const ids = new Set();
    for (const review of raw.floorSupportReviews) {
      if (!review || typeof review !== 'object' || Array.isArray(review) || typeof review.id !== 'string' || !review.id.trim() || review.id.length > 200 || ids.has(review.id)) throw new Error('Floor support review IDs must be unique non-empty strings.');
      ids.add(review.id);
      if (typeof review.memberId !== 'string' || !FLOOR_FRAMING_TARGETS.includes(review.targetType) || typeof review.targetId !== 'string') throw new Error('Floor support review needs a member and supported target reference.');
      for (const key of ['expectedGap', 'minimumPlanArea']) if (review[key] !== undefined && review[key] !== null && (!Number.isFinite(review[key]) || Math.abs(review[key]) > 1e9 || (key === 'minimumPlanArea' && review[key] < 0))) throw new Error('Floor support criteria must be finite project inputs.');
      for (const key of ['design', 'connections', 'drawingRef', 'notes']) if (review[key] !== undefined && (typeof review[key] !== 'string' || review[key].length > 2000)) throw new Error('Floor support review records must be text up to 2,000 characters.');
    }
  }
}

function normalizeFloorFraming(model) {
  const levelIds = new Set(model.levels.map(level => level.id));
  const fallbackLevel = model.levels[0].id;
  const floorIds = new Set(model.floors.map(floor => floor.id));
  model.floorFraming = (Array.isArray(model.floorFraming) ? model.floorFraming : []).map(member => ({
    id: String(member.id || uid('floor-member')),
    floorId: floorIds.has(member.floorId) ? member.floorId : '',
    levelId: levelIds.has(member.levelId) ? member.levelId : fallbackLevel,
    role: FLOOR_FRAMING_ROLES.includes(member.role) ? member.role : 'joist',
    name: typeof member.name === 'string' ? member.name.slice(0, 200) : '',
    ax: finiteNumber(member.ax, 0), ay: finiteNumber(member.ay, 0), bx: finiteNumber(member.bx, 1000), by: finiteNumber(member.by, 0),
    width: positiveNumber(member.width, 45), depth: positiveNumber(member.depth, 190), elevation: finiteNumber(member.elevation, 0),
    material: typeof member.material === 'string' ? member.material.slice(0, 2000) : '',
    design: typeof member.design === 'string' ? member.design.slice(0, 2000) : '',
    fixings: typeof member.fixings === 'string' ? member.fixings.slice(0, 2000) : '',
    drawingRef: typeof member.drawingRef === 'string' ? member.drawingRef.slice(0, 2000) : '',
    notes: typeof member.notes === 'string' ? member.notes.slice(0, 2000) : '',
  }));
  const memberIds = new Set(model.floorFraming.map(member => member.id));
  model.floorSupportReviews = (Array.isArray(model.floorSupportReviews) ? model.floorSupportReviews : []).map(review => ({
    id: String(review.id || uid('floor-support-review')),
    memberId: memberIds.has(review.memberId) ? review.memberId : '',
    targetType: FLOOR_FRAMING_TARGETS.includes(review.targetType) ? review.targetType : 'pier',
    targetId: typeof review.targetId === 'string' ? review.targetId : '',
    expectedGap: review.expectedGap === null ? null : finiteNumber(review.expectedGap, null),
    minimumPlanArea: review.minimumPlanArea === null ? null : finiteNumber(review.minimumPlanArea, null),
    design: typeof review.design === 'string' ? review.design.slice(0, 2000) : '',
    connections: typeof review.connections === 'string' ? review.connections.slice(0, 2000) : '',
    drawingRef: typeof review.drawingRef === 'string' ? review.drawingRef.slice(0, 2000) : '',
    notes: typeof review.notes === 'string' ? review.notes.slice(0, 2000) : '',
  }));
}

function floorMemberGeometry(member) {
  const a = { x: member.ax, y: member.ay }, b = { x: member.bx, y: member.by }, length = lengthBetween(a, b);
  const normal = scale({ x: -(b.y - a.y), y: b.x - a.x }, member.width / (2 * (length || 1)));
  return { a, b, outline: [add(a, normal), add(b, normal), sub(b, normal), sub(a, normal)], length, top: member.elevation + member.depth };
}

function floorFramingBounds() { return (state.model.floorFraming || []).flatMap(member => floorMemberGeometry(member).outline); }

function floorFramingTarget(review) {
  const collection = { pad: 'pads', pier: 'piers', foundation: 'foundations', wall: 'walls' }[review.targetType];
  return collection ? (state.model[collection] || []).find(item => item.id === review.targetId) : null;
}

function floorFramingTargetPolygon(review, target) {
  if (!target) return [];
  if (review.targetType === 'pad' || review.targetType === 'pier') return supportPolygon(target);
  const a = review.targetType === 'wall' ? target.a : target.a;
  const b = review.targetType === 'wall' ? target.b : target.b;
  const width = review.targetType === 'wall' ? target.thickness : target.width;
  const direction = unit(sub(b, a)), normal = scale({ x: -direction.y, y: direction.x }, width / 2);
  return [add(a, normal), add(b, normal), sub(b, normal), sub(a, normal)];
}

function floorFramingTargetVertical(review, target, member) {
  if (!target) return { base: null, top: null };
  if (review.targetType === 'wall') {
    const level = state.model.levels.find(item => item.id === target.levelId);
    const base = level?.elevation ?? member.elevation;
    return { base, top: base + target.height };
  }
  return { base: target.elevation, top: target.elevation + target.depth };
}

function floorFramingSignedArea(points) { let area = 0; for (let i = 0; i < points.length; i += 1) { const a = points[i], b = points[(i + 1) % points.length]; area += a.x * b.y - b.x * a.y; } return area / 2; }
function floorFramingClip(subject, clip) {
  if (subject.length < 3 || clip.length < 3) return [];
  const sign = floorFramingSignedArea(clip) >= 0 ? 1 : -1;
  const inside = (p, a, b) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= -FLOOR_FRAMING_EPS;
  const intersect = (s, e, a, b) => { const r = sub(e, s), d = sub(b, a), denominator = r.x * d.y - r.y * d.x; if (Math.abs(denominator) <= FLOOR_FRAMING_EPS) return e; const t = ((a.x - s.x) * d.y - (a.y - s.y) * d.x) / denominator; return add(s, scale(r, t)); };
  let output = subject.slice();
  for (let i = 0; i < clip.length && output.length; i += 1) { const a = clip[i], b = clip[(i + 1) % clip.length], input = output; output = []; let start = input[input.length - 1]; for (const end of input) { const endInside = inside(end, a, b), startInside = inside(start, a, b); if (endInside) { if (!startInside) output.push(intersect(start, end, a, b)); output.push(end); } else if (startInside) output.push(intersect(start, end, a, b)); start = end; } }
  return output;
}

function floorFramingReview(review) {
  const member = (state.model.floorFraming || []).find(item => item.id === review.memberId), target = floorFramingTarget(review);
  const result = { review, member, target, status: 'Unassessed', reason: '', planArea: null, gap: null, overlapDepth: null, contactArea: 0, marker: null, targetTop: null, targetBase: null, comparison: null, difference: null };
  if (!member) { result.status = 'Missing member'; result.reason = 'The linked floor-framing member is missing.'; return result; }
  if (!target) { result.status = 'Missing target'; result.reason = `The linked ${review.targetType} is missing.`; return result; }
  const memberGeometry = floorMemberGeometry(member), targetPolygon = floorFramingTargetPolygon(review, target), vertical = floorFramingTargetVertical(review, target, member), clipped = floorFramingClip(memberGeometry.outline, targetPolygon);
  result.targetTop = vertical.top; result.targetBase = vertical.base; result.gap = member.elevation - vertical.top; result.overlapDepth = vertical.base === vertical.top ? 0 : Math.max(0, Math.min(memberGeometry.top, vertical.top) - Math.max(member.elevation, vertical.base));
  result.planArea = clipped.length >= 3 ? polygonArea(clipped) : 0;
  if (result.planArea > FLOOR_FRAMING_EPS) result.marker = clipped.reduce((sum, p) => add(sum, p), { x: 0, y: 0 });
  if (result.marker) { result.marker.x /= clipped.length; result.marker.y /= clipped.length; }
  if (!targetPolygon.length) { result.status = 'Target geometry unavailable'; result.reason = 'The linked target has no usable plan footprint.'; return result; }
  if (result.planArea <= FLOOR_FRAMING_EPS) { result.status = 'No plan overlap'; result.reason = 'The member envelope does not overlap the selected support in Plan.'; }
  else if (Math.abs(result.gap) <= FLOOR_FRAMING_EPS) { result.status = 'Plan contact'; result.reason = 'Entered member underside meets the recorded target top at the selected overlap.'; result.contactArea = result.planArea; }
  else if (result.gap > 0) { result.status = 'Gap above target'; result.reason = 'The member underside is above the recorded target top.'; }
  else if (result.overlapDepth <= FLOOR_FRAMING_EPS && memberGeometry.top <= vertical.base + FLOOR_FRAMING_EPS) { result.status = 'Below target'; result.reason = 'The member envelope is below or meets the recorded target base with no solid vertical overlap.'; }
  else { result.status = 'Vertical overlap'; result.reason = 'The member and target envelopes overlap vertically; review the entered levels.'; }
  if (review.minimumPlanArea !== null && result.contactArea > 0) result.comparison = result.contactArea + FLOOR_FRAMING_EPS >= review.minimumPlanArea ? 'Minimum contact area met numerically' : 'Minimum contact area not met numerically';
  if (review.expectedGap !== null && result.gap !== null) { result.difference = result.gap - review.expectedGap; result.comparison = `${result.comparison ? result.comparison + '; ' : ''}${Math.abs(result.difference) <= FLOOR_FRAMING_EPS ? 'Expected gap matches numerically' : 'Expected gap differs numerically'}`; }
  return result;
}

function floorFramingResults() { return (state.model.floorSupportReviews || []).map(floorFramingReview); }
function floorFramingReviewBounds() { return floorFramingResults().flatMap(result => result.marker ? [result.marker] : []); }

function drawFloorFraming(is3d = false) {
  if (state.visibility.floorFraming === false) return;
  for (const floor of state.model.floors) {
    if (is3d ? !isLevelVisible3d(floor) : floor.levelId !== state.model.activeLevelId) continue;
    for (const member of (state.model.floorFraming || []).filter(item => item.floorId === floor.id)) {
      const geometry = floorMemberGeometry(member), colour = member.role === 'bearer' ? '#79502c' : member.role === 'ledger' ? '#8f704d' : member.role === 'rim-joist' ? '#6d563d' : '#b47d42';
      if (!is3d) polygon(geometry.outline.map(worldToScreen), colour, state.floorFramingSelectedId === member.id ? '#ed1c24' : '#5f3b21');
      else { for (let i = 0; i < 4; i += 1) { const a = geometry.outline[i], b = geometry.outline[(i + 1) % 4]; polygon([isoPoint(a, member.elevation), isoPoint(b, member.elevation), isoPoint(b, geometry.top), isoPoint(a, geometry.top)], colour, '#5f3b21'); } polygon(geometry.outline.map(p => isoPoint(p, geometry.top)), '#d6a56d', '#5f3b21'); }
    }
  }
  if (!is3d) for (const result of floorFramingResults()) { if (!result.marker || result.member?.levelId !== state.model.activeLevelId) continue; const p = worldToScreen(result.marker); ctx.save(); ctx.fillStyle = result.status === 'Plan contact' ? '#2d7d50' : '#c76e19'; ctx.strokeStyle = '#8b3a1f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
}

function drawFloorSupportReviews(is3d = false) {
  if (state.visibility.floorFraming === false || is3d) return;
  for (const result of floorFramingResults()) {
    if (!result.marker || result.member?.levelId !== state.model.activeLevelId) continue;
    const member = worldToScreen(result.marker); ctx.save(); ctx.strokeStyle = result.status === 'Plan contact' ? '#2d7d50' : '#c76e19'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(member.x, member.y, 10, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

function hitFloorFraming(p) {
  if (state.visibility.floorFraming === false) return null;
  const members = (state.model.floorFraming || []).filter(member => member.levelId === state.model.activeLevelId).slice().reverse();
  for (const member of members) if (pointInPolygon(p, floorMemberGeometry(member).outline)) { state.floorFramingSelectedId = member.id; return { type: 'floor', id: member.floorId }; }
  return null;
}

function floorFramingMemberFields(member, index) {
  const numeric = [['ax', 'Start X'], ['ay', 'Start Y'], ['bx', 'End X'], ['by', 'End Y'], ['width', 'Section width'], ['depth', 'Section depth'], ['elevation', 'Bottom elevation']];
  const text = [['name', 'Name'], ['material', 'Material / grade / treatment'], ['design', 'Span / support / bracing design'], ['fixings', 'Fixings / durability / tie-down'], ['drawingRef', 'Drawing / adopted NCC and standards'], ['notes', 'Member notes']];
  return `<details ${state.floorFramingSelectedId === member.id ? 'open' : ''}><summary class="roof-summary">${index + 1}. ${escapeHtml(member.name || member.role)} · ${escapeHtml(member.role)} · ${formatLength(floorMemberGeometry(member).length)}</summary><div class="inspector-field"><label>Role</label><select data-floor-member="${index}" data-floor-member-field="role">${FLOOR_FRAMING_ROLES.map(role => `<option value="${role}" ${role === member.role ? 'selected' : ''}>${role}</option>`).join('')}</select></div><div class="field-grid">${numeric.map(([key, label]) => `<div class="inspector-field"><label>${label} (mm)</label><input type="number" step="1" data-floor-member="${index}" data-floor-member-field="${key}" value="${member[key]}" /></div>`).join('')}${text.map(([key, label]) => `<div class="inspector-field full"><label>${label}</label><input maxlength="2000" data-floor-member="${index}" data-floor-member-field="${key}" value="${escapeHtml(member[key])}" /></div>`).join('')}</div><button type="button" class="delete-button" data-action="remove-floor-member" data-index="${index}">Remove member</button></details>`;
}

function renderFloorFramingDetails(floor) {
  const reviews = (state.model.floorSupportReviews || []).filter(review => (state.model.floorFraming || []).find(member => member.id === review.memberId)?.floorId === floor.id);
  const members = (state.model.floorFraming || []).filter(member => member.floorId === floor.id);
  const targets = FLOOR_FRAMING_TARGETS.flatMap(type => (state.model[{ pad: 'pads', pier: 'piers', foundation: 'foundations', wall: 'walls' }[type]] || []).map(target => ({ type, target })));
  const targetOptions = review => targets.map(({ type, target }) => `<option value="${escapeHtml(`${type}:${target.id}`)}" ${review.targetType === type && review.targetId === target.id ? 'selected' : ''}>${escapeHtml(type)} · ${escapeHtml(target.name || target.mark || target.id)} · ${escapeHtml(levelName(target.levelId))}</option>`).join('');
  return `<h3 class="reinforcement-heading">House floor framing</h3><p class="overview-copy">Explicit house-floor joists, bearers, ledgers and rim members. The entered envelopes are shown independently from the slab outline; no automatic spans, sizes, cuts or structural capacity are inferred.</p><button type="button" class="link-button" data-action="add-floor-member">Add framing member</button><button type="button" class="link-button" data-action="floor-framing-csv">Export framing CSV</button>${members.map((member, index) => floorFramingMemberFields(member, index)).join('') || '<p class="empty-selection">No house floor members recorded for this floor.</p>'}<h3 class="reinforcement-heading">Support coordination</h3><button type="button" class="link-button" data-action="add-floor-support-review">Add support review</button><p class="overview-copy">Each review links one entered member to one existing pad, pier, strip foundation or wall. Plan overlap, entered vertical gap and optional numerical criteria are reported; this is not bearing, fixing, load-transfer or compliance approval.</p>${reviews.map((review, index) => { const result = floorFramingReview(review); return `<details ${state.floorSupportSelectedId === review.id ? 'open' : ''}><summary class="roof-summary">${index + 1}. ${escapeHtml(result.status)} · ${escapeHtml(result.member?.name || result.member?.role || 'Missing member')}</summary><div class="inspector-field"><label>Member</label><select data-floor-review="${escapeHtml(review.id)}" data-floor-review-field="memberId">${members.map(member => `<option value="${escapeHtml(member.id)}" ${review.memberId === member.id ? 'selected' : ''}>${escapeHtml(member.name || member.role)} · ${escapeHtml(member.id)}</option>`).join('')}</select></div><div class="inspector-field"><label>Target</label><select data-floor-review="${escapeHtml(review.id)}" data-floor-review-field="target">${targetOptions(review)}</select></div><div class="field-grid"><div class="inspector-field"><label>Expected gap (mm, optional)</label><input type="number" step="any" data-floor-review="${escapeHtml(review.id)}" data-floor-review-field="expectedGap" value="${review.expectedGap ?? ''}" /></div><div class="inspector-field"><label>Minimum contact area (mm², optional)</label><input type="number" min="0" step="any" data-floor-review="${escapeHtml(review.id)}" data-floor-review-field="minimumPlanArea" value="${review.minimumPlanArea ?? ''}" /></div>${[['design', 'Design intent / evidence'], ['connections', 'Connections / bearing evidence'], ['drawingRef', 'Drawing / revision'], ['notes', 'Review notes']].map(([key, label]) => `<div class="inspector-field full"><label>${label}</label><input maxlength="2000" data-floor-review="${escapeHtml(review.id)}" data-floor-review-field="${key}" value="${escapeHtml(review[key])}" /></div>`).join('')}</div><p class="overview-copy"><strong>${escapeHtml(result.status)}</strong> ${escapeHtml(result.reason)}${result.planArea == null ? '' : `<br>${formatArea(result.planArea)} Plan overlap · ${formatNumber(result.gap, 2)} mm member-bottom minus target-top gap${result.comparison ? `<br>${escapeHtml(result.comparison)}` : ''}`}</p><button type="button" class="delete-button" data-action="remove-floor-support-review" data-review-id="${escapeHtml(review.id)}">Remove support review</button></details>`; }).join('') || '<p class="empty-selection">No support reviews recorded for this floor.</p>'}<p class="warning-note">Illustrative records only. Confirm member species/grade, spans, supports, concentrated loads, bracing, tie-down, moisture/termite exposure, fixings and footing capacity against the project design, adopted NCC/standards and qualified advice.</p>`;
}

function floorFramingAction(action, index, reviewId) {
  if (state.selected?.type !== 'floor') return;
  const floor = selectedObject(); if (!floor) return;
  const members = (state.model.floorFraming || []).filter(member => member.floorId === floor.id);
  if (action === 'add-floor-member') { const a = floor.points[0], b = floor.points[1] || { x: a.x + 1000, y: a.y }, member = { id: uid('floor-member'), floorId: floor.id, levelId: floor.levelId, role: 'joist', name: `Floor member ${members.length + 1}`, ax: a.x, ay: a.y, bx: b.x, by: b.y, width: 45, depth: 190, elevation: floor.elevation - 190, material: 'Unspecified', design: '', fixings: '', drawingRef: '', notes: '' }; try { validateFloorFraming({ floorFraming: [member] }); } catch (error) { state.statusMessage = error.message; render(); return; } withHistory(() => { (state.model.floorFraming ||= []).push(member); state.floorFramingSelectedId = member.id; state.visibility.floorFraming = true; }); }
  else if (action === 'remove-floor-member' && Number.isInteger(index) && members[index]) withHistory(() => { const id = members[index].id; state.model.floorFraming = state.model.floorFraming.filter(member => member.id !== id); state.model.floorSupportReviews = (state.model.floorSupportReviews || []).filter(review => review.memberId !== id); if (state.floorFramingSelectedId === id) state.floorFramingSelectedId = null; });
  else if (action === 'add-floor-support-review') { if (!members.length) { state.statusMessage = 'Add a house floor member before adding a support review.'; render(); return; } const target = state.model.piers[0] || state.model.pads[0] || state.model.foundations[0] || state.model.walls[0]; if (!target) { state.statusMessage = 'Add a pad, pier, foundation or wall before adding a support review.'; render(); return; } const targetType = state.model.piers.includes(target) ? 'pier' : state.model.pads.includes(target) ? 'pad' : state.model.foundations.includes(target) ? 'foundation' : 'wall'; const review = { id: uid('floor-support-review'), memberId: members[0].id, targetType, targetId: target.id, expectedGap: null, minimumPlanArea: null, design: '', connections: '', drawingRef: '', notes: '' }; withHistory(() => { (state.model.floorSupportReviews ||= []).push(review); state.floorSupportSelectedId = review.id; state.visibility.floorFraming = true; }); }
  else if (action === 'remove-floor-support-review' && reviewId) withHistory(() => { state.model.floorSupportReviews = (state.model.floorSupportReviews || []).filter(review => review.id !== reviewId); if (state.floorSupportSelectedId === reviewId) state.floorSupportSelectedId = null; });
  else if (action === 'floor-framing-csv') exportFloorFramingCsv();
}

function updateFloorMember(index, field, raw) {
  if (state.selected?.type !== 'floor') return;
  const members = (state.model.floorFraming || []).filter(member => member.floorId === selectedObject()?.id), member = members[index]; if (!member || !Object.hasOwn(member, field) || field === 'id' || ['floorId', 'levelId'].includes(field)) return;
  const next = { ...member }; next[field] = ['ax', 'ay', 'bx', 'by', 'width', 'depth', 'elevation'].includes(field) ? (raw.trim() ? Number(raw) : NaN) : raw.slice(0, 2000);
  try { validateFloorFraming({ floorFraming: [next] }); } catch (error) { state.statusMessage = error.message; render(); return; }
  withHistory(() => Object.assign(member, next));
}

function updateFloorSupportReview(id, field, raw) {
  const review = (state.model.floorSupportReviews || []).find(item => item.id === id); if (!review) return;
  const next = { ...review };
  if (field === 'target') { const [targetType, targetId] = raw.split(':'); next.targetType = targetType; next.targetId = targetId; }
  else if (['expectedGap', 'minimumPlanArea'].includes(field)) next[field] = raw.trim() ? Number(raw) : null;
  else if (field === 'memberId') next.memberId = raw;
  else if (['design', 'connections', 'drawingRef', 'notes'].includes(field)) next[field] = raw.slice(0, 2000);
  else return;
  try { validateFloorFraming({ floorSupportReviews: [next] }); } catch (error) { state.statusMessage = error.message; render(); return; }
  withHistory(() => Object.assign(review, next)); state.floorSupportSelectedId = id;
}

function floorFramingQuantityRows() {
  return FLOOR_FRAMING_ROLES.map(role => { const net = (state.model.floorFraming || []).filter(member => member.role === role).reduce((sum, member) => sum + floorMemberGeometry(member).length / 1000, 0); return { label: `House floor ${role} length`, net, waste: 0, order: net, unit: 'm', basis: 'Entered centreline lengths only; no span design, stock cuts, waste, fixings or automatic layout' }; });
}

function floorFramingScheduleRows() { return (state.model.floorFraming || []).map(member => ({ member, floor: state.model.floors.find(floor => floor.id === member.floorId), reviews: floorFramingResults().filter(result => result.member?.id === member.id) })); }

function renderFloorFramingSchedule() {
  const element = document.querySelector('#floorFramingSchedule'); if (!element) return;
  const rows = floorFramingScheduleRows();
  element.innerHTML = rows.length ? rows.map(row => `<button type="button" class="foundation-schedule-row" data-floor-framing-id="${escapeHtml(row.member.id)}" data-floor-id="${escapeHtml(row.floor?.id || '')}"><strong>${escapeHtml(row.member.name || row.member.role)} · ${escapeHtml(row.member.role)}</strong><span>${escapeHtml(row.floor?.name || 'Missing floor')} · ${formatLength(floorMemberGeometry(row.member).length)}</span><small>${row.reviews.length ? `${row.reviews.length} support review${row.reviews.length === 1 ? '' : 's'} · ${escapeHtml(row.reviews[0].status)}` : 'No support review recorded'}</small></button>`).join('') : '<p class="overview-copy">No house floor framing members recorded. Select a floor and add explicit members.</p>';
}

function selectFloorFraming(memberId, floorId) {
  const member = (state.model.floorFraming || []).find(item => item.id === memberId), floor = state.model.floors.find(item => item.id === (floorId || member?.floorId)); if (!member || !floor) return;
  state.model.activeLevelId = floor.levelId; state.selected = { type: 'floor', id: floor.id }; state.floorFramingSelectedId = member.id; state.visibility.floorFraming = true; render(); document.querySelector('#selectionSection')?.scrollIntoView({ block: 'nearest' });
}

function exportFloorFramingCsv() {
  const rows = [['Floor ID', 'Floor name', 'Level', 'Member ID', 'Name', 'Role', 'Length mm', 'Width mm', 'Depth mm', 'Bottom elevation mm', 'Start X mm', 'Start Y mm', 'End X mm', 'End Y mm', 'Material', 'Structural design', 'Fixings durability', 'Drawing NCC standards', 'Notes', 'Support review count'], ...floorFramingScheduleRows().map(row => { const member = row.member, geometry = floorMemberGeometry(member); return [member.floorId, row.floor?.name || '', levelName(member.levelId), member.id, member.name, member.role, geometry.length, member.width, member.depth, member.elevation, member.ax, member.ay, member.bx, member.by, member.material, member.design, member.fixings, member.drawingRef, member.notes, row.reviews.length]; })];
  download('bc-design-house-floor-framing.csv', rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'), 'text/csv');
}

function prepareExampleFloorFraming(model) {
  const floor = model.floors[0]; if (!floor || model.floorFraming?.length) return;
  const levelId = floor.levelId, elevation = floor.elevation, common = 'Illustrative house floor layout; confirm project-specific species, grade, spans, loads, supports, bracing, tie-down, moisture and connections.';
  const make = (id, role, a, b, width, depth, recordElevation, name) => ({ id, floorId: floor.id, levelId, role, name, ax: a.x, ay: a.y, bx: b.x, by: b.y, width, depth, elevation: recordElevation, material: 'Unspecified timber framing', design: common, fixings: 'Connections and tie-down to be designed', drawingRef: 'Example house floor layout · preliminary', notes: '' });
  const members = [];
  for (let x = 450; x <= 17550; x += 450) members.push(make(`house-floor-joist-main-${x}`, 'joist', { x, y: 0 }, { x, y: 11500 }, 45, 190, elevation - 190, `Main floor joist ${x}`));
  for (let y = 11950; y <= 16550; y += 450) members.push(make(`house-floor-joist-wing-${y}`, 'joist', { x: 0, y }, { x: 10000, y }, 45, 190, elevation - 190, `Wing floor joist ${y}`));
  for (const y of [0, 3000, 6000, 9000, 11500]) members.push(make(`house-floor-bearer-main-${y}`, 'bearer', { x: 0, y }, { x: 18000, y }, 90, 240, elevation - 430, `Main floor bearer ${y}`));
  for (const x of [0, 3000, 6000, 9000, 10000]) members.push(make(`house-floor-bearer-wing-${x}`, 'bearer', { x, y: 11500 }, { x, y: 17000 }, 90, 240, elevation - 430, `Wing floor bearer ${x}`));
  members.push(make('house-floor-ledger-front', 'ledger', { x: 0, y: 0 }, { x: 18000, y: 0 }, 45, 190, elevation - 190, 'Front wall ledger'));
  members.push(make('house-floor-ledger-left', 'ledger', { x: 0, y: 0 }, { x: 0, y: 17000 }, 45, 190, elevation - 190, 'Left wall ledger'));
  model.floorFraming = members;
  const targets = model.piers.filter(pier => pier.levelId === levelId && [1500, 5250, 9000, 12750, 16500].includes(pier.center.x) && [1500, 5500, 10000].includes(pier.center.y));
  model.floorSupportReviews = targets.map((pier, index) => ({ id: `house-floor-support-${index + 1}`, memberId: members.find(member => member.role === 'bearer' && Math.abs(member.ay - pier.center.y) < 1)?.id || members.find(member => member.role === 'bearer')?.id || '', targetType: 'pier', targetId: pier.id, expectedGap: 0, minimumPlanArea: null, design: 'Explicit member-to-pier coordination record; contact is not a bearing approval.', connections: 'Post/bearer connection and tie-down to be designed.', drawingRef: 'Example house floor support coordination', notes: '' }));
}
