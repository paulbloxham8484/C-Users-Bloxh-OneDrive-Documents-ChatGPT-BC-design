/* Each flight has N risers and N-1 separate treads. A stair may also carry a
   measured, horizontal landing and one optional continuation flight. */
const STAIR_LAYOUTS = {
  none: "Single flight",
  landing: "Upper landing only",
  straight: "Straight continuation",
  left: "Quarter turn left",
  right: "Quarter turn right",
  "return-left": "Half turn left",
  "return-right": "Half turn right",
};
const STAIR_CONTINUATION_NUMBERS = ["landingLength", "landingWidth", "landingThickness", "flightWidth", "flightRun", "flightRise", "flightRisers", "flightGap"];

function makeStairContinuation() {
  return { layout: "none", landingLength: null, landingWidth: null, landingThickness: null, flightWidth: null, flightRun: null, flightRise: null, flightRisers: null, flightGap: null, dimensionSource: "", notes: "" };
}

function makeStair(a, b, levelId, elevation = 0) {
  return { id: uid("stair"), levelId, name: "Straight stair", a: { ...a }, b: { ...b }, width: 1000, rise: 1080, risers: 6, elevation, treadThickness: 40, closedRisers: true, material: "Unspecified", landings: "", headroom: "", handrails: "", barriers: "", slipResistance: "", structure: "", drawingRef: "", standardRef: "", notes: "", continuation: makeStairContinuation(), railRuns: [], coordination: makeStairCoordination(), headroomReview: makeStairHeadroom() };
}

function validateStair(stair) {
  if (!stair?.a || !stair?.b || [stair.a.x, stair.a.y, stair.b.x, stair.b.y, stair.elevation].some((value) => !Number.isFinite(value))) throw new Error("Stair coordinates and base elevation must be finite numbers.");
  if ([stair.a.x, stair.a.y, stair.b.x, stair.b.y, stair.elevation].some((value) => Math.abs(value) > 1e9)) throw new Error("Stair geometry exceeds the coordinate modelling limit.");
  const run = lengthBetween(stair.a, stair.b);
  if (run < 100) throw new Error("Draw a stair run at least 100 mm long.");
  if (run > 1e6) throw new Error("Stair run exceeds the 1,000,000 mm modelling limit.");
  if (!Number.isSafeInteger(stair.risers) || stair.risers < 2 || stair.risers > 100) throw new Error("Enter 2–100 whole risers for this modelling tool; check permitted flight length separately.");
  for (const field of ["width", "rise", "treadThickness"]) if (!Number.isFinite(stair[field]) || stair[field] <= 0 || stair[field] > 1e6) throw new Error(`${field} must be greater than zero and no more than 1,000,000 mm.`);
  if (stair.treadThickness > stair.rise / stair.risers) throw new Error("Schematic tread thickness cannot exceed the modelled riser height.");

  validateStairRails(stair.railRuns);
  validateStairCoordination(stair.coordination);
  validateStairHeadroom(stair.headroomReview);
  if (stair.continuation === undefined) return;
  const continuation = stair.continuation;
  if (!continuation || typeof continuation !== "object" || Array.isArray(continuation) || !Object.hasOwn(STAIR_LAYOUTS, continuation.layout)) throw new Error("Choose a supported stair landing/turn layout.");
  for (const key of STAIR_CONTINUATION_NUMBERS) {
    const value = continuation[key];
    if (value === undefined || value === null) continue;
    if (!Number.isFinite(value) || (key === "flightGap" ? value < 0 : value <= 0) || value > 1e6) throw new Error(`${key} must be blank or a valid project dimension (maximum 1,000,000 mm).`);
  }
  if (continuation.flightRisers !== null && continuation.flightRisers !== undefined && (!Number.isSafeInteger(continuation.flightRisers) || continuation.flightRisers < 2 || continuation.flightRisers > 100)) throw new Error("Enter 2–100 whole risers for the second flight.");
  if (continuation.flightRun !== null && continuation.flightRun !== undefined && continuation.flightRun < 100) throw new Error("Second flight run must be at least 100 mm for modelling.");
  if (continuation.flightRise !== null && continuation.flightRise !== undefined && continuation.flightRisers !== null && continuation.flightRisers !== undefined && stair.treadThickness > continuation.flightRise / continuation.flightRisers) throw new Error("Tread thickness cannot exceed the second flight riser height.");
}

