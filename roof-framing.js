/* Roof-face framing layouts. Dimensions and spacing are project inputs, never span-table selections. */
const ROOF_FRAME_ROLES=['rafter','batten','purlin','ridge','hip','valley','other'];
const ROOF_FRAME_TEXT=['id','name','roofId','material','grade','treatment','dimensionSource','productCode','designRef','standardRef','wind','loads','supports','bracing','fixings','notes'];
const ROOF_FRAME_OPTIONAL=['width','depth','spacing','stockLength'];
const ROOF_FRAME_NUMBERS=['face','angle','firstOffset','normalOffset',...ROOF_FRAME_OPTIONAL];
const ROOF_FRAME_BASIS='Centreline clipped to retained roof face; rectangular gross envelope only. No bearing, end cuts, joints, overlap deductions, waste or stock optimisation. Independent sets can overlap.';
let roofFrameCacheKey='',roofFrameCache=[];

function makeRoofFraming(roofId='') {
  return {id:uid('roof-frame'),name:'Roof framing',roofId,face:1,role:'rafter',mode:'array',direction:'fall',angle:0,width:null,depth:null,spacing:null,firstOffset:0,normalOffset:0,stockLength:null,material:'',grade:'',treatment:'',dimensionSource:'',productCode:'',designRef:'',standardRef:'',wind:'',loads:'',supports:'',bracing:'',fixings:'',notes:''};
}
function validateRoofFraming(row) {
  if(!row||typeof row!=='object')throw new Error('Invalid roof framing record.');
  for(const key of ROOF_FRAME_TEXT)if(typeof row[key]!=='string'||row[key].length>2000)throw new Error('Invalid roof framing '+key+'.');
  if(!row.id.trim())throw new Error('Roof framing ID is required.');
  if(!ROOF_FRAME_ROLES.includes(row.role)||!['array','single'].includes(row.mode)||!['fall','across','custom'].includes(row.direction))throw new Error('Invalid roof framing role, layout or direction.');
  if(!Number.isInteger(row.face)||row.face<1||row.face>4)throw new Error('Roof face must be 1 to 4.');
  for(const key of ROOF_FRAME_OPTIONAL)if(row[key]!==null&&(!Number.isFinite(row[key])||row[key]<=0||row[key]>1000000))throw new Error(key+' must be blank or greater than zero, up to 1,000,000 mm.');
  if(!Number.isFinite(row.angle)||Math.abs(row.angle)>360000||!Number.isFinite(row.firstOffset)||row.firstOffset<0||row.firstOffset>1000000||!Number.isFinite(row.normalOffset)||Math.abs(row.normalOffset)>1000000)throw new Error('Framing angle and offsets must be finite within modelling limits.');
}
function validateRoofFramingList(rows) {
  if(rows===undefined)return;
  if(!Array.isArray(rows)||rows.length>100)throw new Error('Roof framing must be a list of at most 100 sets.');
  const ids=new Set();for(const row of rows){validateRoofFraming(row);if(ids.has(row.id))throw new Error('Duplicate roof framing ID.');ids.add(row.id);}
}
function normalizeRoofFraming(model) {
  validateRoofFramingList(model.roofFraming);
  model.roofFraming=(model.roofFraming||[]).map(row=>Object.fromEntries([...ROOF_FRAME_TEXT,...ROOF_FRAME_NUMBERS,'role','mode','direction'].map(key=>[key,row[key]])));
}
const rfDot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const rfSub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const rfUnit=a=>{const length=Math.hypot(a.x,a.y,a.z);if(!Number.isFinite(length)||length<1e-12)throw new Error('Roof framing axes are unresolved.');return {x:a.x/length,y:a.y/length,z:a.z/length};};
const rfCross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});

