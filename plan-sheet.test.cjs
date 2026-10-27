const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const measure={save(){},restore(){},measureText:t=>({width:String(t).length*6,actualBoundingBoxAscent:12,actualBoundingBoxDescent:3})};
const element={value:'',classList:{add(){},remove(){}},getContext:()=>measure,addEventListener(){}};
const context=vm.createContext({document:{querySelector:()=>element,querySelectorAll:()=>[]},console,window:{clearTimeout(){},setTimeout(){}}});
const scripts=require('./node-workspace-scripts.cjs')();
vm.runInContext(scripts.map(file=>file==='app.js'?fs.readFileSync(file,'utf8').split('document.querySelectorAll("[data-tool]")')[0]:fs.readFileSync(file,'utf8')).join('\n'),context);
const run=s=>vm.runInContext(s,context),get=s=>JSON.parse(run(`JSON.stringify(${s})`));
run('render=()=>{};scheduleSave=()=>{};state.model=createExampleModel();state.width=1042;state.height=785;state.mode="3d";state.view.scale=.143;state.view.offsetX=348;state.view.offsetY=-100;state.selected={type:"wall",id:state.model.walls[0].id};state.selectedClearancePair="test-pair";');
const before=get('({model:state.model,history:state.history,future:state.future,view:state.view,mode:state.mode,selected:state.selected,width:state.width,height:state.height,pair:state.selectedClearancePair})');
const sheet=get('makePlanSheet({paper:"A2",scale:125})');assert.equal(sheet.settings.width,594);assert.equal(sheet.metadata.scaleDenominator,125);assert.ok(sheet.vectorCount>20);assert.match(sheet.svg,/<path/);assert.match(sheet.svg,/<text/);assert.doesNotMatch(sheet.svg,/data:image\/png|<script|foreignObject|NOT TO SCALE/);
assert.deepEqual(get('({model:state.model,history:state.history,future:state.future,view:state.view,mode:state.mode,selected:state.selected,width:state.width,height:state.height,pair:state.selectedClearancePair})'),before);
run('state.view.scale=4;state.view.offsetX=-10000;state.view.offsetY=9000;');assert.equal(run('makePlanSheet({paper:"A2",scale:125}).svg'),sheet.svg);
assert.throws(()=>run('makePlanSheet({paper:"A4",scale:1})'),/Nothing was cropped or rescaled/);
assert.throws(()=>run('planSheetSettings({scale:""})'));assert.throws(()=>run('planSheetSettings({scale:Infinity})'));assert.throws(()=>run('planSheetSettings({paper:"prototype"})'));
run('state.drawing={kind:"wall"};');assert.throws(()=>run('makePlanSheet()'),/Finish or cancel/);run('state.drawing=null;');
// No renderer or export exception may strand the live canvas/state in sheet mode.
run('const realRenderPlan=renderPlan;renderPlan=()=>ctx.bezierCurveTo(0,0,1,1,2,2);const savedView=state.view,savedCtx=ctx;');assert.throws(()=>run('makePlanSheet()'),/Unsupported vector drawing operation/);assert.equal(run('ctx===savedCtx&&state.view===savedView&&state.mode==="3d"'),true);run('renderPlan=realRenderPlan;');
run('state.model=createEmptyModel();state.model.name="<script>alert(1)</script> & export";const level=state.model.activeLevelId;state.model.walls=[{id:"w",levelId:level,a:{x:0,y:0},b:{x:1000,y:0},thickness:100,height:2700}];');
const one=get('makePlanSheet({scale:100})');assert.match(one.svg,/&lt;script&gt;/);assert.doesNotMatch(one.svg,/<script>/);
const path=one.svg.match(/<g id="plan-geometry"[^>]*><path d="M([\d.-]+) ([\d.-]+) L([\d.-]+) ([\d.-]+)"/);assert.ok(path);assert.ok(Math.abs((Number(path[3])-Number(path[1]))/(96/25.4)-10)<1e-6);
run('state.model.levels.push({id:"hidden-level",name:"Other",elevation:3000});state.model.walls.push({id:"elsewhere",levelId:"hidden-level",a:{x:0,y:0},b:{x:1e8,y:0},thickness:100,height:2700});');assert.equal(run('makePlanSheet().vectorCount'),one.vectorCount);
run('state.model.levels.push({id:"upper-level",name:"Upper / Level",elevation:3000});state.model.walls.push({id:"upper-wall",levelId:"upper-level",a:{x:0,y:0},b:{x:1000,y:0},thickness:100,height:2700});');
const activeLevelBefore=run('state.model.activeLevelId'),upper=get('makePlanSheet({levelId:"upper-level",sheetIndex:2,sheetCount:2,coverage:"Two selected levels; one sheet per level."})');assert.equal(upper.metadata.levelName,'Upper / Level');assert.equal(upper.metadata.sheetIndex,2);assert.equal(upper.metadata.sheetCount,2);assert.equal(upper.metadata.coverage,'Two selected levels; one sheet per level.');assert.match(upper.svg,/Sheet 2 of 2/);assert.equal(run('state.model.activeLevelId'),activeLevelBefore);
assert.throws(()=>run('makePlanSheet({levelId:"missing-level"})'),/Selected sheet level is missing/);
run('state.visibility.walls=false;');assert.throws(()=>run('makePlanSheet()'),/No visible/);run('state.visibility.walls=true;state.model.walls[0].b.x=1e9;');assert.throws(()=>run('makePlanSheet()'),/Nothing was cropped/);
// Exact circle/partial arc paths, dashes, opacity and independent style stacks.
run('const r=createPlanVectorRecorder(ctx);r.save();r.globalAlpha=.35;r.setLineDash([6,4]);r.beginPath();r.arc(10,20,5,0,Math.PI*2);r.stroke();r.restore();r.beginPath();r.moveTo(0,0);r.lineTo(10,0);r.stroke();');
const recorded=get('r.result()');assert.equal((recorded.items[0].match(/A5 5/g)||[]).length,2);assert.match(recorded.items[0],/opacity="0.35"/);assert.match(recorded.items[0],/stroke-dasharray="6 4"/);assert.match(recorded.items[1],/opacity="1"/);
assert.throws(()=>run('r.lineTo(Infinity,0)'),/Non-finite/);
run('r.beginPath();r.moveTo(0,0);r.lineTo(1,1);r.strokeStyle="url(https://example.com)";');assert.throws(()=>run('r.stroke()'),/Unsupported drawing colour/);
// All supported page sizes/orientations retain exact physical dimensions.
for(const paper of ['A4','A3','A2'])for(const orientation of ['portrait','landscape']){const s=get(`planSheetSettings({paper:'${paper}',orientation:'${orientation}'})`);assert.equal(orientation==='landscape',s.width>s.height);}
console.log('Plan sheet tests passed: physical scale, complete vector render, coverage rejection, active-level/layer scope, stable viewport/history/model, failure recovery, XML safety, dashes/arcs/opacity and paper sizes.');
