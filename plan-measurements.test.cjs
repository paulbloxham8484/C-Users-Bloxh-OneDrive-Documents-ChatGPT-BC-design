const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const measure={save(){},restore(){},measureText:t=>({width:String(t).length*6})};const element={value:'',classList:{add(){},remove(){}},getContext:()=>measure,addEventListener(){}};
const context=vm.createContext({document:{querySelector:()=>element,querySelectorAll:()=>[]},console,window:{clearTimeout(){},setTimeout(){}}});
const scripts=require('./node-workspace-scripts.cjs')();
vm.runInContext(scripts.map(f=>f==='app.js'?fs.readFileSync(f,'utf8').split('document.querySelectorAll("[data-tool]")')[0]:fs.readFileSync(f,'utf8')).join('\n'),context);
const run=s=>vm.runInContext(s,context),get=s=>JSON.parse(run(`JSON.stringify(${s})`));
run('render=()=>{};scheduleSave=()=>{};state.model=createEmptyModel();const lev=state.model.activeLevelId;state.model.walls=[{id:"wall-test",levelId:lev,a:{x:10,y:20},b:{x:3010,y:4020},thickness:140,height:2700}];state.model.openings=[{id:"door-test",levelId:lev,wallId:"wall-test",type:"door",offset:500,width:820,height:2100,sill:0}];state.model.rooms=[makeRoom([{x:0,y:0},{x:3000,y:4000},{x:1400,y:5200},{x:-1600,y:1200}],lev,"Rotated zone")];');
const before=get('state.model');assert.match(get('planMeasurementLabels()').find(l=>l.kind==='wall').lines[0],/5,000 mm CL/);assert.match(get('planMeasurementLabels()').find(l=>l.kind==='room').lines[2],/5,000 × 2,000 mm/);assert.match(get('planMeasurementLabels()').find(l=>l.kind==='opening').lines[0],/Door 820 mm/);assert.deepEqual(get('state.model'),before);
run('state.model.walls[0].b={x:6010,y:8020}');assert.match(get('planMeasurementLabels()').find(l=>l.kind==='wall').lines[0],/10,000 mm CL/);
run('state.visibility.planSizes=false');assert.ok(get('planMeasurementLabels()').every(l=>l.kind==='room'&&l.lines.length===2));run('state.visibility.planSizes=true;state.model.activeLevelId="other"');assert.equal(get('planMeasurementLabels()').length,0);run('state.model.activeLevelId=lev;state.visibility.walls=false;state.visibility.openings=false;state.visibility.rooms=false');assert.equal(get('planMeasurementLabels()').length,0);
assert.match(run('roomPlanSize({points:[{x:0,y:0},{x:1000,y:0},{x:0,y:1000}]})'),/^Zone perimeter/);
for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5,.37,-.84]){
 const g=get(`openingPlanGeometry({offset:200,width:900},{a:{x:10,y:20},b:{x:10+Math.cos(${angle})*5000,y:20+Math.sin(${angle})*5000},thickness:140})`);
 const delta={x:g.leaf.x-g.hinge.x,y:g.leaf.y-g.hinge.y};assert.ok(Math.abs(Math.hypot(delta.x,delta.y)-900)<1e-7);assert.ok(Math.abs(delta.x*g.direction.x+delta.y*g.direction.y)<1e-7);assert.ok(Math.abs(Math.cos(g.angle+Math.PI/2)*900-delta.x)<1e-7);assert.ok(Math.abs(Math.sin(g.angle+Math.PI/2)*900-delta.y)<1e-7);
}
run('state.visibility.walls=true;state.visibility.rooms=true;state.visibility.openings=true;state.width=1200;state.height=900;state.model.openings[0].type="window";');
const svg=get('makePlanSheet({scale:100,paper:"A3"})').svg;assert.match(svg,/W 820/);assert.match(svg,/10,000 mm CL/);assert.match(svg,/5,000/);
console.log('Plan measurements passed: live lengths, rotated room sides, irregular perimeter, layer/level scope, no model writes, door geometry in six orientations, vector export.');
