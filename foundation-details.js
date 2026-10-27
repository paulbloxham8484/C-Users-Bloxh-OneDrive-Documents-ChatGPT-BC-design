/* Foundation geometry and engineer-specified reinforcement records. All dimensions mm. */
function makeSupport(type, center, levelId, id, padId = "") {
  return { id: id || uid(type), levelId, center: { ...center }, shape: type === "pad" ? "rectangular" : "circular", width: type === "pad" ? 600 : 300, length: 600, diameter: type === "pad" ? 600 : 300, depth: type === "pad" ? 300 : 900, elevation: type === "pad" ? -1200 : -900, padId, mark: "", status: "preliminary", reinforcement: emptyReinforcement() };
}

function emptyReinforcement() {
  return { mode: "unspecified", concreteMPa: null, cover: null, exposure: "", drawingRef: "", standardRef: "", anchorage: "", notes: "", bars: [] };
}

function normalizeReinforcement(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const text = (key) => typeof r[key] === "string" ? r[key].slice(0, 2000) : "";
  const optional = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  return { mode: ["unspecified", "reinforced", "plain"].includes(r.mode) ? r.mode : "unspecified", concreteMPa: optional(r.concreteMPa), cover: optional(r.cover), exposure: text("exposure"), drawingRef: text("drawingRef"), standardRef: text("standardRef"), anchorage: text("anchorage"), notes: text("notes"), bars: (Array.isArray(r.bars) ? r.bars : []).slice(0, 100).filter((bar) => bar && typeof bar === "object").map((bar) => ({ mark: String(bar.mark || "").slice(0, 80), designation: String(bar.designation || "").slice(0, 80), location: String(bar.location || "").slice(0, 100), count: Number.isSafeInteger(bar.count) && bar.count > 0 ? bar.count : null, diameter: optional(bar.diameter), spacing: optional(bar.spacing), cutLength: optional(bar.cutLength) })) };
}

function normalizeSupports(model, levelIds, fallbackLevel) {
  for (const type of ["pad", "pier"]) {
    for(const item of model[type==="pad"?"pads":"piers"]||[])if(item.mark!==undefined&&(typeof item.mark!=="string"||item.mark.length>40))throw Error("Support marks must be text up to40 characters.");
    const key = type === "pad" ? "pads" : "piers";
    model[key] = (Array.isArray(model[key]) ? model[key] : []).filter((item) => item && item.center).map((item) => ({ ...makeSupport(type, point(item.center), levelIds.has(item.levelId) ? item.levelId : fallbackLevel, String(item.id || uid(type))), shape: item.shape === "circular" ? "circular" : "rectangular", width: positiveNumber(item.width, 600), length: positiveNumber(item.length, 600), diameter: positiveNumber(item.diameter, 300), depth: positiveNumber(item.depth, type === "pad" ? 300 : 900), elevation: finiteNumber(item.elevation, type === "pad" ? -1200 : -900), mark: typeof item.mark === "string" ? item.mark : "", padId: typeof item.padId === "string" ? item.padId : "", reinforcement: normalizeReinforcement(item.reinforcement) }));
  }
  for (const item of model.foundations) item.reinforcement = normalizeReinforcement(item.reinforcement);
}

function foundationMembers() {
  return [...state.model.foundations.map((item) => ({ item, type: "foundation" })), ...state.model.pads.map((item) => ({ item, type: "pad" })), ...state.model.piers.map((item) => ({ item, type: "pier" }))];
}

function supportPolygon(item) {
  if (item.shape === "circular") return Array.from({ length: 24 }, (_, i) => ({ x: item.center.x + Math.cos(i * Math.PI / 12) * item.diameter / 2, y: item.center.y + Math.sin(i * Math.PI / 12) * item.diameter / 2 }));
  return [{ x: item.center.x - item.width / 2, y: item.center.y - item.length / 2 }, { x: item.center.x + item.width / 2, y: item.center.y - item.length / 2 }, { x: item.center.x + item.width / 2, y: item.center.y + item.length / 2 }, { x: item.center.x - item.width / 2, y: item.center.y + item.length / 2 }];
}
function supportBounds() { return [...(state.model.pads || []), ...(state.model.piers || [])].flatMap(supportPolygon); }
function supportVolume(item) { return (item.shape === "circular" ? Math.PI * (item.diameter / 2) ** 2 : item.width * item.length) * item.depth; }
function memberVolume(item, type) { return type === "foundation" ? lengthBetween(item.a, item.b) * item.width * item.depth : supportVolume(item); }
function activeSupports(type) { return state.model[type === "pad" ? "pads" : "piers"].filter((item) => item.levelId === state.model.activeLevelId); }