function validateStairImport(stairs) {
  if (stairs === undefined) return;
  if (!Array.isArray(stairs)) throw new Error("Stairs must be a list.");
  const ids = new Set();
  for (const stair of stairs) {
    validateStair(stair);
    if (stair.id) {
      if (ids.has(String(stair.id))) throw new Error("Duplicate stair ID.");
      ids.add(String(stair.id));
    }
  }
}

function normalizeStairs(model, levelIds, fallbackLevel) {
  model.stairs = (Array.isArray(model.stairs) ? model.stairs : []).map((raw) => {
    if (!raw?.a || !raw?.b) throw new Error("Stair import needs lower and upper nosing coordinates.");
    if (raw.continuation !== undefined && raw.continuation !== null && (typeof raw.continuation !== "object" || Array.isArray(raw.continuation))) throw new Error("Stair landing/turn data must be an object.");
    const stair = { ...makeStair(raw.a, raw.b, fallbackLevel), ...raw, id: String(raw.id || uid("stair")), levelId: levelIds.has(raw.levelId) ? raw.levelId : fallbackLevel, a: { x: raw.a.x, y: raw.a.y }, b: { x: raw.b.x, y: raw.b.y }, closedRisers: raw.closedRisers !== false, continuation: { ...makeStairContinuation(), ...(raw.continuation || {}) } };
    for (const key of ["name", "material", "landings", "headroom", "handrails", "barriers", "slipResistance", "structure", "drawingRef", "standardRef", "notes"]) stair[key] = typeof stair[key] === "string" ? stair[key].slice(0, 2000) : "";
    for (const key of ["dimensionSource", "notes"]) stair.continuation[key] = typeof stair.continuation[key] === "string" ? stair.continuation[key].slice(0, 2000) : "";
    normalizeStairRails(stair);
    normalizeStairCoordination(stair);
    normalizeStairHeadroom(stair);
    validateStair(stair);
    return stair;
  });
}

function stairFlightGeometry(stair) {
  const run = lengthBetween(stair.a, stair.b), direction = unit(sub(stair.b, stair.a)), normal = { x: -direction.y, y: direction.x };
  const riser = stair.rise / stair.risers, going = run / (stair.risers - 1), treads = stair.risers - 1;
  const p = (distance, side, z) => ({ ...add(add(stair.a, scale(direction, distance)), scale(normal, side * stair.width / 2)), z });
  const outline = [p(0, -1, stair.elevation), p(run, -1, stair.elevation), p(run, 1, stair.elevation), p(0, 1, stair.elevation)];
  const surfaces = Array.from({ length: treads }, (_, i) => { const start = going * i, end = going * (i + 1), z = stair.elevation + riser * (i + 1); return [p(start, -1, z), p(end, -1, z), p(end, 1, z), p(start, 1, z)]; });
  const riserFaces = Array.from({ length: stair.risers }, (_, i) => { const distance = going * i, z = stair.elevation + riser * i; return [p(distance, -1, z), p(distance, 1, z), p(distance, 1, z + riser), p(distance, -1, z + riser)]; });
  return { run, riser, going, treads, outline, surfaces, riserFaces, relation: 2 * riser + going, top: stair.elevation + stair.rise, pitch: Math.atan2(stair.rise, run) * 180 / Math.PI, treadArea: stair.width * run, a: stair.a, b: stair.b, width: stair.width, rise: stair.rise, risers: stair.risers, elevation: stair.elevation };
}

