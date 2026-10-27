const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const element = { value: '', classList: { add() {}, remove() {} }, getContext: () => ({}), addEventListener() {} };
const context = vm.createContext({
  document: { querySelector: () => element, querySelectorAll: () => [] },
  console,
  window: { clearTimeout() {}, setTimeout() {} },
});
const sources = ['foundation-details.js', 'roofs.js', 'roof-junctions.js', 'roof-trimming.js', 'roof-framing.js', 'rooms.js', 'stairs.js', 'stair-coordination.js', 'stair-rails.js', 'stair-rail-members.js', 'stair-rail-ends.js', 'deck-framing.js', 'deck-boards.js', 'deck-supports.js', 'deck-posts.js', 'deck-post-members.js', 'deck-edges.js', 'services.js', 'service-connections.js', 'service-envelopes.js', 'material-references.js', 'service-clearance-checks.js', 'service-route-body-checks.js', 'service-route-volumes.js', 'floor-openings.js', 'floor-cuts.js', 'stair-headroom.js', 'floor-framing.js'];
vm.runInContext(sources.map(file => readFileSync(file, 'utf8')).join('\n') + '\n' + readFileSync('app.js', 'utf8').split('document.querySelectorAll("[data-tool]")')[0], context);
const run = expression => vm.runInContext(expression, context);
run('render=()=>{}; scheduleSave=()=>{}; download=(name,data)=>{ lastDownload={name,data}; }; state.model=createEmptyModel();');

run('const floor={id:"floor-test",levelId:state.model.activeLevelId,points:[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}],elevation:600,thickness:100}; state.model.floors=[floor]; state.model.pads=[{id:"pad-test",levelId:state.model.activeLevelId,center:{x:1000,y:0},shape:"rectangular",width:500,length:500,diameter:500,depth:300,elevation:0}]; state.model.floorFraming=[{id:"member-test",floorId:floor.id,levelId:floor.levelId,role:"bearer",name:"Test bearer",ax:0,ay:0,bx:2000,by:0,width:100,depth:200,elevation:300,material:"Timber",design:"Design input",fixings:"Fixings input",drawingRef:"A-01",notes:""}]; state.model.floorSupportReviews=[{id:"review-test",memberId:"member-test",targetType:"pad",targetId:"pad-test",expectedGap:0,minimumPlanArea:null,design:"Support intent",connections:"Connection intent",drawingRef:"A-01",notes:""}];');
const review = run('floorFramingReview(state.model.floorSupportReviews[0])');
assert.equal(review.status, 'Plan contact');
assert.equal(review.gap, 0);
assert.equal(review.planArea, 50000);
assert.equal(review.contactArea, 50000);
assert.equal(run('floorFramingQuantityRows().find(row=>row.label==="House floor bearer length").net'), 2);
assert.equal(run('floorFramingBounds().length'), 4);
assert.equal(run('floorFramingReviewBounds().length'), 1);

