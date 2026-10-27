/* Rectangular schematic roofs. Geometry is independent of structural sizing. */
function makeRoof(a, b, levelId, elevation = 2700) {
  return { id: uid("roof"), levelId, name: "Roof", form: "gable", joinPriority: 0, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, width: Math.abs(b.x - a.x), length: Math.abs(b.y - a.y), rotation: 0, pitch: 22.5, overhang: 450, elevation, thickness: 150, cladding: "unspecified", product: "", minPitch: null, wind: "", framing: "", tieDown: "", drainage: "", condensation: "", drawingRef: "", standardRef: "" };
}

function validateRoof(roof) {
  for (const key of ["width", "length", "thickness"]) if (!Number.isFinite(roof[key]) || roof[key] <= 0) throw new Error(`${key} must be greater than zero.`);
  for (const value of [roof.center.x, roof.center.y, roof.elevation, roof.rotation]) if (!Number.isFinite(value)) throw new Error("Roof coordinates and elevation must be finite numbers.");
  if (!Number.isFinite(roof.pitch) || roof.pitch < 0 || roof.pitch > 75) throw new Error("Pitch must be between 0° and 75° for this schematic tool.");
  if (!Number.isFinite(roof.overhang) || roof.overhang < 0) throw new Error("Overhang cannot be negative.");
  if (roof.minPitch !== null && (!Number.isFinite(roof.minPitch) || roof.minPitch < 0 || roof.minPitch > 75)) throw new Error("Product minimum pitch must be between 0° and 75°.");
  if(!Number.isSafeInteger(roof.joinPriority)||Math.abs(roof.joinPriority)>1000000)throw new Error("Coplanar join priority must be an integer between -1000000 and 1000000.");
  if (!["gable", "skillion", "flat", "hip"].includes(roof.form)) throw new Error("Unsupported roof form.");
  const g = roofGeometry(roof);
  if ([g.rise, g.planArea, g.surfaceArea, g.volume, g.highest, g.bottom, g.ridgeLength, g.hipLength].some(value => !Number.isFinite(value)) || [...g.outline, ...g.planes.flat()].some(p => ![p.x,p.y,p.z].every(Number.isFinite))) throw new Error("Roof geometry exceeds reliable numeric limits.");
}

function normalizeRoofs(model, levelIds, fallbackLevel) {
  model.roofs = (Array.isArray(model.roofs) ? model.roofs : []).map((raw) => {
    if (!raw || !raw.center || typeof raw.center.x !== "number" || typeof raw.center.y !== "number") throw new Error("A roof is missing its centre coordinates.");
    const roof = { ...makeRoof({ x: 0, y: 0 }, { x: 4000, y: 6000 }, fallbackLevel), ...raw, id: String(raw.id || uid("roof")), levelId: levelIds.has(raw.levelId) ? raw.levelId : fallbackLevel, center: { x: raw.center.x, y: raw.center.y } };
    for (const key of ["name", "product", "wind", "framing", "tieDown", "drainage", "condensation", "drawingRef", "standardRef"]) roof[key] = typeof roof[key] === "string" ? roof[key].slice(0, 2000) : "";
    if (!["unspecified", "metal", "tiles", "other"].includes(roof.cladding)) roof.cladding = "unspecified";
    validateRoof(roof); return roof;
  });
}

