/* User-entered product envelopes and clearance records. No default product sizes. */
const SERVICE_ENVELOPE_FIELDS=['width','depth','height','rotation','left','right','front','back','below','above','sourceRef','clearanceRef','notes'];
const SERVICE_CLEARANCE_FIELDS=['left','right','front','back','below','above'];
function makeServiceEnvelope() {return Object.fromEntries(SERVICE_ENVELOPE_FIELDS.map(k=>[k,k==='rotation'?'0':'']));}
function serviceEnvelopeBox(item,x0,x1,y0,y1,z0,z1,rotation) {
  const angle=(rotation%360)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const base=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>({x:item.center.x+x*c-y*s,y:item.center.y+x*s+y*c,z:z0}));
  return {base,top:base.map(p=>({...p,z:z1}))};
}
function serviceEnvelopeGeometry(item) {
  const e=item.envelope;if(!e||['width','depth','height'].some(k=>!e[k].trim()))return {body:null,clearance:null};
  const w=Number(e.width),d=Number(e.depth),h=Number(e.height),r=Number(e.rotation||0),z=item.elevation;
  const body=serviceEnvelopeBox(item,-w/2,w/2,-d/2,d/2,z,z+h,r);
  const clearance=SERVICE_CLEARANCE_FIELDS.every(k=>e[k].trim())?
    serviceEnvelopeBox(item,-w/2-Number(e.left),w/2+Number(e.right),-d/2-Number(e.front),d/2+Number(e.back),z-Number(e.below),z+h+Number(e.above),r):null;
  return {body,clearance};
}
function validateServiceEnvelope(item) {
  const e=item.envelope;if(e===undefined||e===null)return;
  if(typeof e!=='object'||Array.isArray(e)||SERVICE_ENVELOPE_FIELDS.some(k=>typeof e[k]!=='string'||e[k].length>2000))throw new Error('Envelope fields must be text up to 2000 characters.');
  for(const key of ['width','depth','height','rotation',...SERVICE_CLEARANCE_FIELDS]) {
    if(!e[key].trim())continue;
    const value=Number(e[key]);
    if(!Number.isFinite(value)||(['width','depth','height'].includes(key)?value<=0:SERVICE_CLEARANCE_FIELDS.includes(key)&&value<0))throw new Error('Product dimensions must be positive; clearance margins must be zero or positive. Leave unknown values blank.');
  }
  const geometry=serviceEnvelopeGeometry(item);
  for(const box of [geometry.body,geometry.clearance])if(box&&[...box.base,...box.top].some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw new Error('Envelope coordinates exceed numeric limits.');
}
function normalizeServiceEnvelopes(model) {
  for(const item of model.serviceItems||[]){if(item.envelope===undefined)item.envelope=null;validateServiceEnvelope(item);}
}
function serviceEnvelopeBounds() {
  return (state.model.serviceItems||[]).flatMap(item=>Object.values(serviceEnvelopeGeometry(item)).flatMap(box=>box?[...box.base,...box.top]:[]));
}
function serviceEnvelopeReview(item) {
  const e=item.envelope,g=serviceEnvelopeGeometry(item),issues=[];
  if(!e)return ['Product envelope not recorded'];
  if(!g.body)issues.push('Product width/depth/height incomplete');
  if(!e.sourceRef.trim())issues.push('Product dimensions source unspecified');
  if(!g.clearance)issues.push('Clearance margins incomplete; all six values need explicit input, including zero');
  if(!e.clearanceRef.trim())issues.push('Clearance source unspecified');
  return issues;
}
function renderServiceEnvelopeDetails(item) {
  const e=item.envelope;
  if(!e)return '<h3>Product envelope / clearance</h3><button class="link-button" type="button" data-action="service-add-envelope">Add dimensioned envelope record</button><p class="overview-copy">Enter product dimensions and clearance requirements from the project/supplier evidence. No sizes are assumed.</p>';
  return '<h3>Product envelope / clearance</h3><div class="field-grid">'+
    [['width','Width local X','mm'],['depth','Depth local Y','mm'],['height','Height above item elevation','mm'],['rotation','Plan rotation','°'],
      ['left','Clearance left (−X)','mm'],['right','Clearance right (+X)','mm'],['front','Clearance front (−Y)','mm'],['back','Clearance back (+Y)','mm'],['below','Clearance below','mm'],['above','Clearance above','mm']]
      .map(([key,label,unit])=>detailInput(label,'envelope-'+key,e[key],unit)).join('')+
    detailInput('Dimensions source / product drawing','envelope-sourceRef',e.sourceRef,'',false)+detailInput('Clearance source / project reference','envelope-clearanceRef',e.clearanceRef,'',false)+detailInput('Envelope notes','envelope-notes',e.notes,'',false)+'</div>'+
    '<p class="overview-copy">'+escapeHtml(serviceEnvelopeReview(item).join('; ')||'Envelope and clearance recorded; qualified product review required')+'. The body is centred on the item X/Y with its base at the item elevation. Clearance margins use the same rotated local axes. Ports remain at their own recorded offsets.</p>'+
    '<button class="delete-button" type="button" data-action="service-remove-envelope">Remove envelope record</button>';
}
function updateServiceEnvelopeField(field,raw) {
  if(state.selected?.type!=='serviceItem'||!field.startsWith('envelope-'))return false;
  const key=field.slice(9),item=selectedObject();if(!SERVICE_ENVELOPE_FIELDS.includes(key)||!item.envelope)return true;
  const next=clone(item);next.envelope[key]=raw.slice(0,2000);commitServiceItemWithConnections(item,next);return true;
}
function serviceEnvelopeAction(action) {
  if(state.selected?.type!=='serviceItem'||!['service-add-envelope','service-remove-envelope'].includes(action))return false;
  const item=selectedObject(),next=clone(item);next.envelope=action==='service-add-envelope'?makeServiceEnvelope():null;
  if(commitServiceItemWithConnections(item,next)&&next.envelope){state.visibility.serviceEnvelopes=true;state.visibility.serviceClearances=true;render();}
  return true;
}
function drawServiceEnvelopeBox(box,is3d,colour,clearance=false) {
  const project=p=>is3d?isoPoint(p,p.z):worldToScreen(p),base=box.base.map(project),top=box.top.map(project);
  const face=points=>{ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();ctx.stroke();};
  ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=clearance?'rgba(181,104,28,.04)':colour+'18';ctx.lineWidth=clearance?1.5:2;ctx.setLineDash(clearance?[5,4]:[]);
  if(is3d){face(top);for(let i=0;i<4;i++){const j=(i+1)%4;face([base[i],base[j],top[j],top[i]]);}}else face(base);
  ctx.restore();
}
function drawServiceEnvelopes(is3d=false) {
  for(const item of state.model.serviceItems||[]) {
    if(is3d?!isLevelVisible3d(item):item.levelId!==state.model.activeLevelId)continue;
    const {body,clearance}=serviceEnvelopeGeometry(item),selected=state.selected?.type==='serviceItem'&&state.selected.id===item.id;
    if(clearance&&state.visibility.serviceClearances!==false)drawServiceEnvelopeBox(clearance,is3d,'#b5681c',true);
    if(body&&state.visibility.serviceEnvelopes!==false){
      drawServiceEnvelopeBox(body,is3d,selected?'#ed1c24':SERVICE_SYSTEMS[item.system].colour);
      const p=is3d?isoPoint(body.top[0],body.top[0].z):worldToScreen(body.base[0]);
      ctx.save();ctx.fillStyle=SERVICE_SYSTEMS[item.system].colour;ctx.font='10px Segoe UI';ctx.fillText(item.name+' · '+item.envelope.width+' × '+item.envelope.depth+' × '+item.envelope.height+' mm',p.x+6,p.y-10);ctx.restore();
    }
  }
}
function hitServiceEnvelope(p) {
  const item=[...(state.model.serviceItems||[])].reverse().find(item=>{
    if(item.levelId!==state.model.activeLevelId)return false;
    const {body,clearance}=serviceEnvelopeGeometry(item);
    return state.visibility.serviceEnvelopes!==false&&body&&pointInPolygon(p,body.base)||state.visibility.serviceClearances!==false&&clearance&&pointInPolygon(p,clearance.base);
  });
  return item?{type:'serviceItem',id:item.id}:null;
}
function renderServiceEnvelopeSchedule() {
  const el=document.querySelector('#serviceEnvelopeSchedule');if(!el)return;
  el.innerHTML=(state.model.serviceItems||[]).map(item=>{
    const g=serviceEnvelopeGeometry(item),e=item.envelope;
    return '<button class="foundation-schedule-row" type="button" data-envelope-item="'+escapeHtml(item.id)+'"><strong>'+escapeHtml(item.name)+'</strong><span>'+escapeHtml(levelName(item.levelId))+' · '+(g.body?escapeHtml(e.width+' × '+e.depth+' × '+e.height)+' mm':'Envelope incomplete / unspecified')+'</span><small>'+escapeHtml(serviceEnvelopeReview(item).join('; ')||'Envelope and clearance recorded; qualified review required')+'</small></button>';
  }).join('')||'<p class="overview-copy">Add a fitting or fixture, then record its product envelope in the inspector.</p>';
}
function exportServiceEnvelopeCsv() {
  serviceCsv('bc-design-service-envelopes.csv',[
    ['Item ID','Name','Kind','System','Level','Centre X mm','Centre Y mm','Base elevation mm',...SERVICE_ENVELOPE_FIELDS,'Envelope drawn','Clearance drawn','Review'],
    ...(state.model.serviceItems||[]).map(item=>{const g=serviceEnvelopeGeometry(item);return [item.id,item.name,item.kind,item.system,levelName(item.levelId),item.center.x,item.center.y,item.elevation,...SERVICE_ENVELOPE_FIELDS.map(k=>item.envelope?.[k]??''),Boolean(g.body),Boolean(g.clearance),serviceEnvelopeReview(item).join('; ')||'Records entered; qualified review required'];})
  ]);
}
