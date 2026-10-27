// Vector review sheets reuse the Plan renderer. No model geometry is changed.
const SHEET_PX_PER_MM = 96 / 25.4;
function sheetXml(value) { return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
function sheetNumber(n) { if(!Number.isFinite(n))throw Error('Non-finite drawing coordinate.');return String(Number(n.toFixed(8))); }

// Deliberately fail on new/unsupported Canvas APIs instead of omitting content.
function createPlanVectorRecorder(measureContext) {
  let style={fillStyle:'#000',strokeStyle:'#000',lineWidth:1,lineCap:'butt',lineJoin:'miter',miterLimit:10,font:'10px Segoe UI',textAlign:'start',globalAlpha:1,dash:[]};
  const stack=[],items=[];let path=[],points=[],current=null,bounds=null;
  const n=sheetNumber,e=sheetXml;
  function addBounds(list,pad=0){for(const p of list){n(p.x);n(p.y);if(!bounds)bounds={minX:p.x-pad,maxX:p.x+pad,minY:p.y-pad,maxY:p.y+pad};else{bounds.minX=Math.min(bounds.minX,p.x-pad);bounds.maxX=Math.max(bounds.maxX,p.x+pad);bounds.minY=Math.min(bounds.minY,p.y-pad);bounds.maxY=Math.max(bounds.maxY,p.y+pad);}}}
  function push(xml){if(items.length>=200000)throw Error('Sheet exceeds the 200,000 vector element limit.');items.push(xml);}
  function colour(value){if(!/^(#[\da-f]{3,8}|rgba?\([\d.,%\s]+\)|[a-z]+)$/i.test(value))throw Error('Unsupported drawing colour.');return e(value);}
  function paint(kind){if(!path.length||style.globalAlpha===0)return;const stroke=kind==='stroke';
    const pad=stroke?style.lineWidth/2*(style.lineJoin==='miter'?style.miterLimit:1):0;
    addBounds(points,pad);push(`<path d="${path.join(' ')}" fill="${stroke?'none':colour(style.fillStyle)}"${stroke?` stroke="${colour(style.strokeStyle)}" stroke-width="${n(style.lineWidth)}" stroke-linecap="${e(style.lineCap)}" stroke-linejoin="${e(style.lineJoin)}" stroke-miterlimit="${n(style.miterLimit)}" stroke-dasharray="${style.dash.length?style.dash.map(n).join(' '):'none'}"`:''} opacity="${n(style.globalAlpha)}"/>`);
  }
  const api={
    save(){stack.push({...style,dash:[...style.dash]});},restore(){if(stack.length)style=stack.pop();},
    beginPath(){path=[];points=[];current=null;},closePath(){path.push('Z');},
    moveTo(x,y){path.push(`M${n(x)} ${n(y)}`);points.push({x,y});current={x,y};},
    lineTo(x,y){path.push(`${current?'L':'M'}${n(x)} ${n(y)}`);points.push({x,y});current={x,y};},
    arc(x,y,r,start,end,anticlockwise=false){
      [x,y,r,start,end].forEach(n);if(r<0)throw Error('Negative arc radius.');
      const tau=2*Math.PI;let delta=end-start;
      if(!anticlockwise){delta=delta>=tau?tau:((delta%tau)+tau)%tau;}else{delta=delta<=-tau?-tau:-(((-delta%tau)+tau)%tau);}
      const first={x:x+r*Math.cos(start),y:y+r*Math.sin(start)};
      if(current)api.lineTo(first.x,first.y);else api.moveTo(first.x,first.y);
      // Full-circle bounds are conservative for partial arcs and never crop them.
      points.push({x:x-r,y:y-r},{x:x+r,y:y+r});
      if(r===0||Math.abs(delta)<1e-12)return;
      const pieces=Math.ceil(Math.abs(delta)/Math.PI);
      for(let i=1;i<=pieces;i++){const angle=start+delta*i/pieces;current={x:x+r*Math.cos(angle),y:y+r*Math.sin(angle)};path.push(`A${n(r)} ${n(r)} 0 0 ${delta>0?1:0} ${n(current.x)} ${n(current.y)}`);}
    },
    fill(rule){if(rule&&rule!=='nonzero')throw Error('Unsupported vector fill rule.');paint('fill');},stroke(){paint('stroke');},
    setLineDash(value){value.forEach(n);style.dash=[...value];},
    measureText(value){measureContext.save();try{measureContext.font=style.font;measureContext.textAlign=style.textAlign;return measureContext.measureText(String(value));}finally{measureContext.restore();}},
    fillRect(x,y,w,h){if(style.globalAlpha===0)return;addBounds([{x,y},{x:x+w,y:y+h}]);push(`<rect x="${n(Math.min(x,x+w))}" y="${n(Math.min(y,y+h))}" width="${n(Math.abs(w))}" height="${n(Math.abs(h))}" fill="${colour(style.fillStyle)}" opacity="${n(style.globalAlpha)}"/>`);},
    fillText(value,x,y,maxWidth){
      if(maxWidth!==undefined)throw Error('Constrained text is not supported in vector sheets.');
      if(style.globalAlpha===0)return;const text=String(value).replace(/\s/g,' ');
      const m=api.measureText(text);
      const font=style.font.match(/^(?:(\d+|bold|normal)\s+)?([\d.]+)px (.+)$/);if(!font)throw Error('Unsupported vector font.');
      const size=Number(font[2]),anchor=['center'].includes(style.textAlign)?'middle':['right','end'].includes(style.textAlign)?'end':'start';
      const shift=anchor==='middle'?m.width/2:anchor==='end'?m.width:0;
      const left=Number.isFinite(m.actualBoundingBoxLeft)?m.actualBoundingBoxLeft:shift;
      const right=Number.isFinite(m.actualBoundingBoxRight)?m.actualBoundingBoxRight:m.width-shift;
      // SVG text boxes use full font metrics, which can exceed painted glyph bounds.
      const ascent=Math.max(m.actualBoundingBoxAscent||0,m.fontBoundingBoxAscent||0,size*1.4),descent=Math.max(m.actualBoundingBoxDescent||0,m.fontBoundingBoxDescent||0,size*.5);
      addBounds([{x:x-left,y:y-ascent},{x:x+right,y:y+descent}],2);
      push(`<text x="${n(x)}" y="${n(y)}" font-family="${e(font[3])}" font-size="${n(size)}" font-weight="${e(font[1]||'normal')}" text-anchor="${anchor}"${m.width>0?` textLength="${n(m.width)}" lengthAdjust="spacingAndGlyphs"`:''} xml:space="preserve" fill="${colour(style.fillStyle)}" opacity="${n(style.globalAlpha)}">${e(text)}</text>`);
    },
    result(){if(stack.length)throw Error('Unbalanced Plan drawing state.');return {items:[...items],bounds};}
  };
  return new Proxy(api,{get(target,key){if(key in target)return target[key];if(key in style)return style[key];throw Error(`Unsupported vector drawing operation: ${String(key)}`);},set(_,key,value){if(!(key in style)||key==='dash')throw Error(`Unsupported vector drawing property: ${String(key)}`);if(typeof style[key]==='number')n(value);style[key]=value;return true;}});
}

function planSheetSettings(value={}) {
  const sizes={A4:[210,297],A3:[297,420],A2:[420,594]},paper=value.paper||'A3',orientation=value.orientation||'landscape',scale=Number(value.scale??100);
  if(!Object.hasOwn(sizes,paper)||!['portrait','landscape'].includes(orientation)||!Number.isFinite(scale)||scale<1||scale>10000)throw Error('Choose A4, A3 or A2 and a scale denominator from 1 to 10000.');
  const [short,long]=sizes[paper];return {paper,orientation,scale,width:orientation==='landscape'?long:short,height:orientation==='landscape'?short:long};
}
function capturePlanVectors(settings,measureContext=ctx,levelId=state.model.activeLevelId,afterRender=null) {
  if(state.drawing||state.serviceDraft.length||state.deckDraft.length||state.floorDraft.length||state.roomDraft.length)throw Error('Finish or cancel the current drawing before exporting.');
  const level=state.model.levels.find(candidate=>candidate.id===levelId);if(!level)throw Error('Selected sheet level is missing.');
  const originalContext=ctx,original={view:state.view,mode:state.mode,selected:state.selected,selectedClearancePair:state.selectedClearancePair,selectedRouteBodyPair:state.selectedRouteBodyPair,width:state.width,height:state.height,activeLevelId:state.model.activeLevelId};
  const recorder=createPlanVectorRecorder(measureContext);
  try{
    ctx=recorder;state.mode='plan';state.model.activeLevelId=levelId;state.selected=null;state.selectedClearancePair=null;state.selectedRouteBodyPair=null;
    state.view={...state.view,scale:SHEET_PX_PER_MM/settings.scale,offsetX:0,offsetY:0};state.width=settings.width*SHEET_PX_PER_MM;state.height=settings.height*SHEET_PX_PER_MM;
    renderPlan({grid:false,respectPlanDisplay:false});if(afterRender)afterRender();return recorder.result();
  }finally{ctx=originalContext;state.model.activeLevelId=original.activeLevelId;Object.assign(state,original);}
}

function layoutLayerSet(keys){
  const visible=Object.fromEntries(Object.keys(state.visibility).map(key=>[key,false]));
  for(const key of keys)if(Object.hasOwn(visible,key))visible[key]=true;
  return visible;
}
function drawSheetJoistCentres(levelId){
  if(!state.model.decks)return;
  for(const deck of state.model.decks.filter(item=>item.levelId===levelId))for(const [index,member] of (deck.members||[]).entries()){
    if(member.role!=='joist')continue;
    const a=worldToScreen({x:member.ax,y:member.ay}),b=worldToScreen({x:member.bx,y:member.by}),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    ctx.save();ctx.strokeStyle='#bd6233';ctx.lineWidth=1;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#8f3d22';ctx.font='8px Segoe UI';ctx.textAlign='center';ctx.fillText(`J${index+1}`,mid.x,mid.y-3);ctx.restore();
  }
}
function captureLayoutVectors(kind,settings,measureContext,levelId,wallId){
  const originalModel=state.model,originalVisibility=state.visibility;
  try{
    const wall=kind==='wall'?(originalModel.walls||[]).find(item=>item.id===wallId&&item.levelId===levelId):null;
    if(kind==='wall'&&!wall)throw Error('Selected wall is missing from this level.');
    if(kind==='wall')state.model={...originalModel,walls:[wall],openings:(originalModel.openings||[]).filter(item=>item.wallId===wall.id),decks:[],floors:[],rooms:[],foundations:[],pads:[],piers:[],roofs:[],roofJunctions:[],roofFraming:[],stairs:[],dimensions:[],notes:[],services:[],serviceItems:[]};
    state.visibility=layoutLayerSet(kind==='floor'?['floors','walls','openings','rooms','decks','deckFraming','planSizes','dimensions']:['walls','openings','planSizes','dimensions']);
    return capturePlanVectors(settings,measureContext,levelId,kind==='floor'?()=>drawSheetJoistCentres(levelId):null);
  }finally{state.model=originalModel;state.visibility=originalVisibility;}
}
function layoutSheetLabel(kind,wall){return kind==='floor'?'Floor / joist layout':`Individual wall layout · ${wall?.id||'wall'}`;}
function makeLayoutPlanSheet(value={},measureContext=ctx){
  const settings=planSheetSettings(value),kind=value.kind||'floor',p=SHEET_PX_PER_MM,n=sheetNumber,e=sheetXml,w=settings.width*p,h=settings.height*p,margin=10*p;
  if(!['floor','wall'].includes(kind))throw Error('Choose a floor or wall layout page.');
  const level=state.model.levels.find(candidate=>candidate.id===(value.levelId??state.model.activeLevelId));if(!level)throw Error('Selected sheet level is missing.');
  const wall=kind==='wall'?state.model.walls.find(item=>item.id===value.wallId&&item.levelId===level.id):null;
  if(kind==='wall'&&!wall)throw Error('Selected wall is missing from this level.');
  const shown=kind==='floor'?['Floor / slab outline','Rooms','Walls','Doors / windows','Deck outline','Deck framing','Joist centres']:['Wall centreline','Doors / windows','Measured sizes'];
  const framingNote=kind==='floor'?'Nominal subfloor/veranda centres: joists 450 mm c/c · bearers 1200 mm c/c · review NCC 2022 H1D6(4), H1D11 and AS 1684.2:2021; not a structural approval.':'Wall layout reference: review NCC 2022 H1D6(4) and AS 1684.2:2021 for project-specific framing, bracing, openings and tie-down.';
  const legend=[...sheetWrapped('Layout layers enabled: '+shown.join(', '),w-2*margin,measureContext),...sheetWrapped(framingNote,w-2*margin,measureContext)],footerHeight=25*p+legend.length*12,frame={x:margin,y:40*p,width:w-2*margin,height:h-40*p-margin-footerHeight};
  if(frame.height<30*p)throw Error('Layout legend leaves insufficient drawing space.');
  const drawing=captureLayoutVectors(kind,settings,measureContext,level.id,value.wallId),b=drawing.bounds;if(!b)throw Error(`No visible ${kind} layout geometry on ${level.name}.`);
  const contentWidth=b.maxX-b.minX,contentHeight=b.maxY-b.minY,pad=4*p;
  if(contentWidth>frame.width-2*pad||contentHeight>frame.height-2*pad)throw Error(`Layout needs ${(contentWidth/p+8).toFixed(1)} × ${(contentHeight/p+8).toFixed(1)} mm; drawing area is ${(frame.width/p).toFixed(1)} × ${(frame.height/p).toFixed(1)} mm. Nothing was cropped or rescaled.`);
  const dx=frame.x+frame.width/2-(b.minX+b.maxX)/2,dy=frame.y+frame.height/2-(b.minY+b.maxY)/2;
  const name=els.projectName.value.trim()||state.model.name,date=new Date().toLocaleDateString('en-AU',{timeZone:'Australia/Brisbane'}),sheetIndex=Number(value.sheetIndex??1),sheetCount=Number(value.sheetCount??1),coverage=value.coverage||'Dedicated floor and wall layout page; geometry only; no construction approval.';
  if(!Number.isInteger(sheetIndex)||!Number.isInteger(sheetCount)||sheetIndex<1||sheetCount<sheetIndex)throw Error('Sheet numbering is invalid.');
  const titleLines=sheetWrapped(name,w-margin-100*p,measureContext,'bold 15px Segoe UI');if(titleLines.length>3)throw Error('Project title is too long for this sheet size.');
  const metadata={revision:'layout-sheets1',schema:state.model.schema,paper:settings.paper,orientation:settings.orientation,scaleDenominator:settings.scale,sheetMm:[settings.width,settings.height],sheetIndex,sheetCount,levelId:level.id,levelName:level.name,sheetKind:kind,wallId:wall?.id||null,wallName:wall?.name||null,coverage,worldFrameMm:{minX:(frame.x-dx)*settings.scale/p,minY:(frame.y-dy)*settings.scale/p,width:frame.width*settings.scale/p,height:frame.height*settings.scale/p}};
  const text=(x,y,t,size=9,extra='')=>`<text x="${n(x)}" y="${n(y)}" font-family="Segoe UI, sans-serif" font-size="${size}" fill="#203b2b" ${extra}>${e(t)}</text>`;
  const footerY=frame.y+frame.height+5*p,levelLines=sheetWrapped(`${layoutSheetLabel(kind,wall)} · ${level.name} · ${date} · Sheet ${sheetIndex} of ${sheetCount}`,w-2*margin,measureContext,'11px Segoe UI');if(levelLines.length>2)throw Error('Layout title is too long for this sheet size.');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${settings.width}mm" height="${settings.height}mm" viewBox="0 0 ${n(w)} ${n(h)}" role="img" aria-label="BC Design scaled layout sheet"><title>${e(name)} — ${e(layoutSheetLabel(kind,wall))} 1:${settings.scale}</title><metadata>${e(JSON.stringify(metadata))}</metadata><rect width="100%" height="100%" fill="white"/><image href="__BC_SHEET_LOGO__" x="${n(margin)}" y="${n(7*p)}" width="${n(80*p)}" height="${n(20*p)}"/>${titleLines.map((s,i)=>text(100*p,12*p+i*17,s,15,'font-weight="bold"')).join('')}${text(margin,31*p,`BC Design · ${settings.paper} ${settings.orientation} · ${layoutSheetLabel(kind,wall)} 1:${settings.scale}`,12,'font-weight="bold"')}${levelLines.map((s,i)=>text(margin,35*p+i*12,s,11)).join('')}<rect x="${n(frame.x)}" y="${n(frame.y)}" width="${n(frame.width)}" height="${n(frame.height)}" fill="#fbfcfb" stroke="#b7c8bd"/><g id="plan-geometry" transform="translate(${n(dx)} ${n(dy)})">${drawing.items.join('')}</g>${text(margin,footerY,'PRELIMINARY REVIEW — NOT FOR CONSTRUCTION OR CERTIFICATION',10,'font-weight="bold"')}${text(margin,footerY+13,'Layout pages show entered geometry, centres and openings only; verify spans, fixings, bracing, tie-down and site conditions.',9)}${legend.map((s,i)=>text(margin,footerY+26+i*12,s)).join('')}${text(margin,h-margin-23,'Geometry is scaled; schematic line weights and symbols are not a compliance or fabrication pass.',8)}${text(margin,h-margin-11,'Print actual size / 100% on the specified paper; disable fit/shrink and headers. Verify the 50 mm bar before measuring.',8)}<path id="calibration-bar" d="M${n(margin)} ${n(h-margin)}h${n(50*p)}m0 -4v8m${n(-50*p)} 0v-8" fill="none" stroke="#203b2b" stroke-width="1"/>${text(margin+52*p,h-margin+3,`50 mm on paper = ${50*settings.scale} mm model`,9)}</svg>`;
  return {svg,metadata,settings,frame,bounds:b,vectorCount:drawing.items.length};
}
function sheetWrapped(text,width,measureContext,font='9px Segoe UI'){
  measureContext.save();try{measureContext.font=font;const lines=[];let line='';for(const char of String(text).replace(/\s/g,' ')){if(line&&measureContext.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}if(line)lines.push(line);return lines;}finally{measureContext.restore();}
}
function makePlanSheet(value={},measureContext=ctx) {
  const settings=planSheetSettings(value),p=SHEET_PX_PER_MM,n=sheetNumber,e=sheetXml,w=settings.width*p,h=settings.height*p,margin=10*p;
  const labelFor=key=>document.querySelector(`[data-layer="${key}"]`)?.closest?.('label')?.textContent?.trim()||key;
  const shown=Object.keys(state.visibility).filter(k=>state.visibility[k]).map(labelFor),hidden=Object.keys(state.visibility).filter(k=>!state.visibility[k]).map(labelFor);
  const legend=[...sheetWrapped('Layers enabled: '+(shown.join(', ')||'None'),w-2*margin,measureContext),...sheetWrapped('Layers hidden: '+(hidden.join(', ')||'None'),w-2*margin,measureContext)];
  const footerHeight=25*p+legend.length*12,frame={x:margin,y:40*p,width:w-2*margin,height:h-40*p-margin-footerHeight};
  if(frame.height<30*p)throw Error('Layer legend leaves insufficient drawing space.');
  const level=state.model.levels.find(candidate=>candidate.id===(value.levelId??state.model.activeLevelId));if(!level)throw Error('Selected sheet level is missing.');
  const drawing=capturePlanVectors(settings,measureContext,level.id),b=drawing.bounds;if(!b)throw Error(`No visible Plan geometry on ${level.name}.`);
  const contentWidth=b.maxX-b.minX,contentHeight=b.maxY-b.minY,pad=4*p;
  if(contentWidth>frame.width-2*pad||contentHeight>frame.height-2*pad)throw Error(`Plan needs ${(contentWidth/p+8).toFixed(1)} × ${(contentHeight/p+8).toFixed(1)} mm; drawing area is ${(frame.width/p).toFixed(1)} × ${(frame.height/p).toFixed(1)} mm. Choose larger paper, another orientation or a larger scale denominator. Nothing was cropped or rescaled.`);
  const dx=frame.x+frame.width/2-(b.minX+b.maxX)/2,dy=frame.y+frame.height/2-(b.minY+b.maxY)/2;
  const name=els.projectName.value.trim()||state.model.name,date=new Date().toLocaleDateString('en-AU',{timeZone:'Australia/Brisbane'}),sheetIndex=Number(value.sheetIndex??1),sheetCount=Number(value.sheetCount??1),coverage=value.coverage||'One selected level; all enabled active-level Plan content; no cropping; grid and selection excluded.';
  if(!Number.isInteger(sheetIndex)||!Number.isInteger(sheetCount)||sheetIndex<1||sheetCount<sheetIndex)throw Error('Sheet numbering is invalid.');
  const titleLines=sheetWrapped(name,w-margin-100*p,measureContext,'bold 15px Segoe UI');if(titleLines.length>3)throw Error('Project title is too long for this sheet size.');
  const metadata={revision:'kitchen67',schema:state.model.schema,paper:settings.paper,orientation:settings.orientation,scaleDenominator:settings.scale,sheetMm:[settings.width,settings.height],sheetIndex,sheetCount,levelId:level.id,levelName:level.name,layers:{...state.visibility},serviceOverlayOpacity:state.serviceOverlayOpacity,coverage,worldFrameMm:{minX:(frame.x-dx)*settings.scale/p,minY:(frame.y-dy)*settings.scale/p,width:frame.width*settings.scale/p,height:frame.height*settings.scale/p}};
  const text=(x,y,t,size=9,extra='')=>`<text x="${n(x)}" y="${n(y)}" font-family="Segoe UI, sans-serif" font-size="${size}" fill="#203b2b" ${extra}>${e(t)}</text>`;
  const footerY=frame.y+frame.height+5*p;
  const levelLines=sheetWrapped(`Plan · ${level.name} · ${date} · Sheet ${sheetIndex} of ${sheetCount}`,w-2*margin,measureContext,'11px Segoe UI');if(levelLines.length>2)throw Error('Level name is too long for this sheet size.');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${settings.width}mm" height="${settings.height}mm" viewBox="0 0 ${n(w)} ${n(h)}" role="img" aria-label="BC Design scaled Plan review sheet"><title>${e(name)} — Plan 1:${settings.scale}</title><metadata>${e(JSON.stringify(metadata))}</metadata><rect width="100%" height="100%" fill="white"/>
    <image href="__BC_SHEET_LOGO__" x="${n(margin)}" y="${n(7*p)}" width="${n(80*p)}" height="${n(20*p)}"/>
    ${titleLines.map((s,i)=>text(100*p,12*p+i*17,s,15,'font-weight="bold"')).join('')}
    ${text(margin,31*p,`BC Design · ${settings.paper} ${settings.orientation} · Plan geometry 1:${settings.scale}`,12,'font-weight="bold"')}
    ${levelLines.map((s,i)=>text(margin,35*p+i*12,s,11)).join('')}
    <rect x="${n(frame.x)}" y="${n(frame.y)}" width="${n(frame.width)}" height="${n(frame.height)}" fill="#fbfcfb" stroke="#b7c8bd"/>
    <g id="plan-geometry" transform="translate(${n(dx)} ${n(dy)})">${drawing.items.join('')}</g>
    ${text(margin,footerY,'PRELIMINARY REVIEW — NOT FOR CONSTRUCTION OR CERTIFICATION',10,'font-weight="bold"')}
    ${text(margin,footerY+13,`All rendered ${level.name} Plan content fits. Service overlay opacity: ${Math.round(state.serviceOverlayOpacity*100)}%.`,9)}
    ${legend.map((s,i)=>text(margin,footerY+26+i*12,s)).join('')}
    ${text(margin,h-margin-23,'Geometry is scaled; line weights, symbols and reference envelopes remain schematic. Unmodelled components are not assessed.',8)}
    ${text(margin,h-margin-11,'Print actual size / 100% on the specified paper; disable fit/shrink and headers. Verify the 50 mm bar before measuring.',8)}
    <path id="calibration-bar" d="M${n(margin)} ${n(h-margin)}h${n(50*p)}m0 -4v8m${n(-50*p)} 0v-8" fill="none" stroke="#203b2b" stroke-width="1"/>
    ${text(margin+52*p,h-margin+3,`50 mm on paper = ${50*settings.scale} mm model`,9)}</svg>`;
  return {svg,metadata,settings,frame,bounds:b,vectorCount:drawing.items.length};
}
function readPlanSheetSettings(prefix='planSheet'){return {paper:document.querySelector(`#${prefix}Paper`).value,orientation:document.querySelector(`#${prefix}Orientation`).value,scale:document.querySelector(`#${prefix}Scale`).value};}
function reviewPlanSheet(){const output=document.querySelector('#planSheetCoverage'),button=document.querySelector('#planSheetDownload');try{const sheet=makePlanSheet(readPlanSheetSettings());output.textContent=`Fits without cropping: ${sheet.settings.paper} ${sheet.settings.orientation}, 1:${sheet.settings.scale}. Active level: ${sheet.metadata.levelName}. Current Plan layers and service opacity will be included. Pan, zoom and 3D view do not change this sheet.`;button.disabled=false;}catch(error){output.textContent=error.message;button.disabled=true;}}
function openPlanSheet(){document.querySelector('#planSheetDialog').showModal();reviewPlanSheet();}
async function exportPlanSheet(){
  const button=document.querySelector('#planSheetDownload');button.disabled=true;
  try{
    const response=await fetch('brand-logo.svg');if(!response.ok)throw Error('Brand logo could not be loaded.');const logo=await response.text();
    // Re-capture after async logo loading so settings/layers are not stale.
    const sheet=makePlanSheet(readPlanSheetSettings()),svg=sheet.svg.replace('__BC_SHEET_LOGO__','data:image/svg+xml,'+encodeURIComponent(logo));
    download('bc-design-plan-'+sheet.settings.paper.toLowerCase()+'-1-'+sheet.settings.scale+'.svg',svg,'image/svg+xml');
    state.statusMessage=`Vector Plan downloaded at 1:${sheet.settings.scale}; verify printed calibration bar.`;document.querySelector('#planSheetDialog').close();
  }catch(error){document.querySelector('#planSheetCoverage').textContent=`Export failed: ${error.message}`;}finally{button.disabled=false;render();}
}
function htmlSheetText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function selectedSheetSetLevels(){return [...document.querySelectorAll('#sheetSetLevels input[type="checkbox"]:checked')].map(input=>input.value);}
function renderSheetSetLevels(){
  const container=document.querySelector('#sheetSetLevels');
  container.innerHTML=state.model.levels.map(level=>`<label class="sheet-level-option"><input type="checkbox" value="${htmlSheetText(level.id)}" checked><span>${htmlSheetText(level.name)}</span><small>${formatNumber(level.elevation,0)} mm datum</small></label>`).join('');
}
function readSheetSetSettings(){return {...readPlanSheetSettings('sheetSet'),levelIds:selectedSheetSetLevels()};}
const MULTI_DOWNLOAD_DELAY_MS=220;
function waitBetweenDownloads(){return new Promise(resolve=>window.setTimeout(resolve,MULTI_DOWNLOAD_DELAY_MS));}
function reviewSheetSet(){
  const output=document.querySelector('#sheetSetCoverage'),button=document.querySelector('#sheetSetDownload'),settings=readSheetSetSettings();
  if(!settings.levelIds.length){output.textContent='Select at least one level for the sheet set.';button.disabled=true;return;}
  try{
    const coverage=`One SVG sheet per selected level (${settings.levelIds.length}); same ${settings.paper} ${settings.orientation} paper and 1:${settings.scale} scale; all enabled Plan layers on each level; no cropping; grid and selection excluded.`;
    const sheets=settings.levelIds.map((levelId,index)=>makePlanSheet({...settings,levelId,sheetIndex:index+1,sheetCount:settings.levelIds.length,coverage}));
    output.textContent=`Ready: ${sheets.length} sheet${sheets.length===1?'':'s'} at 1:${settings.scale}. ${sheets.map(sheet=>sheet.metadata.levelName).join(', ')}. Browser download permission may be requested for multiple SVG files.`;button.disabled=false;
  }catch(error){output.textContent=error.message;button.disabled=true;}
}
function openSheetSet(){renderSheetSetLevels();document.querySelector('#sheetSetDialog').showModal();reviewSheetSet();}
async function exportSheetSet(){
  const button=document.querySelector('#sheetSetDownload');button.disabled=true;
  try{
    const settings=readSheetSetSettings(),response=await fetch('brand-logo.svg');if(!response.ok)throw Error('Brand logo could not be loaded.');const logo='data:image/svg+xml,'+encodeURIComponent(await response.text());
    if(!settings.levelIds.length)throw Error('Select at least one level for the sheet set.');
    const coverage=`One SVG sheet per selected level (${settings.levelIds.length}); same ${settings.paper} ${settings.orientation} paper and 1:${settings.scale} scale; all enabled Plan layers on each level; no cropping; grid and selection excluded.`;
    const sheets=settings.levelIds.map((levelId,index)=>makePlanSheet({...settings,levelId,sheetIndex:index+1,sheetCount:settings.levelIds.length,coverage}));
    for(const [index,sheet] of sheets.entries()){const safe=sheet.metadata.levelName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||`level-${sheet.metadata.sheetIndex}`;download(`bc-design-plan-${safe}-${sheet.metadata.sheetIndex}-of-${sheet.metadata.sheetCount}-${sheet.settings.scale}.svg`,sheet.svg.replace('__BC_SHEET_LOGO__',logo),'image/svg+xml');if(index<sheets.length-1)await waitBetweenDownloads();}
    state.statusMessage=`${sheets.length} vector Plan sheets downloaded at 1:${settings.scale}; verify each printed calibration bar.`;document.querySelector('#sheetSetDialog').close();
  }catch(error){document.querySelector('#sheetSetCoverage').textContent=`Export failed: ${error.message}`;}finally{button.disabled=false;render();}
}

function readLayoutSheetSettings(){return {...readPlanSheetSettings('layoutSheet'),includeFloor:document.querySelector('#layoutIncludeFloor').checked,includeWalls:document.querySelector('#layoutIncludeWalls').checked};}
function layoutSheetDescriptors(settings){
  const descriptors=[];
  for(const level of state.model.levels){
    if(settings.includeFloor)descriptors.push({kind:'floor',levelId:level.id});
    if(settings.includeWalls)for(const wall of state.model.walls.filter(item=>item.levelId===level.id))descriptors.push({kind:'wall',levelId:level.id,wallId:wall.id});
  }
  return descriptors;
}
function makeLayoutSheets(settings){
  const descriptors=layoutSheetDescriptors(settings),coverage=`${descriptors.length} dedicated layout page${descriptors.length===1?'':'s'}: floor / joist centres plus individual wall pages; ${settings.paper} ${settings.orientation} at 1:${settings.scale}; no cropping; local review only.`;
  return descriptors.map((item,index)=>makeLayoutPlanSheet({...settings,...item,sheetIndex:index+1,sheetCount:descriptors.length,coverage}));
}
function reviewLayoutSheets(){
  const output=document.querySelector('#layoutSheetCoverage'),button=document.querySelector('#layoutSheetDownload');
  try{
    const settings=readLayoutSheetSettings(),descriptors=layoutSheetDescriptors(settings);
    if(!descriptors.length)throw Error('Select at least one layout page type.');
    const sheets=makeLayoutSheets(settings);output.textContent=`Ready: ${sheets.length} layout page${sheets.length===1?'':'s'} at 1:${settings.scale}. Includes ${settings.includeFloor?'the floor / joist-centre page':''}${settings.includeFloor&&settings.includeWalls?' and ':''}${settings.includeWalls?`${state.model.walls.length} individual wall pages`:''}.`;button.disabled=false;
  }catch(error){output.textContent=error.message;button.disabled=true;}
}
function openLayoutSheets(){document.querySelector('#layoutSheetDialog').showModal();reviewLayoutSheets();}
async function exportLayoutSheets(){
  const button=document.querySelector('#layoutSheetDownload');button.disabled=true;
  try{
    const settings=readLayoutSheetSettings(),response=await fetch('brand-logo.svg');if(!response.ok)throw Error('Brand logo could not be loaded.');const logo='data:image/svg+xml,'+encodeURIComponent(await response.text()),sheets=makeLayoutSheets(settings);
    for(const [index,sheet] of sheets.entries()){const kind=sheet.metadata.sheetKind,wall=sheet.metadata.wallId?`-${sheet.metadata.wallId.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`:'';download(`bc-design-${kind}-layout${wall}-${sheet.metadata.sheetIndex}-of-${sheet.metadata.sheetCount}-${sheet.settings.scale}.svg`,sheet.svg.replace('__BC_SHEET_LOGO__',logo),'image/svg+xml');if(index<sheets.length-1)await waitBetweenDownloads();}
    state.statusMessage=`${sheets.length} floor/wall layout pages downloaded at 1:${settings.scale}; verify each printed calibration bar.`;document.querySelector('#layoutSheetDialog').close();
  }catch(error){document.querySelector('#layoutSheetCoverage').textContent=`Export failed: ${error.message}`;}finally{button.disabled=false;render();}
}
