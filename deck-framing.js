/* Entered framing geometry only: no span tables or automatic structural sizing. */
function normalizeDeckFraming(model) {
  for (const deck of model.decks) {
    deck.members = Array.isArray(deck.members) ? deck.members : [];
    for (const member of deck.members) validateDeckMember(member);
    if (deck.barriers !== undefined && !Array.isArray(deck.barriers)) throw new Error('Deck barriers must be a list.');
    deck.barriers ||= [];
    for (const barrier of deck.barriers) validateDeckBarrier(barrier);
  }
}
function validateDeckMember(m) {
  if (!m || typeof m.id !== 'string' || !['joist', 'bearer', 'ledger'].includes(m.role)) throw new Error('Invalid deck framing member identity or role.');
  if (![m.ax, m.ay, m.bx, m.by, m.elevation, m.width, m.depth].every(Number.isFinite) || m.width <= 0 || m.depth <= 0 || Math.hypot(m.bx-m.ax,m.by-m.ay) < 1) throw new Error('Framing needs finite endpoints/elevation, positive width/depth and a non-zero length.');
  for (const key of ['material','design','fixings','drawingRef']) if (typeof m[key] !== 'string' || m[key].length > 2000) throw new Error('Invalid framing design record.');
}
function deckMemberGeometry(m) {
  const a = {x:m.ax,y:m.ay}, b = {x:m.bx,y:m.by}, n = scale({x:-(b.y-a.y),y:b.x-a.x}, m.width / (2 * lengthBetween(a,b)));
  return { outline:[add(a,n),add(b,n),sub(b,n),sub(a,n)], length:lengthBetween(a,b), top:m.elevation + m.depth };
}
function deckFramingBounds() { return state.model.decks.flatMap(d => (d.members || []).flatMap(m => deckMemberGeometry(m).outline)); }
function drawDeckFraming(is3d = false) {
  if (!state.visibility.deckFraming) return;
  for (const deck of state.model.decks) {
    if (is3d && !isLevelVisible3d(deck)) continue;
    if (!is3d && deck.levelId !== state.model.activeLevelId) continue;
    for (const m of deck.members || []) {
      const g = deckMemberGeometry(m), colour = m.role === 'bearer' ? '#8b5932' : '#bd8d59';
      if (!is3d) polygon(g.outline.map(worldToScreen),colour,'#66432c');
      else {
        for (let i=0;i<4;i++) { const a=g.outline[i], b=g.outline[(i+1)%4]; polygon([isoPoint(a,m.elevation),isoPoint(b,m.elevation),isoPoint(b,g.top),isoPoint(a,g.top)],colour,'#66432c'); }
        polygon(g.outline.map(p=>isoPoint(p,g.top)),'#d5b187','#66432c');
      }
    }
  }
}
function renderDeckFramingDetails(deck) {
  const numeric = [['ax','Start X'],['ay','Start Y'],['bx','End X'],['by','End Y'],['width','Section width'],['depth','Section depth'],['elevation','Bottom elevation']];
  return `<h3 class="reinforcement-heading">Deck framing members</h3><p class="overview-copy">Independent entered members, not automatically laid out or sized. Coordinates and bottom elevations are absolute project millimetres. Geometry is not clipped to the deck outline.</p><button type="button" class="link-button" data-action="add-deck-member">Add framing member</button><button type="button" class="link-button" data-action="deck-framing-csv">Export framing CSV</button>${(deck.members || []).map((m,i)=>`<details open><summary class="roof-summary">${i+1}. ${escapeHtml(m.role)} · ${formatLength(deckMemberGeometry(m).length)}</summary><div class="field-grid"><div class="inspector-field"><label>Role</label><select aria-label="Member ${i+1} role" data-deck-member="${i}" data-member-field="role">${['joist','bearer','ledger'].map(r=>`<option ${r===m.role?'selected':''}>${r}</option>`).join('')}</select></div>${numeric.map(([key,label])=>`<div class="inspector-field"><label>${label} (mm)</label><input aria-label="Member ${i+1} ${label}" type="number" step="1" data-deck-member="${i}" data-member-field="${key}" value="${m[key]}" /></div>`).join('')}${[['material','Material / grade / treatment'],['design','Span / supports / bracing design'],['fixings','Fixings / durability / tie-down'],['drawingRef','Drawing / adopted NCC and standards']].map(([key,label])=>`<div class="inspector-field"><label>${label}</label><input aria-label="Member ${i+1} ${label}" maxlength="2000" data-deck-member="${i}" data-member-field="${key}" value="${escapeHtml(m[key])}" /></div>`).join('')}</div><button type="button" class="delete-button" data-action="remove-deck-member" data-index="${i}">Remove member</button></details>`).join('')}<p class="warning-note">Illustrative dimensions are not approved sizes. Confirm project loads, spans, supports, bracing, connections, durability and adopted standards with the designer. Deck wall attachments have specific application limits; recording details does not establish compliance.</p><p class="overview-copy">Reference: <a href="https://ncc.abcb.gov.au/sites/default/files/resources/2025/ncc2022-volume-two.pdf" target="_blank" rel="noopener">NCC Volume Two H1D6 / H1D11</a> and the project's adopted Housing Provisions Section 6 and Part 12.3. Timber/steel design pathways and deck attachment provisions depend on their application limits.</p>`;
}
function deckMemberAction(action,index) {
  if (state.selected?.type !== 'deck') return;
  const deck = selectedObject();
  if (action === 'add-deck-member') {
    const a=deck.points[0], b=deck.points[1];
    const member={id:uid('member'),role:'joist',ax:a.x,ay:a.y,bx:b.x,by:b.y,width:45,depth:140,elevation:deck.elevation-140,material:'Unspecified',design:'',fixings:'',drawingRef:''};
    try { validateDeckMember(member); } catch(error) { state.statusMessage=error.message; render(); return; }
    withHistory(()=>{ (deck.members ||= []).push(member); state.visibility.deckFraming=true; });
  } else if (action === 'remove-deck-member' && Number.isInteger(index) && deck.members?.[index]) withHistory(()=>deck.members.splice(index,1));
  else if (action === 'deck-framing-csv') exportDeckFramingCsv();
}
function updateDeckMember(index,field,raw) {
  if (state.selected?.type !== 'deck') return;
  const m=selectedObject().members?.[index]; if (!m || !Object.hasOwn(m,field) || field==='id') return;
  const next={...m}; next[field]=['ax','ay','bx','by','width','depth','elevation'].includes(field) ? (raw.trim() ? Number(raw) : NaN) : raw.slice(0,2000);
  try { validateDeckMember(next); } catch(error) {state.statusMessage=error.message;render();return;}
  withHistory(()=>Object.assign(m,next));
}
function deckFramingQuantityRows() {
  return ['joist','bearer','ledger'].map(role=>{const net=state.model.decks.flatMap(d=>d.members||[]).filter(m=>m.role===role).reduce((s,m)=>s+deckMemberGeometry(m).length/1000,0);return {label:`Deck ${role} length`,net,waste:0,order:net,unit:'m',basis:'Entered centreline lengths only; no stock lengths, cuts, waste, fixings or automatic layout'};});
}
function exportDeckFramingCsv() {
  const rows=[['Deck ID','Level','Member ID','Role','Length mm','Width mm','Depth mm','Bottom elevation mm','Start X mm','Start Y mm','End X mm','End Y mm','Material','Structural design','Fixings durability','Drawing NCC standards'],...state.model.decks.flatMap(d=>(d.members||[]).map(m=>[d.id,levelName(d.levelId),m.id,m.role,deckMemberGeometry(m).length,m.width,m.depth,m.elevation,m.ax,m.ay,m.bx,m.by,m.material,m.design,m.fixings,m.drawingRef]))];
  download('bc-design-deck-framing.csv',rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');
}

// Schematic panel/rail runs, not engineered products or automatically compliant handrails.
function validateDeckBarrier(b) {
  if (!b || typeof b.id !== 'string' || ![b.ax,b.ay,b.bx,b.by,b.startElevation,b.endElevation,b.height].every(Number.isFinite) || b.height <= 0 || Math.hypot(b.bx-b.ax,b.by-b.ay)<1) throw new Error('Barrier needs finite endpoints/elevations, positive height and a non-zero plan run.');
  for (const key of ['name','material','openings','climbability','loads','connections','handrail','drawingRef']) if (typeof b[key] !== 'string' || b[key].length>2000) throw new Error('Invalid barrier design record.');
}
function deckBarrierGeometry(b) {
  const a={x:b.ax,y:b.ay,z:b.startElevation}, end={x:b.bx,y:b.by,z:b.endElevation};
  return {points:[a,end,{...end,z:end.z+b.height},{...a,z:a.z+b.height}],run:Math.hypot(end.x-a.x,end.y-a.y),railLength:Math.hypot(end.x-a.x,end.y-a.y,end.z-a.z)};
}
function deckBarrierBounds() {return state.model.decks.flatMap(d=>(d.barriers||[]).flatMap(b=>deckBarrierGeometry(b).points));}
function drawDeckBarriers(is3d=false) {
  if (!state.visibility.barriers) return;
  for (const d of state.model.decks) {
    if (is3d && !isLevelVisible3d(d)) continue;
    if (!is3d && d.levelId!==state.model.activeLevelId) continue;
    for (const b of d.barriers||[]) {
      const g=deckBarrierGeometry(b);
      if (is3d) polygon(g.points.map(p=>isoPoint(p,p.z)),'rgba(116,163,185,.35)','#315f75');
      else {const a=worldToScreen(g.points[0]),end=worldToScreen(g.points[1]);ctx.save();ctx.strokeStyle='#315f75';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.fillStyle='#315f75';ctx.font='10px Segoe UI';ctx.fillText(b.name,(a.x+end.x)/2+5,(a.y+end.y)/2-6);ctx.restore();}
    }
  }
}
function renderDeckBarrierDetails(deck) {
  const fields=[['name','Name'],['ax','Start X'],['ay','Start Y'],['bx','End X'],['by','End Y'],['startElevation','Start base elevation'],['endElevation','End base elevation'],['height','Vertical height'],['material','Material / product'],['openings','Opening / infill design evidence'],['climbability','Climbability / fall-height review'],['loads','Design loads / structural evidence'],['connections','Posts / fixings / end connections'],['handrail','Handrail / graspability / continuity'],['drawingRef','Drawing / adopted NCC and standards']];
  return `<h3 class="reinforcement-heading">Protective barriers / balustrades</h3><button class="link-button" type="button" data-action="add-deck-barrier">Add barrier run</button><button class="link-button" type="button" data-action="deck-barrier-csv">Export barrier CSV</button><p class="overview-copy">Straight schematic panel runs owned by this deck. Separate start/end base elevations support sloping runs. Height is measured vertically, not perpendicular to slope. No automatic edge coverage or stair connection.</p>${(deck.barriers||[]).map((b,i)=>`<details open><summary class="roof-summary">${escapeHtml(b.name)} · ${formatLength(deckBarrierGeometry(b).run)} plan</summary><div class="field-grid">${fields.map(([key,label])=>{const numeric=typeof b[key]==='number';return `<div class="inspector-field"><label>${label}${numeric?' (mm)':''}</label><input aria-label="Barrier ${i+1} ${label}" type="${numeric?'number':'text'}" ${numeric?'step="1"':'maxlength="2000"'} data-deck-barrier="${i}" data-barrier-field="${key}" value="${escapeHtml(String(b[key]))}" /></div>`;}).join('')}</div><button class="delete-button" type="button" data-action="remove-deck-barrier" data-index="${i}">Remove barrier run</button></details>`).join('')}<p class="warning-note">The filled panel is a schematic envelope, not a specified glass product or a gap/climbability check. Dimensions are illustrative, not approval. Review fall protection, height, openings, climbability, handrails, loads and anchorage against the project's adopted NCC Housing Provisions Part 11.3. No compliance pass is assigned.</p><p class="overview-copy">Official references: <a href="https://www.abcb.gov.au/system/files/ncc/ncc2022-volume-two-20230501b.pdf" target="_blank" rel="noopener">NCC Volume Two H5D3</a> and <a href="https://www.vba.vic.gov.au/building/stair-and-barrier-design" target="_blank" rel="noopener">structural stair and barrier design guidance</a>. Confirm applicable AS/NZS 1170.1 loading and, for glass systems, AS 1288 design/product evidence with the designer.</p>`;
}
function deckBarrierAction(action,index) {
  if(state.selected?.type!=='deck') return;
  const deck=selectedObject();
  if(action==='add-deck-barrier') {
    const a=deck.points[0],b=deck.points[1],barrier={id:uid('barrier'),name:`Barrier ${(deck.barriers||[]).length+1}`,ax:a.x,ay:a.y,bx:b.x,by:b.y,startElevation:deck.elevation,endElevation:deck.elevation,height:1000,material:'Unspecified',openings:'',climbability:'',loads:'',connections:'',handrail:'',drawingRef:''};
    try{validateDeckBarrier(barrier);}catch(error){state.statusMessage=error.message;render();return;}
    withHistory(()=>{(deck.barriers ||= []).push(barrier);state.visibility.barriers=true;});
  }else if(action==='remove-deck-barrier' && Number.isInteger(index) && deck.barriers?.[index]) withHistory(()=>deck.barriers.splice(index,1));
  else if(action==='deck-barrier-csv') exportDeckBarrierCsv();
}
function updateDeckBarrier(index,field,raw) {
  if(state.selected?.type!=='deck')return;
  const b=selectedObject().barriers?.[index];if(!b||!Object.hasOwn(b,field)||field==='id')return;
  const next={...b,[field]:typeof b[field]==='number'?(raw.trim()?Number(raw):NaN):raw.slice(0,2000)};
  try{validateDeckBarrier(next);}catch(error){state.statusMessage=error.message;render();return;}
  withHistory(()=>Object.assign(b,next));
}
function deckBarrierQuantityRows(){const net=state.model.decks.flatMap(d=>d.barriers||[]).reduce((s,b)=>s+deckBarrierGeometry(b).railLength/1000,0);return [{label:'Barrier run length',net,waste:0,order:net,unit:'m',basis:'Schematic sloping centreline length; not a rail, glass, post or fixings order; no edge-coverage assessment'}];}
function exportDeckBarrierCsv(){
  const rows=[['Deck ID','Level','Barrier ID','Name','Plan run mm','Sloping run mm','Vertical height mm','Start X mm','Start Y mm','End X mm','End Y mm','Start elevation mm','End elevation mm','Material','Openings','Climbability','Loads','Connections','Handrail','Drawing NCC standards'],...state.model.decks.flatMap(d=>(d.barriers||[]).map(b=>{const g=deckBarrierGeometry(b);return [d.id,levelName(d.levelId),b.id,b.name,g.run,g.railLength,b.height,b.ax,b.ay,b.bx,b.by,b.startElevation,b.endElevation,b.material,b.openings,b.climbability,b.loads,b.connections,b.handrail,b.drawingRef];}))];
  download('bc-design-barriers.csv',rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');
}
