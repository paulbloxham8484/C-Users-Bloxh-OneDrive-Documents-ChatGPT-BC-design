/* Connection topology and geometric coordination. Tolerance is a model setting, not a code rule. */
const SERVICE_CONNECTION_TOLERANCE = 1; // mm, measured in all three dimensions
const MAX_SERVICE_PORTS = 32;
const SERVICE_PORT_TEXT = ['name','system','size','maxConnections','designRef','notes'];

function setServiceOverlays(visible) {
  for(const layer of ['service-water','service-drainage','service-electrical','service-other','serviceFittings','serviceFixtures','serviceConnections','serviceEnvelopes','serviceClearances','serviceClearanceChecks','serviceRouteBodyChecks','serviceRouteVolumes','servicePhysicalChecks'])state.visibility[layer]=visible;
  if(!visible&&['service','serviceItem'].includes(state.selected?.type))state.selected=null;
  render();
}

function makeServicePort(item) {
  return {id:uid('port'),name:'Point '+((item.ports||[]).length+1),system:item.system,
    offset:{x:0,y:0,z:0},size:'',maxConnections:'',designRef:'',notes:''};
}
function servicePortPosition(item,port) {
  return {x:item.center.x+port.offset.x,y:item.center.y+port.offset.y,z:item.elevation+port.offset.z};
}
function validateServiceConnections(route) {
  if(route.connections===undefined)return; // pre-schema-12 project
  if(!route.connections||typeof route.connections!=='object'||Array.isArray(route.connections))throw new Error('Route connections must contain start and end references.');
  for(const end of ['start','end']) {
    const ref=route.connections[end];
    if(ref===undefined||ref===null)continue;
    if(typeof ref!=='object'||Array.isArray(ref)||['itemId','portId'].some(k=>typeof ref[k]!=='string'||!ref[k].trim()||ref[k].length>2000))throw new Error('A connection needs a valid item ID and point ID.');
  }
}
function validateServicePorts(item) {
  if(item.ports===undefined)return;
  if(!Array.isArray(item.ports)||item.ports.length>MAX_SERVICE_PORTS)throw new Error('An item may have up to 32 connection points.');
  const ids=new Set();
  for(const port of item.ports) {
    if(!port||typeof port.id!=='string'||!port.id.trim()||ids.has(port.id))throw new Error('Connection points need unique IDs.');
    ids.add(port.id);
    if(SERVICE_PORT_TEXT.some(k=>typeof port[k]!=='string'||port[k].length>2000)||!port.name.trim()||!Object.hasOwn(SERVICE_SYSTEMS,port.system))throw new Error('A connection point needs a name, valid system and text fields up to 2000 characters.');
    if(![port.offset?.x,port.offset?.y,port.offset?.z,...Object.values(servicePortPosition(item,port))].every(Number.isFinite))throw new Error('Connection point offsets and resulting position must be finite millimetres.');
    if(port.maxConnections.trim()&&(!Number.isSafeInteger(Number(port.maxConnections))||Number(port.maxConnections)<1))throw new Error('Maximum route ends must be a positive whole number or left unspecified.');
  }
}
function normalizeServiceConnections(model) {
  const ids=new Set([...(model.services||[]),...(model.serviceItems||[])].map(s=>s.id));
  for(const route of model.services||[]) {
    validateServiceConnections(route);
    route.connections={start:route.connections?.start??null,end:route.connections?.end??null};
  }
  for(const item of model.serviceItems||[]) {
    item.ports ??= [];validateServicePorts(item);
    for(const port of item.ports){if(ids.has(port.id))throw new Error('Duplicate service connection point ID.');ids.add(port.id);}
  }
}
function servicePortEntries(model=state.model) {
  return (model.serviceItems||[]).flatMap(item=>(item.ports||[]).map(port=>({item,port,position:servicePortPosition(item,port)})));
}
function resolveServiceConnection(ref,model=state.model) {
  const item=(model.serviceItems||[]).find(item=>item.id===ref?.itemId),port=item?.ports?.find(port=>port.id===ref?.portId);
  return {item,port,position:port?servicePortPosition(item,port):null};
}
function servicePortUsers(itemId,portId,model=state.model) {
  return (model.services||[]).flatMap(route=>['start','end'].filter(end=>route.connections?.[end]?.itemId===itemId&&route.connections[end].portId===portId).map(end=>({route,end})));
}
function serviceEndPosition(route,end) {return servicePoints(route)[end==='start'?0:servicePoints(route).length-1];}
function serviceConnectionRow(route,end,model=state.model) {
  const ref=route.connections?.[end],point=serviceEndPosition(route,end),{item,port,position}=resolveServiceConnection(ref,model),issues=[],codes=[];
  const issue=(code,text)=>{codes.push(code);issues.push(text);};
  let gap='';
  if(!ref)issue('unassigned','Route end is unassigned');
  else if(!item)issue('missing-item','Referenced fitting/fixture is missing');
  else if(!port)issue('missing-point','Referenced connection point is missing');
  else {
    gap=Math.hypot(point.x-position.x,point.y-position.y,point.z-position.z);
    if(gap>SERVICE_CONNECTION_TOLERANCE)issue('gap','3D gap '+formatNumber(gap,2)+' mm exceeds the 1 mm modelling tolerance');
    if(route.system!==port.system)issue('system','Route and point systems differ');
    const used=servicePortUsers(item.id,port.id,model).length;
    if(port.maxConnections.trim()&&used>Number(port.maxConnections))issue('capacity','Maximum route ends exceeded ('+used+'/'+Number(port.maxConnections)+')');
    if(route.levelId!==item.levelId)issue('level','Assigned levels differ; review the level crossing');
    if(route.size.trim()&&port.size.trim()&&route.size.trim().toLowerCase()!==port.size.trim().toLowerCase())issue('size','Size/rating text differs; review the intended connection');
  }
  const broken=codes.some(c=>['missing-item','missing-point','gap','system','capacity'].includes(c));
  return {route,end,ref,item,port,point,position,gap,codes,issues,status:broken?'Check':!ref?'Unassigned':issues.length?'Review':'Linked'};
}
function serviceConnectionRows(model=state.model) {return (model.services||[]).flatMap(route=>['start','end'].map(end=>serviceConnectionRow(route,end,model)));}
function servicePortRows(model=state.model) {
  return servicePortEntries(model).map(entry=>{
    const users=servicePortUsers(entry.item.id,entry.port.id,model),rows=users.map(u=>serviceConnectionRow(u.route,u.end,model));
    const issues=[...new Set(rows.flatMap(r=>r.issues))];
    if(!users.length)issues.push('No route ends assigned');
    if(!entry.port.maxConnections.trim())issues.push('Maximum route ends unspecified');
    if(!entry.port.designRef.trim())issues.push('Point design reference unspecified');
    return {...entry,users,issues,status:rows.some(r=>r.status==='Check')?'Check':!users.length?'Unused':issues.length?'Review':'Linked'};
  });
}
function connectionToken(ref) {return ref?JSON.stringify([ref.itemId,ref.portId]):'';}
function renderServiceRouteConnections(route) {
  const entries=servicePortEntries();
  return '<h3>Endpoint connections</h3>'+['start','end'].map(end=>{
    const row=serviceConnectionRow(route,end),value=connectionToken(row.ref),options=[['','Unassigned']];
    if(row.ref&&!row.port)options.push([value,'Unresolved saved connection']);
    options.push(...entries.map(({item,port,position})=>[connectionToken({itemId:item.id,portId:port.id}),item.name+' / '+port.name+' · '+SERVICE_SYSTEMS[port.system].label+' · z '+position.z+' mm']));
    return serviceSelect(end==='start'?'Start connection point':'End connection point','connection-'+end,value,options)+
      '<p class="overview-copy">'+end+': <strong>'+row.status+'</strong> · '+escapeHtml(row.issues.join('; ')||'Endpoint aligned in 3D')+'</p>'+
      (row.ref?'<button type="button" class="link-button" data-action="service-resnap-'+end+'">Align '+end+' to its point</button>':'');
  }).join('')+'<p class="overview-copy">Choosing a point snaps X/Y/elevation and records a link. Moving that item or point moves linked ends in the same undo step. Manual endpoint edits retain the link and report any gap. Checks use a 1 mm modelling tolerance.</p>';
}
function renderServicePorts(item) {
  const rows=servicePortRows().filter(r=>r.item.id===item.id);
  return '<h3>Connection points</h3><button class="link-button" type="button" data-action="service-add-port">Add connection point</button>'+rows.map((r,i)=>{
    const p=r.port,open=state.selected?.portId===p.id||rows.length===1;
    return '<details '+(open?'open':'')+'><summary>'+escapeHtml(p.name)+' · '+r.status+' · '+r.users.length+' route ends</summary><div class="field-grid">'+
      detailInput('Point name','port-'+i+'-name',p.name,'',false)+
      serviceSelect('Point system','port-'+i+'-system',p.system,Object.entries(SERVICE_SYSTEMS).map(([k,v])=>[k,v.label]))+
      ['x','y','z'].map(axis=>detailInput('Offset '+axis.toUpperCase()+' from item','port-'+i+'-offset'+axis.toUpperCase(),p.offset[axis],'mm')).join('')+
      detailInput('Specified size / rating','port-'+i+'-size',p.size,'',false)+
      detailInput('Maximum route ends (blank = unspecified)','port-'+i+'-maxConnections',p.maxConnections,'',false)+
      detailInput('Point design reference','port-'+i+'-designRef',p.designRef,'',false)+detailInput('Point notes','port-'+i+'-notes',p.notes,'',false)+'</div>'+
      '<p class="overview-copy">Absolute XYZ: '+formatNumber(r.position.x,0)+', '+formatNumber(r.position.y,0)+', '+formatNumber(r.position.z,0)+' mm. '+escapeHtml(r.issues.join('; ')||'Linked endpoints aligned')+'</p>'+
      r.users.map(u=>'<button type="button" class="link-button" data-select-connection-route="'+escapeHtml(u.route.id)+'">'+escapeHtml(u.route.name)+' · '+u.end+'</button>').join('')+
      '<button class="delete-button" type="button" data-action="service-delete-port" data-index="'+i+'">Delete point</button></details>';
  }).join('')+'<p class="overview-copy">Offsets follow the item position and absolute elevation. Points may use different systems on the same fixture. Maximum route ends is your explicit connection-count record. Deleting a point leaves its route links unresolved for review.</p>';
}
function checkServiceConnectionAssignment(route,end,ref) {
  const {item,port,position}=resolveServiceConnection(ref);
  if(!port)throw new Error('Choose an existing connection point.');
  if(port.system!==route.system)throw new Error('Route and connection point must use the same system.');
  const others=servicePortUsers(item.id,port.id).filter(u=>!(u.route.id===route.id&&u.end===end)).length;
  if(port.maxConnections.trim()&&others+1>Number(port.maxConnections))throw new Error('This point has reached its maximum route ends.');
  return position;
}
function connectServiceEndpoint(route,end,ref) {
  const next=clone(route);next.points=clone(servicePoints(route));next.connections={start:null,end:null,...next.connections};
  try {
    if(ref)next.points[end==='start'?0:next.points.length-1]=checkServiceConnectionAssignment(route,end,ref);
    next.connections[end]=ref;validateService(next);
  }catch(error){serviceError(error.message);return;}
  state.serviceError='';withHistory(()=>Object.assign(route,next));
}
function commitServiceItemWithConnections(item,next) {
  const updates=[];
  try {
    validateServiceItem(next);
    for(const route of state.model.services||[]) {
      const copy=clone(route);let changed=false;
      for(const end of ['start','end']) {
        const ref=route.connections?.[end];if(ref?.itemId!==item.id)continue;
        const before=item.ports?.find(p=>p.id===ref.portId),after=next.ports?.find(p=>p.id===ref.portId);
        if(!before||!after)continue;
        const a=servicePortPosition(item,before),b=servicePortPosition(next,after);
        if(a.x===b.x&&a.y===b.y&&a.z===b.z)continue;
        copy.points=copy.points||clone(servicePoints(copy));copy.points[end==='start'?0:copy.points.length-1]=b;changed=true;
      }
      if(changed){validateService(copy);updates.push([route,copy]);}
    }
  }catch(error){serviceError('Item/point edit rejected: '+error.message);return false;}
  state.serviceError='';withHistory(()=>{Object.assign(item,next);for(const [route,copy] of updates)Object.assign(route,copy);});return true;
}
function updateServiceConnectionField(field,raw) {
  if(state.selected?.type==='service'&&['connection-start','connection-end'].includes(field)) {
    let ref=null;
    try{if(raw){const ids=JSON.parse(raw);if(!Array.isArray(ids)||ids.length!==2||ids.some(id=>typeof id!=='string'))throw new Error('Invalid connection selection.');ref={itemId:ids[0],portId:ids[1]};}}
    catch(error){serviceError(error.message);return true;}
    connectServiceEndpoint(selectedObject(),field.slice(11),ref);return true;
  }
  const match=/^port-(\d+)-(name|system|offsetX|offsetY|offsetZ|size|maxConnections|designRef|notes)$/.exec(field);
  if(state.selected?.type!=='serviceItem'||!match)return false;
  const item=selectedObject(),next=clone(item),p=next.ports?.[Number(match[1])];if(!p)return true;
  const key=match[2];if(key.startsWith('offset'))p.offset[key.at(-1).toLowerCase()]=raw.trim()?Number(raw):NaN;else p[key]=raw.slice(0,2000);
  commitServiceItemWithConnections(item,next);return true;
}
function serviceConnectionAction(action,index) {
  if(state.selected?.type==='serviceItem'&&['service-add-port','service-delete-port'].includes(action)) {
    const item=selectedObject(),next=clone(item);next.ports ||= [];
    if(action==='service-add-port'){const p=makeServicePort(next);next.ports.push(p);if(commitServiceItemWithConnections(item,next)){state.selected.portId=p.id;state.visibility.serviceConnections=true;render();}}
    else if(Number.isInteger(index)&&index>=0&&index<next.ports.length){next.ports.splice(index,1);commitServiceItemWithConnections(item,next);}
    return true;
  }
  if(state.selected?.type==='service'&&['service-resnap-start','service-resnap-end'].includes(action)) {
    const route=selectedObject(),end=action.slice(15),ref=route.connections?.[end];if(ref)connectServiceEndpoint(route,end,ref);return true;
  }
  return false;
}
function servicePortSnap(point) {
  if(state.visibility.serviceConnections===false)return null;
  const entries=servicePortEntries().filter(e=>e.item.levelId===state.model.activeLevelId)
    .map(e=>({...e,distance:lengthBetween(point,e.position)})).filter(e=>e.distance<=12/state.view.scale).sort((a,b)=>a.distance-b.distance);
  if(!entries.length||entries.length>1&&Math.abs(entries[0].distance-entries[1].distance)<.001)return null;
  return entries[0];
}
function attachDrawnServiceEndpoints(route) {
  const snaps=['start','end'].map(end=>({end,snap:servicePortSnap(serviceEndPosition(route,end))}));
  const first=snaps.find(s=>s.snap);if(first)route.system=first.snap.port.system;
  route.connections={start:null,end:null};
  for(const {end,snap} of snaps)if(snap) {
    const ref={itemId:snap.item.id,portId:snap.port.id};
    route.points[end==='start'?0:route.points.length-1]=checkServiceConnectionAssignment(route,end,ref);route.connections[end]=ref;
  }
  // A closed route can assign both ends to one point; count both new ends together.
  for(const {snap} of snaps)if(snap?.port.maxConnections.trim()) {
    const assigned=Object.values(route.connections).filter(ref=>ref?.itemId===snap.item.id&&ref.portId===snap.port.id).length;
    if(servicePortUsers(snap.item.id,snap.port.id).length+assigned>Number(snap.port.maxConnections))throw new Error('This point has reached its maximum route ends.');
  }
}
function hitServicePort(p) {
  if(state.visibility.serviceConnections===false)return null;
  const entry=[...servicePortEntries()].reverse().find(e=>e.item.levelId===state.model.activeLevelId&&lengthBetween(p,e.position)<10/state.view.scale);
  return entry?{type:'serviceItem',id:entry.item.id,portId:entry.port.id}:null;
}
function connectionColour(status) {return status==='Linked'?'#1c6243':status==='Check'?'#cf202b':'#b5681c';}
function drawServiceConnections(is3d=false) {
  if(state.visibility.serviceConnections===false)return;
  if(!(state.model.services||[]).length&&!servicePortEntries().length)return;
  const screen=p=>is3d?isoPoint(p,p.z):worldToScreen(p),visible=item=>is3d?isLevelVisible3d(item):item.levelId===state.model.activeLevelId;
  ctx.save();ctx.lineWidth=2;ctx.setLineDash([]);ctx.font='10px Segoe UI';
  for(const row of serviceConnectionRows()) {
    if(!visible(row.route))continue;
    const p=screen(row.point);ctx.strokeStyle=connectionColour(row.status);ctx.fillStyle=ctx.strokeStyle;
    ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.stroke();
    if(row.position&&row.gap>SERVICE_CONNECTION_TOLERANCE){const target=screen(row.position);ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(target.x,target.y);ctx.stroke();ctx.setLineDash([]);}
  }
  for(const row of servicePortRows()) {
    if(!visible(row.item))continue;
    const p=screen(row.position),selected=state.selected?.id===row.item.id&&state.selected?.portId===row.port.id;
    ctx.strokeStyle=selected?'#ed1c24':connectionColour(row.status);ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle;ctx.fillText(String((row.item.ports||[]).indexOf(row.port)+1),p.x-3,p.y+3);
    ctx.fillText(row.port.name,p.x+12,p.y+13);
  }
  ctx.restore();
}
function renderServiceConnectionSchedule() {
  const el=document.querySelector('#serviceConnectionSchedule');if(!el)return;
  const rows=serviceConnectionRows(),ports=servicePortRows();
  el.innerHTML='<p class="overview-copy">'+ports.length+' points · '+rows.filter(r=>r.status==='Linked').length+' linked ends · '+rows.filter(r=>r.status==='Unassigned').length+' unassigned · '+rows.filter(r=>['Check','Review'].includes(r.status)).length+' ends need review. All levels/layers included.</p><h4>Route endpoints</h4>'+
    rows.map(r=>'<button type="button" class="foundation-schedule-row" data-connection-route="'+escapeHtml(r.route.id)+'"><strong>'+escapeHtml(r.route.name)+' · '+r.end+' · '+r.status+'</strong><span>'+escapeHtml(levelName(r.route.levelId))+' · '+escapeHtml(r.item?r.item.name+' / '+(r.port?.name||'missing point'):'Unassigned / missing item')+'</span><small>'+escapeHtml(r.issues.join('; ')||'Endpoint aligned in 3D')+'</small></button>').join('')+
    '<h4>Fitting / fixture points</h4>'+ports.map(r=>'<button type="button" class="foundation-schedule-row" data-connection-item="'+escapeHtml(r.item.id)+'" data-port-id="'+escapeHtml(r.port.id)+'"><strong>'+escapeHtml(r.item.name)+' / '+escapeHtml(r.port.name)+' · '+r.status+'</strong><span>'+SERVICE_SYSTEMS[r.port.system].label+' · '+escapeHtml(levelName(r.item.levelId))+' · '+r.users.length+' route ends · XYZ '+formatNumber(r.position.x,0)+', '+formatNumber(r.position.y,0)+', '+formatNumber(r.position.z,0)+' mm</span><small>'+escapeHtml(r.issues.join('; ')||'Linked endpoints aligned')+'</small></button>').join('');
}
function selectServiceConnection(routeId,itemId,portId) {
  state.selected=routeId?{type:'service',id:routeId}:{type:'serviceItem',id:itemId,portId};
  const obj=selectedObject();if(!obj){state.selected=null;return;}
  state.model.activeLevelId=obj.levelId;state.serviceDraft=[];state.serviceError='';render();
  document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});
}
function exportServiceConnectionCsv() {
  serviceCsv('bc-design-service-connections.csv',[
    ['Record','Route ID','Route name','End','Item ID','Item name','Point ID','Point name','System','Level','X mm','Y mm','Elevation mm','3D gap mm','Assigned route ends','Maximum route ends','Size rating','Design reference','Status','Review','Point offset X mm','Point offset Y mm','Point offset Z mm','Notes'],
    ...serviceConnectionRows().map(r=>['Endpoint',r.route.id,r.route.name,r.end,r.ref?.itemId||'',r.item?.name||'',r.ref?.portId||'',r.port?.name||'',r.route.system,levelName(r.route.levelId),r.point.x,r.point.y,r.point.z,r.gap,'','',r.route.size,r.route.designRef,r.status,r.issues.join('; '),'','','',r.route.notes]),
    ...servicePortRows().map(r=>['Point','','','',r.item.id,r.item.name,r.port.id,r.port.name,r.port.system,levelName(r.item.levelId),r.position.x,r.position.y,r.position.z,'',r.users.length,r.port.maxConnections,r.port.size,r.port.designRef,r.status,r.issues.join('; '),r.port.offset.x,r.port.offset.y,r.port.offset.z,r.port.notes])
  ]);
}
