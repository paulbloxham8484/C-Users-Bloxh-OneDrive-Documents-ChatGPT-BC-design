// Independent full-face end-plane studies for recorded horizontal rectangular floor members.
// Source members, support reviews and material takeoffs are never cut or resized here.
const EC_NUMBERS=['startSetback','startAcross','startDepth','endSetback','endAcross','endDepth'];
const EC_TEXT=['name','designRef','drawingRef','sourceUrl','checkedDate','finishRef','notes'];
const EC_UI={id:'',error:'',fingerprint:''};
const EC_EPS=1e-6;
function endCutNew(){return {id:uid('end-cut'),formatVersion:1,enabled:false,memberId:'',...Object.fromEntries(EC_NUMBERS.map(k=>[k,null])),...Object.fromEntries(EC_TEXT.map(k=>[k,'']))};}
function validateEndCuts(raw){
  if(raw.endCutDetails===undefined)return;
  if(!Array.isArray(raw.endCutDetails)||raw.endCutDetails.length>256)throw Error('At most 256 independent end-cut studies per project.');
  const ids=new Set();
  for(const r of raw.endCutDetails){
    if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!r.id.trim()||r.id.length>200||ids.has(r.id))throw Error('End-cut studies need unique non-empty IDs up to 200 characters.');
    ids.add(r.id);
    if(r.formatVersion!==1||typeof r.enabled!=='boolean'||typeof r.memberId!=='string'||r.memberId.length>200)throw Error('End-cut version, modelling state or member reference is invalid.');
    for(const k of EC_NUMBERS){const v=r[k];if(v==null)continue;const setback=k.endsWith('Setback');if(!Number.isFinite(v)||(setback?(v<0||v>1e6):Math.abs(v)>80))throw Error('End-cut setbacks must be 0–1,000,000 mm; slope angles must be within ±80°. Leave unknowns blank.');}
    for(const k of EC_TEXT)if(r[k]!==undefined&&(typeof r[k]!=='string'||r[k].length>2000))throw Error('End-cut evidence must be text up to 2000 characters.');
    if(r.sourceUrl){let u;try{u=new URL(r.sourceUrl);}catch{throw Error('End-cut source must be an http(s) URL.');}if(!['http:','https:'].includes(u.protocol))throw Error('End-cut source must be an http(s) URL.');}
    if(r.checkedDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.checkedDate)||!Number.isFinite(Date.parse(r.checkedDate))||new Date(r.checkedDate).toISOString().slice(0,10)!==r.checkedDate))throw Error('End-cut source date must be a real YYYY-MM-DD date.');
    const matches=(raw.floorFraming||[]).filter(m=>m.id===r.memberId);
    if(matches.length>1)throw Error('End-cut source member ID is ambiguous.');
    if(matches.length){const m=matches[0];if(![m.ax,m.ay,m.bx,m.by,m.width,m.depth,m.elevation].every(Number.isFinite)||m.width<=0||m.depth<=0||Math.hypot(m.bx-m.ax,m.by-m.ay)<1)throw Error('End-cut source needs explicit finite endpoints, elevation and positive section dimensions.');if((raw.levels||[]).filter(l=>l.id===m.levelId).length!==1)throw Error('End-cut source member needs an existing unambiguous owning level.');}
  }
}
function normalizeEndCuts(model){model.endCutDetails=(model.endCutDetails||[]).map(r=>({...endCutNew(),...r}));}
function endCutReview(r,model=state.model){
  const g={record:r,member:null,body:null,status:r.enabled?'Unassessed':'Not modelled',reason:'',missing:EC_TEXT.filter(k=>['designRef','drawingRef','sourceUrl','checkedDate','finishRef'].includes(k)&&!r[k]?.trim())};
  try{
    validateEndCuts({endCutDetails:[r],floorFraming:model.floorFraming,levels:model.levels});
    g.member=(model.floorFraming||[]).find(m=>m.id===r.memberId)||null;
    if(!r.enabled)return g;
    if(!g.member)throw Error(r.memberId?'Referenced member is missing; its ID is retained.':'Select a recorded house floor-framing member.');
    if(EC_NUMBERS.some(k=>r[k]==null))throw Error('Enter both setbacks and all four slope angles, including explicit zero.');
    const m=g.member,L=Math.hypot(m.bx-m.ax,m.by-m.ay),W=m.width,D=m.depth;
    if(L>1e6||W>1e6||D>1e6||[m.ax,m.ay,m.bx,m.by,m.elevation].some(v=>Math.abs(v)>1e9))throw Error('Source exceeds the end-cut modelling extent/coordinate limits.');
    const u={x:(m.bx-m.ax)/L,y:(m.by-m.ay)/L},v={x:-u.y,y:u.x};
    const slopes=[r.startAcross,r.startDepth,r.endAcross,r.endDepth].map(a=>Math.tan(a*Math.PI/180));
    const corners=[[-W/2,-D/2],[W/2,-D/2],[W/2,D/2],[-W/2,D/2]];
    const starts=corners.map(([y,z])=>r.startSetback+slopes[0]*y+slopes[1]*z);
    const ends=corners.map(([y,z])=>L-r.endSetback+slopes[2]*y+slopes[3]*z);
    if([...starts,...ends].some(s=>s< -EC_EPS||s>L+EC_EPS))throw Error('A cut plane extends outside the source at a section corner. Increase/review setbacks; no extension or partial clipping is inferred.');
    const edgeLengths=ends.map((s,i)=>s-starts[i]);
    if(Math.min(...edgeLengths)<.001)throw Error('Cut planes meet, cross or leave a longitudinal corner edge below 0.001 mm. The entire study is unassessed.');
    const local=[...starts.map((s,i)=>({s,v:corners[i][0],w:corners[i][1]})),...ends.map((s,i)=>({s,v:corners[i][0],w:corners[i][1]}))];
    const world=p=>({x:m.ax+u.x*p.s+v.x*p.v,y:m.ay+u.y*p.s+v.y*p.v,z:m.elevation+D/2+p.w});
    const vertices=local.map(world),faceIndices=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
    const centreLength=L-r.startSetback-r.endSetback,volume=W*D*centreLength;
    g.body={vertices,faces:faceIndices.map(ids=>ids.map(i=>vertices[i])),local,faceIndices};
    Object.assign(g,{status:'Measured end-plane reference',L,W,D,starts,ends,edgeLengths,centreLength,bound:Math.max(...ends)-Math.min(...starts),grossVolume:L*W*D,volume,removed:W*D*(r.startSetback+r.endSetback),startArea:W*D*Math.hypot(1,slopes[0],slopes[1]),endArea:W*D*Math.hypot(1,slopes[2],slopes[3]),slopes});
  }catch(e){g.body=null;g.reason=e.message;}
  return g;
}
function endCutResults(){return (state.model.endCutDetails||[]).map(r=>endCutReview(r));}
function endCutBounds(){return endCutResults().flatMap(g=>g.body?.vertices||[]);}
function drawEndCuts(is3d=false){
  if(!state.visibility.endCutReferences)return;
  const project=p=>is3d?isoPoint(p,p.z):worldToScreen(p),faces=[];ctx.save();ctx.lineWidth=1;
  for(const g of endCutResults()){
    if(!g.body||!(is3d?isLevelVisible3d(g.member):g.member.levelId===state.model.activeLevelId))continue;
    if(is3d){g.body.faces.forEach((points,i)=>faces.push({points,cut:i<2}));continue;}
    const original=floorMemberGeometry(g.member).outline;ctx.setLineDash([5,4]);polygon(original.map(worldToScreen),null,'#8a9294');ctx.setLineDash([]);
    polygon(svHull(g.body.vertices).map(worldToScreen),'rgba(53,137,111,.55)','#1d654f');
    for(const face of g.body.faces.slice(0,2))polygon(face.map(worldToScreen),'rgba(212,138,50,.5)','#8a501a');
  }
  faces.sort((a,b)=>a.points.reduce((s,p)=>s+p.x+p.y,0)/a.points.length-b.points.reduce((s,p)=>s+p.x+p.y,0)/b.points.length);
  for(const f of faces)polygon(f.points.map(project),f.cut?'rgba(212,138,50,.65)':'rgba(53,137,111,.55)',f.cut?'#8a501a':'#1d654f');ctx.restore();
}
function endCutCsv(){
  const rows=[['Study ID','Name','Enabled','Member ID','Member name','Level ID','Status','Pending reason','Start centre setback mm','Start across slope deg','Start depth slope deg','End centre setback mm','End across slope deg','End depth slope deg','Source length mm','Width mm','Depth mm','Retained centreline mm','Shortest corner edge mm','Longest corner edge mm','Longitudinal bound mm','Source envelope m3','Reference retained m3','Reference removed m3','Start face m2','End face m2','Design reference','Drawing revision','Source URL','Checked date','Finish/end-grain evidence','Notes','Basis']];
  for(const g of endCutResults()){const r=g.record;rows.push([r.id,r.name,r.enabled,r.memberId,g.member?.name,g.member?.levelId,g.status,g.reason,...EC_NUMBERS.map(k=>r[k]),g.L,g.W,g.D,g.centreLength,g.body?Math.min(...g.edgeLengths):null,g.body?Math.max(...g.edgeLengths):null,g.bound,g.body?g.grossVolume/1e9:null,g.body?g.volume/1e9:null,g.body?g.removed/1e9:null,g.body?g.startArea/1e6:null,g.body?g.endArea/1e6:null,r.designRef,r.drawingRef,r.sourceUrl,r.checkedDate,r.finishRef,r.notes,'Independent full-face plane study; source member/takeoffs unchanged. Alternatives are not additive. No saw setting, kerf, waste, joint fit, support/capacity or procurement approval.']);}
  const cell=v=>{let s=String(v??'');if(typeof v==='string'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return rows.map(r=>r.map(cell).join(',')).join('\n');
}
function endCutDiagram(g){
  if(!g.body)return '<p>Complete a measured study to see its projected end shapes.</p>';
  return `<svg viewBox="0 0 500 310" role="img" aria-label="End-cut Plan and elevation diagrams, not to scale">${[['v',g.W,'Plan: s / v',45],['w',g.D,'Elevation: s / w',185]].map(([axis,size,label,top])=>{const x=s=>45+410*s/g.L,y=t=>top+75-75*(t+size/2)/size,hull=svHull(g.body.local.map(p=>({x:p.s,y:p[axis]})));return `<text x="15" y="${top-12}" font-size="13">${label} · NOT TO SCALE</text><rect x="45" y="${top}" width="410" height="75" fill="#f4f6f6" stroke="#8a9294" stroke-dasharray="4 3"/><polygon points="${hull.map(p=>x(p.x)+','+y(p.y)).join(' ')}" fill="#afd0c1" stroke="#1d654f"/><text x="40" y="${top+91}" font-size="11">A · 0</text><text text-anchor="end" x="460" y="${top+91}" font-size="11">B · ${g.L} mm</text>`;}).join('')}<text x="15" y="302" font-size="11">Axis proportions adjusted; not a cutting template or machine setup.</text></svg>`;
}
function endCutRender(force=false){
  const dialog=document.querySelector('#endCutDialog');if(!dialog?.open)return;
  const fingerprint=JSON.stringify([state.model.endCutDetails,state.model.floorFraming,state.model.levels,EC_UI.id,EC_UI.error]);if(!force&&fingerprint===EC_UI.fingerprint)return;EC_UI.fingerprint=fingerprint;
  const records=state.model.endCutDetails||[],members=state.model.floorFraming||[];
  if(!records.some(r=>r.id===EC_UI.id))EC_UI.id=records[0]?.id||'';
  const r=records.find(r=>r.id===EC_UI.id);dialog.querySelector('#endCutPicker').innerHTML=records.map((r,i)=>`<option value="${escapeHtml(r.id)}" ${r.id===EC_UI.id?'selected':''}>${i+1}. ${escapeHtml(r.name||'End-cut study')}</option>`).join('');dialog.querySelector('#endCutError').textContent=EC_UI.error;
  if(!r){dialog.querySelector('#endCutContent').innerHTML='<p>No end-cut studies. Add a study; no member or cut dimensions are assumed.</p>';return;}
  const g=endCutReview(r),field=(k,label,numeric=false)=>`<label>${label}<input ${numeric?'type="number" step="any"':'maxlength="2000"'} data-ec-field="${k}" value="${escapeHtml(r[k]??'')}"/></label>`,metric=(label,value,unit)=>`<tr><th>${label}</th><td>${value==null?'Unassessed':formatNumber(value,unit==='mm'?3:6)+' '+unit}</td></tr>`;
  dialog.querySelector('#endCutContent').innerHTML=`<div class="stock-plan-grid"><section><h3>Source and entered end planes</h3><div class="stock-fields">${field('name','Study name')}<label>Geometry<select data-ec-field="enabled"><option value="false" ${!r.enabled?'selected':''}>Not modelled</option><option value="true" ${r.enabled?'selected':''}>Measured reference</option></select></label><label>House floor member / all levels<select data-ec-field="memberId"><option value="">Select a recorded member</option>${r.memberId&&!members.some(m=>m.id===r.memberId)?`<option selected value="${escapeHtml(r.memberId)}">Missing: ${escapeHtml(r.memberId)}</option>`:''}${members.map(m=>`<option value="${escapeHtml(m.id)}" ${r.memberId===m.id?'selected':''}>${escapeHtml(m.name||m.role)} · ${escapeHtml(levelName(m.levelId))} · ${escapeHtml(m.id)}</option>`).join('')}</select></label></div><p class="overview-copy">The study follows the selected member's recorded endpoints, section and absolute elevation. Changing a source member updates this reference; the study never edits that member. Missing targets stay recorded.</p>${['start','end'].map((end,i)=>`<fieldset><legend>${i?'B end':'A start'}</legend><div class="stock-fields">${field(end+'Setback','Centre setback inward (mm)',true)}${field(end+'Across','Across-width slope angle (°)',true)}${field(end+'Depth','Depth slope angle (°)',true)}</div></fieldset>`).join('')}<p class="overview-copy">s runs from A to B; v is Plan normal (−dy,+dx), w is up from section centre. Start plane: s = start setback + v tan(across) + w tan(depth). End plane: s = L − end setback + v tan(across) + w tan(depth). Both positive slopes move towards B as v/w increase. Zero is explicit. These independent plane slopes are not compound-saw settings.</p><details><summary>Design and product evidence</summary><div class="stock-fields">${[['designRef','Designer / project approval reference'],['drawingRef','Drawing / revision'],['sourceUrl','Manufacturer source URL'],['checkedDate','Checked date (YYYY-MM-DD)'],['finishRef','Cut end treatment / finish evidence'],['notes','Notes']].map(([k,l])=>field(k,l)).join('')}</div></details><button type="button" data-ec-action="remove">Remove study</button></section><section class="stock-results"><h3>Measured reference review</h3><p id="endCutStatus"><strong>${escapeHtml(g.status)}</strong> ${escapeHtml(g.reason)}</p>${endCutDiagram(g)}<div class="stock-table-wrap"><table><tbody>${metric('Source length',g.L,'mm')}${metric('Retained centreline',g.centreLength,'mm')}${metric('Shortest corner edge',g.body?Math.min(...g.edgeLengths):null,'mm')}${metric('Longest corner edge',g.body?Math.max(...g.edgeLengths):null,'mm')}${metric('Longitudinal bound',g.bound,'mm')}${metric('Source envelope',g.body?g.grossVolume/1e9:null,'m³')}${metric('Reference retained',g.body?g.volume/1e9:null,'m³')}${metric('Reference removed',g.body?g.removed/1e9:null,'m³')}${metric('Start face',g.body?g.startArea/1e6:null,'m²')}${metric('End face',g.body?g.endArea/1e6:null,'m²')}</tbody></table></div><p>${g.missing.length?'Evidence missing: '+escapeHtml(g.missing.join(', ')):'Evidence recorded; project verification is still required.'}</p><p>${records.filter(x=>x.memberId&&x.memberId===r.memberId).length} independent study/studies refer to this member. They are alternatives, never cumulative cuts or additive material deductions.</p><button type="button" data-ec-action="focus">Show reference in Plan</button><p class="overview-copy">All four corners of each end plane must stay inside the original member and every longitudinal corner edge must remain positive. Out-of-envelope or crossing planes leave the entire study unassessed. No partial clipping, holes, notches, fitted joint match, kerf, saw setup, support/contact changes, structural capacity or purchase quantities are inferred. Original member geometry and takeoffs remain unchanged. Overlays show through other bodies.</p></section></div>`;
}
function endCutCommit(records){try{validateEndCuts({...state.model,endCutDetails:records});}catch(e){EC_UI.error=e.message;endCutRender(true);return false;}EC_UI.error='';withHistory(()=>{state.model.endCutDetails=records;});endCutRender(true);return true;}
function endCutChange(key,value){if(![...EC_NUMBERS,...EC_TEXT,'enabled','memberId'].includes(key))return;const records=clone(state.model.endCutDetails||[]),r=records.find(r=>r.id===EC_UI.id);if(!r)return;r[key]=key==='enabled'?value==='true':EC_NUMBERS.includes(key)?value.trim()?Number(value):null:value;endCutCommit(records);}
function endCutAction(action){
  if(action==='undo'||action==='redo'){EC_UI.error='';action==='undo'?undo():redo();endCutRender(true);return;}
  if(action==='csv'){download('bc-design-end-cut-references.csv',endCutCsv(),'text/csv');return;}
  const records=clone(state.model.endCutDetails||[]),r=records.find(r=>r.id===EC_UI.id);
  if(action==='add'){const next=endCutNew();records.push(next);if(endCutCommit(records)){EC_UI.id=next.id;endCutRender(true);}return;}
  if(!r)return;
  if(action==='remove'){endCutCommit(records.filter(s=>s.id!==r.id));return;}
  if(action==='focus'){const g=endCutReview(r);if(!g.body){EC_UI.error='No measured end-cut geometry to focus.';endCutRender(true);return;}const xs=g.body.vertices.map(p=>p.x),ys=g.body.vertices.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;state.model.activeLevelId=g.member.levelId;state.mode='plan';state.planDisplayMode='coordination';state.visibility.endCutReferences=true;state.view.scale=Math.min(4,(state.width-100)/Math.max(200,Math.max(...xs)-Math.min(...xs)+100),(state.height-100)/Math.max(200,Math.max(...ys)-Math.min(...ys)+100));state.view.offsetX=state.width/2-cx*state.view.scale;state.view.offsetY=state.height/2-cy*state.view.scale;document.querySelector('#endCutDialog').close();render();}
}
function initEndCuts(){const d=document.querySelector('#endCutDialog'),button=document.querySelector('#endCutButton');if(!d||!button||d.dataset.ready)return;d.dataset.ready='true';button.addEventListener('click',()=>{EC_UI.error='';d.showModal();endCutRender(true);});d.querySelector('#endCutClose').addEventListener('click',()=>d.close());d.querySelector('#endCutPicker').addEventListener('change',e=>{EC_UI.id=e.target.value;EC_UI.error='';endCutRender(true);});d.addEventListener('change',e=>{if(e.target.dataset.ecField)endCutChange(e.target.dataset.ecField,e.target.value);});d.addEventListener('click',e=>{const b=e.target.closest('[data-ec-action]');if(b)endCutAction(b.dataset.ecAction);});}
if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('DOMContentLoaded',initEndCuts);