function drawSupportsPlan() {
  for (const type of ["pad", "pier"]) {
    if (!state.visibility[type === "pad" ? "pads" : "piers"]) continue;
    for (const item of activeSupports(type)) {
      const points = supportPolygon(item).map(worldToScreen);
      const selected = state.selected?.id === item.id && state.selected?.type === type;
      ctx.save(); polygon(points, type === "pad" ? "rgba(128,99,154,.38)" : "rgba(70,99,117,.65)", selected ? "#ed1c24" : type === "pad" ? "#80639a" : "#375c72");
      const p = worldToScreen(item.center); ctx.strokeStyle = "#375c72"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - 5, p.y); ctx.lineTo(p.x + 5, p.y); ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x, p.y + 5); ctx.stroke();
      ctx.fillStyle = "#375c72"; ctx.font = "10px Segoe UI"; if(!state.visibility.foundationSetout)ctx.fillText(item.mark||(type === "pad" ? "PAD" : "PIER"), p.x + 8, p.y - 7); ctx.restore();
    }
  }
  if (state.visibility.reinforcement) for (const { item, type } of foundationMembers().filter(({ item, type }) => item.levelId === state.model.activeLevelId && state.visibility[type === "foundation" ? "foundations" : type === "pad" ? "pads" : "piers"])) drawRebarPlan(item, type);
}

function drawRebarPlan(item, type) {
  const r = item.reinforcement; if (r?.mode !== "reinforced" || !r.bars.length) return;
  ctx.save(); ctx.strokeStyle = "#c86716"; ctx.lineWidth = 1.5;
  if (type === "foundation") { const a = worldToScreen(item.a), b = worldToScreen(item.b); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  else { const p = worldToScreen(item.center); const w = (item.shape === "circular" ? item.diameter : item.width) * state.view.scale * .32; const h = (item.shape === "circular" ? item.diameter : item.length) * state.view.scale * .32; for (const offset of [-.5, 0, .5]) { ctx.beginPath(); ctx.moveTo(p.x - w, p.y + offset * h); ctx.lineTo(p.x + w, p.y + offset * h); ctx.moveTo(p.x + offset * w, p.y - h); ctx.lineTo(p.x + offset * w, p.y + h); ctx.stroke(); } }
  ctx.restore();
}

function drawSupports3d() {
  if (state.visibility.foundations && state.visibility.reinforcement) for (const item of state.model.foundations.filter(isLevelVisible3d)) if (item.reinforcement?.mode === "reinforced" && item.reinforcement.bars.length) { const a = isoPoint(item.a, item.elevation + item.depth / 2), b = isoPoint(item.b, item.elevation + item.depth / 2); ctx.save(); ctx.strokeStyle = "#c86716"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); }
  for (const type of ["pad", "pier"]) {
    if (!state.visibility[type === "pad" ? "pads" : "piers"]) continue;
    for (const item of state.model[type === "pad" ? "pads" : "piers"].filter(isLevelVisible3d)) {
      const outline = supportPolygon(item); const top = item.elevation + item.depth;
      for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; polygon([isoPoint(a, item.elevation), isoPoint(b, item.elevation), isoPoint(b, top), isoPoint(a, top)], type === "pad" ? "#d4c4df" : "#a4b6c1", type === "pad" ? "#80639a" : "#537084"); }
      polygon(outline.map((p) => isoPoint(p, top)), type === "pad" ? "#e1d7e7" : "#c8d6df", "#738594");
      if (state.visibility.reinforcement && item.reinforcement?.mode === "reinforced" && item.reinforcement.bars.length) { ctx.save(); ctx.strokeStyle = "#c86716"; ctx.lineWidth = 2; const a = isoPoint(item.center, item.elevation), b = isoPoint(item.center, top); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); }
    }
  }
}