function hipRoofGeometry(roof) {
  const w=roof.width+2*roof.overhang,l=roof.length+2*roof.overhang,short=Math.min(w,l),long=Math.max(w,l);
  const rise=short/2*Math.tan(roof.pitch*Math.PI/180),high=roof.elevation+rise,bottom=roof.elevation-roof.thickness;
  const angle=(roof.rotation%360)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const point=(x,y,z=roof.elevation)=>({x:roof.center.x+x*c-y*s,y:roof.center.y+x*s+y*c,z});
  const outline=[point(-w/2,-l/2),point(w/2,-l/2),point(w/2,l/2),point(-w/2,l/2)];
  const inset=(long-short)/2,alongY=l>=w;
  const a=alongY?point(0,-inset,high):point(-inset,0,high),b=alongY?point(0,inset,high):point(inset,0,high);
  const [p,q,r,t]=outline;
  const raw=alongY?[[p,q,a],[q,r,b,a],[r,t,b],[t,p,a,b]]:[[p,q,b,a],[q,r,b],[r,t,a,b],[t,p,a]];
  const same=(p,q)=>p.x===q.x&&p.y===q.y&&p.z===q.z;
  const planes=raw.map(face=>{const clean=face.filter((p,i)=>!i||!same(p,face[i-1]));if(clean.length>1&&same(clean[0],clean.at(-1)))clean.pop();return clean;});
  const ridge=inset>0?[a,b]:[],hips=[[p,a],[q,alongY?a:b],[r,b],[t,alongY?b:a]];
  const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:high};
  const highs=alongY?[a,middle,b,middle]:[middle,b,middle,a];
  const falls=outline.map((p,i)=>[highs[i],{x:(p.x+outline[(i+1)%4].x)/2,y:(p.y+outline[(i+1)%4].y)/2}]);
  const planArea=w*l,sides=outline.map((p,i)=>{const q=outline[(i+1)%4];return [p,q,{...q,z:bottom},{...p,z:bottom}];});
  return {outline,ridge,hips,falls,planes,sides,rise,pitch:roof.pitch,planArea,surfaceArea:planArea/Math.cos(roof.pitch*Math.PI/180),
    volume:planArea*roof.thickness+rise*(planArea/2-short*short/6),highest:high,bottom,
    ridgeLength:Math.max(0,long-short),hipLength:hips.reduce((sum,[a,b])=>sum+Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),0)};
}

function roofGeometry(roof) {
  if(roof.form==="hip")return hipRoofGeometry(roof);
  const w = roof.width + roof.overhang * 2, l = roof.length + roof.overhang * 2;
  const pitch = roof.form === "flat" ? 0 : roof.pitch;
  const rise = Math.tan(pitch * Math.PI / 180) * (roof.form === "gable" ? w / 2 : w);
  const angle = (roof.rotation % 360) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const p = (x, y, z) => ({ x: roof.center.x + x * c - y * s, y: roof.center.y + x * s + y * c, z });
  const height = (x) => roof.elevation + (roof.form === "gable" ? 1 - Math.abs(x) / (w / 2) : (x + w / 2) / w) * rise;
  const v = (x, y) => p(x, y, height(x));
  const outline = [v(-w / 2, -l / 2), v(w / 2, -l / 2), v(w / 2, l / 2), v(-w / 2, l / 2)];
  const ridge = roof.form === "gable" ? [v(0, -l / 2), v(0, l / 2)] : [];
  const planes = roof.form === "gable" ? [[outline[0], ridge[0], ridge[1], outline[3]], [ridge[0], outline[1], outline[2], ridge[1]]] : [outline];
  const bottom = roof.elevation - roof.thickness;
  const sides = outline.map((a, i) => { const b = outline[(i + 1) % 4]; const cap = roof.form === "gable" && (i === 0 || i === 2) ? [a, ridge[i === 0 ? 0 : 1], b] : [a, b]; return [...cap, { ...b, z: bottom }, { ...a, z: bottom }]; });
  const planArea = w * l;
  return { outline, ridge, hips:[], planes, sides, rise, pitch, planArea, surfaceArea: planArea / Math.cos(pitch * Math.PI / 180), volume: planArea * (roof.thickness + rise / 2), highest: roof.elevation + rise, bottom, ridgeLength:ridge.length?l:0, hipLength:0 };
}

function roofBounds() { return (state.model.roofs || []).flatMap((roof) => roofGeometry(roof).outline); }
function roofHeights() { return state.model.roofs.flatMap((roof) => { const g = roofGeometry(roof); return [g.bottom, g.highest]; }); }
function roofQuantityRows() {
  const geometry = state.model.roofs.map(roof=>roofMeasuredGeometry(roof));
  const area = geometry.reduce((sum, g) => sum + g.surfaceArea, 0), volume = geometry.reduce((sum, g) => sum + g.volume, 0);
  return [{ label: "Roof slope surface area", net: area, waste: 0, order: area, unit: "m²", basis: "Retained sloping planes including overhang; explicit joins trimmed; independent overlaps/openings remain; no laps/waste. " + roofJoinQuantityReview() }, { label: "Roof envelope volume", net: volume, waste: 0, order: volume, unit: "m³", basis: "Retained envelope columns to each owning roof underside; includes void, not a solid union or material quantity. " + roofJoinQuantityReview() }];
}

