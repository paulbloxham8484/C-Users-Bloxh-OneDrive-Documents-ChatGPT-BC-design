/* Fitted floor profiles, hardware records and access/obstruction prompts.
   These are entered coordination records; no connector capacity, installation approval or compliance is inferred. */
const FLOOR_FIT_KINDS = ['member-profile', 'support-connector', 'tie-down', 'blocking', 'other'];
const FLOOR_ACCESS_SUBJECTS = ['floor', 'member', 'fit'];
const FLOOR_ACCESS_STATUSES = ['pending', 'clear', 'blocked', 'unassessed'];

function validateFloorFitDetails(raw) {
  if (raw.floorFitDetails !== undefined) {
    if (!Array.isArray(raw.floorFitDetails) || raw.floorFitDetails.length > 5000) throw new Error('Floor fit details must be a list of at most 5,000 records.');
    const ids = new Set();
    for (const fit of raw.floorFitDetails) {
      if (!fit || typeof fit !== 'object' || Array.isArray(fit) || typeof fit.id !== 'string' || !fit.id.trim() || fit.id.length > 200 || ids.has(fit.id)) throw new Error('Floor fit detail IDs must be unique non-empty strings.');
      ids.add(fit.id);
      if (typeof fit.floorId !== 'string' || typeof fit.levelId !== 'string' || !FLOOR_FIT_KINDS.includes(fit.kind)) throw new Error('Floor fit details need a floor, level and supported record kind.');
      if (fit.quantity !== undefined && (!Number.isFinite(fit.quantity) || !Number.isInteger(fit.quantity) || fit.quantity < 1 || fit.quantity > 1000000)) throw new Error('Floor fit quantity must be a positive whole number up to 1,000,000.');
      for (const key of ['name', 'profile', 'hardware', 'manufacturer', 'productCode', 'fixing', 'evidence', 'drawingRef', 'notes']) if (fit[key] !== undefined && (typeof fit[key] !== 'string' || fit[key].length > 2000)) throw new Error('Floor fit details must be text up to 2,000 characters.');
      for (const key of ['width', 'depth', 'length', 'stockLength']) if (fit[key] !== undefined && fit[key] !== null && (!Number.isFinite(fit[key]) || fit[key] <= 0 || fit[key] > 1000000)) throw new Error('Floor fit dimensions must be positive project inputs up to 1,000,000 mm.');
      for (const key of ['memberId', 'supportReviewId']) if (fit[key] !== undefined && typeof fit[key] !== 'string') throw new Error('Floor fit links must be text IDs.');
    }
  }
  if (raw.floorAccessReviews !== undefined) {
    if (!Array.isArray(raw.floorAccessReviews) || raw.floorAccessReviews.length > 5000) throw new Error('Floor access reviews must be a list of at most 5,000 records.');
    const ids = new Set();
    for (const review of raw.floorAccessReviews) {
      if (!review || typeof review !== 'object' || Array.isArray(review) || typeof review.id !== 'string' || !review.id.trim() || review.id.length > 200 || ids.has(review.id)) throw new Error('Floor access review IDs must be unique non-empty strings.');
      ids.add(review.id);
      if (typeof review.floorId !== 'string' || typeof review.levelId !== 'string' || !FLOOR_ACCESS_SUBJECTS.includes(review.subjectType) || !FLOOR_ACCESS_STATUSES.includes(review.status)) throw new Error('Floor access reviews need a floor, level, subject and supported status.');
      for (const key of ['clearanceWidth', 'clearanceHeight']) if (review[key] !== undefined && review[key] !== null && (!Number.isFinite(review[key]) || review[key] < 0 || review[key] > 1000000)) throw new Error('Floor access clearances must be non-negative project inputs up to 1,000,000 mm.');
      for (const key of ['subjectId', 'zone', 'accessPath', 'obstructions', 'designRef', 'notes']) if (review[key] !== undefined && (typeof review[key] !== 'string' || review[key].length > 2000)) throw new Error('Floor access review fields must be text up to 2,000 characters.');
    }
  }
}