function hitSupport(p) {
  for (const type of ["pier", "pad"]) if (state.visibility[type === "pad" ? "pads" : "piers"]) for (const item of activeSupports(type)) if (pointInPolygon(p, supportPolygon(item))) return { type, id: item.id };
  return null;
}
function placeSupport(type, world) {
  const center = snapPoint(world); const pad = type === "pier" ? activeSupports("pad").find((item) => pointInPolygon(center, supportPolygon(item))) : null;
  withHistory(() => { const item = makeSupport(type, pad ? pad.center : center, state.model.activeLevelId, null, pad?.id || ""); item.elevation += activeLevel().elevation; if (pad) item.elevation = pad.elevation + pad.depth; state.model[type === "pad" ? "pads" : "piers"].push(item); state.selected = { type, id: item.id }; });
}
function deleteSupport() {
  const { type, id } = state.selected;
  withHistory(() => { state.model[type === "pad" ? "pads" : "piers"] = state.model[type === "pad" ? "pads" : "piers"].filter((item) => item.id !== id); if (type === "pad") for (const pier of state.model.piers) if (pier.padId === id) pier.padId = ""; state.selected = null; });
}

function detailInput(label, field, value, unit = "", numeric = true) {
  return `<div class="inspector-field"><label for="detail-${field}">${escapeHtml(label)}</label><input id="detail-${field}" data-field="${field}" type="${numeric ? "number" : "text"}" ${numeric ? 'step="any"' : 'maxlength="2000"'} value="${escapeHtml(value ?? "")}" />${unit ? `<span class="field-unit">${escapeHtml(unit)}</span>` : ""}</div>`;
}
function renderSupportDetails(item, type) {
  const sizeFields = item.shape === "circular" ? detailInput("Diameter", "diameter", item.diameter, "mm") : detailInput("Width X", "width", item.width, "mm") + detailInput("Length Y", "length", item.length, "mm");
  const pads = state.model.pads.filter((pad) => pad.levelId === item.levelId);
  return `<div class="detail-head"><h3>${type === "pad" ? "Pad footing" : "Concrete pier"}</h3><button class="delete-button" data-action="delete">Delete</button></div><p class="overview-copy">Illustrative starting geometry. Enter the dimensions from the project design.</p><div class="field-grid"><div class="inspector-field full"><label for="supportShape">Shape</label><select id="supportShape" data-field="shape"><option value="rectangular" ${item.shape === "rectangular" ? "selected" : ""}>Rectangular</option><option value="circular" ${item.shape === "circular" ? "selected" : ""}>Circular</option></select></div>${detailInput("Set-out mark", "mark", item.mark||"", "", false)}${detailInput("Centre X", "centerX", item.center.x, "mm")}${detailInput("Centre Y", "centerY", item.center.y, "mm")}${sizeFields}${detailInput(type === "pad" ? "Thickness" : "Height / depth", "depth", item.depth, "mm")}${detailInput("Base elevation (project datum)", "elevation", item.elevation, "mm")}${type === "pier" ? `<div class="inspector-field full"><label for="supportPad">Supporting pad</label><select id="supportPad" data-field="padId"><option value="">Independent / not linked</option>${pads.map((pad) => `<option value="${escapeHtml(pad.id)}" ${item.padId === pad.id ? "selected" : ""}>${escapeHtml(pad.id)}</option>`).join("")}</select></div>` : ""}</div><p class="overview-copy">Concrete: ${formatNumber(supportVolume(item) / 1e9, 3)} m³ · Top elevation: ${formatNumber(item.elevation + item.depth, 0)} mm</p>`;
}