function drawHipRoofFall(high,low) {
  const a=worldToScreen(high),b=worldToScreen(low),tip={x:a.x+(b.x-a.x)*.65,y:a.y+(b.y-a.y)*.65},direction=unit(sub(tip,a));
  ctx.strokeStyle="#a57232";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(tip.x,tip.y);
  ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-direction.x*8-direction.y*4,tip.y-direction.y*8+direction.x*4);
  ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-direction.x*8+direction.y*4,tip.y-direction.y*8-direction.x*4);ctx.stroke();
}

function drawRoofsPlan() {
  if (!state.visibility.roofs) return;
  for (const roof of state.model.roofs.filter((roof) => roof.levelId === state.model.activeLevelId && !roofHasJoin(roof))) {
    const g = roofGeometry(roof); ctx.save();
    polygon(g.outline.map(worldToScreen), state.selected?.type === "roof" && state.selected.id === roof.id ? "rgba(237,28,36,.18)" : "rgba(188,126,49,.17)", state.selected?.id === roof.id ? "#ed1c24" : "#a57232");
    if (g.ridge.length) { const a = worldToScreen(g.ridge[0]), b = worldToScreen(g.ridge[1]); ctx.strokeStyle = "#8b5724"; ctx.lineWidth = 2; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
    for(const [a,b] of g.hips){const p=worldToScreen(a),q=worldToScreen(b);ctx.strokeStyle="#8b5724";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    if(roof.form==="hip"&&g.pitch>0)for(const [high,low] of g.falls)drawHipRoofFall(high,low);
    const center = worldToScreen(roof.center); ctx.font = "11px Segoe UI"; ctx.fillStyle = "#744b23"; ctx.fillText(`${roof.name} · ${roof.form} · ${formatNumber(g.pitch, 1)}°`, center.x + 6, center.y - 8);
    if (g.pitch > 0 && roof.form !== "hip") { const high = g.ridge.length ? roof.center : { x: (g.outline[1].x + g.outline[2].x) / 2, y: (g.outline[1].y + g.outline[2].y) / 2 }; const low = { x: (g.outline[0].x + g.outline[3].x) / 2, y: (g.outline[0].y + g.outline[3].y) / 2 }; const a = worldToScreen(high), b = worldToScreen(low); const mid = { x: a.x + (b.x - a.x) * .65, y: a.y + (b.y - a.y) * .65 }; const direction = unit(sub(mid, a)); ctx.strokeStyle = "#a57232"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mid.x, mid.y); ctx.moveTo(mid.x, mid.y); ctx.lineTo(mid.x - direction.x * 8 - direction.y * 4, mid.y - direction.y * 8 + direction.x * 4); ctx.moveTo(mid.x, mid.y); ctx.lineTo(mid.x - direction.x * 8 + direction.y * 4, mid.y - direction.y * 8 - direction.x * 4); ctx.stroke(); }
    ctx.restore();
  }
}

function drawRoofs3d() {
  if (!state.visibility.roofs) return;
  const faces = state.model.roofs.filter(roof=>isLevelVisible3d(roof)&&!roofHasJoin(roof)).flatMap((roof) => { const g = roofGeometry(roof); return [...g.sides.map((points) => ({ roof, points, top: false })), ...g.planes.map((points, i) => ({ roof, points, top: true, i }))]; });
  const depth = (face) => face.points.reduce((sum, p) => sum + p.x + p.y, 0) / face.points.length;
  // Sides form the simple roof envelope; top planes are drawn last to keep ridges readable.
  faces.sort((a, b) => Number(a.top) - Number(b.top) || depth(a) - depth(b));
  for (const face of faces) polygon(face.points.map((p) => isoPoint(p, p.z)), face.top ? face.roof.form === "hip" ? ["#d9b27e","#b78750","#c79860","#d0a16b"][face.i] : face.i === 1 ? "#b78750" : "#d9b27e" : "#ead9bf", state.selected?.id === face.roof.id ? "#ed1c24" : "#916539");
}

function drawRoofDraft() {
  if (state.drawing?.kind !== "roof") return;
  const { start: a, current: b } = state.drawing;
  ctx.save(); polygon([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }].map(worldToScreen), "rgba(188,126,49,.12)", "#a57232"); ctx.restore();
}
function commitRoof() {
  const drawing = state.drawing; state.drawing = null;
  const width = Math.abs(drawing.current.x - drawing.start.x), length = Math.abs(drawing.current.y - drawing.start.y);
  if (width < 100 || length < 100) { state.statusMessage = "Roof needs width and length of at least 100 mm. Drag opposite corners."; render(); return; }
  const elevation = Math.max(activeLevel().elevation + 2700, ...activeWalls().map((wall) => activeLevel().elevation + wall.height));
  withHistory(() => { const roof = makeRoof(drawing.start, drawing.current, state.model.activeLevelId, elevation); roof.name = `Roof ${state.model.roofs.length + 1}`; state.model.roofs.push(roof); state.visibility.roofs = true; state.selected = { type: "roof", id: roof.id }; });
}
function hitRoof(p) {const roof=[...state.model.roofs].reverse().find(roof=>{if(roof.levelId!==state.model.activeLevelId)return false;const m=roofMeasuredGeometry(roof);return m.active?state.visibility.joinedRoofs!==false&&m.faces.some(face=>face.polygons.some(poly=>pointInPolygon(p,poly))):state.visibility.roofs&&pointInPolygon(p,roofGeometry(roof).outline);});return roof?{type:'roof',id:roof.id}:null;}