function normalizeFloorFitDetails(model) {
  const levels = new Set(model.levels.map(level => level.id));
  const floors = new Set(model.floors.map(floor => floor.id));
  const members = new Set((model.floorFraming || []).map(member => member.id));
  const supportReviews = new Set((model.floorSupportReviews || []).map(review => review.id));
  const fallbackLevel = model.levels[0].id;
  model.floorFitDetails = (Array.isArray(model.floorFitDetails) ? model.floorFitDetails : []).map(fit => ({
    id: String(fit.id || uid('floor-fit')),
    floorId: floors.has(fit.floorId) ? fit.floorId : '',
    levelId: levels.has(fit.levelId) ? fit.levelId : fallbackLevel,
    memberId: members.has(fit.memberId) ? fit.memberId : '',
    supportReviewId: supportReviews.has(fit.supportReviewId) ? fit.supportReviewId : '',
    kind: FLOOR_FIT_KINDS.includes(fit.kind) ? fit.kind : 'other',
    name: typeof fit.name === 'string' ? fit.name.slice(0, 2000) : '',
    profile: typeof fit.profile === 'string' ? fit.profile.slice(0, 2000) : '',
    hardware: typeof fit.hardware === 'string' ? fit.hardware.slice(0, 2000) : '',
    manufacturer: typeof fit.manufacturer === 'string' ? fit.manufacturer.slice(0, 2000) : '',
    productCode: typeof fit.productCode === 'string' ? fit.productCode.slice(0, 2000) : '',
    width: fit.width === null ? null : positiveNumber(fit.width, null),
    depth: fit.depth === null ? null : positiveNumber(fit.depth, null),
    length: fit.length === null ? null : positiveNumber(fit.length, null),
    stockLength: fit.stockLength === null ? null : positiveNumber(fit.stockLength, null),
    quantity: Number.isInteger(fit.quantity) && fit.quantity > 0 ? fit.quantity : 1,
    fixing: typeof fit.fixing === 'string' ? fit.fixing.slice(0, 2000) : '',
    evidence: typeof fit.evidence === 'string' ? fit.evidence.slice(0, 2000) : '',
    drawingRef: typeof fit.drawingRef === 'string' ? fit.drawingRef.slice(0, 2000) : '',
    notes: typeof fit.notes === 'string' ? fit.notes.slice(0, 2000) : '',
  }));
  model.floorAccessReviews = (Array.isArray(model.floorAccessReviews) ? model.floorAccessReviews : []).map(review => ({
    id: String(review.id || uid('floor-access')),
    floorId: floors.has(review.floorId) ? review.floorId : '',
    levelId: levels.has(review.levelId) ? review.levelId : fallbackLevel,
    subjectType: FLOOR_ACCESS_SUBJECTS.includes(review.subjectType) ? review.subjectType : 'floor',
    subjectId: typeof review.subjectId === 'string' ? review.subjectId.slice(0, 200) : '',
    status: FLOOR_ACCESS_STATUSES.includes(review.status) ? review.status : 'pending',
    zone: typeof review.zone === 'string' ? review.zone.slice(0, 2000) : '',
    accessPath: typeof review.accessPath === 'string' ? review.accessPath.slice(0, 2000) : '',
    clearanceWidth: review.clearanceWidth === null ? null : positiveNumber(review.clearanceWidth, null),
    clearanceHeight: review.clearanceHeight === null ? null : positiveNumber(review.clearanceHeight, null),
    obstructions: typeof review.obstructions === 'string' ? review.obstructions.slice(0, 2000) : '',
    designRef: typeof review.designRef === 'string' ? review.designRef.slice(0, 2000) : '',
    notes: typeof review.notes === 'string' ? review.notes.slice(0, 2000) : '',
  }));
}

function floorFitKindLabel(kind) { return ({ 'member-profile': 'Member profile', 'support-connector': 'Support connector', 'tie-down': 'Tie-down', blocking: 'Blocking', other: 'Other' }[kind] || kind); }
function floorAccessStatusLabel(status) { return ({ pending: 'Pending review', clear: 'Entered clear', blocked: 'Entered obstruction', unassessed: 'Unassessed' }[status] || status); }

function floorFitOptions(floor, fit) {
  const members = (state.model.floorFraming || []).filter(member => member.floorId === floor.id);
  const reviews = (state.model.floorSupportReviews || []).filter(review => members.some(member => member.id === review.memberId));
  return `<option value="">Unlinked record</option>${members.map(member => `<option value="${escapeHtml(member.id)}" ${fit.memberId === member.id ? 'selected' : ''}>${escapeHtml(member.name || member.role)} · ${escapeHtml(member.id)}</option>`).join('')}`;
}