function reinforcementIssues(item, type) {
  const r = item.reinforcement || emptyReinforcement(); const issues = [];
  if (r.mode === "unspecified") issues.push("Reinforcement or plain-concrete design is unspecified.");
  if (!r.drawingRef) issues.push("Engineer drawing and revision required.");
  if (!r.standardRef) issues.push("Applicable NCC / standard edition and design pathway required.");
  if (!r.concreteMPa) issues.push("Concrete strength required.");
  if (!r.exposure) issues.push("Exposure / durability conditions required.");
  if (r.mode === "reinforced") {
    if (!r.cover) issues.push("Specified concrete cover required.");
    const leastSize = Math.min(item.depth, item.shape === "circular" ? item.diameter : item.width, type === "pad" && item.shape !== "circular" ? item.length : Infinity);
    if (r.cover && r.cover * 2 >= leastSize) issues.push("Cover leaves no space for reinforcement inside this member.");
    if (!r.bars.length) issues.push("Reinforcement schedule is empty.");
    if (r.bars.some((bar) => !bar.designation || !bar.location || !bar.count || (!isMeshRow(bar) && !bar.cutLength))) issues.push("Complete designation, location and count for every row; bar rows also need developed cut length.");
    if (!r.anchorage) issues.push("Record laps, hooks, development and starter-bar details.");
  }
  if (type === "pier" && item.padId) {
    const pad = state.model.pads.find((p) => p.id === item.padId && p.levelId === item.levelId);
    if (!pad) issues.push("Linked pad cannot be found on this level.");
    else { if (!supportPolygon(item).every((p) => pad.shape === "circular" ? lengthBetween(p, pad.center) <= pad.diameter / 2 + 1 : Math.abs(p.x - pad.center.x) <= pad.width / 2 + 1 && Math.abs(p.y - pad.center.y) <= pad.length / 2 + 1)) issues.push("Pier footprint extends outside its supporting pad."); if (Math.abs(item.elevation - (pad.elevation + pad.depth)) > 1) issues.push("Pier base and pad top elevations do not meet."); }
  }
  return issues;
}

function renderReinforcementDetails(item, type) {
  const r = item.reinforcement || emptyReinforcement(); const issues = reinforcementIssues(item, type);
  return `<h3 class="reinforcement-heading">Reinforcement & concrete</h3><div class="field-grid"><div class="inspector-field full"><label for="rebarMode">Design type</label><select id="rebarMode" data-field="rebar.mode"><option value="unspecified" ${r.mode === "unspecified" ? "selected" : ""}>Unspecified</option><option value="reinforced" ${r.mode === "reinforced" ? "selected" : ""}>Reinforced concrete</option><option value="plain" ${r.mode === "plain" ? "selected" : ""}>Plain concrete — per design</option></select></div>${detailInput("Concrete strength f’c", "rebar.concreteMPa", r.concreteMPa, "MPa")}${detailInput("Specified cover", "rebar.cover", r.cover, "mm")}${detailInput("Exposure / durability", "rebar.exposure", r.exposure, "", false)}${detailInput("Drawing / revision", "rebar.drawingRef", r.drawingRef, "", false)}${detailInput("NCC / standard edition & pathway", "rebar.standardRef", r.standardRef, "", false)}${detailInput("Laps / hooks / anchorage / starters", "rebar.anchorage", r.anchorage, "", false)}${detailInput("Placement / inspection notes", "rebar.notes", r.notes, "", false)}</div><p class="overview-copy">Use the engineer’s bar marks and developed cut lengths, including bends and hooks. Spacing is recorded; quantities are entered from the design.</p>${r.bars.map((bar, index) => `<fieldset class="bar-row"><legend>Bar / mesh row ${index + 1}</legend><div class="field-grid">${detailInput("Bar mark", `bar.${index}.mark`, bar.mark, "", false)}${detailInput("Designation e.g. N12 / SL72", `bar.${index}.designation`, bar.designation, "", false)}${detailInput("Location / direction", `bar.${index}.location`, bar.location, "", false)}${detailInput("Count (bars / sheets)", `bar.${index}.count`, bar.count)}${detailInput("Bar diameter", `bar.${index}.diameter`, bar.diameter, "mm")}${detailInput("Spacing", `bar.${index}.spacing`, bar.spacing, "mm")}${detailInput("Developed cut length (bars)", `bar.${index}.cutLength`, bar.cutLength, "mm")}</div><button type="button" class="link-button" data-action="remove-bar" data-index="${index}">Remove row</button></fieldset>`).join("")}<button class="example-button" type="button" data-action="add-bar">Add bar / mesh row</button>${foundationDetailSvg(item, type)}<div class="warning-note">${issues.length ? issues.map(escapeHtml).join("<br>") : "Design inputs recorded. Engineering adequacy and construction inspection still require project review."}</div><p class="overview-copy">Reference pathway: NCC adopted project edition; <a href="https://ncc.abcb.gov.au/system/files/ncc/ncc2022-abcb-housing-provisions.pdf" target="_blank" rel="noopener">ABCB Housing Provisions 2022</a> 4.1 and 4.2, including 4.2.11 steel reinforcement and 4.2.13 stump/pad footing details where applicable. These provisions have site and construction limits. Confirm AS 2870, AS 3600 and AS/NZS 4671 editions with the project designer. No standard sizing or cover is assigned automatically.</p>`;
}

