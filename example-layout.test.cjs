const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const measure={save(){},restore(){},measureText:t=>({width:String(t).length*6})};const element={value:'base',classList:{add(){},remove(){}},getContext:()=>measure,addEventListener(){}};const context=vm.createContext({document:{querySelector:()=>element,querySelectorAll:()=>[]},console,window:{clearTimeout(){},setTimeout(){}}});
const scripts=require('./node-workspace-scripts.cjs')();vm.runInContext(scripts.map(f=>f==='app.js'?fs.readFileSync(f,'utf8').split('document.querySelectorAll("[data-tool]")')[0]:fs.readFileSync(f,'utf8')).join('\n'),context);const run=s=>vm.runInContext(s,context),get=s=>JSON.parse(run(`JSON.stringify(${s})`));
run('render=()=>{};scheduleSave=()=>{};state.model=createExampleModel()');
const model=get('state.model'),level=model.activeLevelId;
assert.equal(model.rooms.filter(r=>r.use==='Bedroom').length,3);assert.equal(model.rooms.filter(r=>r.use==='Bathroom').length,2);
const landscaping=model.takeoffGroups.find(group=>group.name==='Landscaping');assert.ok(landscaping,'Detailed landscaping takeoff is present');assert.ok(landscaping.items.length>=40,'Landscaping takeoff includes pool, deck, foundations, driveway and planting detail');assert.equal(landscaping.items.find(item=>/Concrete driveway volume/.test(item.name)).quantity,112.5);assert.equal(landscaping.items.find(item=>/Concrete pool walls/.test(item.name)).quantity,11.52);assert.equal(landscaping.items.find(item=>/Screw pier foundation/.test(item.name)).quantity,44);assert.ok(landscaping.references.some(reference=>/Pool fences and barriers/.test(reference.title)));assert.ok(landscaping.references.some(reference=>/Daly/.test(reference.title)));
assert.equal(run('polygonArea(state.model.floors[0].points)'),262000000);
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0)/2);
const box=p=>({x0:Math.min(...p.map(q=>q.x)),x1:Math.max(...p.map(q=>q.x)),y0:Math.min(...p.map(q=>q.y)),y1:Math.max(...p.map(q=>q.y))});
assert.equal(model.decks.reduce((s,d)=>s+area(d.points),0),246000000);
for(let i=0;i<model.decks.length;i++)for(let j=0;j<i;j++){const a=box(model.decks[i].points),b=box(model.decks[j].points);assert.equal(Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)),0,'Deck panels must not double-count corners');}
assert.ok(Math.abs(run('state.model.roofs.reduce((s,r)=>s+roofMeasuredGeometry(r).planArea,0)')-508000000)<.01,'Retained roof footprint covers exactly house plus veranda');
for(const o of model.openings){const w=model.walls.find(w=>w.id===o.wallId),length=Math.hypot(w.b.x-w.a.x,w.b.y-w.a.y);assert.ok(o.offset>=0&&o.offset+o.width<=length);assert.ok(o.sill>=0&&o.sill+o.height<=w.height);for(const b of model.openings.filter(b=>b.id!==o.id&&b.wallId===o.wallId))assert.ok(o.offset+o.width<=b.offset||b.offset+b.width<=o.offset,'Openings must not overlap');}
assert.equal(model.openings.length,30);assert.equal(model.stairs[0].width,3000);assert.equal(model.stairs[1].width,3000);
assert.equal(model.stairs.reduce((sum,stair)=>sum+(stair.railRuns||[]).filter(run=>run.kind==='handrail').length,0),4);
assert.equal(model.stairs.reduce((sum,stair)=>sum+(stair.railRuns||[]).filter(run=>run.kind==='barrier').length,0),4);
assert.ok(model.decks.every(deck=>(deck.barriers||[]).length>0));assert.equal(model.decks.reduce((sum,deck)=>sum+(deck.barriers||[]).length,0),13);
assert.equal(model.decks.filter(deck=>deck.boards?.enabled).length,model.decks.length);
assert.equal(model.decks[0].boards.width,90);assert.equal(model.decks[0].boards.thickness,19);assert.equal(model.decks[0].boards.gap,5);
assert.equal(model.specifications.length,6);assert.ok(model.metadata.handoverPackage);assert.match(model.notes.find(note=>note.id==='handover-finish-note').text,/HANDOVER-STYLE COMPLETION SET/);
const kitchen=model.rooms.find(r=>r.name==='Kitchen'),kbox=box(kitchen.points);assert.equal(model.kitchenUnits.length,9);
for(const u of model.kitchenUnits){context.unit=u;const b=box(get('kitchenOutline(unit)'));assert.ok(b.x0>=kbox.x0-1e-6&&b.x1<=kbox.x1+1e-6&&b.y0>=kbox.y0-1e-6&&b.y1<=kbox.y1+1e-6,'Kitchen envelope must stay in kitchen zone');}
for(const d of model.decks){assert.equal(d.joistSpacing,450);assert.equal(d.bearerSpacing,1200);const j=d.members.filter(m=>m.role==='joist');for(let i=1;i<j.length;i++)assert.ok(Math.hypot(j[i].ax-j[i-1].ax,j[i].ay-j[i-1].ay)<=450+1e-6);}
console.log('Example layout passed: continuous non-overlapping deck, complete roof footprint, rooms, 30 bounded openings, fitted kitchen, wider stairs and explicit framing spacing.');