function floorFitDetailFields(fit, floor, index) {
  const numeric = [['width', 'Profile width'], ['depth', 'Profile depth'], ['length', 'Fitted length'], ['stockLength', 'Recorded stock length'], ['quantity', 'Quantity']];
  const text = [['name', 'Name'], ['profile', 'Profile / section description'], ['hardware', 'Hardware / connector description'], ['manufacturer', 'Manufacturer / supplier'], ['productCode', 'Product code / SKU'], ['fixing', 'Fixing / installation evidence'], ['evidence', 'Source / checked date'], ['drawingRef', 'Drawing / revision'], ['notes', 'Notes']];
  return `<details ${state.floorFitSelectedId === fit.id ? 'open' : ''}><summary class="roof-summary">${index + 1}. ${escapeHtml(fit.name || floorFitKindLabel(fit.kind))} · ${escapeHtml(floorFitKindLabel(fit.kind))}</summary><div class="field-grid"><div class="inspector-field full"><label>Kind</label><select data-floor-fit-id="${escapeHtml(fit.id)}" data-floor-fit-field="kind">${FLOOR_FIT_KINDS.map(kind => `<option value="${kind}" ${fit.kind === kind ? 'selected' : ''}>${escapeHtml(floorFitKindLabel(kind))}</option>`).join('')}</select></div><div class="inspector-field full"><label>Linked floor member</label><select data-floor-fit-id="${escapeHtml(fit.id)}" data-floor-fit-field="memberId">${floorFitOptions(floor, fit)}</select></div>${numeric.map(([key, label]) => `<div class="inspector-field"><label>${label}${key === 'quantity' ? '' : ' (mm)'}</label><input type="number" min="${key === 'quantity' ? '1' : '0'}" step="${key === 'quantity' ? '1' : 'any'}" data-floor-fit-id="${escapeHtml(fit.id)}" data-floor-fit-field="${key}" value="${fit[key] ?? ''}" /></div>`).join('')}${text.map(([key, label]) => `<div class="inspector-field full"><label>${label}</label><input maxlength="2000" data-floor-fit-id="${escapeHtml(fit.id)}" data-floor-fit-field="${key}" value="${escapeHtml(fit[key])}" /></div>`).join('')}</div><p class="overview-copy">Reference record only. Dimensions and product identity do not establish suitability, capacity, fixing adequacy or order readiness.</p><button type="button" class="delete-button" data-action="remove-floor-fit" data-fit-id="${escapeHtml(fit.id)}">Remove fit detail</button></details>`;
}

function floorAccessReviewFields(review, floor, index) {
  const members = (state.model.floorFraming || []).filter(member => member.floorId === floor.id);
  const subjects = review.subjectType === 'member' ? members.map(member => `<option value="${escapeHtml(member.id)}" ${review.subjectId === member.id ? 'selected' : ''}>${escapeHtml(member.name || member.role)} · ${escapeHtml(member.id)}</option>`).join('') : review.subjectType === 'fit' ? (state.model.floorFitDetails || []).filter(fit => fit.floorId === floor.id).map(fit => `<option value="${escapeHtml(fit.id)}" ${review.subjectId === fit.id ? 'selected' : ''}>${escapeHtml(fit.name || floorFitKindLabel(fit.kind))} · ${escapeHtml(fit.id)}</option>`).join('') : '<option value="">Whole floor / route</option>';
  return `<details ${state.floorAccessSelectedId === review.id ? 'open' : ''}><summary class="roof-summary">${index + 1}. ${escapeHtml(floorAccessStatusLabel(review.status))} · ${escapeHtml(review.zone || 'Access review')}</summary><div class="field-grid"><div class="inspector-field"><label>Status</label><select data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="status">${FLOOR_ACCESS_STATUSES.map(status => `<option value="${status}" ${review.status === status ? 'selected' : ''}>${escapeHtml(floorAccessStatusLabel(status))}</option>`).join('')}</select></div><div class="inspector-field"><label>Subject</label><select data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="subjectType">${FLOOR_ACCESS_SUBJECTS.map(type => `<option value="${type}" ${review.subjectType === type ? 'selected' : ''}>${type === 'floor' ? 'Whole floor' : type === 'member' ? 'Floor member' : 'Fitted detail'}</option>`).join('')}</select></div><div class="inspector-field full"><label>Subject record</label><select data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="subjectId">${subjects}</select></div><div class="inspector-field full"><label>Zone / access point</label><input maxlength="2000" data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="zone" value="${escapeHtml(review.zone)}" /></div><div class="inspector-field full"><label>Access path / maintenance intent</label><input maxlength="2000" data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="accessPath" value="${escapeHtml(review.accessPath)}" /></div><div class="inspector-field"><label>Entered clear width (mm)</label><input type="number" min="0" step="any" data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="clearanceWidth" value="${review.clearanceWidth ?? ''}" /></div><div class="inspector-field"><label>Entered clear height (mm)</label><input type="number" min="0" step="any" data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="clearanceHeight" value="${review.clearanceHeight ?? ''}" /></div><div class="inspector-field full"><label>Other obstructions / exclusions</label><input maxlength="2000" data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="obstructions" value="${escapeHtml(review.obstructions)}" /></div><div class="inspector-field full"><label>Design / evidence reference</label><input maxlength="2000" data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="designRef" value="${escapeHtml(review.designRef)}" /></div><div class="inspector-field full"><label>Review notes</label><input maxlength="2000" data-floor-access-id="${escapeHtml(review.id)}" data-floor-access-field="notes" value="${escapeHtml(review.notes)}" /></div></div><p class="overview-copy">Status is an entered review state. The app does not derive a clearance, inspect an obstruction or approve installation access.</p><button type="button" class="delete-button" data-action="remove-floor-access" data-access-id="${escapeHtml(review.id)}">Remove access review</button></details>`;
}