function foundationDetailSvg(item, type) {
  const r = item.reinforcement || emptyReinforcement();
  return `<svg class="foundation-section" viewBox="0 0 240 145" role="img" aria-label="Schematic foundation section; reinforcement placement per engineer drawing"><rect x="30" y="32" width="180" height="75" rx="${item.shape === "circular" ? 12 : 0}" fill="#e1d7e7" stroke="#80639a"/>${r.mode === "reinforced" && r.bars.length ? '<path d="M45 48H195V92H45Z" fill="none" stroke="#c86716" stroke-width="2"/><circle cx="48" cy="90" r="3" fill="#c86716"/><circle cx="192" cy="90" r="3" fill="#c86716"/>' : ""}<text x="120" y="20" text-anchor="middle">${escapeHtml(type === "foundation" ? "Strip footing" : type === "pad" ? "Pad footing" : "Concrete pier")} — schematic section</text><text x="120" y="125" text-anchor="middle">${escapeHtml(r.cover ? `Specified cover ${r.cover} mm; placement per drawing` : "Cover and reinforcement per project drawing")}</text><text x="120" y="140" text-anchor="middle">Not to scale · cage diagram is indicative</text></svg>`;
}

function updateFoundationField(item, field, raw) {
  const type = state.selected?.type;
  if (!["foundation", "pad", "pier"].includes(type)) return false;
  const supportField = ["mark", "shape", "centerX", "centerY", "width", "length", "diameter", "depth", "elevation", "padId"].includes(field);
  if (!field.startsWith("rebar.") && !field.startsWith("bar.") && !(type !== "foundation" && supportField)) return false;
  if(field==="mark"&&raw.length>40){state.statusMessage="Support marks are limited to40 characters.";render();return true;}
  const parts = field.split("."); const key = parts.at(-1);
  const numeric = ["centerX", "centerY", "width", "length", "diameter", "depth", "elevation", "concreteMPa", "cover", "count", "spacing", "cutLength"].includes(key);
  const optional = field.startsWith("rebar.") || field.startsWith("bar.");
  const value = numeric ? raw === "" && optional ? null : Number(raw) : raw.slice(0, 2000);
  if (numeric && value !== null && (!Number.isFinite(value) || (!["centerX", "centerY", "elevation"].includes(key) && value <= 0) || (key === "count" && !Number.isSafeInteger(value)))) { state.statusMessage = "Enter a positive value (whole number for count)."; render(); return true; }
  if (numeric && !optional && raw === "") { render(); return true; }
  withHistory(() => { if (parts[0] === "rebar") { item.reinforcement ||= emptyReinforcement(); item.reinforcement[key] = value; } else if (parts[0] === "bar") item.reinforcement.bars[Number(parts[1])][key] = value; else if (key === "centerX") item.center.x = value; else if (key === "centerY") item.center.y = value; else item[key] = value; });
  return true;
}
function addReinforcementRow() { const item = selectedObject(); if (!item) return; withHistory(() => { item.reinforcement ||= emptyReinforcement(); item.reinforcement.bars.push({ mark: "", designation: "", location: "", count: null, diameter: null, spacing: null, cutLength: null }); }); }
function removeReinforcementRow(index) { const item = selectedObject(); if (item?.reinforcement?.bars[index]) withHistory(() => item.reinforcement.bars.splice(index, 1)); }

