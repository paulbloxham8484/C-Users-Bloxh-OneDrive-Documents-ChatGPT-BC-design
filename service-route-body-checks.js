/* Route centrelines against explicit product body boxes. No route radius or clearance inferred. */
const ROUTE_BODY_EPS=1e-6; // mm: numerical boundary handling only
function routeBodyClip(a,b,bounds,axes) {
  let enter=0,exit=1;
  for(const axis of axes) {
    const [low,high]=bounds[axis],delta=b[axis]-a[axis];
    if(Math.abs(delta)<=ROUTE_BODY_EPS) {
      if(a[axis]<=low+ROUTE_BODY_EPS||a[axis]>=high-ROUTE_BODY_EPS)return null;
    } else {
      const first=(low-a[axis])/delta,last=(high-a[axis])/delta;
      enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));
      if(exit<=enter)return null;
    }
  }
  if(!Number.isFinite(enter)||!Number.isFinite(exit)||exit<=enter)return null;
  return [enter,exit];
}
function routeBodyPoint(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
function routeBodyFrame(item) {
  const box=serviceEnvelopeGeometry(item).body,e=item.envelope;
  if(!box)return null;
  const w=Number(e.width),d=Number(e.depth),h=Number(e.height),angle=(Number(e.rotation||0)%360)*Math.PI/180;
  if([w,d,h].some(n=>n<=2*ROUTE_BODY_EPS)||!Number.isFinite(clearancePolygonArea(box.base))||clearancePolygonArea(box.base)<=ROUTE_BODY_EPS**2||box.top[0].z-box.base[0].z<=ROUTE_BODY_EPS)return null;
  const c=Math.cos(angle),s=Math.sin(angle);
  return {box,bounds:{x:[-w/2,w/2],y:[-d/2,d/2],z:[0,h]},
    minX:Math.min(...box.base.map(p=>p.x)),maxX:Math.max(...box.base.map(p=>p.x)),
    minY:Math.min(...box.base.map(p=>p.y)),maxY:Math.max(...box.base.map(p=>p.y)),
    local:p=>{const x=p.x-item.center.x,y=p.y-item.center.y;return {x:x*c+y*s,y:-x*s+y*c,z:p.z-item.elevation};}};
}
function serviceRouteBodyChecks(model=state.model) {
  const pairs=[],unchecked=[],bodies=[];
  for(const item of model.serviceItems||[]) {
    const frame=routeBodyFrame(item);
    if(frame)bodies.push({item,frame});
    else unchecked.push({item,reason:serviceEnvelopeGeometry(item).body?'Body coordinates are degenerate or outside the reliable numerical range':'Complete product width, depth and height are required'});
  }
  for(const route of model.services||[])for(const {item,frame} of bodies) {
    const segments=[];
    for(const [index,segment] of serviceGeometry(route).segments.entries()) {
      const {a,b}=segment;
      if(Math.max(a.x,b.x)<frame.minX||Math.min(a.x,b.x)>frame.maxX||Math.max(a.y,b.y)<frame.minY||Math.min(a.y,b.y)>frame.maxY)continue;
      const localA=frame.local(a),localB=frame.local(b);
      if([localA,localB].some(p=>![p.x,p.y,p.z].every(Number.isFinite))){unchecked.push({route,item,reason:'Route/body relative coordinates exceed the numerical range'});continue;}
      const plan=routeBodyClip(localA,localB,frame.bounds,['x','y']);if(!plan)continue;
      if(segment.length*(plan[1]-plan[0])<=ROUTE_BODY_EPS)continue;
      const inside=routeBodyClip(localA,localB,frame.bounds,['x','y','z']);
      const length=inside?segment.length*(inside[1]-inside[0]):0;
      const positive=length>ROUTE_BODY_EPS;
      const planStart=routeBodyPoint(a,b,plan[0]),planEnd=routeBodyPoint(a,b,plan[1]);
      const low=frame.box.base[0].z,high=frame.box.top[0].z;
      const gap=Math.max(0,Math.min(planStart.z,planEnd.z)-high,low-Math.max(planStart.z,planEnd.z));
      segments.push({index:index+1,status:positive?'Centreline inside body':'Plan crossing only',planStart,planEnd,
        insideStart:positive?routeBodyPoint(a,b,inside[0]):null,insideEnd:positive?routeBodyPoint(a,b,inside[1]):null,
        length:positive?length:0,planRun:segment.plan*(plan[1]-plan[0]),gap});
    }
    if(!segments.length)continue;
    const connectedEnds=['start','end'].filter(end=>route.connections?.[end]?.itemId===item.id);
    const review=[...(!item.envelope.sourceRef.trim()?['Product dimensions source unspecified']:[]),
      ...(!route.designRef.trim()?['Route design source unspecified']:[]),
      ...(connectedEnds.length?['Recorded '+connectedEnds.join('/')+' endpoint references this item; entry may be intentional, check connection geometry']:[]),
      'Centreline/body geometry only; route thickness, access and compliance are not assessed'].join('; ');
    pairs.push({key:JSON.stringify([route.id,item.id]),route,item,segments,connectedEnds,
      status:segments.some(s=>s.length>0)?'Centreline inside body':'Plan crossing only',
      length:segments.reduce((n,s)=>n+s.length,0),planRun:segments.reduce((n,s)=>n+s.planRun,0),review});
  }
  return {pairs,unchecked,checked:bodies.length,routes:(model.services||[]).length};
}
function routeBodyMetrics(pair) {
  return pair.segments.length+' crossing segments · '+formatNumber(pair.length,2)+' mm centreline inside body';
}
function routeBodySelectButtons(pair) {
  return ['route','item'].map(type=>'<button class="link-button" type="button" data-route-body-key="'+escapeHtml(pair.key)+'" data-route-body-select="'+type+'">Review '+escapeHtml(pair[type].name)+'</button>').join('');
}
function selectServiceRouteBody(key,type='route') {
  const pair=serviceRouteBodyChecks().pairs.find(p=>p.key===key);if(!pair)return;
  state.selectedRouteBodyPair=key;state.visibility.serviceRouteBodyChecks=true;
  selectServiceConnection(type==='route'?pair.route.id:null,pair.item.id);
}
function onServiceRouteBodyClick(event) {
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.routeBodyKey)selectServiceRouteBody(button.dataset.routeBodyKey,button.dataset.routeBodySelect);
  else if(button.dataset.routeBodyUnchecked)selectServiceConnection(null,button.dataset.routeBodyUnchecked);
}
function renderServiceRouteBodyReview(type,obj) {
  const results=serviceRouteBodyChecks(),pairs=results.pairs.filter(p=>p[type].id===obj.id);
  const unchecked=type==='item'?results.unchecked.find(row=>row.item.id===obj.id):null;
  return '<h3>Route / body review</h3>'+(unchecked?'<p class="overview-copy">Not assessed: '+escapeHtml(unchecked.reason)+'</p>':'')+
    (pairs.length?pairs.map(p=>'<p class="overview-copy"><strong>'+p.status+'</strong> · '+escapeHtml(p[type==='route'?'item':'route'].name)+' · '+routeBodyMetrics(p)+'</p>'+routeBodySelectButtons(p)).join(''):
      '<p class="overview-copy">No centreline crossings detected against configured body boxes. Incomplete bodies remain unassessed.</p>');
}
function serviceRouteBodyPairVisible(pair,is3d) {
  return is3d?isLevelVisible3d(pair.route)&&isLevelVisible3d(pair.item):[pair.route.levelId,pair.item.levelId].includes(state.model.activeLevelId);
}
function drawServiceRouteBodyChecks(is3d=false) {
  if(state.visibility.serviceRouteBodyChecks===false)return;
  const labels=[],project=p=>is3d?isoPoint(p,p.z):worldToScreen(p);
  for(const pair of serviceRouteBodyChecks().pairs) {
    if(!serviceRouteBodyPairVisible(pair,is3d))continue;
    for(const segment of pair.segments) {
      const inside=segment.length>0,a=project(inside?segment.insideStart:segment.planStart),b=project(inside?segment.insideEnd:segment.planEnd);
      const colour=inside?'#cf202b':'#b5681c';ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour;
      ctx.lineWidth=state.selectedRouteBodyPair===pair.key?7:5;ctx.setLineDash(inside?[]:[6,4]);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};ctx.setLineDash([]);ctx.beginPath();ctx.arc(middle.x,middle.y,4,0,Math.PI*2);ctx.fill();
      if(is3d&&!inside&&segment.gap>0) {
        const low=pair.item.elevation,high=low+Number(pair.item.envelope.height);
        const point=[segment.planStart,segment.planEnd].sort((a,b)=>Math.abs(a.z-clamp(a.z,low,high))-Math.abs(b.z-clamp(b.z,low,high)))[0];
        const from=project(point),to=project({...point,z:clamp(point.z,low,high)});ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.setLineDash([]);
      }
      let labelY=middle.y-9;while(labels.some(p=>Math.abs(p.x-middle.x)<180&&Math.abs(p.y-labelY)<15))labelY-=16;
      labels.push({x:middle.x,y:labelY});ctx.font='10px Segoe UI';
      ctx.fillText(inside?'Centreline in body · '+formatNumber(segment.length,0)+' mm':'Plan crossing · gap '+formatNumber(segment.gap,0)+' mm',middle.x+7,labelY);ctx.restore();
    }
  }
}
function isolateServiceRouteBodyChecks(){setServiceOverlays(false);state.visibility.serviceRouteBodyChecks=true;render();}
function renderServiceRouteBodySchedule() {
  const el=document.querySelector('#serviceRouteBodySchedule');if(!el)return;
  const result=serviceRouteBodyChecks(),inside=result.pairs.filter(p=>p.length>0).length;
  el.innerHTML='<p class="overview-copy">'+result.routes+' routes · '+result.checked+' configured bodies · '+inside+' pairs with centreline entry · '+(result.pairs.length-inside)+' plan-only pairs · '+result.unchecked.length+' records not assessed.</p>'+
    (result.pairs.length?result.pairs.map(pair=>'<div class="foundation-schedule-row"><strong>'+escapeHtml(pair.route.name)+' / '+escapeHtml(pair.item.name)+' · '+pair.status+'</strong><span>'+escapeHtml(levelName(pair.route.levelId))+' / '+escapeHtml(levelName(pair.item.levelId))+' · '+routeBodyMetrics(pair)+'</span><small>'+escapeHtml(pair.review)+'</small>'+routeBodySelectButtons(pair)+
      '<details><summary>Crossing segments</summary>'+pair.segments.map(s=>'<p class="overview-copy">Segment '+s.index+' · '+s.status+' · '+formatNumber(s.length,2)+' mm inside · '+formatNumber(s.gap,2)+' mm vertical gap</p>').join('')+'</details></div>').join(''):'<p class="overview-copy">No centreline crossings detected against configured body boxes.</p>')+
    (result.unchecked.length?'<h4>Not assessed</h4>'+result.unchecked.map(row=>'<button type="button" class="foundation-schedule-row" data-route-body-unchecked="'+escapeHtml(row.item.id)+'"><strong>'+escapeHtml(row.item.name)+'</strong><small>'+escapeHtml(row.reason)+'</small></button>').join(''):'');
}
function exportServiceRouteBodyCsv() {
  const result=serviceRouteBodyChecks();
  serviceCsv('bc-design-service-route-body-checks.csv',[
    ['Record','Route ID','Route name','Route level','Item ID','Item name','Item level','Status','Segment','Inside centreline mm','Plan crossing run mm','Vertical gap mm','Plan entry XYZ mm','Plan exit XYZ mm','Body entry XYZ mm','Body exit XYZ mm','Connected endpoints','Product dimensions source','Route design source','Review'],
    ...result.pairs.flatMap(p=>p.segments.map(s=>['Crossing',p.route.id,p.route.name,levelName(p.route.levelId),p.item.id,p.item.name,levelName(p.item.levelId),s.status,s.index,s.length,s.planRun,s.gap,JSON.stringify(s.planStart),JSON.stringify(s.planEnd),s.insideStart?JSON.stringify(s.insideStart):'',s.insideEnd?JSON.stringify(s.insideEnd):'',p.connectedEnds.join('; '),p.item.envelope.sourceRef,p.route.designRef,p.review])),
    ...result.unchecked.map(row=>['Not assessed',row.route?.id||'',row.route?.name||'',row.route?levelName(row.route.levelId):'',row.item.id,row.item.name,levelName(row.item.levelId),'Not assessed',...Array(11).fill(''),row.reason])
  ]);
}