function stairGeometry(stair) {
  const first = stairFlightGeometry(stair);
  const result = { ...first, flights: [first], outlines: [first.outline], landing: null, continuationStatus: "Single flight", continuationIssues: [], totalRun: first.run, totalRise: stair.rise, totalRisers: stair.risers, landingArea: 0, landingVolume: 0 };
  const continuation = { ...makeStairContinuation(), ...(stair.continuation || {}) };
  if (continuation.layout === "none") return result;

  const pending = (message) => { result.continuationStatus = message; result.continuationIssues.push(`${message}. Enter project dimensions; unassessed components are excluded from measured totals.`); return result; };
  if (continuation.landingLength == null || continuation.landingWidth == null) return pending("Landing dimensions pending");

  const direction = unit(sub(stair.b, stair.a)), normal = { x: -direction.y, y: direction.x };
  // Plan has +Y down the screen. Left while walking up is (dy, -dx).
  const isReturn = continuation.layout.startsWith("return-"), sign = continuation.layout.endsWith("left") ? -1 : 1;
  const minSide = isReturn ? (sign === 1 ? -stair.width / 2 : stair.width / 2 - continuation.landingWidth) : -continuation.landingWidth / 2;
  const maxSide = minSide + continuation.landingWidth;
  const p = (along, side, z = first.top) => ({ ...add(add(stair.b, scale(direction, along)), scale(normal, side)), z });
  const landingPoints = [p(0, minSide), p(continuation.landingLength, minSide), p(continuation.landingLength, maxSide), p(0, maxSide)];
  result.landing = { points: landingPoints, top: first.top, thickness: continuation.landingThickness, area: continuation.landingLength * continuation.landingWidth, volume: continuation.landingThickness == null ? null : continuation.landingLength * continuation.landingWidth * continuation.landingThickness };
  result.landingArea = result.landing.area;
  result.landingVolume = result.landing.volume || 0;
  if (continuation.landingThickness == null) result.continuationIssues.push("Landing body thickness is unknown; show the top surface only and leave volume unassessed.");
  if (!continuation.dimensionSource) result.continuationIssues.push("Record the project drawing or exact supplier source for entered landing/second-flight dimensions.");
  if (continuation.landingWidth < stair.width) result.continuationIssues.push("Landing width does not cover the first flight width; connection geometry needs review.");
  if (continuation.layout === "landing") { result.continuationStatus = "Landing preview"; return result; }
  if (["flightWidth", "flightRun", "flightRise", "flightRisers"].some((key) => continuation[key] == null) || (isReturn && continuation.flightGap == null)) return pending("Second flight dimensions pending");

  let start, flightDirection;
  if (continuation.layout === "straight") {
    start = p(continuation.landingLength, 0);
    flightDirection = direction;
  } else if (isReturn) {
    // Both parallel flights meet the near edge; starting at the far edge
    // would run the second flight through the horizontal landing body.
    start = p(0, sign * (stair.width / 2 + continuation.flightGap + continuation.flightWidth / 2));
    flightDirection = scale(direction, -1);
  } else {
    start = p(continuation.landingLength / 2, sign * continuation.landingWidth / 2);
    flightDirection = scale(normal, sign);
  }

  // Source dimensions stay measured values. Draw a continuation only when its
  // complete width can meet the entered landing edge.
  const fits = continuation.landingWidth >= stair.width && (isReturn
    ? continuation.landingWidth >= stair.width + continuation.flightGap + continuation.flightWidth
    : continuation.layout === "straight" ? continuation.landingWidth >= continuation.flightWidth : continuation.landingLength >= continuation.flightWidth);
  if (!fits) return pending("Second flight connection does not fit landing");
  const end = add(start, scale(flightDirection, continuation.flightRun));
  const secondSource = { ...stair, a: start, b: end, width: continuation.flightWidth, rise: continuation.flightRise, risers: continuation.flightRisers, elevation: first.top };
  const second = stairFlightGeometry(secondSource);
  result.flights.push(second); result.outlines.push(second.outline); result.surfaces = [...first.surfaces, ...second.surfaces]; result.riserFaces = [...first.riserFaces, ...second.riserFaces];
  result.treads = first.treads + second.treads; result.treadArea = first.treadArea + second.treadArea; result.top = second.top; result.totalRun = first.run + second.run; result.totalRise = stair.rise + second.rise; result.totalRisers = stair.risers + second.risers; result.continuationStatus = "Two-flight preview";
  if (Math.abs(first.riser - second.riser) > 1e-6) result.continuationIssues.push("The two flights have different calculated riser heights; review finished-level consistency. This is a geometric difference, not a code tolerance check.");
  return result;
}

