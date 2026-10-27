/* Recorded roof pairs: finite top-surface intersections, not automatic roof trimming or drainage design. */
const ROOF_JUNCTION_EPS = 1e-6; // mm, numerical contact handling only
const ROOF_JUNCTION_KINDS = ['unspecified', 'valley', 'hip', 'abutment', 'other'];

function makeRoofJunction(roofAId = '') {
  return {id:uid('roof-junction'),name:'Roof junction',roofAId,roofBId:'',kind:'unspecified',joinMode:'independent',showValley:true,valleyWidth:null,designRef:'',standardRef:'',flashing:'',drainage:'',notes:''};
}
function validateRoofJunction(row) {
  if (!row || typeof row !== 'object' || !ROOF_JUNCTION_KINDS.includes(row.kind)) throw new Error('Invalid roof junction type.');
  for (const field of ['id','name','roofAId','roofBId','designRef','standardRef','flashing','drainage','notes'])
    if (typeof row[field] !== 'string' || row[field].length > 2000) throw new Error('Invalid roof junction '+field+'.');
  if(!ROOF_JOIN_MODES.includes(row.joinMode)||typeof row.showValley!=='boolean'||row.valleyWidth!==null&&(!Number.isFinite(row.valleyWidth)||row.valleyWidth<=0||row.valleyWidth>1000000))throw new Error('Invalid roof trim mode or valley preview width.');
  if (!row.id.trim()) throw new Error('Roof junction ID is required.');
  if (row.roofAId && row.roofAId === row.roofBId) throw new Error('Choose two different roofs for a junction.');
}
function normalizeRoofJunctions(model) {
  if (model.roofJunctions === undefined) model.roofJunctions=[];
  if (!Array.isArray(model.roofJunctions) || model.roofJunctions.length>500) throw new Error('Roof junctions must be a list of at most 500 records.');
  const ids=new Set();
  model.roofJunctions=model.roofJunctions.map(raw=>{
    raw={joinMode:'independent',showValley:true,valleyWidth:null,...raw};
    validateRoofJunction(raw);
    if(ids.has(raw.id))throw new Error('Duplicate roof junction ID.');ids.add(raw.id);
    return Object.fromEntries(['id','name','roofAId','roofBId','kind','joinMode','showValley','valleyWidth','designRef','standardRef','flashing','drainage','notes'].map(key=>[key,raw[key]]));
  });
  validateRoofJoinConfiguration(model);
}

