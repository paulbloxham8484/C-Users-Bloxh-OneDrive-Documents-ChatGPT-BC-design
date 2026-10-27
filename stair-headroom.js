// Explicit selected-floor review. No default clearance, ceiling or regulatory pass.
const STAIR_HEADROOM_CACHE=new WeakMap();
function makeStairHeadroom(){return {floorId:'',required:null,drop:null,source:'',notes:''};}
function validateStairHeadroom(r){
  if(r===undefined)return;
  if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.floorId!=='string'||r.floorId.length>200)throw Error('Choose a valid stair headroom floor reference.');
  for(const k of ['required','drop'])if(r[k]!=null&&(!Number.isFinite(r[k])||r[k]<(k==='required'?1:0)||r[k]>1e6))throw Error('Headroom criterion must be positive; underside allowance non-negative. Use blank for unknown (maximum 1,000,000 mm).');
  for(const k of ['source','notes'])if(r[k]!==undefined&&(typeof r[k]!=='string'||r[k].length>2000))throw Error('Headroom evidence/notes must be text up to 2000 characters.');
}
function normalizeStairHeadroom(s){s.headroomReview={...makeStairHeadroom(),...s.headroomReview};}
function validateHeadroomTargets(raw){
  for(const stair of raw.stairs||[]){const id=stair.headroomReview?.floorId;if(!id)continue;const matches=(raw.floors||[]).filter(f=>String(f.id)===id);if(matches.length>1)throw Error('Ambiguous headroom floor ID.');const f=matches[0];if(!f)continue;
    if(!Number.isFinite(f.elevation)||Math.abs(f.elevation)>1e9||!Number.isFinite(f.thickness)||f.thickness<=0||f.thickness>1e6||!Array.isArray(f.points)||f.points.length<3||f.points.some(p=>![p?.x,p?.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9)))throw Error('Referenced headroom floor needs explicit finite coordinates, elevation and positive thickness before import.');
  }
}
function stairHeadroomComponents(stair){
  const g=stairGeometry(stair),parts=g.flights.map((f,i)=>{const d=unit(sub(f.b,f.a)),start=f.elevation+f.riser,slope=(f.top-start)/f.run;return {key:'flight-'+(i+1),name:'Flight '+(i+1),outline:f.outline,height:p=>start+((p.x-f.a.x)*d.x+(p.y-f.a.y)*d.y)*slope};});
  if(g.landing)parts.push({key:'landing',name:'Landing',outline:g.landing.points,height:()=>g.landing.top});
  return {parts,pending:!['Single flight','Landing preview','Two-flight preview'].includes(g.continuationStatus)?g.continuationStatus:''};
}
function stairHeadroomResult(stair,model=state.model){
  const record=stair.headroomReview||makeStairHeadroom(),matches=(model.floors||[]).filter(f=>f.id===record.floorId),floor=matches.length===1?matches[0]:null;
  const signature=JSON.stringify([stair,floor,matches.length,(model.floorOpenings||[]).filter(r=>r.floorId===record.floorId)]),cached=STAIR_HEADROOM_CACHE.get(stair);if(cached?.signature===signature)return cached.result;
  const result={stair,record,floor,status:'Unassigned floor',reason:'Choose the floor to review; other obstructions are not checked.',components:[],minGap:null,underside:null,assessed:false,geometryAssessed:false};
  function done(){STAIR_HEADROOM_CACHE.set(stair,{signature,result});return result;}
  if(!record.floorId)return done();if(!floor){result.status=matches.length?'Ambiguous floor':'Missing floor';return done();}
  try{
    if(!Number.isFinite(floor.elevation)||!Number.isFinite(floor.thickness)||floor.thickness<=0)throw Error('Selected floor measurements are missing.');
    if(floor.points.length>128||!floorOpeningHostBoundaryValid(floor.points))throw Error('Selected floor boundary is invalid or exceeds 128 vertices.');
    const geometry=floorMeasuredGeometry(floor,model);if(geometry.pending)throw Error(geometry.reason);
    const source=stairHeadroomComponents(stair);if(source.pending)throw Error(source.pending+'; complete the stair before reviewing all components.');
    const origin=floor.points[0],local=p=>({x:p.x-origin.x,y:p.y-origin.y}),world=p=>({x:p.x+origin.x,y:p.y+origin.y}),gross=floorCutTriangles(floor.points.map(local)),retained=geometry.active?geometry.local:gross;
    if(record.drop!=null)result.underside=floor.elevation-floor.thickness-record.drop;
    result.components=source.parts.map(part=>{
      const outline=part.outline.map(local),area=floorCutArea(outline),clip=polys=>polys.map(p=>roofJunctionClip(outline,p)).filter(p=>p.length&&floorCutArea(p)>1e-12),grossPieces=clip(gross),pieces=clip(retained);
      const covered=pieces.reduce((s,p)=>s+floorCutArea(p),0),grossOverlap=grossPieces.reduce((s,p)=>s+floorCutArea(p),0),row={...part,area,covered,cutArea:Math.max(0,grossOverlap-covered),outsideArea:Math.max(0,area-grossOverlap),pieces:pieces.map(p=>p.map(world)),lowPieces:[],lowArea:null,minGap:null,worst:null};
      if(result.underside!=null){for(const polygon of row.pieces)for(const p of polygon){const z=part.height(p),gap=result.underside-z;if(row.minGap===null||gap<row.minGap){row.minGap=gap;row.worst={...p,z};}}
        if(record.required!=null){row.lowPieces=pieces.map(p=>roofTrimHalf(p,q=>record.required-(result.underside-part.height(world(q)))-1e-6)).filter(p=>p.length).map(p=>p.map(world));row.lowArea=row.lowPieces.reduce((s,p)=>s+floorCutArea(p),0);}
      }return row;
    });
    result.geometryAssessed=true;const gaps=result.components.map(p=>p.minGap).filter(Number.isFinite);result.minGap=gaps.length?Math.min(...gaps):null;
    const overlap=result.components.some(p=>p.covered>1e-12);
    result.status=!overlap?'No retained slab in plan footprint':record.drop==null?'Underside allowance pending':record.required==null?'Clearance criterion pending':result.minGap<0?'Floor / underside below nosing reference':result.minGap<record.required-1e-6?'Below entered clearance':'At / above entered clearance';
    result.assessed=overlap&&record.drop!=null&&record.required!=null;
    result.reason='Selected floor only; vertical gap above full-width nosing planes and horizontal landing tops. Apertures/outside-floor portions have no assessed overhead limit. Other floors, beams, finishes, services, rails, access width and regulatory compliance are not checked.';
  }catch(error){result.status='Headroom unassessed';result.reason=error.message;}
  return done();
}
function stairHeadroomResults(){return state.model.stairs.map(s=>stairHeadroomResult(s));}
function headroomVisible(r,mode){return state.visibility.stairHeadroom&&r.record.floorId&&(mode==='3d'?(isLevelVisible3d(r.stair)||(r.floor&&isLevelVisible3d(r.floor))):[r.stair.levelId,r.floor?.levelId].includes(state.model.activeLevelId));}
function stairHeadroomBounds(){return stairHeadroomResults().flatMap(r=>r.components.flatMap(p=>p.outline.flatMap(q=>[{...q,z:p.height(q)},...(r.underside==null?[]:[{...q,z:r.underside}])])));}
function drawStairHeadroom(mode){
  const is3d=mode==='3d',labels=[];
  for(const r of stairHeadroomResults().filter(r=>headroomVisible(r,mode))){
    ctx.save();ctx.lineWidth=1.5;ctx.setLineDash([5,3]);
    if(!r.components.length){const p=is3d?isoPoint(r.stair.a,r.stair.elevation):worldToScreen(r.stair.a);ctx.strokeStyle='#a45c21';ctx.fillStyle='#a45c21';ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();ctx.font='11px Segoe UI';ctx.fillText('Headroom ?',p.x+9,p.y-8);}
    for(const c of r.components){const project=p=>is3d?isoPoint(p,c.height(p)):worldToScreen(p);polygon(c.outline.map(project),'rgba(58,130,137,.04)','#3a8289');ctx.setLineDash([]);floorCutPath(c.pieces,project);ctx.fillStyle='rgba(58,130,137,.18)';ctx.fill();floorCutPath(c.lowPieces,project);ctx.fillStyle='rgba(192,78,39,.35)';ctx.fill();
      const centre=c.outline.reduce((a,p)=>({x:a.x+p.x/c.outline.length,y:a.y+p.y/c.outline.length}),{x:0,y:0}),anchor=c.worst||centre,p=project(anchor);
      ctx.strokeStyle='#a45c21';ctx.fillStyle='#7e4b22';if(is3d&&c.worst){const q=isoPoint(c.worst,r.underside);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.beginPath();ctx.arc(q.x,q.y,4,0,Math.PI*2);ctx.stroke();}
      ctx.font='11px Segoe UI';const text=`${c.name}: ${c.minGap==null?'gap unassessed':formatNumber(c.minGap,1)+' mm gap'}`,x=p.x+8,w=ctx.measureText(text).width;let y=p.y-8;while(labels.some(b=>x<b.x+b.w+4&&x+w+4>b.x&&y>b.y-14&&y-14<b.y))y+=16;labels.push({x,y,w});ctx.fillText(text,x,y);
    }ctx.restore();
  }
}
function hitStairHeadroom(p){const r=stairHeadroomResults().reverse().find(r=>headroomVisible(r,'plan')&&(r.components.some(c=>pointInPolygon(p,c.outline))||lengthBetween(p,r.stair.a)<12/state.view.scale));return r?{type:'stair',id:r.stair.id}:null;}
function updateStairHeadroom(field,value){if(state.selected?.type!=='stair')return;const stair=selectedObject(),next={...makeStairHeadroom(),...stair.headroomReview};if(['required','drop'].includes(field))next[field]=value.trim()?Number(value):null;else if(['floorId','source','notes'].includes(field))next[field]=value.slice(0,field==='floorId'?200:2000);else return;try{validateStairHeadroom(next);}catch(e){state.statusMessage=e.message;render();return;}withHistory(()=>{stair.headroomReview=next;state.visibility.stairHeadroom=true;});}
function renderStairHeadroomDetails(stair){
  const r=stairHeadroomResult(stair),v=r.record,options=[['','Unassigned'],...state.model.floors.map(f=>[f.id,`${f.name||f.id} · ${levelName(f.levelId)}`])];if(v.floorId&&!options.some(o=>o[0]===v.floorId))options.push([v.floorId,'Missing saved floor: '+v.floorId]);
  const field=(label,key,type='text')=>`<div class="inspector-field"><label for="sh-${key}">${label}</label><input id="sh-${key}" data-headroom-field="${key}" type="${type}" ${type==='number'?'step="any"':'maxlength="2000"'} value="${escapeHtml(v[key]??'')}" /></div>`;
  return `<h3 class="reinforcement-heading">Stair opening / headroom review</h3><div class="inspector-field"><label for="sh-floorId">Floor slab to review</label><select id="sh-floorId" data-headroom-field="floorId">${options.map(([id,label])=>`<option value="${escapeHtml(id)}" ${id===v.floorId?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></div><div class="field-grid">${field('Entered minimum vertical clearance (mm)','required','number')}${field('Uniform drop below slab underside (mm; enter 0 for none)','drop','number')}${field('Project criteria / drawing evidence','source')}${field('Review notes','notes')}</div><p class="overview-copy">${escapeHtml(r.status)}${r.minGap==null?'':` · minimum signed gap ${formatNumber(r.minGap,1)} mm`}</p>${r.components.map(c=>`<p class="overview-copy">${c.name}: ${formatArea(c.covered)} beneath retained slab · ${formatArea(c.cutArea)} beneath applied apertures · ${formatArea(c.outsideArea)} outside floor.${c.lowArea==null?'':` ${formatArea(c.lowArea)} below entered criterion.`}</p>`).join('')}<p class="warning-note">${escapeHtml(r.reason)}${!v.source?' Record the project criteria and drawing evidence.':''}</p><p class="overview-copy">First-flight nosing reference starts at the first tread top, one riser above the base, and ends at the upper nosing. Continuation flights follow the same rule; landings use their top. The uniform underside drop is entered geometry, not an automatically detected ceiling. Blank values remain unknown. Negative gaps show that the selected underside lies below the reference. Footprint areas are per component, not material quantities or proof of an accessible opening. Review project-specific dimensions and documentation using <a href="https://www.bpc.vic.gov.au/resource-hub/industry-updates/meeting-the-structural-requirements-for-stair-and-barrier-design" target="_blank" rel="noopener">BPC guidance</a> (checked 26 October 2026); confirm the adopted NCC/standards with the designer.</p>`;
}
function renderStairHeadroomSchedule(){const el=document.querySelector('#stairHeadroomSchedule');if(!el)return;el.innerHTML=stairHeadroomResults().map(r=>`<button type="button" class="foundation-schedule-row" data-headroom-stair="${escapeHtml(r.stair.id)}"><strong>${escapeHtml(r.stair.name)} · ${escapeHtml(r.floor?.name||r.record.floorId||'Unassigned floor')}</strong><span>${escapeHtml(r.status)}</span><small>${r.minGap==null?'Gap unassessed':formatNumber(r.minGap,1)+' mm minimum signed gap'} · ${r.components.length} component(s)</small></button>`).join('')||'<p class="overview-copy">Select a stair to review an explicit floor.</p>';}
function selectStairHeadroom(id){const s=state.model.stairs.find(s=>s.id===id);if(!s)return;state.model.activeLevelId=s.levelId;state.selected={type:'stair',id};state.visibility.stairHeadroom=true;render();document.querySelector('#sh-floorId')?.scrollIntoView?.({block:'nearest'});}
function exportStairHeadroomCsv(){const rows=[['Stair ID','Stair','Stair level','Floor ID','Floor level','Component','Status','Entered clearance mm','Underside drop mm','Effective underside mm','Component footprint m2','Retained slab overlap m2','Applied aperture overlap m2','Outside floor m2','Below criterion footprint m2','Minimum signed gap mm','Worst X mm','Worst Y mm','Nosing or landing Z mm','Evidence','Notes','Basis'],...stairHeadroomResults().flatMap(r=>(r.components.length?r.components:[null]).map(c=>[r.stair.id,r.stair.name,levelName(r.stair.levelId),r.record.floorId,r.floor?levelName(r.floor.levelId):'',c?.name||'',r.status,r.record.required,r.record.drop,r.underside,c?c.area/1e6:null,c?c.covered/1e6:null,c?c.cutArea/1e6:null,c?c.outsideArea/1e6:null,c?.lowArea==null?null:c.lowArea/1e6,c?.minGap,c?.worst?.x,c?.worst?.y,c?.worst?.z,r.record.source,r.record.notes,r.reason+'; per-component areas may overlap; no access, structural, regulatory or procurement assessment']))];const cell=v=>{let s=String(v??'');if(typeof v==='string'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};download('bc-design-stair-headroom.csv',rows.map(r=>r.map(cell).join(',')).join('\n'),'text/csv');}