function stairBounds() {
  return (state.model.stairs || []).flatMap((stair) => { const geometry = stairGeometry(stair); const flightPoints = geometry.flights.flatMap((flight) => flight.outline); const landingPoints = geometry.landing ? geometry.landing.points.flatMap((point) => [point, { ...point, z: point.z - (geometry.landing.thickness || 0) }]) : []; return [...flightPoints, ...landingPoints]; });
}

function drawStairsPlan() {
  if (!state.visibility.stairs && !state.visibility.stairLandings) return;
  for (const stair of state.model.stairs.filter((item) => item.levelId === state.model.activeLevelId)) {
    const geometry = stairGeometry(stair), selected = state.selected?.type === "stair" && state.selected.id === stair.id, stroke = selected ? "#ed1c24" : "#426d8f";
    if (state.visibility.stairLandings && geometry.landing) {
      ctx.save(); polygon(geometry.landing.points.map(worldToScreen), "rgba(180,145,83,.23)", stroke); const centre = geometry.landing.points.reduce((sum, point) => add(sum, point), { x: 0, y: 0 }); const label = worldToScreen(scale(centre, .25)); ctx.font = "10px Segoe UI"; ctx.fillStyle = "#805c2a"; ctx.fillText("LANDING", label.x - 20, label.y); ctx.restore();
    }
    if (!state.visibility.stairs) continue;
    for (const [flightIndex, flight] of geometry.flights.entries()) {
      ctx.save(); polygon(flight.outline.map(worldToScreen), "rgba(85,122,156,.20)", stroke); ctx.strokeStyle = "#426d8f"; ctx.lineWidth = 1;
      for (const face of flight.riserFaces) { const a = worldToScreen(face[0]), b = worldToScreen(face[1]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      const a = worldToScreen(flight.a), b = worldToScreen(flight.b), direction = unit(sub(b, a)); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 10 * direction.x - 5 * (-direction.y), b.y - 10 * direction.y + 5 * direction.x); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 10 * direction.x + 5 * (-direction.y), b.y - 10 * direction.y - 5 * direction.x); ctx.stroke(); ctx.fillStyle = "#426d8f"; ctx.font = "10px Segoe UI"; ctx.fillText(`UP ${flightIndex + 1} · ${stair.name}`, a.x + 8, a.y - 9); ctx.restore();
    }
  }
}

function drawStairs3d() {
  if (!state.visibility.stairs && !state.visibility.stairLandings) return;
  const faces = [];
  for (const stair of state.model.stairs.filter(isLevelVisible3d)) {
    const geometry = stairGeometry(stair);
    if (state.visibility.stairs) for (const flight of geometry.flights) {
      for (const points of flight.surfaces) { faces.push({ points, top: true }); for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; faces.push({ points: [a, b, { ...b, z: b.z - stair.treadThickness }, { ...a, z: a.z - stair.treadThickness }], top: false }); } }
      if (stair.closedRisers) for (const points of flight.riserFaces) faces.push({ points, top: false });
    }
    if (state.visibility.stairLandings && geometry.landing) { const { points, thickness } = geometry.landing; faces.push({ points, top: true, landing: true }); if (thickness != null) { faces.push({ points: points.map((point) => ({ ...point, z: point.z - thickness })), top: false, landing: true }); for (let i = 0; i < 4; i += 1) { const a = points[i], b = points[(i + 1) % 4]; faces.push({ points: [a, b, { ...b, z: b.z - thickness }, { ...a, z: a.z - thickness }], top: false, landing: true }); } } }
  }
  faces.sort((a, b) => a.points.reduce((sum, point) => sum + point.x + point.y, 0) / a.points.length - b.points.reduce((sum, point) => sum + point.x + point.y, 0) / b.points.length || Number(a.top) - Number(b.top));
  for (const face of faces) polygon(face.points.map((point) => isoPoint(point, point.z)), face.landing ? (face.top ? "#d7ba84" : "#eee0c4") : face.top ? "#a6c1d5" : "#d5e1eb", "#426d8f");
}

