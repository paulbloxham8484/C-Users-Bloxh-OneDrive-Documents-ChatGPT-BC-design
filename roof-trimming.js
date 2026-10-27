/* Explicit roof groups: finite upper/lower surface envelopes. Original dimensions remain editable. */
const ROOF_JOIN_MODES=['independent','upper','lower'];
let roofTrimCacheKey='',roofTrimCache=null;

function roofJoinGroups(model) {
  const roofs=new Map((model.roofs||[]).map(r=>[r.id,r])),links=(model.roofJunctions||[]).filter(r=>r.joinMode&&r.joinMode!=='independent'&&roofs.has(r.roofAId)&&roofs.has(r.roofBId)),pending=(model.roofJunctions||[]).filter(r=>r.joinMode&&r.joinMode!=='independent'&&(!roofs.has(r.roofAId)||!roofs.has(r.roofBId)));
  const groups=[],seen=new Set(),pairs=new Set();
  for(const r of links){const pair=JSON.stringify([r.roofAId,r.roofBId].sort());if(pairs.has(pair))throw new Error('Use one active trimming record per roof pair.');pairs.add(pair);}
  for(const link of links)if(!seen.has(link.roofAId)) {
    const ids=new Set([link.roofAId]),queue=[link.roofAId];
    while(queue.length){const id=queue.pop();seen.add(id);for(const r of links){const other=r.roofAId===id?r.roofBId:r.roofBId===id?r.roofAId:null;if(other&&!ids.has(other)){ids.add(other);queue.push(other);}}}
    const records=links.filter(r=>ids.has(r.roofAId)),modes=new Set(records.map(r=>r.joinMode));
    if(modes.size!==1)throw new Error('All junctions in a joined roof group must use the same higher/lower surface choice.');
    if(ids.size>32)throw new Error('A joined roof group supports at most 32 roofs.');
    groups.push({roofs:[...ids].map(id=>roofs.get(id)),records,mode:[...modes][0]});
  }
  return {groups,pending};
}
function validateRoofJoinConfiguration(model){roofJoinGroups(model);}
function roofTrimClean(poly) {
  const clean=[];for(const p of poly)if(!clean.length||Math.hypot(p.x-clean.at(-1).x,p.y-clean.at(-1).y)>ROOF_JUNCTION_EPS)clean.push(p);
  if(clean.length>1&&Math.hypot(clean[0].x-clean.at(-1).x,clean[0].y-clean.at(-1).y)<=ROOF_JUNCTION_EPS)clean.pop();
  return clean.length>=3&&Math.abs(roofJunctionArea(clean))>ROOF_JUNCTION_EPS**2?clean:[];
}
function roofTrimHalf(poly,distance,positive=true) {
  if(!poly.length)return [];
  const result=[],sign=positive?1:-1;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a)*sign,db=distance(b)*sign,insideA=da>=0,insideB=db>=0;
    if(insideA)result.push(a);
    if(insideA!==insideB){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
  }
  return roofTrimClean(result);
}
function roofTrimDifference(subject,cutter) {
  if(!cutter.length||Math.abs(roofJunctionArea(roofJunctionClip(subject,cutter)))<=ROOF_JUNCTION_EPS**2)return [subject];
  const sign=Math.sign(roofJunctionArea(cutter)),outside=[];let inside=subject;
  for(let i=0;i<cutter.length&&inside.length;i++){
    const a=cutter[i],b=cutter[(i+1)%cutter.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<=ROOF_JUNCTION_EPS)continue;
    const distance=p=>sign*(dx*(p.y-a.y)-dy*(p.x-a.x))/len,part=roofTrimHalf(inside,distance,false);
    if(part.length)outside.push(part);inside=roofTrimHalf(inside,distance,true);
  }
  return outside;
}
function roofTrimMetrics(poly,plane,bottom) {
  const o=poly[0];let area=0,volume=0;
  for(let i=1;i<poly.length-1;i++){
    const a=poly[i],b=poly[i+1],part=Math.abs((a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x))/2;
    area+=part;volume+=part*((plane.height(o)+plane.height(a)+plane.height(b))/3-bottom);
  }
  return {planArea:area,surfaceArea:area*Math.hypot(1,plane.a,plane.b),volume};
}
function roofTrimContains(poly,p) {
  const sign=Math.sign(roofJunctionArea(poly));
  return poly.every((a,i)=>{const b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y;return sign*(dx*(p.y-a.y)-dy*(p.x-a.x))>=-ROOF_JUNCTION_EPS*Math.hypot(dx,dy);});
}
// Split at T junctions before discarding internal edges of fragments from the same original plane.
function roofTrimBoundary(pieces) {
  const edges=[];
  for(const [index,poly] of pieces.entries())for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<=ROOF_JUNCTION_EPS)continue;
    const cuts=[0,1];
    for(const other of pieces)for(const p of other){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len);if(t>0&&t<1&&Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/len<=ROOF_JUNCTION_EPS)cuts.push(t);}
    cuts.sort((x,y)=>x-y);
    for(let j=1;j<cuts.length;j++){
      const t=cuts[j-1],u=cuts[j];if((u-t)*len<=ROOF_JUNCTION_EPS)continue;
      const mid={x:a.x+dx*(t+u)/2,y:a.y+dy*(t+u)/2};
      if(pieces.some((other,k)=>k!==index&&roofTrimContains(other,mid)))continue;
      edges.push([{x:a.x+dx*t,y:a.y+dy*t},{x:a.x+dx*u,y:a.y+dy*u}]);
    }
  }
  return edges;
}
function roofTrimGroup(group) {
  const origin={x:group.roofs[0].center.x,y:group.roofs[0].center.y,z:group.roofs[0].elevation},sources=group.roofs.map(roof=>{
    const geometry=roofGeometry(roof),faces=geometry.planes.map(face=>roofJunctionPlane(face,origin));
    if(faces.some(p=>!p))throw new Error('Roof planes are numerically unresolved.');
    return {roof,geometry,faces};
  });
  const results=[];
  for(const source of sources){
    const {roof,geometry}=source,faces=[];let planArea=0,surfaceArea=0,volume=0;
    const ownsTie=other=>(roof.joinPriority||0)>(other.joinPriority||0)||(roof.joinPriority||0)===(other.joinPriority||0)&&roof.id<other.id;
    for(const [faceIndex,plane] of source.faces.entries()){
      let pieces=[plane.points.map(p=>({x:p.x,y:p.y}))];
      for(const other of sources)if(other.roof.id!==roof.id)for(const otherPlane of other.faces){
        let cutter=otherPlane.points.map(p=>({x:p.x,y:p.y}));
        const diff=p=>(otherPlane.height(p)-plane.height(p))*(group.mode==='upper'?1:-1),values=cutter.map(diff);
        if(!values.every(Number.isFinite))throw new Error('Roof comparison exceeds reliable numeric limits.');
        if(values.every(v=>Math.abs(v)<=ROOF_JUNCTION_EPS)){if(ownsTie(other.roof))continue;}
        else cutter=roofTrimHalf(cutter,diff,true);
        if(!cutter.length)continue;
        pieces=pieces.flatMap(poly=>roofTrimDifference(poly,cutter));
        if(pieces.length>256)throw new Error('Trim complexity exceeds 256 fragments per original plane; split the roof group.');
      }
      const world=p=>({x:p.x+origin.x,y:p.y+origin.y,z:plane.height(p)+origin.z});
      for(const poly of pieces){const m=roofTrimMetrics(poly,plane,geometry.bottom-origin.z);planArea+=m.planArea;surfaceArea+=m.surfaceArea;volume+=m.volume;}
      faces.push({faceIndex,plane,local:pieces,polygons:pieces.map(poly=>poly.map(world)),edges:roofTrimBoundary(pieces).map(edge=>edge.map(world)),origin});
    }
    if(![planArea,surfaceArea,volume].every(Number.isFinite))throw new Error('Trim quantities exceed reliable numeric limits.');
    const removedArea=Math.max(0,geometry.surfaceArea-surfaceArea);
    results.push({roof,geometry,faces,planArea,surfaceArea,volume,removedArea,group,active:true,status:surfaceArea<=ROOF_JUNCTION_EPS**2?'Fully trimmed':removedArea>ROOF_JUNCTION_EPS**2?'Trimmed':'Retained unchanged',basis:'Retained top surfaces; envelope columns extend to each owning roof’s original underside. Not a solid union or material quantity.'});
  }
  return results;
}
function roofTrimSegmentInterval(start,end,polygon) {
  let low=0,high=1;const sign=Math.sign(roofJunctionArea(polygon));
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<=ROOF_JUNCTION_EPS)continue;
    const f=p=>sign*(dx*(p.y-a.y)-dy*(p.x-a.x))/len,first=f(start),last=f(end),delta=last-first;
    if(Math.abs(delta)<=ROOF_JUNCTION_EPS){if(first<-ROOF_JUNCTION_EPS)return null;continue;}
    const t=-first/delta;if(delta>0)low=Math.max(low,t);else high=Math.min(high,t);
    if(high<low)return null;
  }
  return high>low?[Math.max(0,low),Math.min(1,high)]:null;
}
function roofTrimValleys(group,results) {
  if(group.mode!=='upper')return [];
  const records=[],pairs=[];
  // Group links are transitive: preview every surviving inter-roof seam, including unrecorded pairs.
  for(let i=0;i<results.length;i++)for(let j=i+1;j<results.length;j++)pairs.push([results[i],results[j]]);
  for(const [a,b] of pairs){
    const explicit=group.records.filter(row=>[row.roofAId,row.roofBId].includes(a.roof.id)&&[row.roofAId,row.roofBId].includes(b.roof.id));
    const row=explicit[0]||{kind:'unspecified',designRef:'',standardRef:'',flashing:'',drainage:'',notes:'',id:'derived:'+JSON.stringify([a.roof.id,b.roof.id]),roofBId:b.roof.id,name:a.roof.name+' / '+b.roof.name,showValley:true,valleyWidth:null};
    if(explicit.length&&explicit.every(r=>r.showValley===false))continue;
    const review=roofJunctionReview({...row,roofAId:a.roof.id,roofBId:b.roof.id}),segments=[];
    for(const segment of review.segments.filter(s=>!s.contact)){
      const faceA=a.faces[segment.faceA-1],faceB=b.faces[segment.faceB-1],origin=faceA.origin;
      const start={x:segment.start.x-origin.x,y:segment.start.y-origin.y},end={x:segment.end.x-origin.x,y:segment.end.y-origin.y},intervals=[];
      for(const pa of faceA.local)for(const pb of faceB.local){const ia=roofTrimSegmentInterval(start,end,pa),ib=roofTrimSegmentInterval(start,end,pb);if(ia&&ib){const low=Math.max(ia[0],ib[0]),high=Math.min(ia[1],ib[1]);if((high-low)*segment.plan>ROOF_JUNCTION_EPS)intervals.push([low,high]);}}
      intervals.sort((x,y)=>x[0]-y[0]);const merged=[];
      for(const interval of intervals){const last=merged.at(-1);if(last&&(interval[0]-last[1])*segment.plan<=ROOF_JUNCTION_EPS)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
      const point=t=>({x:segment.start.x+(segment.end.x-segment.start.x)*t,y:segment.start.y+(segment.end.y-segment.start.y)*t,z:segment.start.z+(segment.end.z-segment.start.z)*t});
      for(const [low,high] of merged){const s=point(low),e=point(high);segments.push({...segment,start:s,end:e,length:segment.length*(high-low),plan:segment.plan*(high-low)});}
    }
    if(segments.length)records.push({row,a,b,segments,length:segments.reduce((n,s)=>n+s.length,0),plan:segments.reduce((n,s)=>n+s.plan,0),derived:!explicit.length});
  }
  return records;
}
function joinedRoofState(model=state.model) {
  const key=JSON.stringify([model.roofs,model.roofJunctions]);if(key===roofTrimCacheKey&&roofTrimCache)return roofTrimCache;
  const {groups,pending}=roofJoinGroups(model),byRoof=new Map(),valleys=[],issues=[];
  for(const group of groups){try{const results=roofTrimGroup(group),preview=roofTrimValleys(group,results);for(const r of results)byRoof.set(r.roof.id,r);valleys.push(...preview);}catch(error){issues.push({group,reason:error.message});}}
  roofTrimCacheKey=key;roofTrimCache={byRoof,valleys,groups,pending,issues};return roofTrimCache;
}
function roofMeasuredGeometry(roof,model=state.model){const state=joinedRoofState(model),retained=state.byRoof.get(roof.id);if(retained)return retained;const issue=state.issues.find(i=>i.group.roofs.some(r=>r.id===roof.id)),pending=state.pending.some(r=>[r.roofAId,r.roofBId].includes(roof.id));return {...roofGeometry(roof),active:false,status:issue?'Join unassessed':pending?'Join pending':'Original',removedArea:0,basis:issue?'Join unassessed: '+issue.reason+' Original overlapping roof quantities retained.':pending?'Join reference missing; original overlapping roof quantities retained.':'Original independent roof; source ridge/hip lengths remain untrimmed.'};}
function roofHasJoin(roof){return joinedRoofState().byRoof.has(roof.id);}
function roofJoinQuantityReview(){const s=joinedRoofState();return s.issues.length||s.pending.length?'Some joins are pending/unassessed; original overlapping quantities remain for those roofs.':'';}
function roofTrimSummary(roof){const r=roofMeasuredGeometry(roof);if(!r.active)return r.status==='Original'?'':'<div class="warning-note">'+escapeHtml(r.status+' — '+r.basis)+'</div>';return r.active?'<p class="overview-copy"><strong>'+r.status+' · '+r.group.mode+' surface group</strong><br>Original slope '+formatArea(r.geometry.surfaceArea)+' · retained '+formatArea(r.surfaceArea)+' · removed '+formatArea(r.removedArea)+'. Retained plan '+formatArea(r.planArea)+' · envelope columns '+formatNumber(r.volume/1e9,3)+' m³. Source ridge/hip lengths remain untrimmed. Coplanar priority only controls coincident ownership; it does not change height. Joined surfaces and valley previews use independent layers.</p>':'';}
function roofTrimProperties(row) {
  const result=joinedRoofState(),a=result.byRoof.get(row.roofAId),b=result.byRoof.get(row.roofBId),active=a&&b,valleys=result.valleys.filter(v=>[v.a.roof.id,v.b.roof.id].includes(row.roofAId)&&[v.a.roof.id,v.b.roof.id].includes(row.roofBId));
  const mode=row.joinMode||'independent';
  return '<h3>Joined roof trimming</h3><div class="field-grid"><div class="inspector-field full"><label for="junction-joinMode">Retain overlapping surfaces</label><select id="junction-joinMode" data-field="joinMode">'+[['independent','Independent — no trimming'],['upper','Higher surface — valley preview'],['lower','Lower surface — ridge / hip preview']].map(([value,label])=>'<option value="'+value+'" '+(mode===value?'selected':'')+'>'+label+'</option>').join('')+'</select></div><div class="inspector-field full"><label for="junction-showValley">Valley preview for this pair</label><select id="junction-showValley" data-field="showValley"><option value="true" '+(row.showValley!==false?'selected':'')+'>Show preview</option><option value="false" '+(row.showValley===false?'selected':'')+'>Hide preview</option></select></div><div class="inspector-field full"><label for="junction-valleyWidth">Optional plan preview width</label><input id="junction-valleyWidth" type="number" min="0" max="1000000" step="any" data-field="valleyWidth" value="'+escapeHtml(row.valleyWidth??'')+'" /><span class="field-unit">mm</span></div></div><p class="overview-copy">'+(active?'Joined group: '+a.group.roofs.length+' roofs · retained slope area '+formatArea(a.surfaceArea+b.surfaceArea)+' for this pair. Valley preview '+formatLength(valleys.reduce((n,v)=>n+v.length,0))+'.':mode!=='independent'?'Join pending/unassessed; original quantities retained.':'Original surfaces and quantities retained.')+'</p>'+result.issues.filter(i=>i.group.records.some(r=>r.id===row.id)).map(i=>'<div class="warning-note">Not trimmed: '+escapeHtml(i.reason)+'</div>').join('')+'<p class="overview-copy">Links join a whole connected group using one higher/lower rule. Coplanar surfaces belong to the roof with higher join priority; equal priorities use stable ID order. Width is an optional horizontal visual corridor, not gutter sheet width, capacity or a product quantity. Lower-surface joins do not show valley previews. Source dimensions remain editable; layer switches do not change quantities.</p>';
}
function drawJoinedRoofs(is3d=false) {
  if(state.visibility.joinedRoofs===false)return;
  const faces=[];
  for(const r of joinedRoofState().byRoof.values())if(is3d?isLevelVisible3d(r.roof):r.roof.levelId===state.model.activeLevelId)for(const face of r.faces)faces.push({r,face});
  faces.sort((a,b)=>a.face.polygons.flat().reduce((n,p)=>n+p.x+p.y,0)/Math.max(1,a.face.polygons.flat().length)-b.face.polygons.flat().reduce((n,p)=>n+p.x+p.y,0)/Math.max(1,b.face.polygons.flat().length));
  const project=p=>is3d?isoPoint(p,p.z):worldToScreen(p);
  for(const {r,face} of faces){ctx.save();ctx.fillStyle=is3d?['#d9b27e','#b78750','#c79860','#d0a16b'][face.faceIndex%4]:'rgba(188,126,49,.20)';for(const poly of face.polygons){const points=poly.map(project);ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();}ctx.strokeStyle=state.selected?.type==='roof'&&state.selected.id===r.roof.id?'#ed1c24':'#916539';ctx.lineWidth=1;for(const edge of face.edges){const [a,b]=edge.map(project);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.restore();}
}
function drawRoofValleys(is3d=false) {
  if(state.visibility.roofValleys===false)return;
  const project=p=>is3d?isoPoint(p,p.z):worldToScreen(p);
  for(const valley of joinedRoofState().valleys){if(!roofJunctionVisible({a:valley.a.roof,b:valley.b.roof},is3d))continue;
    ctx.save();ctx.strokeStyle='#176ab1';ctx.fillStyle='rgba(23,106,177,.22)';ctx.lineWidth=3;
    for(const s of valley.segments){const start=project(s.start),end=project(s.end);
      if(valley.row.valleyWidth>0){const nx=-(s.end.y-s.start.y)/s.plan*valley.row.valleyWidth/2,ny=(s.end.x-s.start.x)/s.plan*valley.row.valleyWidth/2;
        for(const r of [valley.a,valley.b])for(const face of r.faces){const o=face.origin,band=[{x:s.start.x+nx-o.x,y:s.start.y+ny-o.y},{x:s.end.x+nx-o.x,y:s.end.y+ny-o.y},{x:s.end.x-nx-o.x,y:s.end.y-ny-o.y},{x:s.start.x-nx-o.x,y:s.start.y-ny-o.y}];for(const poly of face.local){const clipped=roofTrimClean(roofJunctionClip(poly,band));if(!clipped.length)continue;const points=clipped.map(p=>project({x:p.x+o.x,y:p.y+o.y,z:face.plane.height(p)+o.z}));ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();}}
      }
      ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
      const high=s.start.z>=s.end.z?start:end,low=high===start?end:start,dx=low.x-high.x,dy=low.y-high.y,len=Math.hypot(dx,dy);
      if(Math.abs(s.end.z-s.start.z)>ROOF_JUNCTION_EPS&&len>0){const x=high.x+dx*.65,y=high.y+dy*.65;ctx.beginPath();ctx.moveTo(x-dx/len*7-dy/len*4,y-dy/len*7+dx/len*4);ctx.lineTo(x,y);ctx.lineTo(x-dx/len*7+dy/len*4,y-dy/len*7-dx/len*4);ctx.stroke();}
    }
    ctx.restore();
  }
}
function hitRoofValley(p){if(state.visibility.roofValleys===false)return null;for(const v of joinedRoofState().valleys)if(!v.derived&&roofJunctionVisible({a:v.a.roof,b:v.b.roof})&&v.segments.some(s=>distanceToSegment(p,s.start,s.end).distance<8/state.view.scale))return {type:'roofJunction',id:v.row.id};return null;}
function exportRoofValleyCsv(){const rows=[['Junction ID','Name','Derived group pair','Roof A','Roof B','Segment','3D length mm','Plan run mm','Absolute rise mm','Start XYZ JSON mm','End XYZ JSON mm','Plan preview width mm','Basis']];for(const v of joinedRoofState().valleys)v.segments.forEach((s,i)=>rows.push([v.row.id,v.row.name,v.derived,v.a.roof.id,v.b.roof.id,i+1,s.length,s.plan,Math.abs(s.rise),JSON.stringify(s.start),JSON.stringify(s.end),v.row.valleyWidth??'','Retained higher-surface seam only; preview width is horizontal, not gutter sizing or product order.']));const cell=value=>{let s=String(value??'');if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};download('bc-design-valley-previews.csv',rows.map(r=>r.map(cell).join(',')).join('\n'),'text/csv');}