function deleteRoof() { const id = state.selected.id; withHistory(() => { state.model.roofs = state.model.roofs.filter((roof) => roof.id !== id); state.selected = null; }); }

function roofIssues(roof) {
  const issues = [], g = roofGeometry(roof);
  if (!roof.drawingRef || !roof.standardRef) issues.push("Record the design drawing/revision and adopted NCC / standard editions.");
  if (!roof.wind || !roof.framing || !roof.tieDown) issues.push("Wind design, framing and tie-down details required.");
  if (roof.cladding === "unspecified" || !roof.product) issues.push("Select cladding and record its product/profile specification.");
  if (roof.minPitch === null) issues.push("Confirm the selected roof system’s minimum pitch and installation conditions.");
  else if (g.pitch < roof.minPitch) issues.push(`Pitch ${g.pitch}° is below the entered product minimum ${roof.minPitch}°.`);
  if (!roof.drainage) issues.push("Record gutter/downpipe, rainfall, overflow and discharge design.");
  if (!roof.condensation) issues.push("Record sarking, condensation and ventilation details for the project.");
  return issues;
}

function roofField(label, field, value, numeric = true, unit = "") {
  return `<div class="inspector-field"><label for="roof-${field}">${escapeHtml(label)}</label><input id="roof-${field}" data-field="${field}" type="${numeric ? "number" : "text"}" ${numeric ? 'step="any"' : 'maxlength="2000"'} value="${escapeHtml(value ?? "")}" />${unit ? `<span class="field-unit">${unit}</span>` : ""}</div>`;
}
function renderRoofDetails(roof) {
  const g = roofGeometry(roof), issues = roofIssues(roof);
  const hipSummary=roof.form==="hip"?`<p class="overview-copy">${g.ridge.length?"Hipped roof with a ridge":"Pyramidal hip with one apex"} · derived ridge ${formatLength(g.ridgeLength)} · 4 hips / ${formatLength(g.hipLength)} total 3D line length. Equal pitch on all four faces; the ridge follows the longer overhang-inclusive plan dimension. Line lengths are geometry, not capping orders. Hip framing, cappings, fixings, flashing and any joins need project-specific design.</p>`:"";
  return `<div class="detail-head"><h3>${escapeHtml(roof.name)}</h3><button class="delete-button" data-action="delete">Delete</button></div><div class="field-grid">${roofField("Name", "name", roof.name, false)}<div class="inspector-field"><label for="roof-form">Roof form</label><select id="roof-form" data-field="form">${["gable", "skillion", "flat", "hip"].map((form) => `<option value="${form}" ${roof.form === form ? "selected" : ""}>${form === "gable" ? "Gable — two planes" : form === "skillion" ? "Skillion — single plane" : form === "hip" ? "Hip — four equal-pitch planes" : "Flat — horizontal plane"}</option>`).join("")}</select></div>${roofField("Centre X", "centerX", roof.center.x, true, "mm")}${roofField("Centre Y", "centerY", roof.center.y, true, "mm")}${roofField(roof.form === "hip" ? "Base local X width" : "Base width across slope", "width", roof.width, true, "mm")}${roofField(roof.form === "hip" ? "Base local Y length" : "Base length along ridge", "length", roof.length, true, "mm")}${roofField("Rotation", "rotation", roof.rotation, true, "°")}${roofField("Coplanar join priority", "joinPriority", roof.joinPriority)}${roof.form !== "flat" ? roofField("Pitch", "pitch", roof.pitch, true, "°") : ""}${roofField("Plan overhang — all edges", "overhang", roof.overhang, true, "mm")}${roofField("Low eave top (project datum)", "elevation", roof.elevation, true, "mm")}${roofField("Schematic body depth below eave", "thickness", roof.thickness, true, "mm")}</div><p class="overview-copy">${g.planes.length} roof plane(s) · Sloping surface ${formatArea(g.surfaceArea)} · Highest point ${formatNumber(g.highest, 0)} mm · Envelope ${formatNumber(g.volume / 1e9, 3)} m³</p><p class="overview-copy">The roof envelope includes the void and a schematic body depth; it is not a material volume. Overhang is horizontal in plan. Explicit join records control retained higher/lower surfaces; use the separate joined-roof and valley layers.</p>${roofTrimSummary(roof)}${hipSummary}<h3 class="reinforcement-heading">Australian roof design</h3><div class="field-grid"><div class="inspector-field"><label for="roof-cladding">Roof cladding</label><select id="roof-cladding" data-field="cladding">${["unspecified", "metal", "tiles", "other"].map((type) => `<option value="${type}" ${roof.cladding === type ? "selected" : ""}>${type}</option>`).join("")}</select></div>${roofField("Product / profile", "product", roof.product, false)}${roofField("Product minimum pitch", "minPitch", roof.minPitch, true, "°")}${roofField("Wind classification / design", "wind", roof.wind, false)}${roofField("Framing / truss design", "framing", roof.framing, false)}${roofField("Tie-down / fixings", "tieDown", roof.tieDown, false)}${roofField("Drainage / overflow design", "drainage", roof.drainage, false)}${roofField("Sarking / ventilation / condensation", "condensation", roof.condensation, false)}${roofField("Drawing / revision", "drawingRef", roof.drawingRef, false)}${roofField("Adopted NCC / standard editions", "standardRef", roof.standardRef, false)}</div><div class="warning-note">${issues.length ? issues.map(escapeHtml).join("<br>") : "Design records entered; project designer review still required."}</div><p class="overview-copy">Reference: <a href="https://ncc.abcb.gov.au/system/files/ncc/ncc2022-abcb-housing-provisions.pdf" target="_blank" rel="noopener">ABCB Housing Provisions Section 7</a> — 7.2 metal roofing, 7.3 tiles/shingles (hip/ridge fixings in 7.3.2 and flashing in 7.3.3) and 7.4 gutters/downpipes, subject to the adopted project edition and its limits. Confirm applicable AS 1562.1 (metal cladding), AS 2050 (tiles), AS 1684 (timber framing), AS 4055 or AS/NZS 1170.2 (wind), and AS/NZS 3500.3 (stormwater) pathways with the designer. Product pitch, spans and fixing requirements are not inferred from shape.</p>`;
}

