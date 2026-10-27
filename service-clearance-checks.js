/* Intersections of explicitly recorded vertical clearance prisms. Derived results only. */
const CLEARANCE_NUMERIC_EPS=1e-6; // millimetres: floating-point boundary handling, not a design allowance
function isolateServiceClearanceChecks() {setServiceOverlays(false);state.visibility.serviceClearanceChecks=true;render();}
function clearancePolygonArea(points) {
  if(points.length<3)return 0;
  const origin=points[0];let twice=0;
  for(let i=1;i<points.length-1;i++)twice+=(points[i].x-origin.x)*(points[i+1].y-origin.y)-(points[i].y-origin.y)*(points[i+1].x-origin.x);
  return Math.abs(twice)/2;
}
function clearanceRectanglesPenetrate(a,b) {
  const origin=a[0],project=(p,n)=>(p.x-origin.x)*n.x+(p.y-origin.y)*n.y;
  for(const rect of [a,b])for(let i=0;i<2;i++) {
    const p=rect[i],q=rect[i+1],length=lengthBetween(p,q);if(length<=CLEARANCE_NUMERIC_EPS)return false;
    const normal={x:-(q.y-p.y)/length,y:(q.x-p.x)/length};
    const pa=a.map(p=>project(p,normal)),pb=b.map(p=>project(p,normal));
    if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=CLEARANCE_NUMERIC_EPS)return false;
  }
  return true;
}
function intersectClearanceFootprints(a,b) {
  if(!clearanceRectanglesPenetrate(a,b))return [];
  // Translate before clipping to reduce cancellation in large project coordinates.
  const origin=a[0],local=p=>({x:p.x-origin.x,y:p.y-origin.y});
  let output=a.map(local);const clip=b.map(local);
  for(let i=0;i<clip.length&&output.length;i++) {
    const u=clip[i],v=clip[(i+1)%clip.length],dx=v.x-u.x,dy=v.y-u.y,edgeLength=Math.hypot(dx,dy);
    const distance=p=>(dx*(p.y-u.y)-dy*(p.x-u.x))/edgeLength,input=output;output=[];
    let previous=input.at(-1),pd=distance(previous);
    for(const current of input) {
      const cd=distance(current),inside=cd>=-CLEARANCE_NUMERIC_EPS,wasInside=pd>=-CLEARANCE_NUMERIC_EPS;
      if(inside!==wasInside) {
        const t=pd/(pd-cd);output.push({x:previous.x+t*(current.x-previous.x),y:previous.y+t*(current.y-previous.y)});
      }
      if(inside)output.push(current);
      previous=current;pd=cd;
    }
  }
  const clean=output.filter((p,i)=>!i||lengthBetween(p,output[i-1])>CLEARANCE_NUMERIC_EPS);
  if(clean.length>1&&lengthBetween(clean[0],clean.at(-1))<=CLEARANCE_NUMERIC_EPS)clean.pop();
  return clean.map(p=>({x:p.x+origin.x,y:p.y+origin.y}));
}
function serviceClearanceChecks(model=state.model) {
  const entries=[],unchecked=[],pairs=[];
  for(const item of model.serviceItems||[]) {
    const box=serviceEnvelopeGeometry(item).clearance;
    if(!box){unchecked.push({item,reason:'Complete product dimensions and all six clearance margins are required'});continue;}
    const area=clearancePolygonArea(box.base),height=box.top[0].z-box.base[0].z;
    if(!Number.isFinite(area)||area<=CLEARANCE_NUMERIC_EPS**2||!Number.isFinite(height)||height<=CLEARANCE_NUMERIC_EPS){unchecked.push({item,reason:'Clearance coordinates exceed the reliable numerical range or are degenerate'});continue;}
    entries.push({item,box,minX:Math.min(...box.base.map(p=>p.x)),maxX:Math.max(...box.base.map(p=>p.x)),minY:Math.min(...box.base.map(p=>p.y)),maxY:Math.max(...box.base.map(p=>p.y))});
  }
  entries.sort((a,b)=>a.minX-b.minX||a.item.id.localeCompare(b.item.id));
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++) {
    const a=entries[i],b=entries[j];
    if(b.minX>=a.maxX-CLEARANCE_NUMERIC_EPS)break;
    if(Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY)<=CLEARANCE_NUMERIC_EPS)continue;
    const polygon=intersectClearanceFootprints(a.box.base,b.box.base),area=clearancePolygonArea(polygon);
    if(!area||area<=CLEARANCE_NUMERIC_EPS**2)continue;
    const low=Math.max(a.box.base[0].z,b.box.base[0].z),high=Math.min(a.box.top[0].z,b.box.top[0].z);
    const height=Math.max(0,high-low),volume=height>CLEARANCE_NUMERIC_EPS?area*height:0,gap=Math.max(0,low-high);
    const status=!Number.isFinite(volume)?'Not assessed':volume>0?'Volume overlap':'Plan overlap only';
    const review=status==='Not assessed'?'Overlap volume exceeds the numerical range':
      [a,b].flatMap(e=>serviceEnvelopeReview(e.item).map(issue=>e.item.name+': '+issue)).join('; ')||'Recorded zones only; project/product review required';
    pairs.push({key:JSON.stringify([a.item.id,b.item.id].sort()),a:a.item,b:b.item,polygon,area,low,high,height:volume>0?height:0,gap,volume:Number.isFinite(volume)?volume:null,status,review});
  }
  return {pairs,unchecked,checked:entries.length};
}
function clearancePairMetrics(pair) {
  return formatNumber(pair.area/1e6,3)+' m² plan intersection · '+(pair.status==='Volume overlap'?formatNumber(pair.height,2)+' mm vertical overlap · '+formatNumber(pair.volume/1e9,6)+' m³ intersection':pair.status==='Plan overlap only'?formatNumber(pair.gap,2)+' mm vertical gap':'Numerical review required');
}
function renderServiceClearanceItemReview(item) {
  const result=serviceClearanceChecks(),pairs=result.pairs.filter(p=>p.a.id===item.id||p.b.id===item.id),unchecked=result.unchecked.find(r=>r.item.id===item.id);
  return '<h3>Clearance overlap review</h3>'+(unchecked?'<p class="overview-copy">Not assessed: '+escapeHtml(unchecked.reason)+'</p>':pairs.length?pairs.map(pair=>{
    const other=pair.a.id===item.id?pair.b:pair.a;
    return '<p class="overview-copy"><strong>'+pair.status+'</strong> with '+escapeHtml(other.name)+' · '+clearancePairMetrics(pair)+'</p><button class="link-button" type="button" data-clearance-pair="'+escapeHtml(pair.key)+'" data-overlap-item="'+escapeHtml(other.id)+'">Review '+escapeHtml(other.name)+'</button>';
  }).join(''):'<p class="overview-copy">No overlapping recorded clearance zones detected for this item.</p>');
}
function selectServiceClearancePair(key,itemId) {
  const pair=serviceClearanceChecks().pairs.find(pair=>pair.key===key);if(!pair)return;
  if(![pair.a.id,pair.b.id].includes(itemId))itemId=pair.a.id;
  state.selectedClearancePair=key;state.visibility.serviceClearanceChecks=true;
  selectServiceConnection(null,itemId);
}
function serviceClearancePairVisible(pair,is3d) {
  return is3d?isLevelVisible3d(pair.a)&&isLevelVisible3d(pair.b):[pair.a.levelId,pair.b.levelId].includes(state.model.activeLevelId);
}
function drawServiceClearanceChecks(is3d=false) {
  if(state.visibility.serviceClearanceChecks===false)return;
  const labelPositions=[];
  for(const pair of serviceClearanceChecks().pairs) {
    if(!serviceClearancePairVisible(pair,is3d)||pair.status==='Not assessed')continue;
    const solid=pair.status==='Volume overlap',colour=solid?'#cf202b':'#b5681c';
    const centroid={x:pair.polygon.reduce((n,p)=>n+p.x,0)/pair.polygon.length,y:pair.polygon.reduce((n,p)=>n+p.y,0)/pair.polygon.length};
    const project=(p,z)=>is3d?isoPoint(p,z):worldToScreen(p);
    ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=solid?'rgba(207,32,43,.2)':'rgba(181,104,28,.14)';ctx.lineWidth=state.selectedClearancePair===pair.key?3:2;ctx.setLineDash(solid?[]:[5,4]);
    const face=points=>{ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();ctx.stroke();};
    if(is3d&&solid) {
      const base=pair.polygon.map(p=>project(p,pair.low)),top=pair.polygon.map(p=>project(p,pair.high));face(top);
      for(let i=0;i<base.length;i++){const j=(i+1)%base.length;face([base[i],base[j],top[j],top[i]]);}
    } else if(is3d) {
      const a=project(centroid,pair.high),b=project(centroid,pair.low);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.stroke();}
    } else face(pair.polygon.map(p=>project(p,pair.low)));
    const label=project(centroid,pair.low);ctx.setLineDash([]);ctx.font='10px Segoe UI';ctx.fillStyle=colour;
    let labelY=label.y-7;
    while(labelPositions.some(p=>Math.abs(p.x-label.x)<180&&Math.abs(p.y-labelY)<15))labelY-=16;
    labelPositions.push({x:label.x,y:labelY});
    ctx.fillText(solid?'Clearance volume overlap':'Plan only · gap '+formatNumber(pair.gap,0)+' mm',label.x+7,labelY);ctx.restore();
  }
}
function renderServiceClearanceSchedule() {
  const el=document.querySelector('#serviceClearanceSchedule');if(!el)return;
  const result=serviceClearanceChecks(),volume=result.pairs.filter(p=>p.status==='Volume overlap').length,plan=result.pairs.filter(p=>p.status==='Plan overlap only').length;
  el.innerHTML='<p class="overview-copy">'+result.checked+' configured zones · '+volume+' volume overlaps · '+plan+' plan-only overlaps · '+result.unchecked.length+' items not assessed.</p>'+
    (result.pairs.length?result.pairs.map(pair=>'<div class="foundation-schedule-row"><strong>'+escapeHtml(pair.a.name)+' / '+escapeHtml(pair.b.name)+' · '+pair.status+'</strong><span>'+escapeHtml(levelName(pair.a.levelId))+' / '+escapeHtml(levelName(pair.b.levelId))+' · '+clearancePairMetrics(pair)+'</span><small>'+escapeHtml(pair.review)+'</small>'+[pair.a,pair.b].map(item=>'<button class="link-button" type="button" data-clearance-pair="'+escapeHtml(pair.key)+'" data-overlap-item="'+escapeHtml(item.id)+'">Review '+escapeHtml(item.name)+'</button>').join('')+'</div>').join(''):'<p class="overview-copy">No overlaps between configured clearance zones were detected.</p>')+
    (result.unchecked.length?'<h4>Not assessed</h4>'+result.unchecked.map(row=>'<button class="foundation-schedule-row" type="button" data-unchecked-clearance="'+escapeHtml(row.item.id)+'"><strong>'+escapeHtml(row.item.name)+'</strong><small>'+escapeHtml(row.reason)+'</small></button>').join(''):'');
}
function exportServiceClearanceCsv() {
  const result=serviceClearanceChecks();
  serviceCsv('bc-design-service-clearance-checks.csv',[
    ['Record','Item A ID','Item A name','Level A','Item B ID','Item B name','Level B','Status','Plan intersection mm2','Vertical overlap mm','Vertical gap mm','Overlap volume mm3','Intersection low Z mm','Intersection high Z mm','Footprint XY JSON mm','Source A','Source B','Review'],
    ['Summary','','','','','','','',...Array(9).fill(''),result.checked+' configured zones; '+result.pairs.length+' overlap records; '+result.unchecked.length+' items not assessed. Recorded service zones only.'],
    ...result.pairs.map(pair=>['Overlap',pair.a.id,pair.a.name,levelName(pair.a.levelId),pair.b.id,pair.b.name,levelName(pair.b.levelId),pair.status,pair.area,pair.height,pair.gap,pair.volume??'',pair.low,pair.high,JSON.stringify(pair.polygon),pair.a.envelope.clearanceRef,pair.b.envelope.clearanceRef,pair.review]),
    ...result.unchecked.map(row=>['Not assessed',row.item.id,row.item.name,levelName(row.item.levelId),'','','','Not assessed','','','','','','','','','',row.reason])
  ]);
}