assert.equal(model.rooms.filter(r=>r.use==='Study').length,1);
assert.ok(model.rooms.filter(r=>r.use==='Bedroom').every(r=>area(r.points)>17e6));
assert.ok(Math.abs(model.metadata.designInspiration.openLivingArea-97.0876)<1e-7);
assert.equal(model.openings.filter(o=>o.operation==='sliding').length,3);
assert.equal(model.openings.filter(o=>o.operation==='passage').length,2);
assert.equal(model.walls.filter(w=>!w.id.includes('pantry')&&Math.min(w.a.y,w.b.y)>0&&Math.max(w.a.y,w.b.y)<5800).length,0,'Open living zones have no dividing walls');
assert.equal(new Set(model.pads.map(p=>p.mark)).size,model.pads.length);
assert.equal(new Set(model.piers.map(p=>p.mark)).size,model.piers.length);
for(const d of model.decks)for(const post of d.posts){const pier=model.piers.find(p=>p.id===post.footingId),pad=model.pads.find(p=>p.id===pier.padId);assert.deepEqual(pier.center,pad.center);assert.deepEqual(pier.center,{x:post.x,y:post.y});const supports=d.members.filter(m=>m.role==='bearer'&&Math.abs((post.x-m.ax)*(m.by-m.ay)-(post.y-m.ay)*(m.bx-m.ax))<.01);assert.ok(supports.length);assert.ok(supports.some(m=>Math.abs(m.elevation-pier.elevation-pier.depth)<1e-8));}
for(const direction of ['front','rear','left','right']){const svg=run('makeFoundationElevationSvg('+JSON.stringify(direction)+')');assert.match(svg,/Foundation set-out/);assert.match(svg,/NOT TO SCALE/);assert.doesNotMatch(svg,/NaN|Infinity/);}
assert.match(run('foundationSetoutCsv()'),/Centre X mm from project zero/);
const serialized=JSON.stringify(model);context.raw=structuredClone(model);run('state.model=normalizeModel(raw)');assert.deepEqual(get('state.model.piers').map(p=>({id:p.id,mark:p.mark,center:p.center})),model.piers.map(p=>({id:p.id,mark:p.mark,center:p.center})));
assert.equal(run('state.model.openings.filter(o=>o.operation==="sliding").length'),3);
context.raw=structuredClone(model);delete context.raw.metadata.exampleCompletion;context.raw.stairs.forEach(stair=>delete stair.railRuns);context.raw.decks.forEach(deck=>delete deck.barriers);run('state.model=normalizeModel(raw)');assert.equal(run('state.model.stairs.reduce((sum,stair)=>sum+(stair.railRuns||[]).length,0)'),8);assert.equal(run('state.model.decks.reduce((sum,deck)=>sum+(deck.barriers||[]).length,0)'),13);
context.raw=structuredClone(model);context.raw.metadata.exampleCompletion={rails:true,stairs3m:false};context.raw.stairs.forEach(stair=>{stair.width=2400;stair.railRuns=[];});context.raw.decks.forEach(deck=>delete deck.barriers);run('state.model=normalizeModel(raw)');assert.deepEqual(get('state.model.stairs').map(stair=>stair.width),[3000,3000]);assert.equal(run('state.model.stairs.reduce((sum,stair)=>sum+(stair.railRuns||[]).length,0)'),8);assert.equal(run('state.model.decks.reduce((sum,deck)=>sum+(deck.barriers||[]).length,0)'),13);
context.raw=structuredClone(model);delete context.raw.openings[0].operation;run('state.model=normalizeModel(raw)');assert.equal(run('state.model.openings[0].operation'),'hinged');
context.raw=structuredClone(model);context.raw.piers[0].mark='x'.repeat(41);assert.throws(()=>run('normalizeModel(raw)'));
console.log('Modern layout/foundation tests passed: 262 m2 house, 246 m2 veranda, 97 m2 open living, 3 large bedrooms + study, aligned marked supports and four detail elevations.');