function roofFramingGeometry(row,model=state.model) {
  const roof=(model.roofs||[]).find(r=>r.id===row.roofId);
  const result={row,roof,members:[],length:0,volume:null,status:'Not assessed',reason:'',review:[],section:row.width!==null&&row.depth!==null};
  const missing=reason=>({...result,reason});
  if(!roof)return missing('Choose an existing roof. Missing links are kept for repair.');
  if(row.mode==='array'&&row.spacing===null)return missing('Enter project-specified spacing to lay out members.');
  const measured=roofMeasuredGeometry(roof,model);
  if(['Join unassessed','Join pending'].includes(measured.status))return missing(measured.basis);
  const source=roofGeometry(roof).planes[row.face-1];
  if(!source)return missing('The selected face no longer exists. Select a face on the current roof form.');
  try {
    const origin=source[0],plane=roofJunctionPlane(source,origin);
    if(!plane)throw new Error('Roof face is numerically unresolved.');
    const normal=rfUnit({x:-plane.a,y:-plane.b,z:1});
    const angle=(roof.rotation+(row.direction==='custom'?row.angle:0))*Math.PI/180;
    let dx=Math.cos(angle),dy=Math.sin(angle);
    if(row.direction!=='custom'&&Math.hypot(plane.a,plane.b)>1e-10){dx=-plane.a;dy=-plane.b;}
    let along=rfUnit({x:dx,y:dy,z:plane.a*dx+plane.b*dy});
    if(row.direction==='across')along=rfUnit(rfCross(normal,along));
    const across=rfUnit(rfCross(normal,along));
    const uv=p=>{const d=rfSub(p,origin);return {x:rfDot(d,along),y:rfDot(d,across)};};
    const original=source.map(uv),fragments=measured.active?measured.faces[row.face-1].polygons:[source],polygons=fragments.map(p=>p.map(uv));
    const minU=Math.min(...original.map(p=>p.x)),maxU=Math.max(...original.map(p=>p.x)),minV=Math.min(...original.map(p=>p.y)),maxV=Math.max(...original.map(p=>p.y));
    if(![minU,maxU,minV,maxV].every(Number.isFinite)||maxU-minU<ROOF_JUNCTION_EPS)throw new Error('Framing face bounds are unresolved.');
    const first=minV+row.firstOffset,span=maxV-first;
    const count=span<-ROOF_JUNCTION_EPS?0:row.mode==='single'?1:Math.floor((span+ROOF_JUNCTION_EPS)/row.spacing)+1;
    if(!Number.isSafeInteger(count)||count>500)throw new Error('Layout exceeds 500 stations per set; increase spacing or divide the roof.');
    const point=(u,v)=>({x:origin.x+along.x*u+across.x*v-normal.x*row.normalOffset,y:origin.y+along.y*u+across.y*v-normal.y*row.normalOffset,z:origin.z+along.z*u+across.z*v-normal.z*row.normalOffset});
    for(let i=0;i<count;i++) {
      const station=first+i*(row.mode==='array'?row.spacing:0),a={x:minU-1,y:station},b={x:maxU+1,y:station},extent=b.x-a.x;
      const intervals=polygons.map(poly=>roofTrimSegmentInterval(a,b,poly)).filter(Boolean).map(([lo,hi])=>[a.x+lo*extent,a.x+hi*extent]).filter(([lo,hi])=>hi-lo>ROOF_JUNCTION_EPS).sort((a,b)=>a[0]-b[0]);
      const merged=[];
      for(const pair of intervals){const last=merged.at(-1);if(last&&pair[0]-last[1]<=ROOF_JUNCTION_EPS)last[1]=Math.max(last[1],pair[1]);else merged.push([...pair]);}
      for(const [piece,[lo,hi]] of merged.entries()) {
        const start=point(lo,station),end=point(hi,station),length=hi-lo;
        if(![start,end].every(p=>[p.x,p.y,p.z].every(Number.isFinite)))throw new Error('Framing coordinates exceed numeric limits.');
        const member={id:row.id+':'+(i+1)+':'+(piece+1),station:i+1,piece:piece+1,offset:station-minV,start,end,length,along,across,normal,volume:result.section?length*row.width*row.depth:null,overStock:row.stockLength!==null&&length>row.stockLength+ROOF_JUNCTION_EPS};
        result.members.push(member);if(result.members.length>1000)throw new Error('Layout exceeds 1,000 clipped member pieces; divide the set.');
      }
    }
    result.length=result.members.reduce((s,m)=>s+m.length,0);result.volume=result.section?result.length*row.width*row.depth:null;
    result.status=result.members.length?(result.section?'Measured geometry':'Centreline only'):'No retained members';
    result.reason=result.section?'':'Enter width and depth to measure and show member sections.';
    if(!row.material||!row.grade||!row.treatment)result.review.push('Record material, grade and treatment/durability.');
    if(!row.dimensionSource)result.review.push('Record section dimension evidence.');
    for(const [key,label] of [['designRef','Designer drawing / revision'],['standardRef','Adopted NCC / standard editions'],['wind','Wind design'],['loads','Loads'],['supports','Spans / supports / bearing'],['bracing','Bracing'],['fixings','Connections / tie-down']])if(!row[key])result.review.push(label+' required.');
    const ref=MATERIAL_REFERENCES.find(r=>r.code===row.productCode&&row.dimensionSource.includes(r.url)&&r.category==='Timber');
    if(ref&&result.section&&!((row.width===ref.thickness&&row.depth===ref.width)||(row.width===ref.width&&row.depth===ref.thickness)))result.review.push('Entered section differs from the linked supplier listing; verify the selected product.');
    if(row.stockLength===null)result.review.push('Stock length is unknown; no length comparison.');
    else if(result.members.some(m=>m.overStock))result.review.push('Some geometric member lengths exceed the recorded stock length; no splice is inferred.');
    return result;
  } catch(error) {return {...result,members:[],length:0,volume:null,status:'Not assessed',reason:error.message};}
}
function roofFramingResults(model=state.model) {
  const key=JSON.stringify([model.roofFraming,model.roofs,model.roofJunctions]);if(key===roofFrameCacheKey)return roofFrameCache;
  let count=0;const results=(model.roofFraming||[]).map(row=>{const r=roofFramingGeometry(row,model);count+=r.members.length;if(count>5000)return {...r,members:[],length:0,volume:null,status:'Not assessed',reason:'Project exceeds 5,000 generated member pieces; divide the project.'};return r;});
  roofFrameCacheKey=key;roofFrameCache=results;return results;
}
function roofFrameCorners(member,row) {
  if(row.width===null||row.depth===null)return [member.start,member.end];
  return [member.start,member.end].flatMap(p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([w,d])=>({x:p.x+member.across.x*w*row.width/2+member.normal.x*d*row.depth/2,y:p.y+member.across.y*w*row.width/2+member.normal.y*d*row.depth/2,z:p.z+member.across.z*w*row.width/2+member.normal.z*d*row.depth/2})));
}
function roofFramingBounds(){return roofFramingResults().flatMap(r=>r.members.flatMap(m=>roofFrameCorners(m,r.row)));}
function roofFramingVisible(r,is3d=false){return !!r.roof&&(is3d?isLevelVisible3d(r.roof):r.roof.levelId===state.model.activeLevelId);}
function drawRoofFraming(is3d=false) {
  if(state.visibility.roofFraming===false)return;
  const project=p=>is3d?isoPoint(p,p.z):worldToScreen(p),faces=[];
  if(state.selected?.type==='roofFraming') {
    const selected=roofFramingResults().find(r=>r.row.id===state.selected.id);
    if(selected&&roofFramingVisible(selected,is3d)) {
      const outline=roofGeometry(selected.roof).planes[selected.row.face-1];
      if(outline){ctx.save();ctx.strokeStyle='#70461f';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);const p=outline.map(project);ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(const q of p.slice(1))ctx.lineTo(q.x,q.y);ctx.closePath();ctx.stroke();ctx.setLineDash([]);ctx.font='11px Segoe UI';ctx.fillStyle='#70461f';ctx.fillText('Original face '+selected.row.face,p[0].x+6,p[0].y-8);ctx.restore();}
    }
  }
  for(const r of roofFramingResults())if(roofFramingVisible(r,is3d))for(const m of r.members) {
    const selected=state.selected?.type==='roofFraming'&&state.selected.id===r.row.id,stroke=selected?'#ed1c24':'#70461f',fill=r.row.role==='batten'?'#e6c38e':'#c88e4e';
    if(!r.section){const a=project(m.start),b=project(m.end);ctx.save();ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();continue;}
    const p=roofFrameCorners(m,r.row);
    for(const indices of [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])faces.push({points:indices.map(i=>p[i]),fill,stroke});
  }
  faces.sort((a,b)=>a.points.reduce((n,p)=>n+p.x+p.y,0)-b.points.reduce((n,p)=>n+p.x+p.y,0));
  for(const face of faces)polygon(face.points.map(project),face.fill,face.stroke);
}
function hitRoofFraming(p){if(state.visibility.roofFraming===false)return null;for(const r of [...roofFramingResults()].reverse())if(roofFramingVisible(r)&&r.members.some(m=>distanceToSegment(p,m.start,m.end).distance<=Math.max(8/state.view.scale,(r.row.width||0)/2)))return {type:'roofFraming',id:r.row.id};return null;}
function addRoofFraming() {
  if((state.model.roofFraming||[]).length>=100){state.statusMessage='At most 100 roof framing sets are supported.';render();return;}
  const row=makeRoofFraming(state.selected?.type==='roof'?state.selected.id:state.selected?.type==='roofFraming'?selectedObject().roofId:'');
  withHistory(()=>{(state.model.roofFraming||=[]).push(row);state.selected={type:'roofFraming',id:row.id};state.visibility.roofFraming=true;});
  document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});
}
function selectRoofFraming(id){const row=(state.model.roofFraming||[]).find(r=>r.id===id);if(!row)return;state.selected={type:'roofFraming',id};const roof=state.model.roofs.find(r=>r.id===row.roofId);if(roof)state.model.activeLevelId=roof.levelId;state.visibility.roofFraming=true;render();document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});}
function deleteRoofFraming(){withHistory(()=>{state.model.roofFraming=state.model.roofFraming.filter(r=>r.id!==state.selected.id);state.selected=null;});}
function updateRoofFramingField(field,raw) {
  if(state.selected?.type!=='roofFraming')return false;
  const row=selectedObject();if(field==='id'||!Object.hasOwn(row,field))return true;
  const next={...row,[field]:ROOF_FRAME_NUMBERS.includes(field)?raw.trim()===''?(ROOF_FRAME_OPTIONAL.includes(field)?null:NaN):Number(raw):raw};
  try{validateRoofFraming(next);}catch(error){state.statusMessage=error.message;render();return true;}
  withHistory(()=>Object.assign(row,next));return true;
}
function applyRoofFrameReference(code) {
  if(state.selected?.type!=='roofFraming')return;
  const ref=MATERIAL_REFERENCES.find(r=>materialReferenceKey(r)===code&&r.category==='Timber');if(!ref)return;
  const row=selectedObject();
  withHistory(()=>Object.assign(row,{width:ref.thickness,depth:ref.width,stockLength:ref.length,material:ref.name,grade:ref.grade,treatment:ref.finish,productCode:ref.code,dimensionSource:ref.supplier+' '+ref.codeLabel+' '+ref.code+'; listing checked '+ref.checked+'; '+ref.url}));
}
function roofFrameSummary(r){return r.status+' · '+r.members.length+' pieces · '+formatLength(r.length)+' total'+(r.volume===null?' · volume unknown':' · '+formatNumber(r.volume/1e9,4)+' m³ gross section envelope');}
function roofFrameMemberSchedule(r) {
  if(!r.members.length)return '';
  return '<details><summary>Member measurements ('+r.members.length+')</summary>'+r.members.map(m=>'<p class="overview-copy">Station '+m.station+' / piece '+m.piece+' · '+formatLength(m.length)+' · '+(m.volume===null?'section unknown':formatNumber(m.volume/1e9,4)+' m³ gross')+(m.overStock?' · exceeds recorded stock':'')+'</p>').join('')+'</details>';
}
function renderRoofFramingDetails(row) {
  const r=roofFramingResults().find(r=>r.row.id===row.id)||roofFramingGeometry(row),field=(label,key,unit='')=>'<div class="inspector-field"><label for="rf-'+key+'">'+label+'</label><input id="rf-'+key+'" data-field="'+key+'" type="'+(ROOF_FRAME_NUMBERS.includes(key)?'number':'text')+'" step="any" maxlength="2000" value="'+escapeHtml(row[key]??'')+'" />'+(unit?'<span class="field-unit">'+unit+'</span>':'')+'</div>';
  const select=(label,key,options)=>'<div class="inspector-field full"><label for="rf-'+key+'">'+label+'</label><select id="rf-'+key+'" data-field="'+key+'">'+options.map(([value,label])=>'<option value="'+escapeHtml(value)+'" '+(String(row[key])===String(value)?'selected':'')+'>'+escapeHtml(label)+'</option>').join('')+'</select></div>';
  const roofs=[['','Choose roof'],...state.model.roofs.map(r=>[r.id,r.name+' · '+levelName(r.levelId)])];if(row.roofId&&!r.roof)roofs.push([row.roofId,'Missing: '+row.roofId]);
  const faces=Array.from({length:r.roof?roofGeometry(r.roof).planes.length:4},(_,i)=>[i+1,'Face '+(i+1)]);if(!faces.some(([v])=>v===row.face))faces.push([row.face,'Missing face '+row.face]);
  return '<div class="detail-head"><h3>Roof framing set</h3><button class="delete-button" data-action="delete">Delete</button></div><div class="field-grid">'+field('Name','name')+select('Roof','roofId',roofs)+select('Original roof face','face',faces)+select('Member role','role',ROOF_FRAME_ROLES.map(v=>[v,v]))+select('Layout','mode',[['array','Parallel members'],['single','Single member line']])+select('Direction','direction',[['fall','Along roof fall'],['across','Across roof fall'],['custom','Custom plan angle from roof local X']])+(row.direction==='custom'?field('Custom plan angle','angle','°'):'')+field('Section width across member','width','mm')+field('Section depth normal to roof','depth','mm')+(row.mode==='array'?field('Centres on roof plane','spacing','mm'):'')+field('First centre from original face edge','firstOffset','mm')+field('Centre below roof face (negative = above)','normalOffset','mm')+field('Recorded stock length','stockLength','mm')+'</div><p class="overview-copy"><strong>'+escapeHtml(roofFrameSummary(r))+'</strong></p>'+roofFrameMemberSchedule(r)+(r.reason?'<p class="warning-note">'+escapeHtml(r.reason)+'</p>':'')+'<p class="overview-copy">Spacing is perpendicular to the members on the sloping plane, not horizontal plan spacing. First centre is measured from the original face’s minimum transverse edge; trimmed gaps do not restart the grid. Only centrelines are trimmed. Section edges and normal offsets can project beyond roof boundaries. One face per set; use another set for another face. These are schematic square-ended members, not structural spans or a cut list.</p><details><summary>Australian supplier dimension references</summary><p class="overview-copy">Copy a listing only after choosing it for your project. This sets this record’s section on edge and stock length; spacing and design remain your inputs. Listed dimensions are not measured tolerances or suitability checks.</p>'+MATERIAL_REFERENCES.filter(ref=>ref.category==='Timber').map(ref=>'<p class="overview-copy">'+escapeHtml(ref.supplier)+' · '+escapeHtml(ref.name)+' · '+escapeHtml(ref.codeLabel)+' '+escapeHtml(ref.code)+' · checked '+escapeHtml(ref.checked)+'<br><a href="'+escapeHtml(ref.url)+'" target="_blank" rel="noopener noreferrer">View exact listing</a> <button type="button" class="link-button" data-rf-product="'+escapeHtml(materialReferenceKey(ref))+'">Copy listed dimensions</button></p>').join('')+'</details><h3>Design and material records</h3><div class="field-grid">'+[['material','Material / product'],['grade','Structural grade'],['treatment','Treatment / durability'],['productCode','Supplier item number'],['dimensionSource','Dimension source / checked date'],['designRef','Designer drawing / revision'],['standardRef','Adopted NCC / standard editions'],['wind','Wind classification / design'],['loads','Roof / ceiling / imposed loads'],['supports','Spans / supports / bearing'],['bracing','Bracing design'],['fixings','Connections / tie-down'],['notes','Notes']].map(([key,label])=>field(label,key)).join('')+'</div><p class="warning-note">'+r.review.map(escapeHtml).join('<br>')+(r.review.length?'<br>':'')+'Geometry and recorded evidence do not establish structural compliance.</p><p class="overview-copy">Australian reference pathways: <a href="https://ncc.abcb.gov.au/system/files/ncc/ncc2022-combined-vol2-housing-provisions-20230501b.pdf" target="_blank" rel="noopener">NCC Volume Two H1D6</a>: applicable AS 1684.2 / AS 1684.4 non-cyclonic or AS 1684.3 cyclonic framing, AS 1720.1 engineered timber and AS 1720.5 nailplated trusses. Confirm adopted editions, jurisdiction, application limits, loads, spans, bearing, bracing, durability and tie-down with the project designer. No truss design or automatic member sizing is performed.</p>';
}
function renderRoofFramingSchedule() {
  const el=document.querySelector('#roofFramingSchedule');if(!el)return;
  el.innerHTML=roofFramingResults().map(r=>'<button class="foundation-schedule-row" type="button" data-roof-framing-id="'+escapeHtml(r.row.id)+'"><strong>'+escapeHtml(r.row.name)+' · '+escapeHtml(r.row.role)+'</strong><span>'+escapeHtml(r.roof?.name||r.row.roofId||'Choose roof')+' · face '+r.row.face+'</span><span>'+escapeHtml(roofFrameSummary(r))+'</span><small>'+escapeHtml(r.reason||r.row.width+' × '+r.row.depth+' mm · '+(r.row.mode==='array'?r.row.spacing+' mm centres':'single line'))+'</small></button>').join('')||'<p class="overview-copy">Select a roof, add a framing set, then enter section and spacing from the project design.</p>';
}
function roofFramingQuantityRows(){const rows=roofFramingResults(),length=rows.reduce((n,r)=>n+r.length,0),volume=rows.reduce((n,r)=>n+(r.volume||0),0),pending=rows.filter(r=>r.status==='Not assessed'||r.volume===null).length;return [{label:'Roof framing centreline length',net:length/1000,waste:0,order:length/1000,unit:'m',basis:ROOF_FRAME_BASIS+' '+pending+' incomplete/unassessed sets.'},{label:'Roof framing gross section envelope',net:volume,waste:0,order:volume,unit:'m³',basis:'Only dimensioned assessed sets included; '+pending+' incomplete/unassessed sets. '+ROOF_FRAME_BASIS}];}
function roofFrameCsv(rows){const cell=v=>{let s=String(v??'');if(typeof v==='string'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return rows.map(r=>r.map(cell).join(',')).join('\n');}
function exportRoofFramingCsv(members=false) {
  const common=['Set ID','Name','Roof ID','Roof','Level','Original face','Role','Status','Width mm','Depth mm','Mode','Spacing on plane mm','Direction','Custom plan angle degrees','First centre offset mm','Centre below face mm','Stock length mm'];
  const evidence=['Material','Grade','Treatment','Product code','Dimension source','Designer revision','Adopted editions','Wind','Loads','Supports','Bracing','Fixings','Notes','Review','Basis'];
  const header=[...common,...(members?['Member ID','Station','Piece','Offset on plane mm','Length mm','Gross envelope m3','Start XYZ JSON mm','End XYZ JSON mm','Exceeds recorded stock']:['Member pieces','Total length mm','Gross envelope m3','Over-stock pieces']),...evidence],rows=[header];
  for(const r of roofFramingResults()) {
    const s=r.row,base=[s.id,s.name,s.roofId,r.roof?.name||'',r.roof?levelName(r.roof.levelId):'',s.face,s.role,r.status,s.width,s.depth,s.mode,s.mode==='array'?s.spacing:'',s.direction,s.direction==='custom'?s.angle:'',s.firstOffset,s.normalOffset,s.stockLength],tail=[s.material,s.grade,s.treatment,s.productCode,s.dimensionSource,s.designRef,s.standardRef,s.wind,s.loads,s.supports,s.bracing,s.fixings,s.notes,[r.reason,...r.review].filter(Boolean).join('; '),ROOF_FRAME_BASIS];
    if(members){for(const m of r.members)rows.push([...base,m.id,m.station,m.piece,m.offset,m.length,m.volume===null?'':m.volume/1e9,JSON.stringify(m.start),JSON.stringify(m.end),s.stockLength===null?'Unknown':m.overStock,...tail]);if(!r.members.length)rows.push([...base,'','','','','','','','','',...tail]);}
    else rows.push([...base,r.status==='Not assessed'?'':r.members.length,r.status==='Not assessed'?'':r.length,r.volume===null?'':r.volume/1e9,s.stockLength===null?'Unknown':r.members.filter(m=>m.overStock).length,...tail]);
  }
  download(members?'bc-design-roof-framing-members.csv':'bc-design-roof-framing-sets.csv',roofFrameCsv(rows),'text/csv');
}