function supportQuantityRows() {
  const rows = ["pad", "pier"].map((type) => { const items = state.model[type === "pad" ? "pads" : "piers"]; const net = items.reduce((sum, item) => sum + supportVolume(item), 0); return { label: type === "pad" ? "Pad footing concrete" : "Pier concrete", net, waste: net * .05, order: net * 1.05, unit: "m³", basis: `${items.length} individual ${type}s; geometry only; overlaps not deducted; 5% provisional allowance` }; });
  const bars = foundationMembers().flatMap(({ item }) => item.reinforcement?.mode === "reinforced" ? item.reinforcement.bars : []);
  const total = bars.filter((bar) => !isMeshRow(bar) && bar.count && bar.cutLength).reduce((sum, bar) => sum + bar.count * bar.cutLength / 1000, 0);
  rows.push({ label: "Scheduled reinforcement bar length", net: total, waste: 0, order: total, unit: "m", basis: "Entered counts × developed cut lengths only; incomplete rows and mesh excluded; stock cutting and waste not calculated" });
  const sheets = bars.filter(isMeshRow).reduce((sum, bar) => sum + (bar.count || 0), 0);
  rows.push({ label: "Scheduled mesh sheets", net: sheets, waste: 0, order: sheets, unit: "count", basis: "SL / RL designations; entered sheet counts only; sheet size, laps and layout per project drawing" });
  return rows;
}
function isMeshRow(bar) { return /^(SL|RL)\d/i.test(bar.designation.trim()); }
function foundationReviewHtml() {
  const issues = foundationMembers().reduce((sum, { item, type }) => sum + (reinforcementIssues(item, type).length ? 1 : 0), 0);
  return `<div class="compliance-row"><strong>Foundation design details</strong><small>${issues} member(s) have incomplete design inputs or geometry issues. Open the foundation schedule to review each member.</small></div>`;
}
function renderFoundationSchedule() {
  const container = document.querySelector("#foundationSchedule"); if (!container) return;
  container.innerHTML = foundationMembers().map(({ item, type }) => { const r = item.reinforcement || emptyReinforcement(); const issues = reinforcementIssues(item, type); return `<button type="button" class="foundation-schedule-row" data-member-id="${escapeHtml(item.id)}" data-member-type="${type}"><strong>${escapeHtml(type === "foundation" ? "Strip footing" : type === "pad" ? "Pad footing" : "Pier")} · ${escapeHtml(item.id)}</strong><span>${escapeHtml(levelName(item.levelId))} · ${formatNumber(memberVolume(item, type) / 1e9, 3)} m³ net</span><span>${escapeHtml(r.drawingRef || "Drawing required")} · ${r.bars.length} reinforcement rows</span><small>${issues.length ? escapeHtml(issues.join(" ")) : "Inputs recorded; professional design review required."}</small></button>`; }).join("") || '<p class="overview-copy">Place a strip footing, pad or pier to begin the schedule.</p>';
}
function exportFoundationCsv() {
  const header = ["Member ID", "Type", "Level", "Shape", "Width mm", "Length mm", "Diameter mm", "Depth mm", "Base elevation mm", "Net concrete m3", "Supporting pad", "Design type", "Concrete MPa", "Cover mm", "Exposure", "Drawing revision", "Standard edition pathway", "Mark", "Designation", "Location", "Count", "Diameter mm", "Spacing mm", "Developed cut length mm", "Developed bar total m", "Laps hooks anchorage", "Notes", "Review"];
  const rows = foundationMembers().flatMap(({ item, type }) => {
    const r = item.reinforcement || emptyReinforcement();
    return (r.bars.length ? r.bars : [{}]).map((bar, index) => [
      item.id, type, levelName(item.levelId), item.shape || "strip",
      item.shape === "circular" ? "" : item.width,
      type === "foundation" ? lengthBetween(item.a, item.b) : item.shape === "circular" ? "" : item.length,
      item.shape === "circular" ? item.diameter : "", item.depth, item.elevation,
      index === 0 ? memberVolume(item, type) / 1e9 : "", item.padId || "",
      r.mode, r.concreteMPa, r.cover, r.exposure, r.drawingRef, r.standardRef,
      bar.mark, bar.designation, bar.location, bar.count, bar.diameter, bar.spacing, bar.cutLength,
      r.mode === "reinforced" && bar.designation && !isMeshRow(bar) && bar.count && bar.cutLength ? bar.count * bar.cutLength / 1000 : "",
      r.anchorage, r.notes, reinforcementIssues(item, type).join("; "),
    ]);
  });
  download("bc-design-foundation-schedule.csv", [header, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv");
}
