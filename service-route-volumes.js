/* Explicit outside cross-sections and finite straight segment envelopes.
 * Cylinder/box test independently implements the slab/projection/hull method in
 * David Eberly, Intersection of a Box and a Finite Cylinder, section 3:
 * https://www.geometrictools.com/Documentation/IntersectionBoxCylinder.pdf
 * Rectangular volumes use separating axes. No sizes, fittings or compliance inferred.
 */
const SERVICE_VOLUME_EPS=1e-6; // mm: numerical contact handling, not a design clearance
const SERVICE_SECTION_FIELDS=['shape','diameter','width','height','roll','sourceRef','notes'];
const svAdd=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const svSub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const svScale=(a,t)=>({x:a.x*t,y:a.y*t,z:a.z*t});
const svDot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const svCross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const svLength=a=>Math.hypot(a.x,a.y,a.z);
const svUnit=a=>svScale(a,1/svLength(a));
function makeServiceCrossSection(){return {shape:'round',diameter:'',width:'',height:'',roll:'0',sourceRef:'',notes:''};}
function serviceSectionDimensions(route) {
  const c=route.crossSection;if(!c)return null;
  const keys=c.shape==='round'?['diameter']:['width','height','roll'];
  if(keys.some(k=>!c[k].trim()))return null;
  const width=Number(c.shape==='round'?c.diameter:c.width),height=Number(c.shape==='round'?c.diameter:c.height);
  return {shape:c.shape,width,height,roll:c.shape==='round'?0:Number(c.roll),area:c.shape==='round'?Math.PI*(width/2)**2:width*height};
}
function validateServiceCrossSection(route) {
  const c=route.crossSection;if(c===undefined||c===null)return;
  if(typeof c!=='object'||Array.isArray(c)||SERVICE_SECTION_FIELDS.some(k=>typeof c[k]!=='string'||c[k].length>2000)||!['round','rectangular'].includes(c.shape))throw new Error('Cross-section needs a supported shape and text fields up to 2000 characters.');
  for(const key of ['diameter','width','height','roll'])if(c[key].trim()&&(!Number.isFinite(Number(c[key]))||(key!=='roll'&&Number(c[key])<=0)))throw new Error('Outside dimensions must be positive and roll finite. Leave unknown dimensions blank.');
  const d=serviceSectionDimensions(route);
  if(d&&(!Number.isFinite(d.area)||!Number.isFinite(d.area*serviceGeometry(route).length)))throw new Error('Cross-section area or gross envelope volume exceeds numeric limits.');
}
function serviceSectionReview(route) {
  const c=route.crossSection,issues=[];
  if(!c)return ['Cross-section not recorded'];
  if(!serviceSectionDimensions(route))issues.push('Outside dimensions incomplete'+(c.shape==='rectangular'?' (width, height and roll required)':''));
  if(!c.sourceRef.trim())issues.push('Cross-section dimensions source unspecified');
  return issues;
}
function serviceSectionLabel(route) {
  const c=route.crossSection;if(!c)return 'No section';
  return c.shape==='round'?'Round Ø '+(c.diameter.trim()||'?')+' mm':
    'Rectangular '+(c.width.trim()||'?')+' × '+(c.height.trim()||'?')+' mm · roll '+(c.roll.trim()||'?')+'°';
}
function serviceSegmentVolume(route,segment,index) {
  const d=serviceSectionDimensions(route);if(!d)return null;
  const n=svUnit(svSub(segment.b,segment.a)),horizontal=Math.hypot(n.x,n.y);
  const side=horizontal>1e-12?{x:-n.y/horizontal,y:n.x/horizontal,z:0}:{x:1,y:0,z:0};
  const up=svCross(n,side),roll=(d.roll%360)*Math.PI/180;
  const u=svAdd(svScale(side,Math.cos(roll)),svScale(up,Math.sin(roll))),v=svCross(n,u);
  const center=svAdd(segment.a,svScale(svSub(segment.b,segment.a),.5));
  const half=[segment.length/2,d.width/2,d.height/2],axes=[n,u,v];
  const extent=axis=>d.shape==='round'?Math.abs(n[axis])*half[0]+half[1]*Math.hypot(u[axis],v[axis]):axes.reduce((sum,a,i)=>sum+Math.abs(a[axis])*half[i],0);
  const bounds=Object.fromEntries(['x','y','z'].map(axis=>[axis,[center[axis]-extent(axis),center[axis]+extent(axis)]]));
  const coordinateValues=[...Object.values(center),...Object.values(bounds).flat()];
  if(half.some(h=>h<=SERVICE_VOLUME_EPS)||coordinateValues.some(value=>!Number.isFinite(value)||Math.abs(value)*Number.EPSILON>SERVICE_VOLUME_EPS))return null;
  return {route,segment,index,shape:d.shape,center,axes,half,bounds,area:d.area,volume:d.area*segment.length};
}
function serviceVolumeGeometry(route) {
  const d=serviceSectionDimensions(route);if(!d)return {segments:[],reason:serviceSectionReview(route)[0]};
  const segments=serviceGeometry(route).segments.map((s,i)=>serviceSegmentVolume(route,s,i+1));
  if(segments.some(s=>!s))return {segments:[],reason:'Dimensions/coordinates are outside the reliable numerical resolution'};
  return {segments,area:d.area,volume:segments.reduce((sum,s)=>sum+s.volume,0),reason:''};
}
function svBoxVertices(center,axes,half) {
  return Array.from({length:8},(_,i)=>axes.reduce((p,axis,j)=>svAdd(p,svScale(axis,(i&(1<<j)?1:-1)*half[j])),center));
}
function svHull(points) {
  const sorted=points.map(p=>({x:p.x,y:p.y})).sort((a,b)=>a.x-b.x||a.y-b.y).filter((p,i,a)=>!i||Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y)>SERVICE_VOLUME_EPS);
  if(sorted.length<3)return sorted;
  const turn=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lower=[],upper=[];
  for(const p of sorted){while(lower.length>1&&turn(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of [...sorted].reverse()){while(upper.length>1&&turn(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function svPolygonDistance(hull) {
  if(!hull.length)return Infinity;
  if(hull.length===1)return Math.hypot(hull[0].x,hull[0].y);
  let inside=hull.length>=3,distance=Infinity;
  for(let i=0;i<hull.length;i++) {
    const a=hull[i],b=hull[(i+1)%hull.length],dx=b.x-a.x,dy=b.y-a.y;
    if(dx*(-a.y)-dy*(-a.x)<-SERVICE_VOLUME_EPS*Math.hypot(dx,dy))inside=false;
    const length2=dx*dx+dy*dy,t=length2?clamp(-(a.x*dx+a.y*dy)/length2,0,1):0;
    distance=Math.min(distance,Math.hypot(a.x+t*dx,a.y+t*dy));
  }
  return inside?0:distance;
}
function svBoxesOverlap(a,b) {
  const delta=svSub(b.center,a.center),directions=[...a.axes,...b.axes];
  for(const x of a.axes)for(const y of b.axes){const axis=svCross(x,y);if(svLength(axis)>1e-10)directions.push(svUnit(axis));}
  for(const axis of directions) {
    const radius=shape=>shape.axes.reduce((sum,v,i)=>sum+Math.abs(svDot(v,axis))*shape.half[i],0);
    if(radius(a)+radius(b)-Math.abs(svDot(delta,axis))<=SERVICE_VOLUME_EPS)return false;
  }
  return true;
}
function svCylinderBoxOverlap(cylinder,box) {
  const [n,u,v]=cylinder.axes,h=cylinder.half[0],radius=cylinder.half[1];
  // Clip a box to the finite axial slab, then project its vertices and edge/slab
  // intersections to the radial plane. Distance to that convex hull tests the circle.
  const vertices=svBoxVertices(svSub(box.center,cylinder.center),box.axes,box.half),axial=vertices.map(p=>svDot(p,n));
  if(Math.min(Math.max(...axial),h)-Math.max(Math.min(...axial),-h)<=SERVICE_VOLUME_EPS)return false;
  const clipped=vertices.filter((p,i)=>axial[i]>=-h-SERVICE_VOLUME_EPS&&axial[i]<=h+SERVICE_VOLUME_EPS);
  for(let i=0;i<8;i++)for(let bit=1;bit<=4;bit*=2) {
    const j=i^bit;if(j<i)continue;const change=axial[j]-axial[i];if(Math.abs(change)<=SERVICE_VOLUME_EPS)continue;
    for(const plane of [-h,h]){const t=(plane-axial[i])/change;if(t>=0&&t<=1)clipped.push(svAdd(vertices[i],svScale(svSub(vertices[j],vertices[i]),t)));}
  }
  const hull=svHull(clipped.map(p=>({x:svDot(p,u),y:svDot(p,v)})));
  return radius-svPolygonDistance(hull)>SERVICE_VOLUME_EPS;
}
function serviceBodyVolume(item) {
  const frame=routeBodyFrame(item);if(!frame)return null;
  const e=item.envelope,r=(Number(e.rotation||0)%360)*Math.PI/180;
  const body={item,shape:'rectangular',center:{x:item.center.x,y:item.center.y,z:item.elevation+Number(e.height)/2},axes:[{x:Math.cos(r),y:Math.sin(r),z:0},{x:-Math.sin(r),y:Math.cos(r),z:0},{x:0,y:0,z:1}],half:[Number(e.width)/2,Number(e.depth)/2,Number(e.height)/2],box:frame.box};
  if([...Object.values(body.center),...body.half].some(value=>!Number.isFinite(value)||Math.abs(value)*Number.EPSILON>SERVICE_VOLUME_EPS)||body.half.some(h=>h<=SERVICE_VOLUME_EPS))return null;
  return body;
}
function svOverlap(segment,body){return segment.shape==='round'?svCylinderBoxOverlap(segment,body):svBoxesOverlap(segment,body);}
function svPlanOverlap(segment,body) {
  // An extrusion covering the complete route Z range is an exact projection test;
  // round-route checks therefore do not rely on the faceted display mesh.
  const low=segment.bounds.z[0]-1,high=segment.bounds.z[1]+1;
  return svOverlap(segment,{...body,center:{...body.center,z:low+(high-low)/2},half:[body.half[0],body.half[1],(high-low)/2]});
}
function servicePhysicalChecks(model=state.model) {
  const pairs=[],unchecked=[],bodies=[],routes=[];
  for(const item of model.serviceItems||[]){const body=serviceBodyVolume(item);if(body)bodies.push(body);else unchecked.push({kind:'item',object:item,reason:'Complete numerically reliable product body dimensions are required'});}
  for(const route of model.services||[]){const geometry=serviceVolumeGeometry(route);if(!geometry.segments.length){unchecked.push({kind:'route',object:route,reason:geometry.reason});continue;}routes.push({route,geometry});}
  for(const {route,geometry} of routes)for(const body of bodies) {
    const segments=[];
    for(const segment of geometry.segments) {
      const width=body.half[0],depth=body.half[1],x=body.axes[0],y=body.axes[1];
      const ex=Math.abs(x.x)*width+Math.abs(y.x)*depth,ey=Math.abs(x.y)*width+Math.abs(y.y)*depth;
      if(segment.bounds.x[1]<body.center.x-ex||segment.bounds.x[0]>body.center.x+ex||segment.bounds.y[1]<body.center.y-ey||segment.bounds.y[0]>body.center.y+ey)continue;
      if(!svPlanOverlap(segment,body))continue;
      const overlap=svOverlap(segment,body),low=body.center.z-body.half[2],high=body.center.z+body.half[2];
      segments.push({...segment,status:overlap?'Volume overlap':'Plan overlap only',zGap:Math.max(0,low-segment.bounds.z[1],segment.bounds.z[0]-high)});
    }
    if(!segments.length)continue;
    const connectedEnds=['start','end'].filter(end=>route.connections?.[end]?.itemId===body.item.id);
    const review=[...serviceSectionReview(route),...(!body.item.envelope.sourceRef.trim()?['Product body dimensions source unspecified']:[]),
      ...(connectedEnds.length?['Connected '+connectedEnds.join('/')+' endpoint; entry may be intentional and requires review']:[]),
      'Flat-ended straight segments; bends/insulation only as explicitly recorded; no compliance assessment'].join('; ');
    pairs.push({key:JSON.stringify([route.id,body.item.id]),route,item:body.item,body,segments,connectedEnds,status:segments.some(s=>s.status==='Volume overlap')?'Volume overlap':'Plan overlap only',review});
  }
  return {pairs,unchecked,routes:routes.length,bodies:bodies.length};
}
function serviceVolumeMesh(segment) {
  const count=segment.shape==='round'?32:4,[,u,v]=segment.axes,ends=[];
  for(const center of [segment.segment.a,segment.segment.b]) {
    ends.push(Array.from({length:count},(_,i)=>{
      const xy=segment.shape==='round'?[Math.cos(i*2*Math.PI/count)*segment.half[1],Math.sin(i*2*Math.PI/count)*segment.half[1]]:
        [[-1,-1],[1,-1],[1,1],[-1,1]][i].map((sign,j)=>sign*segment.half[j+1]);
      return svAdd(center,svAdd(svScale(u,xy[0]),svScale(v,xy[1])));
    }));
  }
  return ends;
}
function serviceRouteVolumeBounds() {
  return (state.model.services||[]).flatMap(route=>serviceVolumeGeometry(route).segments.flatMap(s=>
    Array.from({length:8},(_,i)=>({x:s.bounds.x[i&1?1:0],y:s.bounds.y[i&2?1:0],z:s.bounds.z[i&4?1:0]}))));
}
function drawServiceVolumeSegment(segment,is3d,colour,review=false) {
  const [a,b]=serviceVolumeMesh(segment),project=p=>is3d?isoPoint(p,p.z):worldToScreen(p);
  const face=points=>{if(points.length<3)return;ctx.beginPath();const p=points.map(project);ctx.moveTo(p[0].x,p[0].y);for(const q of p.slice(1))ctx.lineTo(q.x,q.y);ctx.closePath();ctx.fill();ctx.stroke();};
  ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour+(review?'35':'1c');ctx.lineWidth=review?2:1;ctx.setLineDash(review&&segment.status==='Plan overlap only'?[5,4]:[]);
  if(is3d){face(a);for(let i=0;i<a.length;i++){const j=(i+1)%a.length;face([a[i],a[j],b[j],b[i]]);}face(b);}
  else face(svHull([...a,...b]));ctx.restore();
}
function drawServiceRouteVolumes(is3d=false) {
  if(state.visibility.serviceRouteVolumes===false)return;
  for(const route of state.model.services||[]) {
    if(is3d?!isLevelVisible3d(route):route.levelId!==state.model.activeLevelId)continue;
    for(const segment of serviceVolumeGeometry(route).segments)drawServiceVolumeSegment(segment,is3d,SERVICE_SYSTEMS[route.system].colour);
  }
}
function drawServicePhysicalChecks(is3d=false) {
  if(state.visibility.servicePhysicalChecks===false)return;
  const labels=[];
  for(const pair of servicePhysicalChecks().pairs) {
    if(!serviceRouteBodyPairVisible(pair,is3d))continue;
    for(const segment of pair.segments)drawServiceVolumeSegment(segment,is3d,segment.status==='Volume overlap'?'#cf202b':'#b5681c',true);
    drawServiceEnvelopeBox(pair.body.box,is3d,pair.status==='Volume overlap'?'#cf202b':'#b5681c',true);
    const p=is3d?isoPoint(pair.body.center,pair.body.center.z):worldToScreen(pair.body.center);let y=p.y-9;
    while(labels.some(q=>Math.abs(q.x-p.x)<190&&Math.abs(q.y-y)<15))y-=16;labels.push({x:p.x,y});
    ctx.save();ctx.font='10px Segoe UI';ctx.fillStyle=pair.status==='Volume overlap'?'#cf202b':'#b5681c';ctx.fillText(pair.status+' · '+pair.route.name,p.x+7,y);ctx.restore();
  }
}
function hitServiceRouteVolume(p) {
  if(state.visibility.serviceRouteVolumes===false)return null;
  for(const route of [...state.model.services||[]].reverse())if(route.levelId===state.model.activeLevelId&&serviceVolumeGeometry(route).segments.some(s=>pointInPolygon(p,svHull(serviceVolumeMesh(s).flat()))))return {type:'service',id:route.id};
  return null;
}
function renderServiceCrossSection(route) {
  const c=route.crossSection;
  if(!c)return '<h3>Physical cross-section</h3><button type="button" class="link-button" data-action="service-add-section">Add route cross-section</button><p class="overview-copy">Record outside dimensions from a product or project drawing. Unknown routes have no physical envelope.</p>';
  const d=serviceSectionDimensions(route),g=serviceVolumeGeometry(route);
  return '<h3>Physical cross-section</h3>'+serviceSelect('Section shape','section-shape',c.shape,[['round','Round'],['rectangular','Rectangular']])+'<div class="field-grid">'+
    (c.shape==='round'?detailInput('Outside diameter','section-diameter',c.diameter,'mm'):detailInput('Outside width','section-width',c.width,'mm')+detailInput('Outside height','section-height',c.height,'mm')+detailInput('Roll about segment','section-roll',c.roll,'°'))+
    detailInput('Dimensions source / product drawing','section-sourceRef',c.sourceRef,'',false)+detailInput('Cross-section notes','section-notes',c.notes,'',false)+'</div>'+
    '<p class="overview-copy">'+escapeHtml(serviceSectionReview(route).join('; ')||'Dimensions recorded; qualified product review required')+'. '+(g.segments.length?'Cross-section '+formatNumber(d.area,2)+' mm² · gross straight envelope '+formatNumber(g.volume/1e9,6)+' m³.':escapeHtml(g.reason)+'.')+'</p>'+
    '<p class="inspector-footnote">Centred on the route. Round: finite cylinders with flat ends. Rectangular roll 0: width horizontal across each nonvertical segment, height in its upward transverse plane. Vertical runs use world X for width and the transverse Y direction for height. Roll rotates about the segment direction. Each leg is separate; bend overlap is not deducted. Outside dimensions include insulation only if entered. Gross envelopes are not material quantities or pipe capacity.</p>'+
    '<button type="button" class="delete-button" data-action="service-remove-section">Remove cross-section</button>';
}
function updateServiceCrossSectionField(field,raw) {
  if(state.selected?.type!=='service'||!field.startsWith('section-'))return false;
  const key=field.slice(8),route=selectedObject();if(!route.crossSection||!SERVICE_SECTION_FIELDS.includes(key))return true;
  const next=clone(route);next.crossSection[key]=raw.slice(0,2000);
  try{validateService(next);}catch(error){serviceError(error.message);return true;}
  state.serviceError='';withHistory(()=>Object.assign(route,next));return true;
}
function serviceCrossSectionAction(action) {
  if(state.selected?.type!=='service'||!['service-add-section','service-remove-section'].includes(action))return false;
  const route=selectedObject();state.serviceError='';withHistory(()=>{route.crossSection=action==='service-add-section'?makeServiceCrossSection():null;if(route.crossSection)state.visibility.serviceRouteVolumes=true;});return true;
}
function renderServiceVolumeSchedule() {
  const el=document.querySelector('#serviceVolumeSchedule');if(!el)return;
  el.innerHTML=(state.model.services||[]).map(route=>{const g=serviceVolumeGeometry(route);return '<button type="button" class="foundation-schedule-row" data-volume-route="'+escapeHtml(route.id)+'"><strong>'+escapeHtml(route.name)+' · '+escapeHtml(serviceSectionLabel(route))+'</strong><span>'+escapeHtml(levelName(route.levelId))+' · '+(g.segments.length?formatNumber(g.area,2)+' mm² · '+formatNumber(g.volume/1e9,6)+' m³ gross envelope':'Not assessed: '+escapeHtml(g.reason))+'</span><small>'+escapeHtml(serviceSectionReview(route).join('; ')||'Dimensions recorded; product review required')+'</small></button>';}).join('')||'<p class="overview-copy">Add a service route, then record its cross-section.</p>';
}
function selectServicePhysicalPair(key,type) {
  const pair=servicePhysicalChecks().pairs.find(p=>p.key===key);if(!pair)return;
  state.visibility.servicePhysicalChecks=true;selectServiceConnection(type==='route'?pair.route.id:null,pair.item.id);
}
function onServicePhysicalClick(event) {
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.physicalPair)selectServicePhysicalPair(b.dataset.physicalPair,b.dataset.physicalType);
  else if(b.dataset.volumeRoute)selectServiceConnection(b.dataset.volumeRoute);
  else if(b.dataset.physicalUnchecked)selectServiceConnection(b.dataset.physicalKind==='route'?b.dataset.physicalUnchecked:null,b.dataset.physicalUnchecked);
}
function isolateServicePhysicalChecks(){setServiceOverlays(false);state.visibility.servicePhysicalChecks=true;render();}
function renderServicePhysicalReview(type,obj) {
  const result=servicePhysicalChecks(),pairs=result.pairs.filter(p=>p[type].id===obj.id),unchecked=result.unchecked.find(r=>r.kind===type&&r.object.id===obj.id);
  return '<h3>Physical volume / body review</h3>'+(unchecked?'<p class="overview-copy">Not assessed: '+escapeHtml(unchecked.reason)+'</p>':pairs.map(p=>'<p class="overview-copy"><strong>'+p.status+'</strong> with '+escapeHtml(p[type==='route'?'item':'route'].name)+' · '+p.segments.length+' affected segments.</p>').join('')||'<p class="overview-copy">No positive overlaps detected against configured physical bodies. Incomplete records remain unassessed.</p>');
}
function renderServicePhysicalSchedule() {
  const el=document.querySelector('#servicePhysicalSchedule');if(!el)return;
  const result=servicePhysicalChecks(),count=result.pairs.filter(p=>p.status==='Volume overlap').length;
  el.innerHTML='<p class="overview-copy">'+result.routes+' configured routes · '+result.bodies+' configured bodies · '+count+' volume-overlap pairs · '+(result.pairs.length-count)+' plan-only pairs · '+result.unchecked.length+' unassessed records.</p>'+
    result.pairs.map(p=>'<div class="foundation-schedule-row"><strong>'+escapeHtml(p.route.name)+' / '+escapeHtml(p.item.name)+' · '+p.status+'</strong><span>'+escapeHtml(levelName(p.route.levelId))+' / '+escapeHtml(levelName(p.item.levelId))+'</span><small>'+escapeHtml(p.review)+'</small>'+['route','item'].map(type=>'<button class="link-button" type="button" data-physical-pair="'+escapeHtml(p.key)+'" data-physical-type="'+type+'">Review '+escapeHtml(p[type].name)+'</button>').join('')+'<details><summary>Affected segments</summary>'+p.segments.map(s=>'<p class="overview-copy">Segment '+s.index+' · '+s.status+' · '+formatNumber(s.volume/1e9,6)+' m³ full segment envelope · '+formatNumber(s.zGap,2)+' mm Z-range gap</p>').join('')+'</details></div>').join('')+
    (result.unchecked.length?'<h4>Not assessed</h4>'+result.unchecked.map(r=>'<button class="foundation-schedule-row" type="button" data-physical-unchecked="'+escapeHtml(r.object.id)+'" data-physical-kind="'+r.kind+'"><strong>'+escapeHtml(r.object.name)+'</strong><small>'+escapeHtml(r.reason)+'</small></button>').join(''):'');
}
function exportServiceVolumeCsv() {
  serviceCsv('bc-design-service-route-volumes.csv',[
    ['Record','Route ID','Name','Level','Shape','Outside diameter mm','Outside width mm','Outside height mm','Roll degrees','Segment','3D length mm','Section area mm2','Gross envelope mm3','Start XYZ mm','End XYZ mm','Local axes JSON','Dimensions source','Review'],
    ...(state.model.services||[]).flatMap(route=>{const c=route.crossSection||{},g=serviceVolumeGeometry(route),review=serviceSectionReview(route).join('; ')||'Gross straight envelope only; bends not deducted; not a material order';
      const row=(type,segment,length,area,volume,a='',b='',axes='')=>[type,route.id,route.name,levelName(route.levelId),c.shape||'',c.shape==='round'?c.diameter:'',c.shape==='rectangular'?c.width:'',c.shape==='rectangular'?c.height:'',c.shape==='rectangular'?c.roll:'',segment,length,area,volume,a,b,axes,c.sourceRef||'',review];
      return g.segments.length?[row('Route total','',serviceGeometry(route).length,g.area,g.volume),...g.segments.map(s=>row('Segment',s.index,s.segment.length,s.area,s.volume,JSON.stringify(s.segment.a),JSON.stringify(s.segment.b),JSON.stringify(s.axes)))]:[row('Not assessed','','','','',...Array(3).fill('')).map((v,i)=>i===17?g.reason+'; '+review:v)];})
  ]);
}
function exportServicePhysicalCsv() {
  const result=servicePhysicalChecks();
  serviceCsv('bc-design-service-physical-checks.csv',[
    ['Record','Route ID','Route name','Route level','Item ID','Item name','Item level','Status','Segment','Shape','Full segment gross envelope mm3','Z-range gap mm','Start XYZ mm','End XYZ mm','Connected endpoints','Route dimensions source','Product body source','Review'],
    ...result.pairs.flatMap(p=>p.segments.map(s=>['Pair segment',p.route.id,p.route.name,levelName(p.route.levelId),p.item.id,p.item.name,levelName(p.item.levelId),s.status,s.index,s.shape,s.volume,s.zGap,JSON.stringify(s.segment.a),JSON.stringify(s.segment.b),p.connectedEnds.join('; '),p.route.crossSection.sourceRef,p.item.envelope.sourceRef,p.review])),
    ...result.unchecked.map(r=>['Not assessed',r.kind==='route'?r.object.id:'',r.kind==='route'?r.object.name:'',r.kind==='route'?levelName(r.object.levelId):'',r.kind==='item'?r.object.id:'',r.kind==='item'?r.object.name:'',r.kind==='item'?levelName(r.object.levelId):'','Not assessed',...Array(9).fill(''),r.reason])
  ]);
}
