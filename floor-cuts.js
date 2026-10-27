// Explicit geometric slab apertures. Source floor outlines are never rewritten.
const FLOOR_CUT_CACHE = new WeakMap();
function floorCutArea(poly){if(poly.length<3)return 0;const o=poly[0];return Math.abs(poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+(a.x-o.x)*(b.y-o.y)-(b.x-o.x)*(a.y-o.y);},0))/2;}
function floorCutTriangles(points){
  let p=points.map(v=>({...v}));if(roofJunctionArea(p)<0)p.reverse();
  let changed=true;while(changed&&p.length>3){changed=false;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if(floorOpeningOnEdge(b,a,c)){p.splice(i,1);changed=true;break;}}}
  const triangles=[];
  while(p.length>3){let found=false;for(let i=0;i<p.length;i++){
    const previous=(i+p.length-1)%p.length,next=(i+1)%p.length,a=p[previous],b=p[i],c=p[next];
    if(floorOpeningSignedDistance(a,b,c)<=FLOOR_OPENING_EPS)continue;
    const tri=[a,b,c];if(p.some((v,j)=>![previous,i,next].includes(j)&&roofTrimContains(tri,v)))continue;
    triangles.push(tri);p.splice(i,1);found=true;break;
  }if(!found)throw Error('Floor triangulation is numerically unresolved.');}
  if(p.length===3&&floorCutArea(p)>FLOOR_OPENING_EPS**2)triangles.push(p);return triangles;
}
function floorMeasuredGeometry(floor,model=state.model){
  const requested=(model.floorOpenings||[]).filter(r=>r.floorId===floor.id&&r.mode==='cut').sort((a,b)=>a.id.localeCompare(b.id));
  const signature=JSON.stringify([floor.points,floor.elevation,floor.thickness,requested.map(r=>[r.id,r.center,r.width,r.length,r.rotation])]),cached=FLOOR_CUT_CACHE.get(floor);if(cached?.signature===signature)return cached.result;
  const grossArea=floorCutArea(floor.points),volume=Number.isFinite(floor.thickness)&&floor.thickness>0?grossArea*floor.thickness:null;
  const original={floor,active:false,pending:false,status:'Original outline',reason:'No applied cuts requested',requested:requested.map(r=>r.id),grossArea,area:grossArea,removedArea:0,volume,grossVolume:volume,removedVolume:0,polygons:[floor.points],edges:floor.points.map((p,i)=>[p,floor.points[(i+1)%floor.points.length]])};
  let result=original;
  if(requested.length)try{
    if(requested.length>32)throw Error('More than 32 cut records on this floor.');
    if(floor.points.length>128)throw Error('More than 128 source floor vertices.');
    if(!floorOpeningHostBoundaryValid(floor.points))throw Error('Host floor boundary is invalid.');
    if(!Number.isFinite(floor.elevation)||!Number.isFinite(floor.thickness)||floor.thickness<=0)throw Error('Host elevation / thickness is missing.');
    if(requested.some(r=>r.width==null||r.length==null))throw Error('An opted-in cut has missing dimensions.');
    const origin=floor.points[0],local=p=>({x:p.x-origin.x,y:p.y-origin.y}),world=p=>({x:p.x+origin.x,y:p.y+origin.y});
    let pieces=floorCutTriangles(floor.points.map(local));
    const trianglesArea=pieces.reduce((sum,p)=>sum+floorCutArea(p),0),epsilon=Math.max(1e-4,grossArea*1e-10);
    if(Math.abs(trianglesArea-grossArea)>epsilon)throw Error('Floor triangulation area did not balance.');
    for(const r of requested){const cutter=floorOpeningOutline(r).map(local);pieces=pieces.flatMap(p=>roofTrimDifference(p,cutter));if(pieces.length>256)throw Error('More than 256 retained fragments; split the floor/cut layout.');}
    let area=pieces.reduce((sum,p)=>sum+floorCutArea(p),0);if(!Number.isFinite(area)||area<0||area>grossArea+epsilon)throw Error('Cut area is numerically unresolved.');area=Math.min(grossArea,area);
    const removedArea=Math.max(0,grossArea-area),edges=roofTrimBoundary(pieces).map(edge=>edge.map(world));
    result={...original,active:true,area,removedArea,volume:area*floor.thickness,removedVolume:removedArea*floor.thickness,origin,local:pieces,polygons:pieces.map(p=>p.map(world)),edges,status:area<=FLOOR_OPENING_EPS**2?'Fully cut':removedArea<=FLOOR_OPENING_EPS**2?'Applied; no intersecting area':'Cuts applied',reason:'Union of opted-in rectangles clipped to this floor; geometric slab envelope only'};
  }catch(error){result={...original,pending:true,status:'Cuts unassessed',reason:error.message+' Original outline/quantities retained; no partial cuts applied.'};}
  FLOOR_CUT_CACHE.set(floor,{signature,result});return result;
}
function floorCutReviewSummary(){const pending=state.model.floors.filter(f=>floorMeasuredGeometry(f).pending).length;return pending?`${pending} floor(s) have unassessed cuts; original gross areas retained`:'Opted-in cuts are unioned and clipped; other floors retain their outlines';}
function floorCutPath(polys,project){ctx.beginPath();for(const poly of polys){if(!poly.length)continue;poly.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();}}
function drawCutFloor(floor,selected=false,is3d=false){
  const g=floorMeasuredGeometry(floor);if(!g.active)return false;if(!g.polygons.length)return true;
  const top=p=>is3d?isoPoint(p,floor.elevation):worldToScreen(p),bottom=p=>isoPoint(p,floor.elevation-floor.thickness);
  ctx.save();
  if(is3d){floorCutPath(g.polygons,bottom);ctx.fillStyle='#dfd0b6';ctx.fill();for(const [a,b] of g.edges)polygon([bottom(a),bottom(b),top(b),top(a)],'#d4bc95','#b58a4c');}
  floorCutPath(g.polygons,top);ctx.fillStyle=selected?'rgba(237,28,36,.12)':is3d?'#eadfcb':'rgba(190,154,93,.14)';ctx.fill();ctx.strokeStyle=selected?'#ed1c24':'#b58a4c';ctx.lineWidth=selected?3:1.5;ctx.setLineDash(is3d||selected?[]:[5,4]);ctx.beginPath();for(const [a,b] of g.edges){const p=top(a),q=top(b);ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);}ctx.stroke();ctx.restore();return true;
}
function floorContainsPoint(floor,p){const g=floorMeasuredGeometry(floor);return g.active?g.local.some(poly=>pointInPolygon({x:p.x-g.origin.x,y:p.y-g.origin.y},poly)):pointInPolygon(p,floor.points);}
function floorCutOpeningStatus(record){if(record.mode!=='cut')return 'Reference only; no slab deduction';const floor=state.model.floors.find(f=>f.id===record.floorId);if(!floor)return 'Cut unassessed: missing/unassigned host';const g=floorMeasuredGeometry(floor);return `${g.status}: ${g.reason}`;}
function renderFloorCutDetails(floor){const g=floorMeasuredGeometry(floor);return `<h3 class="reinforcement-heading">Slab aperture geometry</h3><p class="overview-copy">${escapeHtml(g.status)} · gross ${formatArea(g.grossArea)} · ${g.pending?'deduction/net pending':`union deduction ${formatArea(g.removedArea)} · retained ${formatArea(g.area)}`}. ${escapeHtml(g.reason)}</p><p class="warning-note">Cut mode changes geometric floor area and linked measurements; it does not authorise construction. Review trimming/supports, reinforcement, access, fall protection and service/fire/moisture details with the project designer. Slab-envelope volumes exclude beams, finishes and reinforcement. Separate overlapping floors are not unioned.</p>`;}
function renderFloorCutSchedule(){const el=document.querySelector('#floorCutSchedule');if(!el)return;el.innerHTML=state.model.floors.map(f=>{const g=floorMeasuredGeometry(f);return `<button type="button" class="foundation-schedule-row" data-cut-floor-id="${escapeHtml(f.id)}"><strong>${escapeHtml(f.name||f.id)} · ${escapeHtml(levelName(f.levelId))}</strong><span>${g.pending?'Net unassessed — gross retained':`${formatArea(g.area)} retained · ${formatArea(g.removedArea)} union cut`}</span><small>${escapeHtml(g.status)} · ${g.requested.length} cut record(s)</small></button>`;}).join('')||'<p class="overview-copy">No floor slabs.</p>';}
function selectCutFloor(id){const floor=state.model.floors.find(f=>f.id===id);if(!floor)return;state.model.activeLevelId=floor.levelId;state.selected={type:'floor',id};render();document.querySelector('#selectionSection')?.scrollIntoView?.({block:'nearest'});}
function exportFloorCutCsv(){const rows=[['Floor ID','Name','Level','Gross area m2','Union deduction m2','Retained area m2','Thickness mm','Top mm','Gross envelope m3','Deducted envelope m3','Retained envelope m3','Requested cut IDs','Status','Basis'],...state.model.floors.map(f=>{const g=floorMeasuredGeometry(f);return [f.id,f.name||'',levelName(f.levelId),g.grossArea/1e6,g.pending?'':g.removedArea/1e6,g.pending?'':g.area/1e6,f.thickness,f.elevation,g.grossVolume==null?'':g.grossVolume/1e9,g.pending?'':g.removedVolume/1e9,g.pending||g.volume==null?'':g.volume/1e9,g.requested.join('; '),g.status,g.reason+'; no engineering/approval; no union across separate floors; no product/waste conversion'];})];const cell=v=>{let s=String(v??'');if(typeof v==='string'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};download('bc-design-floor-cut-quantities.csv',rows.map(r=>r.map(cell).join(',')).join('\n'),'text/csv');}
