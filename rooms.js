/* Independently measured room boundaries; no automatic wall enclosure or compliance inference. */
const ROOM_COLOURS = { green: "#5c9776", blue: "#608eac", ochre: "#ba9459", mauve: "#997cab" };
function roomBoundaryError(points) {
  if (!Array.isArray(points) || points.length < 3) return "A room needs at least three boundary points.";
  if (points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "Room coordinates must be finite numbers.";
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const on = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-6 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (lengthBetween(a, b) < 1) return "Room boundary points must be distinct.";
    const previous = points[(i + points.length - 1) % points.length];
    if (Math.abs(cross(previous, a, b)) < 1e-6 && dot(sub(previous, a), sub(b, a)) > 0) return "Room edges cannot fold back over each other.";
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return "Room boundary edges cannot cross or touch themselves.";
    }
  }
  return polygonArea(points) < 1 ? "Room boundary must enclose an area." : "";
}
function makeRoom(points, levelId, name = "Room") { return { id: uid("room"), levelId, name, points: points.map((p) => ({ ...p })), use: "Unspecified", colour: "green", ceilingHeight: null, floorFinish: "" }; }
function normalizeRooms(model, levelIds, fallbackLevel) {
  model.rooms = (Array.isArray(model.rooms) ? model.rooms : []).map((raw) => {
    const error = roomBoundaryError(raw?.points); if (error) throw new Error(`Room import: ${error}`);
    if (raw.ceilingHeight != null && (!Number.isFinite(raw.ceilingHeight) || raw.ceilingHeight <= 0)) throw new Error("Room ceiling height must be positive or unspecified.");
    return { ...makeRoom(raw.points, levelIds.has(raw.levelId) ? raw.levelId : fallbackLevel), id: String(raw.id || uid("room")), name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 120) : "Room", use: typeof raw.use === "string" ? raw.use.slice(0, 120) : "Unspecified", colour: Object.hasOwn(ROOM_COLOURS, raw.colour) ? raw.colour : "green", ceilingHeight: raw.ceilingHeight ?? null, floorFinish: typeof raw.floorFinish === "string" ? raw.floorFinish.slice(0, 2000) : "" };
  });
}
function roomPerimeter(room) { return room.points.reduce((sum, p, i) => sum + lengthBetween(p, room.points[(i + 1) % room.points.length]), 0); }
function roomLabelPoint(room) {
  const center = room.points.reduce((sum, p) => add(sum, scale(p, 1 / room.points.length)), { x: 0, y: 0 });
  if (pointInPolygon(center, room.points)) return center;
  // A scan line gives an interior label position even for strongly concave outlines.
  const ys = [...new Set(room.points.map((p) => p.y))].sort((a, b) => a - b); let best = null;
  for (let k = 0; k < ys.length - 1; k++) {
    const y = (ys[k] + ys[k + 1]) / 2, xs = [];
    for (let i = 0; i < room.points.length; i++) { const a = room.points[i], b = room.points[(i + 1) % room.points.length]; if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)); }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best.span) best = { x: (xs[i] + xs[i + 1]) / 2, y, span: xs[i + 1] - xs[i] };
  }
  return best || room.points[0];
}
function roomBounds() { return (state.model.rooms || []).flatMap((room) => room.points); }
function drawRoomsPlan() {
  if (!state.visibility.rooms) return;
  for (const room of state.model.rooms.filter((room) => room.levelId === state.model.activeLevelId)) {
    const colour = ROOM_COLOURS[room.colour], selected = state.selected?.type === "room" && state.selected.id === room.id;
    ctx.save(); polygon(room.points.map(worldToScreen), `${colour}${state.planDisplayMode === 'readable' ? '22' : '30'}`, selected ? "#ed1c24" : colour);
    // Room labels render above the other Plan layers in drawPlanLabels().
    if (selected) for (const point of room.points.map(worldToScreen)) { ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
function drawRooms3d() {
  if (!state.visibility.rooms) return;
  for (const room of state.model.rooms.filter(isLevelVisible3d)) { const z = (state.model.levels.find((level) => level.id === room.levelId)?.elevation || 0) + 5; ctx.save(); polygon(room.points.map((p) => isoPoint(p, z)), `${ROOM_COLOURS[room.colour]}70`, ROOM_COLOURS[room.colour]); const p = isoPoint(roomLabelPoint(room), z + 10); ctx.textAlign = "center"; ctx.font = "10px Segoe UI"; ctx.fillStyle = "#20342a"; ctx.fillText(room.name, p.x, p.y); ctx.restore(); }
}
function drawRoomDraft() {
  if (!state.roomDraft.length) return;
  const points = state.roomDraft.map(worldToScreen); ctx.save(); ctx.strokeStyle = "#ed1c24"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const p of points.slice(1)) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]); for (const p of points) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
}
function addRoomPoint(world) { const p = snapPoint(world); if (state.roomDraft.length >= 3 && lengthBetween(p, state.roomDraft[0]) < 130) { finishRoom(); return; } state.roomDraft.push(p); render(); }
function finishRoom() {
  const error = roomBoundaryError(state.roomDraft);
  if (error) { state.statusMessage = error; render(); return; }
  const points = state.roomDraft.map((p) => ({ ...p })); state.roomDraft = [];
  withHistory(() => { const room = makeRoom(points, state.model.activeLevelId, `Room ${state.model.rooms.length + 1}`); state.model.rooms.push(room); state.selected = { type: "room", id: room.id }; state.visibility.rooms = true; });
}
function hitRoom(p) { if (!state.visibility.rooms) return null; const room = [...state.model.rooms].reverse().find((room) => room.levelId === state.model.activeLevelId && pointInPolygon(p, room.points)); return room ? { type: "room", id: room.id } : null; }
function deleteRoom() { const id = state.selected.id; withHistory(() => { state.model.rooms = state.model.rooms.filter((room) => room.id !== id); state.selected = null; }); }
function renderRoomDetails(room) {
  return `<div class="detail-head"><h3>${escapeHtml(room.name)}</h3><button class="delete-button" data-action="delete">Delete</button></div><div class="field-grid">${detailInput("Room name", "name", room.name, "", false)}${detailInput("Room use", "use", room.use, "", false)}<div class="inspector-field"><label for="roomColour">Room colour</label><select id="roomColour" data-field="colour">${Object.keys(ROOM_COLOURS).map((colour) => `<option value="${colour}" ${room.colour === colour ? "selected" : ""}>${colour}</option>`).join("")}</select></div>${detailInput("Recorded ceiling height", "ceilingHeight", room.ceilingHeight, "mm")}${detailInput("Floor finish specification", "floorFinish", room.floorFinish, "", false)}</div><p class="overview-copy">Boundary area: ${formatArea(polygonArea(room.points))} · Perimeter: ${formatLength(roomPerimeter(room))}</p><p class="overview-copy">Independent measured zone. Walls and openings do not move this outline. Area is measured to these points; choose the correct finished-face boundaries for the project. Ceiling height is a record, not a 3D ceiling or clearance check.</p><details><summary class="roof-summary">Edit boundary coordinates</summary>${room.points.map((p, i) => `<fieldset class="bar-row"><legend>Point ${i + 1}</legend><div class="field-grid">${detailInput("X", `vertex.${i}.x`, p.x, "mm")}${detailInput("Y", `vertex.${i}.y`, p.y, "mm")}</div></fieldset>`).join("")}</details>`;
}
function updateRoomField(field, raw) {
  if (state.selected?.type !== "room") return false;
  const room = selectedObject(), next = clone(room), parts = field.split(".");
  if (parts[0] === "vertex") { const point = next.points[Number(parts[1])]; if (!point || !["x", "y"].includes(parts[2])) return true; point[parts[2]] = raw.trim() ? Number(raw) : NaN; }
  else if (field === "ceilingHeight") { next.ceilingHeight = raw === "" ? null : Number(raw); if (next.ceilingHeight !== null && (!Number.isFinite(next.ceilingHeight) || next.ceilingHeight <= 0)) { state.statusMessage = "Ceiling height must be positive or left unspecified."; render(); return true; } }
  else if (["name", "use", "floorFinish"].includes(field)) { next[field] = raw.trim().slice(0, field === "floorFinish" ? 2000 : 120); if (field === "name" && !next.name) { state.statusMessage = "Enter a room name."; render(); return true; } }
  else if (field === "colour" && Object.hasOwn(ROOM_COLOURS, raw)) next.colour = raw; else return true;
  const error = roomBoundaryError(next.points); if (error) { state.statusMessage = error; render(); return true; }
  withHistory(() => Object.assign(room, next)); return true;
}
function renderRoomSchedule() {
  const container = document.querySelector("#roomSchedule"); if (!container) return;
  container.innerHTML = state.model.rooms.map((room) => `<button type="button" class="foundation-schedule-row" data-room-id="${escapeHtml(room.id)}"><strong>${escapeHtml(room.name)} · ${escapeHtml(room.use)}</strong><span>${escapeHtml(levelName(room.levelId))} · ${formatArea(polygonArea(room.points))} · ${formatLength(roomPerimeter(room))} perimeter</span></button>`).join("") || '<p class="overview-copy">Choose Room, tap the boundary points, then Finish outline.</p>';
  if (state.tool === "room") els.toolHelp.textContent = "Tap room boundary points with the pen or mouse, then Finish outline. Touch pans. Room boundaries stay independent of walls.";
}
function roomQuantityRows() { const net = state.model.rooms.reduce((sum, room) => sum + polygonArea(room.points), 0); return [{ label: "Room boundary area", net, waste: 0, order: net, unit: "m²", basis: "Independent room zones; not additional slab area; overlaps not deducted; not a statutory floor-area calculation" }]; }
function exportRoomCsv() {
  const rows = [["ID", "Room", "Use", "Level", "Boundary area m2", "Perimeter m", "Recorded ceiling height mm", "Floor finish", "Boundary coordinates mm"], ...state.model.rooms.map((room) => [room.id, room.name, room.use, levelName(room.levelId), polygonArea(room.points) / 1e6, roomPerimeter(room) / 1000, room.ceilingHeight, room.floorFinish, JSON.stringify(room.points)])];
  download("bc-design-room-schedule.csv", rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv");
}