function renderFloorFitDetails(floor) {
  const fits = (state.model.floorFitDetails || []).filter(fit => fit.floorId === floor.id);
  const access = (state.model.floorAccessReviews || []).filter(review => review.floorId === floor.id);
  return `<h3 class="reinforcement-heading">Fitted profiles and hardware</h3><p class="overview-copy">Record the selected profile, connector, tie-down or blocking detail against the entered floor layout. Product dimensions and evidence remain project inputs; no capacity, fastening or compliance result is inferred.</p><button type="button" class="link-button" data-action="add-floor-fit">Add fitted detail</button><button type="button" class="link-button" data-action="floor-fit-csv">Export fit/access CSV</button>${fits.map((fit, index) => floorFitDetailFields(fit, floor, index)).join('') || '<p class="empty-selection">No fitted profile or hardware details recorded for this floor.</p>'}<h3 class="reinforcement-heading">Access and other-obstruction review</h3><button type="button" class="link-button" data-action="add-floor-access">Add access review</button><p class="overview-copy">Enter the access path, clear dimensions and known obstructions for a floor member, fitting or whole-floor zone. This is a coordination checklist, not an automatic clash or safe-access assessment.</p>${access.map((review, index) => floorAccessReviewFields(review, floor, index)).join('') || '<p class="empty-selection">No access reviews recorded for this floor.</p>'}<p class="warning-note">Before construction, confirm the selected member species/grade, span, support, connector manufacturer instructions, fixing schedule, subfloor access, maintenance path, ventilation, termite/moisture conditions and professional approval.</p>`;
}

function floorFitAction(action, fitId) {
  if (state.selected?.type !== 'floor') return;
  const floor = selectedObject(); if (!floor) return;
  if (action === 'add-floor-fit') {
    const member = (state.model.floorFraming || []).find(item => item.floorId === floor.id);
    const fit = { id: uid('floor-fit'), floorId: floor.id, levelId: floor.levelId, memberId: member?.id || '', supportReviewId: '', kind: 'member-profile', name: `Floor fit ${(state.model.floorFitDetails || []).filter(item => item.floorId === floor.id).length + 1}`, profile: '', hardware: '', manufacturer: '', productCode: '', width: null, depth: null, length: null, stockLength: null, quantity: 1, fixing: '', evidence: '', drawingRef: '', notes: '' };
    try { validateFloorFitDetails({ floorFitDetails: [fit] }); } catch (error) { state.statusMessage = error.message; render(); return; }
    withHistory(() => { (state.model.floorFitDetails ||= []).push(fit); state.floorFitSelectedId = fit.id; });
  } else if (action === 'remove-floor-fit' && fitId) withHistory(() => { state.model.floorFitDetails = (state.model.floorFitDetails || []).filter(fit => fit.id !== fitId); state.floorAccessReviews = (state.model.floorAccessReviews || []).filter(review => review.subjectId !== fitId); if (state.floorFitSelectedId === fitId) state.floorFitSelectedId = null; });
  else if (action === 'floor-fit-csv') exportFloorFitCsv(floor.id);
}

function floorAccessAction(action, accessId) {
  if (state.selected?.type !== 'floor') return;
  const floor = selectedObject(); if (!floor) return;
  if (action === 'add-floor-access') {
    const review = { id: uid('floor-access'), floorId: floor.id, levelId: floor.levelId, subjectType: 'floor', subjectId: '', status: 'pending', zone: '', accessPath: '', clearanceWidth: null, clearanceHeight: null, obstructions: '', designRef: '', notes: '' };
    try { validateFloorFitDetails({ floorAccessReviews: [review] }); } catch (error) { state.statusMessage = error.message; render(); return; }
    withHistory(() => { (state.model.floorAccessReviews ||= []).push(review); state.floorAccessSelectedId = review.id; });
  } else if (action === 'remove-floor-access' && accessId) withHistory(() => { state.model.floorAccessReviews = (state.model.floorAccessReviews || []).filter(review => review.id !== accessId); if (state.floorAccessSelectedId === accessId) state.floorAccessSelectedId = null; });
  else if (action === 'floor-fit-csv') exportFloorFitCsv(floor.id);
}