function drawStairDraft() { if (state.drawing?.kind === "stair") drawDraftWall(state.drawing.start, state.drawing.current); }

function commitStair() {
  const { start, current } = state.drawing; state.drawing = null;
  const stair = makeStair(start, current, state.model.activeLevelId, activeLevel().elevation);
  try { validateStair(stair); } catch (error) { state.statusMessage = error.message; render(); return; }
  stair.name = `Stair ${state.model.stairs.length + 1}`;
  withHistory(() => { state.model.stairs.push(stair); state.selected = { type: "stair", id: stair.id }; state.visibility.stairs = true; state.visibility.stairLandings = true; });
}

function hitStair(point) {
  if (!state.visibility.stairs && !state.visibility.stairLandings && !state.visibility.stairHandrails && !state.visibility.stairBarriers) return null;
  const stair = [...state.model.stairs].reverse().find((item) => { if (item.levelId !== state.model.activeLevelId) return false; const geometry = stairGeometry(item); return hitStairRails(item, point) || (state.visibility.stairs && geometry.flights.some((flight) => pointInPolygon(point, flight.outline))) || (state.visibility.stairLandings && geometry.landing && pointInPolygon(point, geometry.landing.points)); });
  return stair ? { type: "stair", id: stair.id } : null;
}

function deleteStair() { const id = state.selected.id; withHistory(() => { state.model.stairs = state.model.stairs.filter((stair) => stair.id !== id); state.selected = null; }); }

function stairIssues(stair) {
  const issues = [];
  if (!stair.drawingRef || !stair.standardRef) issues.push("Record the project design drawing/revision, applicable NCC edition and stair design criteria.");
  if (!stair.landings) issues.push("Upper/lower landings and connection to finished floor levels need design details.");
  if (!stair.headroom) issues.push("Headroom and clearance to structure are not checked by this model.");
  if (!stair.handrails || !stair.barriers) issues.push("Handrails, barriers and fall protection need project details; attached reference runs do not establish complete edge coverage.");
  if (!stair.slipResistance) issues.push("Record wet/dry slip-resistance requirements and product evidence.");
  if (!stair.structure || stair.material === "Unspecified") issues.push("Specify material, supports, stringers, fixings and structural design.");
  if (!stair.closedRisers) issues.push("Open-riser openings require separate measurement and review.");
  return [...issues, ...stairGeometry(stair).continuationIssues];
}

function renderStairContinuation(stair) {
  const continuation = stair.continuation || makeStairContinuation(), geometry = stairGeometry(stair);
  const field = (label, key) => detailInput(label, `continuation-${key}`, continuation[key], key === "flightRisers" ? "" : "mm");
  return `<h3 class="reinforcement-heading">Landing and turn</h3><div class="field-grid"><div class="inspector-field full"><label for="stairLayout">Layout after first flight</label><select id="stairLayout" data-field="continuation-layout">${Object.entries(STAIR_LAYOUTS).map(([value, label]) => `<option value="${value}" ${value === continuation.layout ? "selected" : ""}>${label}</option>`).join("")}</select></div>${continuation.layout === "none" ? "" : field("Landing forward length", "landingLength") + field("Landing overall width", "landingWidth") + field("Landing body thickness", "landingThickness")}${["none", "landing"].includes(continuation.layout) ? "" : field("Second flight width", "flightWidth") + field("Second flight run", "flightRun") + field("Second flight rise", "flightRise") + field("Second flight risers", "flightRisers") + (continuation.layout.startsWith("return-") ? field("Clear gap between flights", "flightGap") : "")}${continuation.layout === "none" ? "" : detailInput("Dimension source / product reference", "continuation-dimensionSource", continuation.dimensionSource, "", false) + detailInput("Landing / turn notes", "continuation-notes", continuation.notes, "", false)}</div><p class="overview-copy">${escapeHtml(geometry.continuationStatus)}. ${geometry.flights.length} measured flight(s), ${geometry.totalRisers} risers and ${geometry.treads} separate treads. Measured upper elevation: ${formatNumber(geometry.top, 1)} mm.${geometry.landing ? ` Landing top area: ${formatArea(geometry.landing.area)}; body envelope: ${geometry.landing.volume == null ? "unassessed" : `${formatNumber(geometry.landing.volume / 1e9, 3)} m³`}.` : ""}</p>${geometry.flights.map((flight, index) => `<p class="overview-copy">Flight ${index + 1}: R ${formatNumber(flight.riser, 1)} mm · G ${formatNumber(flight.going, 1)} mm · 2R+G ${formatNumber(flight.relation, 1)} mm · run ${formatLength(flight.run)}</p>`).join("")}<p class="overview-copy">Enter project-designed dimensions; blanks remain unknown. Left/right turns are named while walking up in Plan. The landing starts at the first flight's upper nosing and stays horizontal. Half turns use the entered clear gap. A second flight is shown only when its whole width meets the landing edge. The final upper floor/landing, winders, stringers and structural connections are excluded; attached rail records are separate reference geometry.</p>`;
}