function updateRoofField(field, raw) {
  if (state.selected?.type !== "roof") return false;
  const roof = selectedObject(), next = clone(roof);
  const numeric = ["joinPriority", "centerX", "centerY", "width", "length", "rotation", "pitch", "overhang", "elevation", "thickness", "minPitch"].includes(field);
  const value = numeric ? raw === "" && field === "minPitch" ? null : raw === "" ? NaN : Number(raw) : raw.slice(0, 2000);
  if (field === "centerX") next.center.x = value; else if (field === "centerY") next.center.y = value; else if (Object.hasOwn(next, field)) next[field] = value; else return true;
  try { validateRoof(next); } catch (error) { state.statusMessage = error.message; render(); return true; }
  withHistory(() => Object.assign(roof, next)); return true;
}

function renderRoofSchedule() {
  const container = document.querySelector("#roofSchedule"); if (!container) return;
  container.innerHTML = state.model.roofs.map((roof) => { const g = roofGeometry(roof),m=roofMeasuredGeometry(roof); return `<button type="button" class="foundation-schedule-row" data-roof-id="${escapeHtml(roof.id)}"><strong>${escapeHtml(roof.name)} · ${roof.form}</strong><span>${escapeHtml(levelName(roof.levelId))} · ${g.planes.length} planes · ${formatArea(m.surfaceArea)}</span>${m.status!=="Original" ? `<span>Original ${formatArea(g.surfaceArea)} · removed ${formatArea(m.removedArea)} · ${m.status}</span>` : ""}${roof.form === "hip" ? `<span>Ridge ${formatLength(g.ridgeLength)} · 4 hips / ${formatLength(g.hipLength)} 3D total</span>` : ""}<small>${roofIssues(roof).length} design items for review</small></button>`; }).join("") || '<p class="overview-copy">Choose Roof and drag opposite corners on the plan.</p>';
  const message = document.querySelector("#roofStatus"); if (message) message.textContent = state.statusMessage;
  if (state.tool === "roof") els.toolHelp.textContent = "Drag opposite roof corners in plan, then edit form, pitch, overhang and elevation. Toggle Roofs to see the structure beneath.";
}

