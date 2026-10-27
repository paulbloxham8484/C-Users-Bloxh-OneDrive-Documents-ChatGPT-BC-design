// Independent, entered 1D demands. Never derive fabrication cuts from model envelopes.
const STOCK_PLAN_LIMITS = Object.freeze({ plans: 32, rows: 100, pieces: 1000, bars: 1000, length: 1000000 });
const STOCK_PLAN_TEXT = ['name', 'specification', 'designRef', 'notes'];
const STOCK_PIECE_TEXT = ['label', 'demandRef'];
const STOCK_VARIANT_TEXT = ['label', 'supplier', 'sku', 'sourceUrl', 'checkedDate'];
const STOCK_PLAN_UI = { selectedId: '', fingerprint: '', error: '' };

function stockNumberValid(value, count = false, zero = false) {
  if (value == null) return true;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (zero ? 0 : count ? 1 : .001)) return false;
  if (count) return Number.isInteger(value) && value <= 1000;
  return value <= STOCK_PLAN_LIMITS.length && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;
}
function validateStockPlans(raw) {
  if (raw.stockPlans === undefined) return;
  if (!Array.isArray(raw.stockPlans) || raw.stockPlans.length > STOCK_PLAN_LIMITS.plans) throw new Error('Stock planning: maximum 32 plans in an array.');
  const ids = new Set();
  const record = (item, texts, numbers, label) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200 || ids.has(item.id)) throw new Error(`Stock planning: ${label} requires a unique ID.`);
    ids.add(item.id);
    for (const field of texts) if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 2000)) throw new Error(`Stock planning: invalid ${field}.`);
    for (const [field, count, zero] of numbers) if (!stockNumberValid(item[field], count, zero)) throw new Error(`Stock planning: ${field} must be ${count ? 'a whole count from 1 to 1000' : 'an explicit millimetre value (up to 3 decimals) within limits'} or blank.`);
  };
  for (const plan of raw.stockPlans) {
    record(plan, STOCK_PLAN_TEXT, [['kerf', false, true], ['trimStart', false, true], ['trimEnd', false, true]], 'plan');
    if (plan.formatVersion !== undefined && plan.formatVersion !== 1) throw new Error('Stock planning: unsupported record version.');
    for (const key of ['pieces', 'stocks']) if (!Array.isArray(plan[key]) || plan[key].length > STOCK_PLAN_LIMITS.rows) throw new Error(`Stock planning: ${key} must be an array of at most 100 rows.`);
    for (const piece of plan.pieces) record(piece, STOCK_PIECE_TEXT, [['length'], ['quantity', true]], 'piece demand');
    for (const stock of plan.stocks) {
      record(stock, STOCK_VARIANT_TEXT, [['length'], ['quantity', true]], 'stock variant');
      if (stock.sourceUrl && !/^https?:\/\//i.test(stock.sourceUrl)) throw new Error('Stock planning: source URL must use http or https.');
      if (stock.checkedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(stock.checkedDate) || !Number.isFinite(Date.parse(stock.checkedDate)) || new Date(stock.checkedDate).toISOString().slice(0, 10) !== stock.checkedDate)) throw new Error('Stock planning: checked date must be a valid YYYY-MM-DD date.');
    }
    if (plan.pieces.reduce((n, r) => n + (r.quantity || 0), 0) > STOCK_PLAN_LIMITS.pieces || plan.stocks.reduce((n, r) => n + (r.quantity || 0), 0) > STOCK_PLAN_LIMITS.bars) throw new Error('Stock planning: at most 1000 demanded pieces and 1000 candidate bars per plan.');
  }
}
function normalizeStockPlans(model) {
  const text = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k] || '']));
  model.stockPlans = (model.stockPlans || []).map(p => ({ id: p.id, formatVersion: 1, ...text(p, STOCK_PLAN_TEXT), kerf: p.kerf ?? null, trimStart: p.trimStart ?? null, trimEnd: p.trimEnd ?? null,
    pieces: p.pieces.map(r => ({ id: r.id, ...text(r, STOCK_PIECE_TEXT), length: r.length ?? null, quantity: r.quantity ?? null })),
    stocks: p.stocks.map(r => ({ id: r.id, ...text(r, STOCK_VARIANT_TEXT), length: r.length ?? null, quantity: r.quantity ?? null })) }));
}
function stockPlanNew(id) {
  return { id, formatVersion: 1, name: '', specification: '', designRef: '', notes: '', kerf: null, trimStart: null, trimEnd: null, pieces: [], stocks: [] };
}
function stockPlanReview(plan) {
  const pending = [], evidence = [];
  try { validateStockPlans({ stockPlans: [plan] }); } catch (e) { return { status: 'pending', pending: [e.message], evidence, bars: [], unallocated: [], summary: null }; }
  for (const key of ['kerf', 'trimStart', 'trimEnd']) if (plan[key] == null) pending.push(`${key} is blank; enter 0 where intended.`);
  if (!plan.pieces.length) pending.push('No piece demands entered.');
  if (!plan.stocks.length) pending.push('No stock variants entered.');
  for (const [key, label] of [['pieces', 'Piece'], ['stocks', 'Stock']]) plan[key].forEach((r, i) => { if (r.length == null || r.quantity == null) pending.push(`${label} ${i + 1}: length or count is blank.`); });
  if (!plan.specification?.trim()) evidence.push('Material, section/profile, grade and treatment/finish specification is unrecorded.');
  if (!plan.designRef?.trim()) evidence.push('Design / revision and compatibility evidence is unrecorded.');
  plan.pieces.forEach((p, i) => { if (!p.demandRef?.trim()) evidence.push(`Piece ${i + 1}: measured cut / drawing reference is unrecorded.`); });
  plan.stocks.forEach((s, i) => { for (const k of ['supplier', 'sku', 'sourceUrl', 'checkedDate']) if (!s[k]?.trim()) evidence.push(`Stock ${i + 1}: ${k} is unrecorded.`); });
  if (pending.length) return { status: 'pending', pending, evidence, bars: [], unallocated: [], summary: null };
  // Integer micrometres avoid floating-point fit tolerances. This is not a site tolerance.
  const units = n => Math.round(n * 1000), mm = n => n / 1000;
  const kerf = units(plan.kerf), start = units(plan.trimStart), end = units(plan.trimEnd);
  const pieces = plan.pieces.flatMap((p, index) => Array.from({ length: p.quantity }, (_, i) => ({ demandId: p.id, label: p.label, occurrence: i + 1, order: index, size: units(p.length) })));
  pieces.sort((a, b) => b.size - a.size || a.order - b.order || a.occurrence - b.occurrence);
  const variants = plan.stocks.map((s, i) => ({ record: s, order: i, size: units(s.length), unused: s.quantity, used: 0 }));
  const bars = [], unallocated = [];
  for (const piece of pieces) {
    const cost = piece.size + kerf;
    let bar = bars.filter(b => b.free >= cost).sort((a, b) => a.free - b.free || a.index - b.index)[0];
    if (!bar) {
      const variant = variants.filter(s => s.unused > 0 && s.size - start - end >= cost).sort((a, b) => a.size - b.size || a.order - b.order)[0];
      if (variant) {
        variant.unused--; variant.used++;
        bar = { index: bars.length + 1, stockId: variant.record.id, stockOccurrence: variant.used, length: mm(variant.size), free: variant.size - start - end, cursor: start, pieces: [] };
        bars.push(bar);
      }
    }
    if (!bar) { unallocated.push({ demandId: piece.demandId, occurrence: piece.occurrence, label: piece.label, length: mm(piece.size) }); continue; }
    bar.pieces.push({ demandId: piece.demandId, occurrence: piece.occurrence, label: piece.label, length: mm(piece.size), start: mm(bar.cursor), end: mm(bar.cursor + piece.size), kerfAfter: mm(kerf) });
    bar.free -= cost; bar.cursor += cost;
  }
  for (const bar of bars) { bar.remaining = mm(bar.free); bar.pieceLength = mm(bar.pieces.reduce((n, p) => n + units(p.length), 0)); bar.kerfLength = mm(bar.pieces.length * kerf); bar.trimLength = mm(start + end); delete bar.free; delete bar.cursor; }
  const sum = key => mm(bars.reduce((n, b) => n + units(b[key]), 0));
  return { status: unallocated.length ? 'unallocated' : 'allocated', pending, evidence, bars, unallocated,
    variants: variants.map(v => ({ stockId: v.record.id, entered: v.record.quantity, used: v.used, unused: v.unused })),
    summary: { demanded: pieces.length, assigned: pieces.length - unallocated.length, unallocated: unallocated.length, usedBars: bars.length, stockLength: sum('length'), pieceLength: sum('pieceLength'), kerfLength: sum('kerfLength'), trimLength: sum('trimLength'), remaining: sum('remaining') } };
}
function stockCsvCell(value) {
  let text = String(value ?? '');
  // Keep user-entered spreadsheet formulas inert, including formulas after whitespace.
  if (/^\s*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
function stockPlanCsv(plans) {
  const header = ['Record', 'Plan ID', 'Plan name', 'Allocation status', 'Evidence status', 'Stock ID', 'Bar number', 'Demand ID', 'Piece number', 'Label', 'Count', 'Length mm', 'Start mm', 'End mm', 'Kerf mm', 'Start trim mm', 'End trim mm', 'Remainder mm', 'Supplier', 'SKU', 'Source URL', 'Checked date', 'Specification', 'Design reference', 'Demand reference', 'Notes'];
  const rows = [header];
  for (const p of plans) {
    const r = stockPlanReview(p), evidence = r.evidence.length ? 'Incomplete evidence' : 'Recorded evidence; unverified', base = [p.id, p.name, r.status, evidence];
    const push = (kind, cells) => rows.push([kind, ...base, ...cells]);
    push('PLAN', ['', '', '', '', '', '', '', '', '', p.kerf ?? '', p.trimStart ?? '', p.trimEnd ?? '', '', '', '', '', '', p.specification, p.designRef, '', [...r.pending, ...r.evidence, p.notes, 'Draft longest-first best-fit; not optimal, no order approval. BAR rows alone total used stock; CUT rows alone total assigned demands.'].filter(Boolean).join(' | ')]);
    for (const d of p.pieces) push('DEMAND', ['', '', d.id, '', d.label, d.quantity ?? '', d.length ?? '', '', '', '', '', '', '', '', '', '', '', '', '', d.demandRef, 'Entered cut demand; not derived from model geometry.']);
    for (const s of p.stocks) push('STOCK', [s.id, '', '', '', s.label, s.quantity ?? '', s.length ?? '', '', '', '', '', '', '', s.supplier, s.sku, s.sourceUrl, s.checkedDate, '', '', '', 'Entered candidate count; supplier availability unverified.']);
    for (const b of r.bars) {
      push('BAR', [b.stockId, b.index, '', '', '', 1, b.length, '', '', b.kerfLength, p.trimStart, p.trimEnd, b.remaining, '', '', '', '', '', '', '', 'Kerf is total for this bar; remainder is not classified as waste or reusable stock.']);
      for (const d of b.pieces) push('CUT', [b.stockId, b.index, d.demandId, d.occurrence, d.label, 1, d.length, d.start, d.end, d.kerfAfter, '', '', '', '', '', '', '', '', '', '', 'Flat length demand; one kerf allowance after each piece including last.']);
    }
    for (const d of r.unallocated) push('UNALLOCATED', ['', '', d.demandId, d.occurrence, d.label, 1, d.length, '', '', '', '', '', '', '', '', '', '', '', '', '', 'No fit found by this heuristic; not proof of infeasibility.']);
  }
  return rows.map(row => row.map(stockCsvCell).join(',')).join('\n');
}

function stockPlanDiagram(plan, result) {
  const positions = b => `<details><summary>View cut positions for bar ${b.index}</summary><div class="stock-table-wrap"><table><thead><tr><th>Piece</th><th>Length mm</th><th>Start mm</th><th>End mm</th><th>Kerf after mm</th></tr></thead><tbody>${b.pieces.map(p => `<tr><td>${escapeHtml(p.label || p.demandId)} #${p.occurrence}</td><td>${p.length}</td><td>${p.start}</td><td>${p.end}</td><td>${p.kerfAfter}</td></tr>`).join('')}</tbody></table></div></details>`;
  return result.bars.slice(0, 40).map(b => `<div class="stock-bar"><strong>Bar ${b.index} · ${escapeHtml(plan.stocks.find(s => s.id === b.stockId)?.label || b.stockId)} · ${b.length} mm</strong><svg viewBox="0 0 ${b.length} 34" preserveAspectRatio="none" role="img" aria-label="Bar ${b.index}, ${b.pieces.length} pieces, ${b.remaining} millimetres remaining"><rect width="${b.length}" height="34" fill="#e4e9ec"/><rect width="${plan.trimStart}" height="34" fill="#ad6672"/><rect x="${b.length - plan.trimEnd}" width="${plan.trimEnd}" height="34" fill="#ad6672"/>${b.pieces.map(p => `<rect x="${p.start}" width="${p.length}" height="34" fill="#247b78" stroke="white" stroke-width="${b.length / 800}"/><rect x="${p.end}" width="${p.kerfAfter}" height="34" fill="#d89635"/>`).join('')}</svg><small>${b.pieces.length} cuts · ${b.pieceLength} mm pieces + ${b.kerfLength} mm kerf + ${b.trimLength} mm trims + ${b.remaining} mm remainder = ${b.length} mm</small>${positions(b)}</div>`).join('');
}
function stockPlanningRender(force = false) {
  const dialog = document.querySelector('#stockPlanningDialog');
  if (!dialog?.open) return;
  const plans = state.model.stockPlans || [], key = JSON.stringify(plans);
  if (!force && key === STOCK_PLAN_UI.fingerprint) return;
  STOCK_PLAN_UI.fingerprint = key;
  if (!plans.some(p => p.id === STOCK_PLAN_UI.selectedId)) STOCK_PLAN_UI.selectedId = plans[0]?.id || '';
  const picker = dialog.querySelector('#stockPlanPicker');
  picker.innerHTML = plans.length ? plans.map((p, i) => `<option value="${escapeHtml(p.id)}" ${p.id === STOCK_PLAN_UI.selectedId ? 'selected' : ''}>${escapeHtml(p.name || `Plan ${i + 1}`)}</option>`).join('') : '<option value="">No stock plans</option>';
  const p = plans.find(x => x.id === STOCK_PLAN_UI.selectedId), body = dialog.querySelector('#stockPlanBody');
  dialog.querySelector('#stockPlanError').textContent = STOCK_PLAN_UI.error;
  if (!p) { body.innerHTML = '<p>Add a stock plan, then enter compatible stock variants and measured piece demands. Existing building quantities stay unchanged.</p>'; return; }
  const field = (label, obj, key, scope = 'plan', numeric = false, count = false) => `<label>${label}<input data-stock-scope="${scope}" data-stock-id="${escapeHtml(obj.id)}" data-stock-field="${key}" ${numeric ? `type="number" step="${count ? '1' : '.001'}" min="${count ? '1' : '0'}" max="${count ? '1000' : '1000000'}"` : 'maxlength="2000"'} value="${escapeHtml(String(obj[key] ?? ''))}" placeholder="${numeric ? 'Not entered' : ''}"></label>`;
  const result = stockPlanReview(p), status = result.status === 'pending' ? 'Pending inputs' : result.status === 'unallocated' ? `${result.unallocated.length} pieces unallocated` : 'All entered pieces allocated — draft';
  body.innerHTML = `<div class="stock-plan-grid"><section><h3>Plan inputs</h3><div class="stock-fields">${field('Plan name', p, 'name')}${field('Material / section / grade / treatment or finish', p, 'specification')}${field('Design revision / variant compatibility evidence', p, 'designRef')}${field('Notes', p, 'notes')}${field('Saw kerf per piece (mm)', p, 'kerf', 'plan', true)}${field('Start trim per used bar (mm)', p, 'trimStart', 'plan', true)}${field('End trim per used bar (mm)', p, 'trimEnd', 'plan', true)}</div><p class="overview-copy">Explicit zero is required. Trims are total reserved end lengths, including any trim-cut loss. A kerf is reserved after every piece, including the last.</p><h3>Piece demands</h3><button type="button" data-stock-action="add-piece">Add piece demand</button>${p.pieces.map((d, i) => `<fieldset><legend>Piece demand ${i + 1}</legend><div class="stock-fields">${field('Label', d, 'label', 'piece')}${field('Finished flat length (mm)', d, 'length', 'piece', true)}${field('Piece count', d, 'quantity', 'piece', true, true)}${field('Cut measurement / drawing reference', d, 'demandRef', 'piece')}</div><button type="button" data-stock-action="remove-piece" data-stock-id="${escapeHtml(d.id)}">Remove demand ${i + 1}</button></fieldset>`).join('')}<h3>Compatible stock variants</h3><button type="button" data-stock-action="add-stock">Add stock variant</button>${p.stocks.map((s, i) => `<fieldset><legend>Stock variant ${i + 1}</legend><div class="stock-fields">${field('Variant label', s, 'label', 'stock')}${field('Stock length (mm)', s, 'length', 'stock', true)}${field('Candidate bar count', s, 'quantity', 'stock', true, true)}${field('Australian supplier / manufacturer', s, 'supplier', 'stock')}${field('Exact SKU / variant identifier', s, 'sku', 'stock')}${field('Product source URL', s, 'sourceUrl', 'stock')}${field('Source checked date (YYYY-MM-DD)', s, 'checkedDate', 'stock')}</div><button type="button" data-stock-action="remove-stock" data-stock-id="${escapeHtml(s.id)}">Remove variant ${i + 1}</button></fieldset>`).join('')}<button type="button" data-stock-action="remove-plan" class="delete-button">Remove selected plan</button></section><section class="stock-results"><h3>Allocation review</h3><p id="stockAllocationStatus" role="status"><strong>${status}</strong></p>${result.pending.length ? `<ul>${result.pending.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : `<p>${result.summary.assigned} / ${result.summary.demanded} pieces assigned across ${result.summary.usedBars} candidate bars. Used stock ${result.summary.stockLength} mm; assigned pieces ${result.summary.pieceLength} mm; remainder ${result.summary.remaining} mm.</p><p class="overview-copy">Teal: piece length. Amber: kerf. Rose: end trims. Grey: remainder. Diagrams are schematic; they do not show mitres, defects or profile machining.</p>${stockPlanDiagram(p, result)}${result.bars.length > 40 ? '<p>Showing first 40 bar diagrams. CSV includes every bar and cut.</p>' : ''}<div class="stock-table-wrap"><table><thead><tr><th>Stock variant</th><th>Entered</th><th>Used</th><th>Unused</th></tr></thead><tbody>${result.variants.map(v => `<tr><td>${escapeHtml(p.stocks.find(s => s.id === v.stockId)?.label || v.stockId)}</td><td>${v.entered}</td><td>${v.used}</td><td>${v.unused}</td></tr>`).join('')}</tbody></table></div>${result.unallocated.length ? `<p>Unallocated: ${result.unallocated.slice(0, 40).map(d => `${escapeHtml(d.label || d.demandId)} #${d.occurrence}: ${d.length} mm`).join('; ')}${result.unallocated.length > 40 ? ' (all rows in CSV)' : ''}</p>` : ''}`}<h3>Procurement evidence</h3><p>${result.evidence.length ? 'Evidence incomplete' : 'Evidence recorded — verify before purchase'}</p>${result.evidence.length ? `<ul>${result.evidence.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}<p>One plan assumes compatible material, grade, treatment, profile and section. Confirm exact variants, measured lengths, defects, tolerances, joints, supplier availability and designer/manufacturer requirements. Recorded evidence is not independently verified by this calculation.</p><p>Longest-first, best-fit allocation is deterministic, not guaranteed optimal. An unallocated piece is not proof that no feasible arrangement exists. Plans do not share stock. No splices, waste allowance, price, purchase order or structural approval is generated.</p></section></div>`;
}
function stockPlanningChange(scope, id, field, raw) {
  const plans = clone(state.model.stockPlans || []), p = plans.find(p => p.id === STOCK_PLAN_UI.selectedId);
  if (!p) return;
  const obj = scope === 'plan' ? p : (scope === 'piece' ? p.pieces : p.stocks).find(r => r.id === id);
  if (!obj) return;
  const allowed = scope === 'plan' ? [...STOCK_PLAN_TEXT, 'kerf', 'trimStart', 'trimEnd'] : scope === 'piece' ? [...STOCK_PIECE_TEXT, 'length', 'quantity'] : [...STOCK_VARIANT_TEXT, 'length', 'quantity'];
  if (!allowed.includes(field)) return;
  obj[field] = ['kerf', 'trimStart', 'trimEnd', 'length', 'quantity'].includes(field) ? (raw.trim() ? Number(raw) : null) : raw;
  stockPlanningCommit(plans);
}
function stockPlanningCommit(plans) {
  try { validateStockPlans({ stockPlans: plans }); } catch (e) { STOCK_PLAN_UI.error = e.message; stockPlanningRender(true); return false; }
  STOCK_PLAN_UI.error = '';
  withHistory(() => { state.model.stockPlans = plans; });
  stockPlanningRender(true); return true;
}
function stockPlanningAction(action, id) {
  if (action === 'undo' || action === 'redo') { STOCK_PLAN_UI.error = ''; action === 'undo' ? undo() : redo(); stockPlanningRender(true); return; }
  const plans = clone(state.model.stockPlans || []), p = plans.find(p => p.id === STOCK_PLAN_UI.selectedId);
  if (action === 'add-plan') { const next = stockPlanNew(uid('stock-plan')); plans.push(next); if (stockPlanningCommit(plans)) { STOCK_PLAN_UI.selectedId = next.id; stockPlanningRender(true); } return; }
  if (action === 'csv') { download('bc-design-stock-allocation.csv', stockPlanCsv(plans), 'text/csv'); return; }
  if (!p) return;
  if (action === 'add-piece') p.pieces.push({ id: uid('cut'), label: '', demandRef: '', length: null, quantity: null });
  else if (action === 'add-stock') p.stocks.push({ id: uid('stock'), label: '', supplier: '', sku: '', sourceUrl: '', checkedDate: '', length: null, quantity: null });
  else if (action === 'remove-piece') p.pieces = p.pieces.filter(d => d.id !== id);
  else if (action === 'remove-stock') p.stocks = p.stocks.filter(s => s.id !== id);
  else if (action === 'remove-plan') { stockPlanningCommit(plans.filter(x => x.id !== p.id)); return; }
  else return;
  stockPlanningCommit(plans);
}
function initStockPlanning() {
  const button = document.querySelector('#stockPlanningButton'), dialog = document.querySelector('#stockPlanningDialog');
  if (!button || !dialog || dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';
  button.addEventListener('click', () => { STOCK_PLAN_UI.error = ''; dialog.showModal(); stockPlanningRender(true); });
  dialog.querySelector('#stockPlanningClose').addEventListener('click', () => dialog.close());
  dialog.querySelector('#stockPlanPicker').addEventListener('change', e => { STOCK_PLAN_UI.selectedId = e.target.value; STOCK_PLAN_UI.error = ''; stockPlanningRender(true); });
  dialog.addEventListener('change', e => { if (e.target.dataset.stockField) stockPlanningChange(e.target.dataset.stockScope, e.target.dataset.stockId, e.target.dataset.stockField, e.target.value); });
  dialog.addEventListener('click', e => { const b = e.target.closest('[data-stock-action]'); if (b) stockPlanningAction(b.dataset.stockAction, b.dataset.stockId); });
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('DOMContentLoaded', initStockPlanning);