function renderStairDetails(stair) {
  const geometry = stairGeometry(stair), first = geometry.flights[0];
  return `<div class="detail-head"><h3>${escapeHtml(stair.name)}</h3><button class="delete-button" data-action="delete">Delete</button></div><p class="overview-copy">Measured first flight. Lower and upper points are nosing centres in plan. ${stair.risers} risers, ${first.treads} separate treads; the upper floor or entered landing supplies the final surface.</p><div class="field-grid">${detailInput("Name", "name", stair.name, "", false)}${detailInput("Width", "width", stair.width, "mm")}${detailInput("Lower X", "startX", stair.a.x, "mm")}${detailInput("Lower Y", "startY", stair.a.y, "mm")}${detailInput("Upper X", "endX", stair.b.x, "mm")}${detailInput("Upper Y", "endY", stair.b.y, "mm")}${detailInput("First flight finished rise", "rise", stair.rise, "mm")}${detailInput("Number of risers", "risers", stair.risers)}${detailInput("Lower finished elevation", "elevation", stair.elevation, "mm")}${detailInput("Schematic tread thickness", "treadThickness", stair.treadThickness, "mm")}<div class="inspector-field"><label for="stairRisers">Riser faces</label><select id="stairRisers" data-field="closedRisers"><option value="true" ${stair.closedRisers ? "selected" : ""}>Closed</option><option value="false" ${!stair.closedRisers ? "selected" : ""}>Open</option></select></div>${detailInput("Material", "material", stair.material, "", false)}</div><p class="overview-copy">First flight — R: ${formatNumber(first.riser, 1)} mm · G: ${formatNumber(first.going, 1)} mm · 2R + G: ${formatNumber(first.relation, 1)} mm · run: ${formatLength(first.run)} · upper elevation: ${formatNumber(first.top, 0)} mm. Sum of measured flight runs (landing travel excluded): ${formatLength(geometry.totalRun)}.</p><p class="overview-copy">Equal risers/goings are a geometry assumption. Model limits do not establish allowable stair dimensions or finished-site uniformity.</p>${renderStairContinuation(stair)}${renderStairRailDetails(stair)}${renderStairCoordinationDetails(stair)}${renderStairHeadroomDetails(stair)}<h3 class="reinforcement-heading">Australian stair review</h3><div class="field-grid">${detailInput("Landings / floor connections", "landings", stair.landings, "", false)}${detailInput("Headroom / clearances", "headroom", stair.headroom, "", false)}${detailInput("Handrail design", "handrails", stair.handrails, "", false)}${detailInput("Barriers / fall protection", "barriers", stair.barriers, "", false)}${detailInput("Slip resistance / product evidence", "slipResistance", stair.slipResistance, "", false)}${detailInput("Stringers / supports / fixings", "structure", stair.structure, "", false)}${detailInput("Drawing / revision", "drawingRef", stair.drawingRef, "", false)}${detailInput("NCC edition / stair criteria", "standardRef", stair.standardRef, "", false)}${detailInput("Notes", "notes", stair.notes, "", false)}</div><div class="warning-note">${stairIssues(stair).map(escapeHtml).join("<br>") || "Project details recorded; dimensional, structural and construction review still required."}</div><p class="overview-copy">Review against the project's adopted <a href="https://ncc.abcb.gov.au/system/files/ncc/ncc2022-abcb-housing-provisions.pdf" target="_blank" rel="noopener">ABCB Housing Provisions Parts 11.2 and 11.3</a>, including applicable riser/going tables, flight limits, landings, slip resistance, handrails and barriers. AS 4586 concerns slip-resistance testing; confirm the required class and product evidence. No automatic regulatory pass is assigned. <a href="https://www.bpc.vic.gov.au/resource-hub/industry-updates/meeting-the-structural-requirements-for-stair-and-barrier-design" target="_blank" rel="noopener">BPC stair and barrier design guidance</a> (checked 26 October 2026) also identifies project-specific loading, structural connections and design documentation; confirm the applicable requirements with the project designer.</p>`;
}