function exportRoofCsv() {
  const header = ["ID", "Name", "Level", "Form", "Planes", "Base width mm", "Base length mm", "Rotation deg", "Pitch deg", "Plan overhang mm", "Low eave top mm", "Body depth mm", "Highest point mm", "Plan area m2", "Slope area m2", "Envelope volume m3 (not material)", "Cladding", "Product", "Product min pitch deg", "Wind design", "Framing", "Tie down", "Drainage", "Condensation", "Drawing revision", "NCC standard editions", "Review", "Ridge geometry length mm", "Hip 3D geometry length mm", "Hip endpoints XYZ JSON mm", "Trim status", "Original plan area m2", "Original slope area m2", "Removed slope area m2", "Original envelope m3", "Retained envelope basis", "Retained polygons XYZ JSON mm"];
  const rows = state.model.roofs.map((roof) => { const g = roofGeometry(roof),m=roofMeasuredGeometry(roof); return [roof.id, roof.name, levelName(roof.levelId), roof.form, g.planes.length, roof.width, roof.length, roof.rotation, g.pitch, roof.overhang, roof.elevation, roof.thickness, g.highest, m.planArea / 1e6, m.surfaceArea / 1e6, m.volume / 1e9, roof.cladding, roof.product, roof.minPitch, roof.wind, roof.framing, roof.tieDown, roof.drainage, roof.condensation, roof.drawingRef, roof.standardRef, roofIssues(roof).join("; "), g.ridgeLength, g.hipLength, JSON.stringify(g.hips),m.status,g.planArea/1e6,g.surfaceArea/1e6,m.removedArea/1e6,g.volume/1e9,m.basis,m.active?JSON.stringify(m.faces.flatMap(f=>f.polygons)):JSON.stringify(g.planes)]; });
  download("bc-design-roof-schedule.csv", [header, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv");
}