run('state.model.pads[0].elevation=500; state.model.floorFraming[0].elevation=0;');
const below = run('floorFramingReview(state.model.floorSupportReviews[0])');
assert.equal(below.status, 'Below target');
assert.equal(below.overlapDepth, 0);
run('state.model.pads[0].depth=100; state.model.floorFraming[0].elevation=300;');
const belowBoundary = run('floorFramingReview(state.model.floorSupportReviews[0])');
assert.equal(belowBoundary.status, 'Below target');
assert.equal(belowBoundary.overlapDepth, 0);
run('state.model.pads[0].elevation=0; state.model.floorFraming[0].elevation=300;');
run('state.model.pads[0].depth=300;');
run('state.model.levels.push({id:"wall-level",name:"Wall test level",elevation:1000}); state.model.walls=[{id:"wall-target",levelId:"wall-level",a:{x:0,y:0},b:{x:2000,y:0},thickness:200,height:2700}]; state.model.floorFraming.push({id:"wall-member",floorId:floor.id,levelId:floor.levelId,role:"joist",name:"Wall test member",ax:0,ay:0,bx:2000,by:0,width:100,depth:200,elevation:3700,material:"Timber",design:"",fixings:"",drawingRef:"",notes:""}); state.model.floorSupportReviews.push({id:"wall-review",memberId:"wall-member",targetType:"wall",targetId:"wall-target",expectedGap:0,minimumPlanArea:null,design:"",connections:"",drawingRef:"",notes:""});');
const wallReview = run('floorFramingReview(state.model.floorSupportReviews.find(item=>item.id==="wall-review"))');
assert.equal(wallReview.targetBase, 1000);
assert.equal(wallReview.targetTop, 3700);
assert.equal(wallReview.status, 'Plan contact');
run('state.model.floorFraming.find(item=>item.id==="wall-member").elevation=2700;');
const wallBelowBase = run('floorFramingReview(state.model.floorSupportReviews.find(item=>item.id==="wall-review"))');
assert.equal(wallBelowBase.targetTop, 3700);
assert.equal(wallBelowBase.status, 'Vertical overlap');
run('state.model.floorFraming=state.model.floorFraming.filter(item=>item.id!=="wall-member"); state.model.floorSupportReviews=state.model.floorSupportReviews.filter(item=>item.id!=="wall-review"); state.model.walls=[]; state.model.levels=state.model.levels.filter(item=>item.id!=="wall-level");');

run('const normalized=normalizeModel(JSON.parse(JSON.stringify(state.model)));');
assert.equal(run('normalized.floorFraming.length'), 1);
assert.equal(run('normalized.floorSupportReviews.length'), 1);
run('let legacy=clone(state.model); delete legacy.floorFraming; delete legacy.floorSupportReviews;');
assert.equal(run('normalizeModel(legacy).floorFraming.length'), 0);
assert.equal(run('normalizeModel(legacy).floorSupportReviews.length'), 0);
run('let bad=clone(state.model); bad.floorFraming[0].width=0;');
assert.throws(() => run('normalizeModel(bad)'));
run('let badReview=clone(state.model); badReview.floorSupportReviews[0].targetType="roof";');
assert.throws(() => run('normalizeModel(badReview)'));

run('state.selected={type:"floor",id:"floor-test"}; updateFloorMember(0,"depth","240"); updateFloorSupportReview("review-test","expectedGap","10");');
assert.equal(run('state.model.floorFraming[0].depth'), 240);
assert.equal(run('state.model.floorSupportReviews[0].expectedGap'), 10);
run('updateFloorMember(0,"width","0"); updateFloorSupportReview("review-test","minimumPlanArea","-1");');
assert.equal(run('state.model.floorFraming[0].width'), 100);
assert.equal(run('state.model.floorSupportReviews[0].minimumPlanArea'), null);

run('exportFloorFramingCsv();');
assert.ok(run('lastDownload.name==="bc-design-house-floor-framing.csv" && lastDownload.data.includes("Test bearer") && lastDownload.data.includes("Support review count")'));
run('floorFramingAction("add-floor-member");');
assert.equal(run('state.model.floorFraming.length'), 2);
run('floorFramingAction("remove-floor-member",1);');
assert.equal(run('state.model.floorFraming.length'), 1);
run('undo();');
assert.equal(run('state.model.floorFraming.length'), 2);
run('redo();');
assert.equal(run('state.model.floorFraming.length'), 1);

run('state.model=normalizeModel(createExampleModel());');
assert.ok(run('state.model.floorFraming.length') > 50);
assert.ok(run('state.model.floorSupportReviews.length') > 0);
assert.equal(run('normalizeModel(JSON.parse(JSON.stringify(state.model))).floorFraming.length'), run('state.model.floorFraming.length'));
console.log('Floor framing tests passed: explicit members, support overlap/gap review, quantities, bounds, JSON/legacy validation, CSV, edits, delete/undo/redo and example generation.');
