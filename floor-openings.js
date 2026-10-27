// Proposed rectangular floor apertures: review geometry only, never automatic cuts.
const FLOOR_OPENING_EPS = 1e-6; // Numerical epsilon in mm, not construction tolerance.
const FLOOR_OPENING_TEXT = ['name','purpose','dimensionSource','drawingRef','designCriteria','edgeSupport','fallProtection','continuity','notes'];
function makeFloorOpening(floor) {
  const xs=floor.points.map(p=>p.x),ys=floor.points.map(p=>p.y);
  return {id:uid('floor-opening'),mode:'reference',floorId:floor.id,levelId:floor.levelId,center:{x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2},width:null,length:null,rotation:0,name:'Floor opening reference',purpose:'',dimensionSource:'',drawingRef:'',designCriteria:'',edgeSupport:'',fallProtection:'',continuity:'',notes:''};
}
function validateFloorOpenings(raw) {
  const records=raw.floorOpenings;if(records===undefined)return;
  if(!Array.isArray(records)||records.length>500)throw Error('Floor opening references must be a list of at most 500 records.');
  const ids=new Set();
  for(const r of records){
    if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!r.id.trim()||r.id.length>200||ids.has(r.id))throw Error('Floor openings need unique non-empty IDs.');ids.add(r.id);
    if(r.mode!==undefined&&!['reference','cut'].includes(r.mode))throw Error('Choose reference-only or cut mode for floor openings.');
    if(typeof r.floorId!=='string'||r.floorId.length>200||typeof r.levelId!=='string'||!(raw.levels||[]).some(l=>l.id===r.levelId))throw Error('Floor opening needs a recorded level and a floor reference ID (or unassigned).');
    if(![r.center?.x,r.center?.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9))throw Error('Opening centre must contain finite coordinates within ±1,000,000,000 mm.');
    for(const k of ['width','length'])if(r[k]!==null&&(!Number.isFinite(r[k])||r[k]<1||r[k]>1e6))throw Error('Opening width/length must be 1–1,000,000 mm or blank.');
    if(!Number.isFinite(r.rotation)||Math.abs(r.rotation)>360)throw Error('Opening rotation must be between −360 and 360 degrees.');
    for(const k of FLOOR_OPENING_TEXT)if(r[k]!==undefined&&(typeof r[k]!=='string'||r[k].length>2000))throw Error('Opening text must be at most 2000 characters.');
    const floors=r.floorId?(raw.floors||[]).filter(f=>f.id===r.floorId):[];
    if(floors.length>1)throw Error('Referenced opening floor ID is ambiguous.');
    // Validate BEFORE legacy normalization: never substitute zero for a linked datum.
    if(floors.length){const f=floors[0];if(!Number.isFinite(f.elevation)||Math.abs(f.elevation)>1e9||!Number.isFinite(f.thickness)||f.thickness<=0||f.thickness>1e6)throw Error('Referenced opening floor needs finite recorded elevation and positive thickness.');if(!Array.isArray(f.points)||f.points.length<3||f.points.some(p=>![p?.x,p?.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9)))throw Error('Referenced opening floor needs finite recorded boundary coordinates.');}
  }
}
function normalizeFloorOpenings(model){model.floorOpenings=(model.floorOpenings||[]).map(r=>({...r,mode:r.mode||'reference',center:{...r.center},...Object.fromEntries(FLOOR_OPENING_TEXT.map(k=>[k,r[k]||'']))}));}
function floorOpeningOutline(r){
  if(r.width==null||r.length==null)return [];
  const a=r.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:r.center.x+x*r.width/2*c-y*r.length/2*s,y:r.center.y+x*r.width/2*s+y*r.length/2*c}));
}
function floorOpeningSignedDistance(a,b,p){return ((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y);}
function floorOpeningOnEdge(p,a,b){const eps=FLOOR_OPENING_EPS;return Math.abs(floorOpeningSignedDistance(a,b,p))<=eps&&p.x>=Math.min(a.x,b.x)-eps&&p.x<=Math.max(a.x,b.x)+eps&&p.y>=Math.min(a.y,b.y)-eps&&p.y<=Math.max(a.y,b.y)+eps;}
function floorOpeningEdgeRelation(a,b,c,d){
  const eps=FLOOR_OPENING_EPS,ab=[floorOpeningSignedDistance(a,b,c),floorOpeningSignedDistance(a,b,d)],cd=[floorOpeningSignedDistance(c,d,a),floorOpeningSignedDistance(c,d,b)];
  const opposite=v=>(v[0]>eps&&v[1]<-eps)||(v[0]<-eps&&v[1]>eps);
  if(opposite(ab)&&opposite(cd))return 'cross';
  return floorOpeningOnEdge(c,a,b)||floorOpeningOnEdge(d,a,b)||floorOpeningOnEdge(a,c,d)||floorOpeningOnEdge(b,c,d)?'touch':'none';
}
function floorOpeningHostBoundaryValid(points){
  if(!Array.isArray(points)||points.length<3||points.length>2000||points.some(p=>![p?.x,p?.y].every(Number.isFinite)))return false;
  let twiceArea=0;const origin=points[0];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],previous=points[(i+points.length-1)%points.length];if(lengthBetween(a,b)<=FLOOR_OPENING_EPS)return false;
    if(Math.abs(floorOpeningSignedDistance(previous,a,b))<=FLOOR_OPENING_EPS&&dot(sub(previous,a),sub(b,a))>0)return false;
    twiceArea+=(a.x-origin.x)*(b.y-origin.y)-(b.x-origin.x)*(a.y-origin.y);
    for(let j=i+1;j<points.length;j++){if(j===i+1||(i===0&&j===points.length-1))continue;if(floorOpeningEdgeRelation(a,b,points[j],points[(j+1)%points.length])!=='none')return false;}
  }
  return Math.abs(twiceArea)>FLOOR_OPENING_EPS;
}
function floorOpeningContainment(outline,boundary){
  const onBoundary=p=>boundary.some((a,i)=>floorOpeningOnEdge(p,a,boundary[(i+1)%boundary.length]));
  if(outline.some(p=>!pointInPolygon(p,boundary)&&!onBoundary(p)))return 'Outside or crosses floor boundary';
  let touch=outline.some(onBoundary);
  for(let i=0;i<outline.length;i++)for(let j=0;j<boundary.length;j++){
    const relation=floorOpeningEdgeRelation(outline[i],outline[(i+1)%outline.length],boundary[j],boundary[(j+1)%boundary.length]);
    if(relation==='cross')return 'Outside or crosses floor boundary';if(relation==='touch')touch=true;
  }
  // Split at every coincident host vertex: one midpoint can miss an off-centre notch.
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],d=sub(b,a),length2=dot(d,d),ts=[0,1,...boundary.filter(p=>floorOpeningOnEdge(p,a,b)).map(p=>dot(sub(p,a),d)/length2)].sort((a,b)=>a-b);
    for(let j=1;j<ts.length;j++){const t=(ts[j-1]+ts[j])/2,p=add(a,scale(d,t));if(!pointInPolygon(p,boundary)&&!onBoundary(p))return 'Outside or crosses floor boundary';}
  }
  return touch?'Touches floor boundary; review':'Inside recorded floor outline';
}
function floorOpeningGeometry(r,model=state.model,boundaryCache=new Map()){
  const floors=model.floors.filter(f=>f.id===r.floorId),floor=floors.length===1?floors[0]:null,outline=floorOpeningOutline(r);
  const result={floor,levelId:floor?.levelId||r.levelId,outline,area:outline.length?r.width*r.length/1e6:null,perimeter:outline.length?2*(r.width+r.length)/1000:null,top:null,bottom:null,envelopeVolume:null,status:'Dimensions pending',assessed:false};
  if(!r.floorId)result.status='Host floor unassigned';else if(!floor)result.status=floors.length?'Ambiguous host floor':'Missing host floor';
  else if(!Number.isFinite(floor.elevation)||!Number.isFinite(floor.thickness)||floor.thickness<=0)result.status='Host elevation / thickness unassessed';
  else{
    result.top=floor.elevation;result.bottom=floor.elevation-floor.thickness;
    if(outline.length){result.envelopeVolume=r.width*r.length*floor.thickness/1e9;
      if(!boundaryCache.has(floor))boundaryCache.set(floor,floorOpeningHostBoundaryValid(floor.points));
      if(!boundaryCache.get(floor))result.status='Host boundary unassessed';
      else{result.status=floorOpeningContainment(outline,floor.points);result.assessed=true;}
    }
  }
  return result;
}
function floorOpeningRectanglesOverlap(a,b){
  const origin=a[0],relative=p=>({x:p.x-origin.x,y:p.y-origin.y}),aa=a.map(relative),bb=b.map(relative);
  for(const polygon of [aa,bb])for(let i=0;i<2;i++){
    const edge=sub(polygon[i+1],polygon[i]),axis=unit({x:-edge.y,y:edge.x}),pa=aa.map(p=>dot(p,axis)),pb=bb.map(p=>dot(p,axis));
    if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=FLOOR_OPENING_EPS)return false;
  }
  return true;
}
function floorOpeningResults(model=state.model){
  const cache=new Map(),rows=(model.floorOpenings||[]).map(record=>({record,geometry:floorOpeningGeometry(record,model,cache),overlaps:[]}));
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j];if(!a.geometry.assessed||!b.geometry.assessed||a.record.floorId!==b.record.floorId)continue;
    if(floorOpeningRectanglesOverlap(a.geometry.outline,b.geometry.outline)){a.overlaps.push(b.record.id);b.overlaps.push(a.record.id);}
  }
  return rows;
}
function floorOpeningBounds(){return (state.model.floorOpenings||[]).flatMap(r=>{const g=floorOpeningGeometry(r),points=g.outline.length?g.outline:[r.center];return points.flatMap(p=>g.top==null?[p]:[{...p,z:g.top},{...p,z:g.bottom}]);});}
function drawFloorOpenings(mode='plan'){
  if(!state.visibility.floorOpenings)return;
  const is3d=mode==='3d',cache=new Map(),labels=[];
  for(const r of state.model.floorOpenings||[]){
    const g=floorOpeningGeometry(r,state.model,cache);if(is3d?(!isLevelVisible3d({levelId:g.levelId})||g.top==null):g.levelId!==state.model.activeLevelId)continue;
    const project=p=>is3d?isoPoint(p,g.top):worldToScreen(p),centre=project(r.center),selected=state.selected?.type==='floorOpening'&&state.selected.id===r.id;
    ctx.save();ctx.strokeStyle=selected?'#ed1c24':'#9b4f98';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=selected?3:1.8;ctx.setLineDash([7,4]);ctx.beginPath();
    if(g.outline.length){const top=g.outline.map(project);top.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
      if(is3d){const bottom=g.outline.map(p=>isoPoint(p,g.bottom));ctx.beginPath();bottom.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.beginPath();for(let i=0;i<4;i++){ctx.moveTo(top[i].x,top[i].y);ctx.lineTo(bottom[i].x,bottom[i].y);}ctx.stroke();}
    }else{ctx.moveTo(centre.x-7,centre.y);ctx.lineTo(centre.x+7,centre.y);ctx.moveTo(centre.x,centre.y-7);ctx.lineTo(centre.x,centre.y+7);ctx.stroke();}
    ctx.setLineDash([]);ctx.font='11px Segoe UI';
    const text=`${r.name} · ${g.outline.length?(r.mode==='cut'?'cut request':'proposed opening'):'dimensions pending'}`,x=centre.x+8,width=ctx.measureText(text).width;let y=centre.y-8;
    while(labels.some(b=>x<b.x+b.width+4&&x+width+4>b.x&&y>b.y-14&&y-14<b.y))y+=16;
    labels.push({x,y,width});ctx.fillText(text,x,y);ctx.restore();
  }
}
function hitFloorOpening(p){if(!state.visibility.floorOpenings)return null;const r=[...(state.model.floorOpenings||[])].reverse().find(r=>{const g=floorOpeningGeometry(r);return g.levelId===state.model.activeLevelId&&(lengthBetween(p,r.center)<12/state.view.scale||(g.outline.length&&pointInPolygon(p,g.outline)));});return r?{type:'floorOpening',id:r.id}:null;}
function addFloorOpening(){const floor=state.selected?.type==='floor'?selectedObject():null;if(!floor)return;const r=makeFloorOpening(floor),next=[...(state.model.floorOpenings||[]),r];try{validateFloorOpenings({...state.model,floorOpenings:next});}catch(error){state.statusMessage=error.message;render();return;}withHistory(()=>{state.model.floorOpenings=next;state.selected={type:'floorOpening',id:r.id};state.visibility.floorOpenings=true;});}
function updateFloorOpening(field,raw){
  if(state.selected?.type!=='floorOpening')return false;const record=selectedObject(),next=clone(record);
  if(FLOOR_OPENING_TEXT.includes(field))next[field]=raw.slice(0,2000);
  else if(field==='floorId')next.floorId=raw;
  else if(field==='mode')next.mode=raw;
  else if(['centerX','centerY'].includes(field))next.center[field==='centerX'?'x':'y']=raw.trim()?Number(raw):NaN;
  else if(['width','length','rotation'].includes(field))next[field]=raw.trim()?Number(raw):(field==='rotation'?NaN:null);
  else return true;
  try{validateFloorOpenings({...state.model,floorOpenings:[next]});}catch(error){state.statusMessage=error.message;render();return true;}
  withHistory(()=>{Object.assign(record,next);const g=floorOpeningGeometry(record);state.model.activeLevelId=g.levelId;});return true;
}
function deleteFloorOpening(){const id=state.selected.id;withHistory(()=>{state.model.floorOpenings=state.model.floorOpenings.filter(r=>r.id!==id);state.selected=null;});}
function selectFloorOpening(id){const r=(state.model.floorOpenings||[]).find(r=>r.id===id);if(!r)return;state.selected={type:'floorOpening',id};state.model.activeLevelId=floorOpeningGeometry(r).levelId;state.visibility.floorOpenings=true;render();document.querySelector('#selectionSection')?.scrollIntoView?.({block:'nearest'});}
function floorOpeningReview(row){const {record:r,geometry:g,overlaps}=row;return [g.status,...(overlaps.length?[`Plan overlap with ${overlaps.length} other reference(s) on this floor.`]:[]),...(!r.dimensionSource||!r.drawingRef?['Record measured dimensions and drawing revision.']:[]),...(!r.edgeSupport||!r.fallProtection?['Edge support/trimming and fall protection/temporary covers require project design.']:[]),floorCutOpeningStatus(r),'No stair access, headroom, structural or compliance check.'];}
function renderFloorOpeningDetails(r){
  const row=floorOpeningResults().find(v=>v.record.id===r.id),g=row.geometry,options=[['','Unassigned'],...state.model.floors.map(f=>[f.id,`${f.name||f.id} · ${levelName(f.levelId)}`])];if(r.floorId&&!options.some(([id])=>id===r.floorId))options.push([r.floorId,`Missing saved floor: ${r.floorId}`]);
  const field=(label,key,value,type='text')=>`<div class="inspector-field"><label for="fo-${key}">${label}</label><input id="fo-${key}" data-field="${key}" type="${type}" ${type==='number'?'step="any"':'maxlength="2000"'} value="${escapeHtml(value??'')}" /></div>`;
  return `<div class="detail-head"><h3>Floor opening reference</h3><button class="delete-button" data-action="delete">Delete</button></div><div class="inspector-field"><label for="fo-floorId">Host floor</label><select id="fo-floorId" data-field="floorId">${options.map(([id,label])=>`<option value="${escapeHtml(id)}" ${id===r.floorId?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></div><div class="inspector-field"><label for="fo-mode">Effect on host slab</label><select id="fo-mode" data-field="mode"><option value="reference" ${r.mode!=='cut'?'selected':''}>Reference only — no deduction</option><option value="cut" ${r.mode==='cut'?'selected':''}>Apply geometric slab cut</option></select></div><div class="field-grid">${field('Name','name',r.name)}${field('Purpose','purpose',r.purpose)}${field('Centre X (mm)','centerX',r.center.x,'number')}${field('Centre Y (mm)','centerY',r.center.y,'number')}${field('Width local X (mm)','width',r.width,'number')}${field('Length local Y (mm)','length',r.length,'number')}${field('Clockwise rotation in Plan (°)','rotation',r.rotation,'number')}</div><p class="overview-copy">${g.area==null?'Footprint dimensions pending':`${formatNumber(g.area,3)} m² rectangle · ${formatNumber(g.perimeter,3)} m perimeter`}${g.top==null?' · Elevation unassessed':` · host top ${formatNumber(g.top)} mm / underside ${formatNumber(g.bottom)} mm`}. Centre coordinates stay fixed when changing the host; only its level and recorded elevations are followed.</p><div class="field-grid">${field('Dimension / survey evidence','dimensionSource',r.dimensionSource)}${field('Drawing and revision','drawingRef',r.drawingRef)}${field('Adopted NCC / design criteria','designCriteria',r.designCriteria)}${field('Edge support / trimming design','edgeSupport',r.edgeSupport)}${field('Fall protection / temporary cover','fallProtection',r.fallProtection)}${field('Fire / acoustic / moisture continuity','continuity',r.continuity)}${field('Notes','notes',r.notes)}</div><p class="warning-note">${floorOpeningReview(row).map(escapeHtml).join('<br>')}</p><p class="overview-copy">Dashed outlines and host-depth cages show the full entered rectangles. Only explicit cut mode changes the host slab; intersections are clipped and overlapping cuts deducted once. Reference-only records make no deduction. Boundary contact uses a 1e−6 mm arithmetic epsilon, not a site tolerance. Containment and same-floor overlap use recorded geometry only. Gross schedule areas/volumes include overlaps and portions outside the floor.</p><p class="overview-copy">Review project-specific stairs, supports and barriers with the designer: <a href="https://www.bpc.vic.gov.au/resource-hub/industry-updates/meeting-the-structural-requirements-for-stair-and-barrier-design" target="_blank" rel="noopener">BPC design/documentation guidance</a> (checked 26 October 2026). Confirm the project's adopted NCC and standards; no structural sizes are supplied.</p>`;
}
function renderFloorOpeningSchedule(){
  const el=document.querySelector('#floorOpeningSchedule');if(!el)return;const rows=floorOpeningResults(),area=rows.reduce((sum,r)=>sum+(r.geometry.area??0),0),pending=rows.filter(r=>!r.geometry.assessed).length;
  el.innerHTML=`<p class="overview-copy">${rows.length} references · ${formatNumber(area,3)} m² gross recorded rectangles · ${pending} unassessed. Gross rectangles include overlaps; applied slab deductions are in the Floor cut quantities schedule.</p>`+rows.map(({record:r,geometry:g,overlaps})=>`<button type="button" class="foundation-schedule-row" data-floor-opening-id="${escapeHtml(r.id)}"><strong>${escapeHtml(r.name||r.id)} · ${escapeHtml(levelName(g.levelId))}</strong><span>${g.area==null?'Dimensions pending':`${formatNumber(g.area,3)} m² gross rectangle`}</span><small>${escapeHtml(g.status)} · ${r.mode==='cut'?'cut requested':'reference only'}${overlaps.length?` · ${overlaps.length} overlapping reference(s)`:''}</small></button>`).join('');
}
function exportFloorOpeningCsv(){
  const rows=[['Opening ID','Name','Host floor ID','Host floor','Recorded level','Displayed level','Purpose','Centre X mm','Centre Y mm','Width mm','Length mm','Plan rotation deg','Gross rectangle m2','Perimeter m','Host top mm','Host underside mm','Gross host-depth envelope m3','Review status','Overlapping reference IDs','Dimension evidence','Drawing revision','Design criteria','Edge support','Fall protection','Continuity','Notes','Mode','Host cut status','Basis'],...floorOpeningResults().map(({record:r,geometry:g,overlaps})=>[r.id,r.name,r.floorId,g.floor?.name||g.floor?.id||'',levelName(r.levelId),levelName(g.levelId),r.purpose,r.center.x,r.center.y,r.width,r.length,r.rotation,g.area,g.perimeter,g.top,g.bottom,g.envelopeVolume,g.status,overlaps.join('; '),r.dimensionSource,r.drawingRef,r.designCriteria,r.edgeSupport,r.fallProtection,r.continuity,r.notes,r.mode||'reference',floorCutOpeningStatus(r),r.mode==='cut'?'Cut requested; this row contains gross rectangle measurements, not individual union deductions; use floor cut quantities CSV':'Proposed reference; no slab cut/deduction; gross dimensions include overlaps/outside portions; no structural/access/headroom/compliance check'])];
  const cell=value=>{let text=String(value??'');if(typeof value==='string'&&/^\s*[=+@-]/.test(text))text="'"+text;return `"${text.replaceAll('"','""')}"`;};download('bc-design-floor-opening-references.csv',rows.map(row=>row.map(cell).join(',')).join('\n'),'text/csv');
}