function updateStairField(field, raw) {
  if (state.selected?.type !== "stair") return false;
  const stair = selectedObject(), next = clone(stair);
  const continuationField = field.startsWith("continuation-") ? field.slice("continuation-".length) : "";
  if (continuationField) {
    next.continuation = { ...makeStairContinuation(), ...(next.continuation || {}) };
    if (continuationField === "layout") next.continuation.layout = raw;
    else if (STAIR_CONTINUATION_NUMBERS.includes(continuationField)) next.continuation[continuationField] = raw.trim() ? Number(raw) : null;
    else if (["dimensionSource", "notes"].includes(continuationField)) next.continuation[continuationField] = raw.slice(0, 2000);
    else return true;
  } else {
    const numeric = ["width", "rise", "risers", "elevation", "treadThickness", "startX", "startY", "endX", "endY"].includes(field);
    const value = numeric ? (raw.trim() ? Number(raw) : NaN) : raw.slice(0, 2000);
    if (field === "startX") next.a.x = value; else if (field === "startY") next.a.y = value; else if (field === "endX") next.b.x = value; else if (field === "endY") next.b.y = value; else if (field === "closedRisers") next.closedRisers = raw === "true"; else if (Object.hasOwn(next, field)) next[field] = value; else return true;
  }
  try { validateStair(next); } catch (error) { state.statusMessage = error.message; render(); return true; }
  withHistory(() => Object.assign(stair, next)); return true;
}

function stairQuantityRows() {
  const geometries = state.model.stairs.map((stair) => stairGeometry(stair));
  const treads = geometries.reduce((sum, geometry) => sum + geometry.treads, 0);
  const landingArea = geometries.reduce((sum, geometry) => sum + geometry.landingArea, 0) / 1e6;
  const landingVolume = geometries.reduce((sum, geometry) => sum + geometry.landingVolume, 0) / 1e9;
  const pending = geometries.filter((geometry) => geometry.continuationStatus.includes("pending") || geometry.continuationStatus.includes("does not fit")).length;
  const unknownBodies = geometries.filter((geometry) => geometry.landing && geometry.landing.volume == null).length;
  const rows = [{ label: "Stair tread count", net: treads, waste: 0, order: treads, unit: "count", basis: "N−1 separate treads per measured flight; upper floor/landing, stringers, handrails and fixings excluded" }];
  if (landingArea) rows.push({ label: "Stair landing area", net: landingArea, waste: 0, order: landingArea, unit: "m²", basis: "Entered horizontal landing/turn top areas; final upper floor/landing and construction build-up excluded" });
  if (landingVolume) rows.push({ label: "Stair landing body volume", net: landingVolume, waste: 0, order: landingVolume, unit: "m³", basis: "Gross entered landing body envelope; overlaps, reinforcement, finishes and waste excluded" });
  if (pending) rows.push({ label: "Stair continuations unassessed", net: pending, waste: 0, order: pending, unit: "count", basis: "Missing dimensions or non-fitting connections; these components are excluded from measured totals" });
  if (unknownBodies) rows.push({ label: "Stair landing volumes unassessed", net: unknownBodies, waste: 0, order: unknownBodies, unit: "count", basis: "Landing thickness is unknown; top areas are measured but body volumes are excluded" });
  return rows;
}