function roofJunctionArea(points) {
  if(points.length<3)return 0;
  const o=points[0];let twice=0;
  for(let i=1;i<points.length-1;i++)twice+=(points[i].x-o.x)*(points[i+1].y-o.y)-(points[i].y-o.y)*(points[i+1].x-o.x);
  return twice/2;
}
function roofJunctionPlane(face,origin) {
  const points=face.map(p=>({x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z})),o=points[0];
  for(let i=1;i<points.length-1;i++) {
    const p=points[i],q=points[i+1],dx=p.x-o.x,dy=p.y-o.y,ex=q.x-o.x,ey=q.y-o.y,det=dx*ey-dy*ex;
    if(Math.abs(det)<=ROOF_JUNCTION_EPS**2)continue;
    const a=((p.z-o.z)*ey-(q.z-o.z)*dy)/det,b=(dx*(q.z-o.z)-ex*(p.z-o.z))/det,c=o.z-a*o.x-b*o.y;
    if(![a,b,c,...points.flatMap(p=>[p.x,p.y,p.z])].every(Number.isFinite))return null;
    if(Math.abs(roofJunctionArea(points))<=ROOF_JUNCTION_EPS**2)return null;
    return {points,a,b,c,height:p=>a*p.x+b*p.y+c};
  }
  return null;
}
function roofJunctionClip(subject,clip) {
  let result=subject.map(p=>({x:p.x,y:p.y}));const sign=Math.sign(roofJunctionArea(clip));
  for(let i=0;i<clip.length&&result.length;i++) {
    const a=clip[i],b=clip[(i+1)%clip.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<=ROOF_JUNCTION_EPS)continue;
    const distance=p=>sign*(dx*(p.y-a.y)-dy*(p.x-a.x))/len,output=[];
    for(let j=0;j<result.length;j++) {
      const p=result[j],q=result[(j+1)%result.length],dp=distance(p),dq=distance(q),insideP=dp>=-ROOF_JUNCTION_EPS,insideQ=dq>=-ROOF_JUNCTION_EPS;
      if(insideP)output.push(p);
      if(insideP!==insideQ){const t=dp/(dp-dq);output.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
    }
    result=output;
  }
  return result;
}
function roofJunctionFacePair(a,b,origin,faceA,faceB) {
  const polygon=roofJunctionClip(a.points,b.points),area=Math.abs(roofJunctionArea(polygon));
  if(!Number.isFinite(area))return {unresolved:true};
  if(area<=ROOF_JUNCTION_EPS**2)return {};
  const diff=p=>a.height(p)-b.height(p),values=polygon.map(diff);
  if(!values.every(Number.isFinite))return {unresolved:true};
  const min=Math.min(...values),max=Math.max(...values);
  const world=p=>({x:p.x+origin.x,y:p.y+origin.y,z:(a.height(p)+b.height(p))/2+origin.z});
  if(values.every(n=>Math.abs(n)<=ROOF_JUNCTION_EPS))return {coplanar:polygon.map(world)};
  if(min>ROOF_JUNCTION_EPS||max<-ROOF_JUNCTION_EPS)return {};
  const points=[];
  for(let i=0;i<polygon.length;i++) {
    const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=values[i],dq=values[(i+1)%polygon.length];
    if(Math.abs(dp)<=ROOF_JUNCTION_EPS)points.push(p);
    if(dp*dq<0){const t=dp/(dp-dq);points.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
  }
  let ends=null,plan=0;
  for(const p of points)for(const q of points){const length=Math.hypot(q.x-p.x,q.y-p.y);if(length>plan){plan=length;ends=[p,q];}}
  if(!ends||plan<=ROOF_JUNCTION_EPS)return {};
  const [start,end]=ends.map(world),length=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z);
  if(![plan,length,start.x,start.y,start.z,end.x,end.y,end.z].every(Number.isFinite))return {unresolved:true};
  return {segment:{start,end,plan,length,rise:end.z-start.z,faceA:faceA+1,faceB:faceB+1,contact:!(min<-ROOF_JUNCTION_EPS&&max>ROOF_JUNCTION_EPS)}};
}
function roofJunctionReview(row,model=state.model) {
  const a=(model.roofs||[]).find(r=>r.id===row.roofAId),b=(model.roofs||[]).find(r=>r.id===row.roofBId);
  const result={row,a,b,segments:[],coplanar:[],unresolved:0,status:'Not assessed',length:0,plan:0,contacts:0,review:[]};
  if(!a||!b||a.id===b.id){result.review.push('Select two existing, different roofs; missing references are retained for repair.');return result;}
  const origin={x:a.center.x,y:a.center.y,z:a.elevation},first=roofGeometry(a).planes.map(f=>roofJunctionPlane(f,origin)),second=roofGeometry(b).planes.map(f=>roofJunctionPlane(f,origin));
  if(first.some(p=>!p)||second.some(p=>!p)){result.review.push('Roof plane coordinates are numerically unresolved.');return result;}
  const near=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<=ROOF_JUNCTION_EPS;
  for(const [i,p] of first.entries())for(const [j,q] of second.entries()) {
    const pair=roofJunctionFacePair(p,q,origin,i,j);
    if(pair.unresolved)result.unresolved++;
    if(pair.coplanar)result.coplanar.push(pair.coplanar);
    if(pair.segment) {
      const s=pair.segment,duplicate=result.segments.find(t=>near(t.start,s.start)&&near(t.end,s.end)||near(t.start,s.end)&&near(t.end,s.start));
      if(duplicate)duplicate.contact&&=s.contact;else result.segments.push(s);
    }
  }
  const crossings=result.segments.filter(s=>!s.contact);
  result.length=crossings.reduce((sum,s)=>sum+s.length,0);result.plan=crossings.reduce((sum,s)=>sum+s.plan,0);result.contacts=result.segments.length-crossings.length;
  result.status=result.unresolved?'Partly unassessed':crossings.length?'Surface crossing':result.coplanar.length?'Coplanar overlap':result.contacts?'Boundary contact only':'No interior surface crossing';
  if(result.coplanar.length)result.review.push('Coplanar face overlap has no unique junction line.');
  if(result.contacts)result.review.push('Boundary-only contact is shown separately and excluded from crossing totals.');
  if(row.kind==='unspecified')result.review.push('Junction intent is unspecified.');
  if(!row.designRef.trim()||!row.standardRef.trim())result.review.push('Record designer drawing/revision and adopted code/standard editions.');
  if(!row.flashing.trim()||!row.drainage.trim())result.review.push('Record flashing/product compatibility and drainage/overflow design.');
  result.review.push(row.joinMode&&row.joinMode!=='independent'?'Explicit '+row.joinMode+' surface trimming requested; see retained roof measurements. Junction review lines remain original-surface crossings.':'Top-surface geometry only; intent is declared, not classified. Roofs are not trimmed; duplicate areas/voids remain in takeoffs.');
  return result;
}
function roofJunctionVisible(result,is3d=false) {
  return !!result.a&&!!result.b&&(is3d?isLevelVisible3d(result.a)&&isLevelVisible3d(result.b):[result.a.levelId,result.b.levelId].includes(state.model.activeLevelId));
}
function drawRoofJunctions(is3d=false) {
  if(state.visibility.roofJunctions===false)return;
  const project=p=>is3d?isoPoint(p,p.z):worldToScreen(p);
  for(const row of state.model.roofJunctions||[]) {
    const r=roofJunctionReview(row);if(!roofJunctionVisible(r,is3d))continue;
    ctx.save();ctx.lineWidth=state.selected?.type==='roofJunction'&&state.selected.id===row.id?4:2.5;
    for(const s of r.segments){const a=project(s.start),b=project(s.end);ctx.strokeStyle=s.contact?'#b5681c':'#8f2cad';ctx.setLineDash(s.contact?[4,4]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    ctx.strokeStyle='#b5681c';ctx.setLineDash([5,4]);for(const polygon of r.coplanar){const p=polygon.map(project);ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(const q of p.slice(1))ctx.lineTo(q.x,q.y);ctx.closePath();ctx.stroke();}
    const anchor=r.segments[0]?.start||r.coplanar[0]?.[0];
    if(anchor){const p=project(anchor);ctx.setLineDash([]);ctx.font='11px Segoe UI';ctx.fillStyle='#70218c';ctx.fillText(row.name+' · '+r.status,p.x+7,p.y-7);}
    ctx.restore();
  }
}
function hitRoofJunction(p) {
  if(state.visibility.roofJunctions===false)return null;
  for(const row of [...(state.model.roofJunctions||[])].reverse()){const r=roofJunctionReview(row);if(roofJunctionVisible(r)&&r.segments.some(s=>distanceToSegment(p,s.start,s.end).distance<8/state.view.scale))return {type:'roofJunction',id:row.id};}
  return null;
}
function selectRoofJunction(id) {
  const row=(state.model.roofJunctions||[]).find(r=>r.id===id);if(!row)return;
  const roof=state.model.roofs.find(r=>[row.roofAId,row.roofBId].includes(r.id));
  state.selected={type:'roofJunction',id};if(roof)state.model.activeLevelId=roof.levelId;state.visibility.roofJunctions=true;render();
  document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});
}
function addRoofJunction() {
  if((state.model.roofJunctions||[]).length>=500){state.statusMessage='At most 500 roof junction records are supported.';render();return;}
  const row=makeRoofJunction(state.selected?.type==='roof'?state.selected.id:'');
  withHistory(()=>{(state.model.roofJunctions||=[]).push(row);state.selected={type:'roofJunction',id:row.id};state.visibility.roofJunctions=true;});
  document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});
}
function deleteRoofJunction() {withHistory(()=>{state.model.roofJunctions=state.model.roofJunctions.filter(r=>r.id!==state.selected.id);state.selected=null;});}
function updateRoofJunctionField(field,value) {
  if(state.selected?.type!=='roofJunction')return false;
  const row=selectedObject(),next={...row};if(field==='id'||!Object.hasOwn(next,field))return true;
  next[field]=field==='showValley'?value==='true':field==='valleyWidth'?value===''?null:Number(value):value;
  try{validateRoofJunction(next);validateRoofJoinConfiguration({...state.model,roofJunctions:state.model.roofJunctions.map(r=>r.id===row.id?next:r)});}catch(error){state.statusMessage=error.message;render();return true;}
  withHistory(()=>Object.assign(row,next));return true;
}
function roofJunctionMetrics(r) {return r.segments.filter(s=>!s.contact).length+' crossing segments · '+formatLength(r.length)+' 3D / '+formatLength(r.plan)+' plan · '+r.contacts+' contacts';}
function renderRoofJunctionDetails(row) {
  const r=roofJunctionReview(row),field=(label,key)=>'<div class="inspector-field full"><label for="junction-'+key+'">'+label+'</label><input id="junction-'+key+'" data-field="'+key+'" maxlength="2000" value="'+escapeHtml(row[key])+'" /></div>';
  const roofs=key=>'<div class="inspector-field full"><label for="junction-'+key+'">'+(key==='roofAId'?'Roof A':'Roof B')+'</label><select id="junction-'+key+'" data-field="'+key+'"><option value="">Choose roof</option>'+(!state.model.roofs.some(r=>r.id===row[key])&&row[key]?'<option selected value="'+escapeHtml(row[key])+'">Missing: '+escapeHtml(row[key])+'</option>':'')+state.model.roofs.map(roof=>'<option value="'+escapeHtml(roof.id)+'" '+(roof.id===row[key]?'selected':'')+'>'+escapeHtml(roof.name)+' · '+escapeHtml(levelName(roof.levelId))+'</option>').join('')+'</select></div>';
  return '<div class="detail-head"><h3>'+escapeHtml(row.name)+'</h3><button class="delete-button" data-action="delete">Delete</button></div><div class="field-grid">'+field('Name','name')+roofs('roofAId')+roofs('roofBId')+'<div class="inspector-field full"><label for="junction-kind">Declared junction intent</label><select id="junction-kind" data-field="kind">'+ROOF_JUNCTION_KINDS.map(k=>'<option '+(k===row.kind?'selected':'')+' value="'+k+'">'+k+'</option>').join('')+'</select></div>'+field('Designer drawing / revision','designRef')+field('Adopted NCC / standard editions','standardRef')+field('Flashing / product compatibility design','flashing')+field('Drainage / overflow / catchment design','drainage')+field('Notes','notes')+'</div><p class="overview-copy"><strong>'+r.status+'</strong> · '+roofJunctionMetrics(r)+'</p>'+r.segments.map((s,i)=>'<p class="overview-copy">'+(i+1)+'. Faces '+s.faceA+'/'+s.faceB+' · '+(s.contact?'Boundary contact':'Surface crossing')+' · '+formatLength(s.length)+' · |ΔZ| '+formatNumber(Math.abs(s.rise),1)+' mm</p>').join('')+'<div class="warning-note">'+r.review.map(escapeHtml).join('<br>')+'</div><p class="overview-copy">Use explicit trimming choices below. Valley gutter capacity, framing and product quantities still require design. Confirm the project edition and application limits of <a href="https://ncc.abcb.gov.au/system/files/ncc/abcb-housing-provisions-2022-20230501b.pdf" target="_blank" rel="noopener">ABCB Housing Provisions</a>: sheet flashings/cappings 7.2.7, tile flashing 7.3.3, and gutter/drainage provisions in Part 7.4. Use the qualified designer’s applicable AS/NZS 3500.3 pathway and manufacturer details.</p>'+roofTrimProperties(row);
}
function renderRoofJunctionSchedule() {
  const el=document.querySelector('#roofJunctionSchedule');if(!el)return;
  el.innerHTML=(state.model.roofJunctions||[]).map(row=>{const r=roofJunctionReview(row);return '<button type="button" class="foundation-schedule-row" data-roof-junction-id="'+escapeHtml(row.id)+'"><strong>'+escapeHtml(row.name)+' · '+r.status+'</strong><span>'+escapeHtml(r.a?.name||row.roofAId||'Choose roof A')+' / '+escapeHtml(r.b?.name||row.roofBId||'Choose roof B')+'</span><span>'+roofJunctionMetrics(r)+'</span><span>Trim: '+escapeHtml(row.joinMode||'independent')+'</span><small>Intent: '+row.kind+' · '+r.review.length+' review notes</small></button>';}).join('')||'<p class="overview-copy">Add a record and choose two roofs to review their top-surface intersections.</p>';
}
function exportRoofJunctionCsv() {
  const header=['Record','Junction ID','Name','Declared intent','Roof A ID','Roof A','Level A','Roof B ID','Roof B','Level B','Status','Segment','Face A','Face B','3D length mm','Plan run mm','Absolute rise mm','Start XYZ JSON mm','End XYZ JSON mm','Designer revision','Adopted editions','Flashing design','Drainage design','Notes','Review','Trim mode','Show valley preview','Plan preview width mm'];
  const rows=[header];
  for(const row of state.model.roofJunctions||[]) {
    const r=roofJunctionReview(row),base=[row.id,row.name,row.kind,row.roofAId,r.a?.name||'',r.a?levelName(r.a.levelId):'',row.roofBId,r.b?.name||'',r.b?levelName(r.b.levelId):''];
    const evidence=[row.designRef,row.standardRef,row.flashing,row.drainage,row.notes,r.review.join('; '),row.joinMode,row.showValley,row.valleyWidth??''];
    rows.push(['Junction total',...base,r.status,'','','',r.length,r.plan,'','','',...evidence]);
    r.segments.forEach((s,i)=>rows.push([s.contact?'Boundary contact':'Crossing segment',...base,s.contact?'Boundary contact':'Surface crossing',i+1,s.faceA,s.faceB,s.length,s.plan,Math.abs(s.rise),JSON.stringify(s.start),JSON.stringify(s.end),...evidence]));
  }
  const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  download('bc-design-roof-junctions.csv',rows.map(row=>row.map(cell).join(',')).join('\n'),'text/csv');
}
