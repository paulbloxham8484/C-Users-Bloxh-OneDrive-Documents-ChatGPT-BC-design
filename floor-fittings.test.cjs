const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const element = { value: '', classList: { add() {}, remove() {} }, getContext: () => ({}), addEventListener() {} };
const context = vm.createContext({
  document: { querySelector: () => element, querySelectorAll: () => [] },
  console,
  window: { clearTimeout() {}, setTimeout() {} },
});
const sources = ['foundation-details.js', 'roofs.js', 'roof-junctions.js', 'roof-trimming.js', 'roof-framing.js', 'rooms.js', 'stairs.js', 'stair-coordination.js', 'stair-rails.js', 'stair-rail-members.js', 'stair-rail-ends.js', 'deck-framing.js', 'deck-boards.js', 'deck-supports.js', 'deck-posts.js', 'deck-post-members.js', 'deck-edges.js', 'services.js', 'service-connections.js', 'service-envelopes.js', 'material-references.js', 'service-clearance-checks.js', 'service-route-body-checks.js', 'service-route-volumes.js', 'floor-openings.js', 'floor-cuts.js', 'stair-headroom.js', 'floor-framing.js', 'floor-fittings.js'];
vm.runInContext(sources.map(file => readFileSync(file, 'utf8')).join('\n') + '\n' + readFileSync('app.js', 'utf8').split('document.querySelectorAll("[data-tool]")')[0], context);
const run = expression => vm.runInContext(expression, context);
run('render=()=>{}; scheduleSave=()=>{}; download=(name,data)=>{ lastDownload={name,data}; }; state.model=createEmptyModel();');

run('const floor={id:"floor-fit-test",levelId:state.model.activeLevelId,points:[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}],elevation:600,thickness:100}; state.model.floors=[floor]; state.model.floorFraming=[{id:"member-fit",floorId:floor.id,levelId:floor.levelId,role:"bearer",name:"Test bearer",ax:0,ay:0,bx:2000,by:0,width:100,depth:200,elevation:300}]; state.model.floorFitDetails=[{id:"fit-1",floorId:floor.id,levelId:floor.levelId,memberId:"member-fit",supportReviewId:"",kind:"support-connector",name:"Test connector",profile:"90 x 45 profile",hardware:"Saddle connector",manufacturer:"Example supplier",productCode:"SKU-1",width:90,depth:45,length:200,stockLength:2400,quantity:2,fixing:"Project fixing schedule",evidence:"Drawing A-02 / checked date",drawingRef:"A-02",notes:"Review before order"}]; state.model.floorAccessReviews=[{id:"access-1",floorId:floor.id,levelId:floor.levelId,subjectType:"floor",subjectId:"",status:"pending",zone:"Subfloor east",accessPath:"Entry from east hatch",clearanceWidth:600,clearanceHeight:900,obstructions:"Pier line",designRef:"A-03",notes:"Confirm maintenance route"}];');
assert.equal(run('normalizeModel(JSON.parse(JSON.stringify(state.model))).floorFitDetails.length'), 1);
assert.equal(run('normalizeModel(JSON.parse(JSON.stringify(state.model))).floorAccessReviews.length'), 1);
assert.throws(() => run('normalizeModel({...state.model,floorFitDetails:[{...state.model.floorFitDetails[0],quantity:0}]})'));
assert.throws(() => run('normalizeModel({...state.model,floorAccessReviews:[{...state.model.floorAccessReviews[0],status:"approved"}]})'));

run('state.selected={type:"floor",id:"floor-fit-test"}; updateFloorFitDetail("fit-1","profile","90 x 45 MGP10"); updateFloorFitDetail("fit-1","quantity","3"); updateFloorAccessReview("access-1","status","blocked"); updateFloorAccessReview("access-1","obstructions","Pier line; duct route");');
assert.equal(run('state.model.floorFitDetails[0].profile'), '90 x 45 MGP10');
assert.equal(run('state.model.floorFitDetails[0].quantity'), 3);
assert.equal(run('state.model.floorAccessReviews[0].status'), 'blocked');
assert.match(run('renderFloorFitDetails(state.model.floors[0])'), /Fitted profiles and hardware/);
run('exportFloorFitCsv();');
assert.ok(run('lastDownload.name==="bc-design-floor-fitted-details.csv" && lastDownload.data.includes("Test connector") && lastDownload.data.includes("Subfloor east")'));
assert.equal(run('floorFitQuantityRows().find(row=>row.label==="Floor fitted detail records").net'), 1);
assert.equal(run('floorFitQuantityRows().find(row=>row.label==="Floor access reviews").net'), 1);

run('floorFitAction("add-floor-fit"); floorAccessAction("add-floor-access");');
assert.equal(run('state.model.floorFitDetails.length'), 2);
assert.equal(run('state.model.floorAccessReviews.length'), 2);
run('floorFitAction("remove-floor-fit", "fit-1"); floorAccessAction("remove-floor-access", "access-1");');
assert.equal(run('state.model.floorFitDetails.length'), 1);
assert.equal(run('state.model.floorAccessReviews.length'), 1);
run('undo(); undo();');
assert.equal(run('state.model.floorFitDetails.length'), 2);
assert.equal(run('state.model.floorAccessReviews.length'), 2);
run('redo(); redo();');
assert.equal(run('state.model.floorFitDetails.length'), 1);
assert.equal(run('state.model.floorAccessReviews.length'), 1);

run('let legacy=clone(state.model); delete legacy.floorFitDetails; delete legacy.floorAccessReviews;');
assert.equal(run('normalizeModel(legacy).floorFitDetails.length'), 0);
assert.equal(run('normalizeModel(legacy).floorAccessReviews.length'), 0);
console.log('Floor fitting tests passed: profile/hardware records, access review inputs, validation, JSON migration, CSV, quantities and history.');