function renderStairSchedule() {
  const container = document.querySelector("#stairSchedule"); if (!container) return;
  container.innerHTML = state.model.stairs.map((stair) => { const geometry = stairGeometry(stair); return `<button type="button" class="foundation-schedule-row" data-stair-id="${escapeHtml(stair.id)}"><strong>${escapeHtml(stair.name)}</strong><span>${escapeHtml(levelName(stair.levelId))} · ${geometry.flights.length} flight${geometry.flights.length === 1 ? "" : "s"} / ${geometry.treads} treads</span><small>R ${formatNumber(geometry.flights[0].riser, 1)} mm · G ${formatNumber(geometry.flights[0].going, 1)} mm · ${geometry.continuationStatus} · ${stairIssues(stair).length} review items</small></button>`; }).join("") || '<p class="overview-copy">Choose Stair in Plan and drag from lower to upper nosing.</p>';
  if (state.tool === "stair") els.toolHelp.textContent = "Drag from the lower nosing towards the upper nosing in plan. Edit the first flight, then add a measured landing or one turning/continuation flight in the inspector.";
}

function exportStairCsv() {
  const rows = [["ID", "Name", "Level", "Layout", "First flight width mm", "First lower X mm", "First lower Y mm", "First upper X mm", "First upper Y mm", "Base elevation mm", "Measured upper elevation mm", "Total measured rise mm", "First flight run mm", "Total measured flight run mm", "First flight risers", "Total measured risers", "Separate treads", "First riser R mm", "First going G mm", "First 2R+G mm", "Tread thickness mm", "Closed risers", "Landing length mm", "Landing width mm", "Landing thickness mm", "Landing area m2", "Landing volume m3", "Entered second width mm", "Entered second run mm", "Entered second rise mm", "Entered second risers", "Half-turn gap mm", "Continuation status", "Dimension source", "Landing / turn notes", "Material", "Landings", "Headroom", "Handrails", "Barriers", "Slip resistance", "Structural design", "Drawing revision", "NCC edition criteria", "Notes", "Review", "First flight rise mm", "First upper elevation mm", "Second lower X mm", "Second lower Y mm", "Second upper X mm", "Second upper Y mm", "Second base elevation mm", "Second upper elevation mm", "Second riser R mm", "Second going G mm", "Second 2R+G mm", "Quantity basis"], ...state.model.stairs.map((stair) => {
    const geometry = stairGeometry(stair), continuation = stair.continuation || makeStairContinuation(), first = geometry.flights[0], second = geometry.flights[1];
    return [stair.id, stair.name, levelName(stair.levelId), continuation.layout, stair.width, stair.a.x, stair.a.y, stair.b.x, stair.b.y, stair.elevation, geometry.top, geometry.totalRise, first.run, geometry.totalRun, stair.risers, geometry.totalRisers, geometry.treads, first.riser, first.going, first.relation, stair.treadThickness, stair.closedRisers, continuation.landingLength, continuation.landingWidth, continuation.landingThickness, geometry.landing ? geometry.landing.area / 1e6 : "", geometry.landing?.volume == null ? "" : geometry.landing.volume / 1e9, continuation.flightWidth, continuation.flightRun, continuation.flightRise, continuation.flightRisers, continuation.flightGap, geometry.continuationStatus, continuation.dimensionSource, continuation.notes, stair.material, stair.landings, stair.headroom, stair.handrails, stair.barriers, stair.slipResistance, stair.structure, stair.drawingRef, stair.standardRef, stair.notes, stairIssues(stair).join("; "), stair.rise, first.top, second?.a.x, second?.a.y, second?.b.x, second?.b.y, second?.elevation, second?.top, second?.riser, second?.going, second?.relation, "Measured components only; N-1 treads per flight; run excludes landing travel; gross landing body is not a material order; missing/non-fitting components excluded"];
  })];
  download("bc-design-stair-schedule.csv", rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv");
}