function updateFloorFitDetail(id, field, raw) {
  const fit = (state.model.floorFitDetails || []).find(item => item.id === id); if (!fit) return;
  const next = { ...fit };
  if (['width', 'depth', 'length', 'stockLength'].includes(field)) next[field] = raw.trim() ? Number(raw) : null;
  else if (field === 'quantity') next.quantity = raw.trim() ? Number(raw) : 1;
  else if (field === 'memberId') next.memberId = raw;
  else if (field === 'kind' && FLOOR_FIT_KINDS.includes(raw)) next.kind = raw;
  else if (['name', 'profile', 'hardware', 'manufacturer', 'productCode', 'fixing', 'evidence', 'drawingRef', 'notes'].includes(field)) next[field] = raw.slice(0, 2000);
  else return;
  try { validateFloorFitDetails({ floorFitDetails: [next] }); } catch (error) { state.statusMessage = error.message; render(); return; }
  withHistory(() => Object.assign(fit, next)); state.floorFitSelectedId = id;
}

function updateFloorAccessReview(id, field, raw) {
  const review = (state.model.floorAccessReviews || []).find(item => item.id === id); if (!review) return;
  const next = { ...review };
  if (['clearanceWidth', 'clearanceHeight'].includes(field)) next[field] = raw.trim() ? Number(raw) : null;
  else if (field === 'subjectType' && FLOOR_ACCESS_SUBJECTS.includes(raw)) { next.subjectType = raw; next.subjectId = ''; }
  else if (field === 'status' && FLOOR_ACCESS_STATUSES.includes(raw)) next.status = raw;
  else if (['subjectId', 'zone', 'accessPath', 'obstructions', 'designRef', 'notes'].includes(field)) next[field] = raw.slice(0, 2000);
  else return;
  try { validateFloorFitDetails({ floorAccessReviews: [next] }); } catch (error) { state.statusMessage = error.message; render(); return; }
  withHistory(() => Object.assign(review, next)); state.floorAccessSelectedId = id;
}

function exportFloorFitCsv(floorId = '') {
  const fits = (state.model.floorFitDetails || []).filter(fit => !floorId || fit.floorId === floorId);
  const access = (state.model.floorAccessReviews || []).filter(review => !floorId || review.floorId === floorId);
  const rows = [['Record type', 'Floor ID', 'Level', 'ID', 'Kind / status', 'Name / zone', 'Member / subject ID', 'Profile', 'Hardware', 'Manufacturer', 'Product code', 'Width mm', 'Depth mm', 'Length mm', 'Stock length mm', 'Quantity', 'Fixing / access path', 'Evidence / obstructions', 'Drawing / design reference', 'Notes'], ...fits.map(fit => ['FIT', fit.floorId, levelName(fit.levelId), fit.id, floorFitKindLabel(fit.kind), fit.name, fit.memberId, fit.profile, fit.hardware, fit.manufacturer, fit.productCode, fit.width ?? '', fit.depth ?? '', fit.length ?? '', fit.stockLength ?? '', fit.quantity, fit.fixing, fit.evidence, fit.drawingRef, fit.notes]), ...access.map(review => ['ACCESS', review.floorId, levelName(review.levelId), review.id, floorAccessStatusLabel(review.status), review.zone, review.subjectId, '', '', '', '', review.clearanceWidth ?? '', '', '', '', '', review.accessPath, review.obstructions, review.designRef, review.notes])];
  download('bc-design-floor-fitted-details.csv', rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'), 'text/csv');
}

function floorFitQuantityRows() {
  const fits = state.model.floorFitDetails || [], access = state.model.floorAccessReviews || [];
  return [{ label: 'Floor fitted detail records', net: fits.length, waste: 0, order: fits.length, unit: 'count', basis: 'Entered profile/hardware records only; no connector takeoff or product approval' }, { label: 'Floor access reviews', net: access.length, waste: 0, order: access.length, unit: 'count', basis: 'Entered access/obstruction prompts only; no automatic clearance or safe-access result' }];
}
