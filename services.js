/* Measured service centrelines and explicit item records. No system sizing or approval. */
const SERVICE_SYSTEMS = {
  water: { label: 'Water', colour: '#217cad' },
  drainage: { label: 'Drainage', colour: '#925a32' },
  electrical: { label: 'Electrical', colour: '#b5681c' },
  other: { label: 'Other services', colour: '#7955a4' }
};
const SERVICE_TEXT_FIELDS = ['name','size','material','designRef','notes'];
const SERVICE_ITEM_FIELDS = [...SERVICE_TEXT_FIELDS,'partType','manufacturer','productCode','routeId'];
const MAX_SERVICE_POINTS = 500;

function makeService(a,b,levelId,elevation=0) {
  return { id:uid('service'), levelId, name:'Service route', system:'water',
    points:[{x:a.x,y:a.y,z:elevation},{x:b.x,y:b.y,z:elevation}],
    size:'',material:'',designRef:'',notes:'',connections:{start:null,end:null},crossSection:null };
}
function servicePoints(s) {
  // Schema 10 straight routes retain their exact coordinates, elevations and IDs on import.
  return s.points === undefined ? [{...s.a,z:s.startElevation},{...s.b,z:s.endElevation}] : s.points;
}
function serviceGeometry(s) {
  const points=servicePoints(s),segments=points.slice(1).map((b,i)=>{
    const a=points[i],plan=lengthBetween(a,b),rise=b.z-a.z;
    return {a,b,plan,rise,length:Math.hypot(plan,rise)};
  });
  return {segments,plan:segments.reduce((n,g)=>n+g.plan,0),
    rise:points.at(-1).z-points[0].z,length:segments.reduce((n,g)=>n+g.length,0)};
}
function validateServiceText(s,fields) {
  if(!s||typeof s.id!=='string'||!s.id.trim()||!Object.hasOwn(SERVICE_SYSTEMS,s.system))
    throw new Error('Service needs an ID and a valid system.');
  for(const k of fields) if(typeof s[k]!=='string'||s[k].length>2000)
    throw new Error('Service fields must be text up to 2000 characters.');
}
function validateService(s) {
  validateServiceText(s,SERVICE_TEXT_FIELDS);
  validateServiceConnections(s);
  const points=servicePoints(s);
  if(!Array.isArray(points)||points.length<2||points.length>MAX_SERVICE_POINTS||
      points.some(p=>!p||![p.x,p.y,p.z].every(Number.isFinite)))
    throw new Error('A route needs 2–500 points with finite X, Y and absolute elevation.');
  const g=serviceGeometry(s);
  if(!Number.isFinite(g.length)||!Number.isFinite(g.plan)||!Number.isFinite(g.rise)||
      g.segments.some(segment=>segment.length<1))
    throw new Error('Every service segment must be finite and at least 1 mm long.');
  validateServiceCrossSection(s);
}
function makeServiceItem(kind,p,levelId,elevation=0) {
  return {id:uid('service-item'),levelId,kind,system:'water',name:kind==='fitting'?'Fitting':'Fixture',
    center:{x:p.x,y:p.y},elevation,partType:'',size:'',material:'',manufacturer:'',
    productCode:'',designRef:'',notes:'',routeId:'',ports:[],envelope:null};
}
function validateServiceItem(item) {
  validateServiceText(item,SERVICE_ITEM_FIELDS);
  if(!['fitting','fixture'].includes(item.kind)||![item.center?.x,item.center?.y,item.elevation].every(Number.isFinite))
    throw new Error('A service item needs a fitting/fixture kind and finite position/elevation.');
  validateServicePorts(item);
  validateServiceEnvelope(item);
}
function normalizeServices(model) {
  const ids=new Set();
  for(const key of ['services','serviceItems']) {
    if(model[key]!==undefined&&!Array.isArray(model[key]))throw new Error(key+' must be a list.');
    model[key] ||= [];
    for(const s of model[key]) {
      if(key==='services') {
        if(s.crossSection===undefined)s.crossSection=null;
        validateService(s);
        s.points=servicePoints(s).map(p=>({x:p.x,y:p.y,z:p.z}));
        delete s.a;delete s.b;delete s.startElevation;delete s.endElevation;
      } else validateServiceItem(s);
      if(ids.has(s.id))throw new Error('Duplicate service ID.');
      ids.add(s.id);
      if(!model.levels.some(l=>l.id===s.levelId))s.levelId=model.activeLevelId;
    }
  }
  normalizeServiceConnections(model);
  normalizeServiceEnvelopes(model);
}
function serviceBounds() {
  return (state.model.services||[]).flatMap(servicePoints)
    .concat((state.model.serviceItems||[]).map(s=>({...s.center,z:s.elevation})),servicePortEntries().map(e=>e.position),serviceEnvelopeBounds(),serviceRouteVolumeBounds());
}
function serviceLayer(s) { return s.kind ? (s.kind==='fitting'?'serviceFittings':'serviceFixtures') : 'service-'+s.system; }
function serviceVisible(s,is3d) {
  return state.visibility[serviceLayer(s)]!==false &&
    (is3d?isLevelVisible3d(s):s.levelId===state.model.activeLevelId);
}
function drawServices(is3d=false) {
  if(!(state.model.services||[]).length&&!(state.model.serviceItems||[]).length)return;
  ctx.save();ctx.globalAlpha=state.serviceOverlayOpacity??1;
  drawServiceRouteVolumes(is3d);
  drawServiceEnvelopes(is3d);
  for(const s of state.model.services||[]) {
    if(!serviceVisible(s,is3d))continue;
    const points=servicePoints(s).map(p=>is3d?isoPoint(p,p.z):worldToScreen(p));
    ctx.save();ctx.strokeStyle=state.selected?.type==='service'&&state.selected.id===s.id?'#ed1c24':SERVICE_SYSTEMS[s.system].colour;
    ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=3;ctx.lineJoin='round';ctx.setLineDash(s.system==='electrical'?[7,4]:[]);
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
    ctx.stroke();ctx.setLineDash([]);
    for(const p of points){ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
    // Label a segment's midpoint, leaving the waypoints clear for item symbols.
    const segment=points.slice(1).map((b,i)=>({a:points[i],b,length:lengthBetween(points[i],b)})).sort((a,b)=>b.length-a.length)[0];
    const label={x:(segment.a.x+segment.b.x)/2,y:(segment.a.y+segment.b.y)/2};
    ctx.font='11px Segoe UI';ctx.fillText(s.name+' · '+formatLength(serviceGeometry(s).length),label.x+8,label.y+16);ctx.restore();
  }
  for(const item of state.model.serviceItems||[]) {
    if(!serviceVisible(item,is3d))continue;
    const p=is3d?isoPoint(item.center,item.elevation):worldToScreen(item.center);
    ctx.save();ctx.strokeStyle=state.selected?.type==='serviceItem'&&state.selected.id===item.id?'#ed1c24':SERVICE_SYSTEMS[item.system].colour;
    ctx.fillStyle='#ffffff';ctx.lineWidth=2;ctx.setLineDash([]);ctx.beginPath();
    if(item.kind==='fitting'){
      ctx.moveTo(p.x,p.y-7);ctx.lineTo(p.x+7,p.y);ctx.lineTo(p.x,p.y+7);ctx.lineTo(p.x-7,p.y);
    }else{
      ctx.moveTo(p.x-7,p.y-7);ctx.lineTo(p.x+7,p.y-7);ctx.lineTo(p.x+7,p.y+7);ctx.lineTo(p.x-7,p.y+7);
    }
    ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=ctx.strokeStyle;
    ctx.font='10px Segoe UI';ctx.fillText(item.kind==='fitting'?'F':'X',p.x-3,p.y+3);
    ctx.fillText(item.name,p.x+11,p.y-9);ctx.restore();
  }
  drawServiceConnections(is3d);
  drawServiceClearanceChecks(is3d);
  drawServiceRouteBodyChecks(is3d);
  drawServicePhysicalChecks(is3d);
  ctx.restore();
}
function drawServiceDraft() {
  const points=state.serviceDraft||[];
  for(let i=1;i<points.length;i++)drawDraftWall(points[i-1],points[i]);
  for(const p of points){const screen=worldToScreen(p);ctx.save();ctx.fillStyle='#ed1c24';ctx.beginPath();ctx.arc(screen.x,screen.y,4,0,Math.PI*2);ctx.fill();ctx.restore();}
}
function serviceError(message) { state.serviceError=message;state.statusMessage=message;render(); }
function commitServiceObject(s) {
  try{attachDrawnServiceEndpoints(s);validateService(s);}catch(error){serviceError(error.message);return false;}
  state.serviceError='';
  withHistory(()=>{(state.model.services ||= []).push(s);state.selected={type:'service',id:s.id};state.visibility[serviceLayer(s)]=true;});
  return true;
}
function commitService() {
  const {start,current}=state.drawing;state.drawing=null;
  const s=makeService(start,current,state.model.activeLevelId,activeLevel().elevation);
  s.name='Service '+((state.model.services||[]).length+1);commitServiceObject(s);
}
function addServicePoint(world) {
  const p={...snapPoint(world),z:activeLevel().elevation},points=state.serviceDraft;
  if(points.length>=MAX_SERVICE_POINTS){serviceError('Finish this route before adding more than 500 points.');return;}
  if(points.length&&lengthBetween(points.at(-1),p)<1){serviceError('Choose a different waypoint; edit elevations later for a vertical segment.');return;}
  points.push(p);state.serviceError='';render();
}
function finishServiceRoute() {
  const points=state.serviceDraft;
  if(points.length<2){serviceError('Place at least two route points, then Finish route.');return;}
  const s=makeService(points[0],points.at(-1),state.model.activeLevelId);
  s.points=clone(points);s.name='Service '+((state.model.services||[]).length+1);
  if(commitServiceObject(s)){state.serviceDraft=[];render();}
}
function placeServiceItem(kind,world) {
  const item=makeServiceItem(kind,snapPoint(world),state.model.activeLevelId,activeLevel().elevation);
  item.name=(kind==='fitting'?'Fitting ':'Fixture ')+((state.model.serviceItems||[]).filter(s=>s.kind===kind).length+1);
  state.serviceError='';
  withHistory(()=>{(state.model.serviceItems ||= []).push(item);state.selected={type:'serviceItem',id:item.id};state.visibility[serviceLayer(item)]=true;});
}
function hitService(p) {
  const port=hitServicePort(p);if(port)return port;
  const item=[...(state.model.serviceItems||[])].reverse().find(s=>serviceVisible(s,false)&&lengthBetween(p,s.center)<12/state.view.scale);
  if(item)return {type:'serviceItem',id:item.id};
  const route=[...(state.model.services||[])].reverse().find(s=>serviceVisible(s,false)&&
    serviceGeometry(s).segments.some(g=>distanceToSegment(p,g.a,g.b).distance<10/state.view.scale));
  return route?{type:'service',id:route.id}:hitServiceEnvelope(p)||hitServiceRouteVolume(p);
}
function serviceSelect(label,field,value,options) {
  return '<label class="inspector-field full"><span class="field-label">'+label+'</span><select data-field="'+field+'">'+options.map(([key,text])=>
    '<option value="'+escapeHtml(key)+'" '+(key===value?'selected':'')+'>'+escapeHtml(text)+'</option>').join('')+'</select></label>';
}
function serviceCommonDetails(s) {
  return serviceSelect('System','system',s.system,Object.entries(SERVICE_SYSTEMS).map(([k,v])=>[k,v.label]))+
    serviceSelect('Assigned level','levelId',s.levelId,state.model.levels.map(l=>[l.id,l.name]))+
    '<div class="field-grid">'+detailInput('Name','name',s.name,'',false)+
    detailInput('Specified size / rating','size',s.size,'',false)+detailInput('Material / product','material',s.material,'',false)+
    detailInput('Designer drawing / adopted requirements','designRef',s.designRef,'',false)+detailInput('Notes','notes',s.notes,'',false)+'</div>';
}
function serviceErrorMarkup(){return state.serviceError?'<p class="warning-note" role="alert">'+escapeHtml(state.serviceError)+'</p>':'';}
function renderServiceDetails(s) {
  const g=serviceGeometry(s),points=servicePoints(s),a=points[0],b=points.at(-1);
  return '<div class="detail-head"><h3>Measured service route</h3><button class="delete-button" data-action="delete">Delete</button></div>'+
    serviceErrorMarkup()+serviceCommonDetails(s)+renderServiceRouteConnections(s)+renderServiceCrossSection(s)+'<div class="field-grid">'+
    detailInput('Start X','startX',a.x,'mm')+detailInput('Start Y','startY',a.y,'mm')+
    detailInput('End X','endX',b.x,'mm')+detailInput('End Y','endY',b.y,'mm')+
    detailInput('Start absolute elevation','startElevation',a.z,'mm')+detailInput('End absolute elevation','endElevation',b.z,'mm')+'</div>'+
    '<h3>Route waypoints</h3>'+points.map((p,i)=>'<details'+(i>0&&i<points.length-1?' open':'')+'><summary>Point '+(i+1)+(i===0?' · start':i===points.length-1?' · end':'')+'</summary><div class="field-grid">'+
      ['x','y','z'].map(axis=>detailInput(axis==='z'?'Absolute elevation':axis.toUpperCase(),'point-'+i+'-'+axis,p[axis],'mm')).join('')+
      '</div><button type="button" class="link-button" data-action="service-remove-point" data-index="'+i+'" '+(points.length<=2?'disabled':'')+'>Remove point '+(i+1)+'</button></details>').join('')+
    '<button type="button" class="link-button" data-action="service-append">Extend route by one segment</button>'+
    '<h3>Measured segments</h3>'+g.segments.map((seg,i)=>'<p class="overview-copy">Segment '+(i+1)+' · '+formatLength(seg.plan)+' plan · '+formatNumber(seg.rise,0)+' mm rise · '+formatLength(seg.length)+' 3D</p><button type="button" class="link-button" data-action="service-insert-point" data-index="'+i+'">Insert midpoint in segment '+(i+1)+'</button>').join('')+
    '<p class="overview-copy">Total plan run '+formatLength(g.plan)+' · Net signed rise '+formatNumber(g.rise,0)+' mm · Total 3D centreline '+formatLength(g.length)+'. Length sums every segment, including vertical risers. Elevations are absolute project datum; changing the assigned level does not move geometry. Extending repeats the last segment direction and length.</p>'+
    renderServiceRouteBodyReview('route',s)+renderServicePhysicalReview('route',s)+
    '<p class="warning-note">Schematic route only. Waypoints do not create fittings or prove connections. No automatic sizing, falls acceptance, separation, burial, voltage-drop or hydraulic checks. Confirm project requirements with the qualified designer.</p>';
}
function serviceItemReview(s) {
  const issues=[];
  for(const [key,label] of [['partType','type'],['size','size/rating'],['material','material/product'],['designRef','design evidence']])
    if(!s[key].trim())issues.push('Specify '+label);
  if(s.routeId){
    const route=(state.model.services||[]).find(r=>r.id===s.routeId);
    if(!route)issues.push('Unresolved route reference');
    else{
      if(route.system!==s.system)issues.push('Referenced route has a different system');
      if(route.levelId!==s.levelId)issues.push('Referenced route has a different assigned level');
    }
  }
  return issues;
}
function renderServiceItemDetails(s) {
  const routes=state.model.services||[],options=[['','Unassigned']];
  if(s.routeId&&!routes.some(r=>r.id===s.routeId))options.push([s.routeId,'Unresolved saved route']);
  options.push(...routes.map(r=>[r.id,r.name+' · '+SERVICE_SYSTEMS[r.system].label+' · '+levelName(r.levelId)]));
  return '<div class="detail-head"><h3>Service '+s.kind+'</h3><button class="delete-button" data-action="delete">Delete</button></div>'+
    serviceErrorMarkup()+serviceSelect('Record kind','kind',s.kind,[['fitting','Fitting'],['fixture','Fixture']])+serviceCommonDetails(s)+
    '<div class="field-grid">'+detailInput('Fitting / fixture type','partType',s.partType,'',false)+
    detailInput('Position X','positionX',s.center.x,'mm')+detailInput('Position Y','positionY',s.center.y,'mm')+
    detailInput('Absolute elevation','elevation',s.elevation,'mm')+
    detailInput('Manufacturer','manufacturer',s.manufacturer,'',false)+detailInput('Product code','productCode',s.productCode,'',false)+'</div>'+
    renderServiceEnvelopeDetails(s)+renderServiceClearanceItemReview(s)+renderServiceRouteBodyReview('item',s)+renderServicePhysicalReview('item',s)+renderServicePorts(s)+serviceSelect('Related route (legacy record only)','routeId',s.routeId,options)+
    '<p class="overview-copy">Count: 1 placed '+s.kind+'. '+escapeHtml(serviceItemReview(s).join('; ')||'Design records entered; qualified product review required')+'.</p>'+
    '<p class="warning-note">The symbol marks the item origin. Product dimensions and clearances use the explicit envelope record above. Endpoint links use the explicit connection points above; the legacy related-route field is a reference only. Record the applicable Australian requirements and product evidence; no certification is inferred.</p>';
}
function updateServiceField(field,raw) {
  if(!['service','serviceItem'].includes(state.selected?.type))return false;
  if(updateServiceCrossSectionField(field,raw))return true;
  if(updateServiceEnvelopeField(field,raw))return true;
  if(updateServiceConnectionField(field,raw))return true;
  const s=selectedObject(),next=clone(s),v=raw.trim()?Number(raw):NaN;
  if(state.selected.type==='service') {
    next.points=clone(servicePoints(s));
    const endpoints={startX:[0,'x'],startY:[0,'y'],endX:[next.points.length-1,'x'],endY:[next.points.length-1,'y'],
      startElevation:[0,'z'],endElevation:[next.points.length-1,'z']};
    const match=/^point-(\d+)-([xyz])$/.exec(field);
    if(endpoints[field]){const [i,axis]=endpoints[field];next.points[i][axis]=v;}
    else if(match&&next.points[Number(match[1])])next.points[Number(match[1])][match[2]]=v;
    else if([...SERVICE_TEXT_FIELDS,'system','levelId'].includes(field))next[field]=raw.slice(0,2000);
    else return true;
  } else {
    if(field==='positionX')next.center.x=v;
    else if(field==='positionY')next.center.y=v;
    else if(field==='elevation')next.elevation=v;
    else if([...SERVICE_ITEM_FIELDS,'system','levelId','kind'].includes(field))next[field]=raw.slice(0,2000);
    else return true;
  }
  try {
    if(!state.model.levels.some(l=>l.id===next.levelId))throw new Error('Choose an existing level.');
    if(state.selected.type==='service')validateService(next);else validateServiceItem(next);
  }catch(error){serviceError(error.message);return true;}
  if(state.selected.type==='serviceItem'){commitServiceItemWithConnections(s,next);return true;}
  state.serviceError='';
  withHistory(()=>{Object.assign(s,next);state.visibility[serviceLayer(s)]=true;});return true;
}
function serviceAction(action,index) {
  if(!['service','serviceItem'].includes(state.selected?.type))return;
  if(serviceCrossSectionAction(action))return;
  if(serviceEnvelopeAction(action))return;
  if(serviceConnectionAction(action,index))return;
  if(action==='delete'){
    const key=state.selected.type==='service'?'services':'serviceItems',id=state.selected.id;
    state.serviceError='';
    withHistory(()=>{state.model[key]=(state.model[key]||[]).filter(s=>s.id!==id);state.selected=null;});return;
  }
  if(state.selected.type!=='service'||!['service-append','service-insert-point','service-remove-point'].includes(action))return;
  const s=selectedObject(),next=clone(s);next.points=clone(servicePoints(s));
  if(action==='service-append'){
    const b=next.points.at(-1),a=next.points.at(-2);next.points.push({x:b.x+(b.x-a.x),y:b.y+(b.y-a.y),z:b.z+(b.z-a.z)});
    if(next.connections)next.connections.end=null;
  } else if(action==='service-insert-point'&&Number.isInteger(index)&&index>=0&&index<next.points.length-1) {
    const a=next.points[index],b=next.points[index+1];next.points.splice(index+1,0,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});
  } else if(action==='service-remove-point'&&Number.isInteger(index)&&index>=0&&index<next.points.length) {
    if(next.connections&&index===0)next.connections.start=null;
    if(next.connections&&index===next.points.length-1)next.connections.end=null;
    next.points.splice(index,1);
  }
  else return;
  try{validateService(next);}catch(error){serviceError(error.message);return;}
  state.serviceError='';withHistory(()=>Object.assign(s,next));
}
function serviceQuantityRows() {
  const rows=Object.entries(SERVICE_SYSTEMS).map(([system,v])=>{
    const net=(state.model.services||[]).filter(s=>s.system===system).reduce((n,s)=>n+serviceGeometry(s).length/1000,0);
    return {label:v.label+' route length',net,waste:0,order:net,unit:'m',basis:'Sum of entered 3D segments; no fittings, stock, shared-run deductions or waste; not an order'};
  });
  for(const [system,v] of Object.entries(SERVICE_SYSTEMS))for(const kind of ['fitting','fixture']){
    const net=(state.model.serviceItems||[]).filter(s=>s.system===system&&s.kind===kind).length;
    if(net)rows.push({label:v.label+' '+kind+'s',net,waste:0,order:net,unit:'count',basis:'One count per explicitly placed record; no inferred fittings, product approval or order'});
  }
  return rows;
}
function renderServiceSchedule() {
  const el=document.querySelector('#serviceSchedule');if(!el)return;
  el.innerHTML=(state.model.services||[]).map(s=>{
    const g=serviceGeometry(s);
    return '<button class="foundation-schedule-row" type="button" data-service-id="'+escapeHtml(s.id)+'"><strong>'+escapeHtml(s.name)+'</strong><span>'+SERVICE_SYSTEMS[s.system].label+' · '+escapeHtml(levelName(s.levelId))+' · '+g.segments.length+' segments · '+formatLength(g.length)+' 3D</span><small>'+(s.size&&s.material&&s.designRef?'Design records entered; qualified review required':'Size, material and design evidence require review')+'</small></button>';
  }).join('')||'<p class="overview-copy">Choose Route in Plan, tap each waypoint, then Finish route. Service still draws a single segment by dragging.</p>';
  const items=document.querySelector('#serviceItemSchedule');
  if(items)items.innerHTML=(state.model.serviceItems||[]).map(s=>'<button class="foundation-schedule-row" type="button" data-service-item-id="'+escapeHtml(s.id)+'"><strong>'+escapeHtml(s.name)+'</strong><span>'+s.kind+' · '+SERVICE_SYSTEMS[s.system].label+' · '+escapeHtml(levelName(s.levelId))+' · 1 count</span><small>'+escapeHtml(s.partType||'Type unspecified')+' · '+escapeHtml(serviceItemReview(s).join('; ')||'Records entered; qualified review required')+'</small></button>').join('')||'<p class="overview-copy">Choose Fitting or Fixture, then tap its plan location. Each marker is one record; no items are automatically generated.</p>';
  const status=document.querySelector('#serviceStatus');if(status)status.textContent=state.serviceError||'';
  if(state.tool==='service')els.toolHelp.textContent='Drag a straight route, or choose Route to tap multiple waypoints. Edit absolute elevations in the inspector.';
  else if(state.tool==='service-route')els.toolHelp.textContent='Tap each route waypoint, then Finish route. Cancel discards the draft. Touch pans; use the inspector for precise coordinates and vertical risers.';
  else if(['service-fitting','service-fixture'].includes(state.tool))els.toolHelp.textContent='Tap a location to place one fitting or fixture record, then edit its system, type, elevation and product/design evidence.';
}
function serviceCsv(name,rows) {
  // Prevent user-entered text becoming spreadsheet formulas, while retaining numeric coordinates.
  download(name,rows.map(row=>row.map(value=>{
    let text=String(value??'');
    if(typeof value==='string'&&/^[\s]*[=+\-@]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(',')).join('\n'),'text/csv');
}
function exportServiceCsv() {
  serviceCsv('bc-design-service-routes.csv',[
    ['ID','Name','System','Level','Segment count','Plan run mm','Net signed rise mm','3D length m','Waypoints JSON (x/y/z mm)','Size rating','Material','Design reference','Notes','Start connection JSON','End connection JSON'],
    ...(state.model.services||[]).map(s=>{const g=serviceGeometry(s);return [s.id,s.name,s.system,levelName(s.levelId),g.segments.length,g.plan,g.rise,g.length/1000,JSON.stringify(servicePoints(s)),s.size,s.material,s.designRef,s.notes,JSON.stringify(s.connections?.start??null),JSON.stringify(s.connections?.end??null)];})
  ]);
}
function exportServiceSegmentCsv() {
  serviceCsv('bc-design-service-segments.csv',[
    ['Route ID','Route name','System','Level','Segment','Start X mm','Start Y mm','Start elevation mm','End X mm','End Y mm','End elevation mm','Plan run mm','Signed rise mm','3D length m'],
    ...(state.model.services||[]).flatMap(s=>serviceGeometry(s).segments.map((g,i)=>[s.id,s.name,s.system,levelName(s.levelId),i+1,g.a.x,g.a.y,g.a.z,g.b.x,g.b.y,g.b.z,g.plan,g.rise,g.length/1000]))
  ]);
}
function exportServiceItemCsv() {
  serviceCsv('bc-design-service-items.csv',[
    ['ID','Name','Kind','System','Level','Type','X mm','Y mm','Absolute elevation mm','Count','Size rating','Material','Manufacturer','Product code','Related route ID','Design reference','Notes','Review'],
    ...(state.model.serviceItems||[]).map(s=>[s.id,s.name,s.kind,s.system,levelName(s.levelId),s.partType,s.center.x,s.center.y,s.elevation,1,s.size,s.material,s.manufacturer,s.productCode,s.routeId,s.designRef,s.notes,serviceItemReview(s).join('; ')||'Records entered; qualified review required'])
  ]);
}
