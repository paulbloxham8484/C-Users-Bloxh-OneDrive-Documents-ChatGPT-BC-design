const {readFileSync}=require('node:fs');
const vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',classList:{add(){},remove(){}},getContext:()=>({}),addEventListener(){},scrollIntoView(){}});return elements.get(id);};
const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[]},console,window:{clearTimeout(){},setTimeout(){}}});
vm.runInContext(['foundation-details.js','roofs.js','roof-junctions.js','roof-trimming.js','roof-framing.js','rooms.js','stairs.js','stair-coordination.js','floor-openings.js','floor-cuts.js','stair-headroom.js','stair-rails.js','stair-rail-members.js','stair-rail-ends.js','deck-framing.js','deck-boards.js','deck-supports.js','deck-posts.js','deck-post-members.js','deck-edges.js','services.js','service-connections.js','service-envelopes.js','material-references.js','service-clearance-checks.js','service-route-body-checks.js','service-route-volumes.js'].map(f=>readFileSync(f,'utf8')).join('\n')+'\n'+readFileSync('app.js','utf8').split('document.querySelectorAll("[data-tool]")')[0],context);
const run=s=>vm.runInContext(s,context);
run(`render=()=>{};scheduleSave=()=>{};state.model=createEmptyModel();
 let host=makeServiceItem('fixture',{x:1000,y:2000},state.model.activeLevelId,400);
 let port=makeServicePort(host);port.name='Water inlet';port.offset={x:100,y:200,z:300};port.maxConnections='1';port.designRef='Designer A1';
 host.ports.push(port);state.model.serviceItems.push(host);
 let route=makeService({x:0,y:0},{x:3000,y:0},state.model.activeLevelId);state.model.services.push(route);
 let routeId=route.id,hostId=host.id,portId=port.id,ref={itemId:hostId,portId};
 connectServiceEndpoint(route,'end',ref);`);
assert.equal(run('serviceEndPosition(route,"end").x'),1100);
assert.equal(run('serviceEndPosition(route,"end").y'),2200);
assert.equal(run('serviceEndPosition(route,"end").z'),700);
assert.equal(run('serviceConnectionRow(route,"end").status'),'Linked');
assert.equal(run('serviceConnectionRow(route,"start").status'),'Unassigned');
assert.equal(run('servicePortRows()[0].status'),'Linked');
assert.equal(run('servicePortUsers(hostId,portId).length'),1);

// Each item/point movement and all affected endpoint changes are a single undo step.
run('state.selected={type:"serviceItem",id:hostId};let steps=state.history.length;updateSelectedField("positionX","2000");');
assert.equal(run('serviceEndPosition(state.model.services[0],"end").x'),2100);
assert.equal(run('state.history.length'),run('steps+1'));
run('undo();');assert.equal(run('state.model.serviceItems[0].center.x'),1000);
assert.equal(run('state.model.services[0].points[1].x'),1100);
run('redo();');assert.equal(run('state.model.serviceItems[0].center.x'),2000);
assert.equal(run('state.model.services[0].points[1].x'),2100);
run('state.selected={type:"serviceItem",id:hostId};updateSelectedField("port-0-offsetZ","600");');
assert.equal(run('state.model.services[0].points[1].z'),1000);
run('updateSelectedField("elevation","800");');assert.equal(run('state.model.services[0].points[1].z'),1400);

// A change which collapses any connected segment is rejected atomically.
run('let second=makeService({x:3100,y:2200},{x:7000,y:2200},state.model.activeLevelId,1400);state.model.services.push(second);state.model.serviceItems[0].ports[0].maxConnections="2";connectServiceEndpoint(second,"end",ref);let unchanged=JSON.stringify(state.model),historySize=state.history.length;updateSelectedField("positionX","3000");');
assert.equal(run('JSON.stringify(state.model)'),run('unchanged'));
assert.equal(run('state.history.length'),run('historySize'));
assert.ok(run('state.serviceError.includes("at least 1 mm")'));

// Gap checks use Z as well as X/Y; editing an endpoint never silently removes its link.
run('state.selected={type:"service",id:routeId};updateSelectedField("endElevation","1420");');
assert.equal(run('serviceConnectionRow(state.model.services[0],"end").gap'),20);
assert.ok(run('serviceConnectionRow(state.model.services[0],"end").codes.includes("gap")'));
assert.equal(run('state.model.services[0].connections.end.portId'),run('portId'));
run('serviceAction("service-resnap-end");');assert.equal(run('state.model.services[0].points[1].z'),1400);
run('updateSelectedField("endElevation","1401");');assert.equal(run('serviceConnectionRow(state.model.services[0],"end").status'),'Linked','Tolerance boundary inclusive');
run('serviceAction("service-resnap-end");');

// Capacity, system and size checks are records/geometry checks, not professional design checks.
run('state.selected={type:"serviceItem",id:hostId};updateSelectedField("port-0-maxConnections","1");');
assert.ok(run('serviceConnectionRows().filter(r=>r.codes.includes("capacity")).length===2'));
run('let third=makeService({x:9000,y:3000},{x:8000,y:3000},state.model.activeLevelId);state.model.services.push(third);let beforeThird=JSON.stringify(third);connectServiceEndpoint(third,"end",ref);');
assert.equal(run('JSON.stringify(third)'),run('beforeThird'),'Full point does not move or link a new end');
run('updateSelectedField("port-0-maxConnections","3");third.system="drainage";connectServiceEndpoint(third,"end",ref);');
assert.equal(run('third.connections.end'),null,'Mismatched assignment rejected');
run('updateSelectedField("port-0-system","drainage");');
assert.ok(run('serviceConnectionRows().filter(r=>r.codes.includes("system")).length===2'));
run('updateSelectedField("port-0-system","water");updateSelectedField("port-0-size","20 mm");state.selected={type:"service",id:routeId};updateSelectedField("size","25 mm");');
assert.ok(run('serviceConnectionRow(state.model.services[0],"end").codes.includes("size")'));
run('updateSelectedField("size","20 mm");state.model.levels.push({id:"upper",name:"Upper",elevation:2700});state.model.serviceItems[0].levelId="upper";');
assert.ok(run('serviceConnectionRow(state.model.services[0],"end").codes.includes("level")'));
run('state.model.serviceItems[0].levelId=state.model.activeLevelId;');

// Point deletion retains unresolved links; undo restores the same IDs and geometry.
run('state.selected={type:"serviceItem",id:hostId};serviceAction("service-delete-port",0);');
assert.ok(run('serviceConnectionRow(state.model.services[0],"end").codes.includes("missing-point")'));
run('undo();state.selected={type:"serviceItem",id:hostId};serviceAction("delete");');
assert.ok(run('serviceConnectionRow(state.model.services[0],"end").codes.includes("missing-item")'));
run('undo();state.selected={type:"service",id:routeId};updateSelectedField("connection-end","");');
assert.equal(run('state.model.services[0].connections.end'),null);
run('undo();');

// All field validation is atomic, including malformed imports; old projects gain empty records.
run('let migrated=normalizeModel(clone(state.model));');
assert.equal(run('JSON.stringify(migrated.services)'),run('JSON.stringify(state.model.services)'));
assert.equal(run('JSON.stringify(migrated.serviceItems)'),run('JSON.stringify(state.model.serviceItems)'));
run('let oldModel=clone(state.model);oldModel.services.forEach(s=>delete s.connections);oldModel.serviceItems.forEach(s=>delete s.ports);let oldMigrated=normalizeModel(oldModel);');
assert.equal(run('oldMigrated.services[0].connections.end'),null);
assert.equal(run('oldMigrated.serviceItems[0].ports.length'),0);
assert.equal(run('oldModel.serviceItems[0].ports'),undefined);
assert.throws(()=>run('let badRef=clone(state.model);badRef.services[0].connections.end={itemId:5,portId};normalizeModel(badRef);'));
assert.throws(()=>run('let badOffset=clone(state.model);badOffset.serviceItems[0].ports[0].offset.z=null;normalizeModel(badOffset);'));
assert.throws(()=>run('let badCap=clone(state.model);badCap.serviceItems[0].ports[0].maxConnections="1.5";normalizeModel(badCap);'));
assert.throws(()=>run('let badDup=clone(state.model);badDup.serviceItems[0].ports.push(clone(badDup.serviceItems[0].ports[0]));normalizeModel(badDup);'));
assert.throws(()=>run('let tooMany=clone(state.model);tooMany.serviceItems[0].ports=Array.from({length:33},(_,i)=>({...tooMany.serviceItems[0].ports[0],id:"p"+i}));normalizeModel(tooMany);'));
run('state.selected={type:"serviceItem",id:hostId};let beforeBlank=JSON.stringify(state.model);updateSelectedField("port-0-offsetX","");');
assert.equal(run('JSON.stringify(state.model)'),run('beforeBlank'));

// Endpoint selection uses an ID pair; unrelated legacy route references never make connections.
run('third=state.model.services[2];state.selected={type:"service",id:third.id};third.system="water";updateSelectedField("connection-end",connectionToken(ref));');
assert.equal(run('third.connections.end.portId'),run('portId'));
run('serviceAction("service-append");');assert.equal(run('third.connections.end'),null,'An extension has a new unassigned end');
run('undo();state.selected={type:"service",id:third.id};serviceAction("service-insert-point",0);');
assert.equal(run('state.model.services[2].connections.end.portId'),run('portId'),'Inserting midpoint keeps endpoints');
run('serviceAction("service-remove-point",2);');assert.equal(run('state.model.services[2].connections.end'),null);

// Port symbols, hidden layers and 3D level filters do not alter checks, takeoffs or topology.
run('let arcs=0;Object.assign(ctx,{save(){},restore(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){arcs++;},fill(){},fillText(){}});let savedModel=JSON.stringify(state.model),q=JSON.stringify(quantityData());drawServiceConnections();');
assert.equal(run('arcs'),7,'Six route endpoints plus one point');
run('arcs=0;state.visibility.serviceConnections=false;drawServiceConnections();');assert.equal(run('arcs'),0);
assert.equal(run('hitServicePort({x:2100,y:2200})'),null);
run('state.visibility.serviceConnections=true;');assert.equal(run('hitServicePort({x:2100,y:2200}).portId'),run('portId'));
run('arcs=0;state.hidden3dLevels.add(state.model.activeLevelId);drawServiceConnections(true);');assert.equal(run('arcs'),0);
assert.equal(run('JSON.stringify(state.model)'),run('savedModel'));
assert.equal(run('JSON.stringify(quantityData())'),run('q'));
assert.ok(run('serviceBounds().some(p=>p.x===2100&&p.y===2200&&p.z===1400)'));
run('renderServiceConnectionSchedule();let csv="";download=(name,data)=>csv=data;exportServiceConnectionCsv();');
assert.ok(element('#serviceConnectionSchedule').innerHTML.includes('Water inlet'));
assert.ok(run('csv.includes("Endpoint")&&csv.includes("Point")&&csv.includes("3D gap mm")&&csv.includes(portId)'));

// Drawing snaps only to unambiguous visible points; the port system determines a new route's system.
run('state.model=createEmptyModel();let snapHost=makeServiceItem("fitting",{x:2000,y:2000},state.model.activeLevelId,900);snapHost.system="drainage";let snapPort=makeServicePort(snapHost);snapHost.ports.push(snapPort);state.model.serviceItems.push(snapHost);let drawn=makeService({x:0,y:0},{x:2000,y:2000},state.model.activeLevelId);commitServiceObject(drawn);');
assert.equal(run('drawn.system'),'drainage');
assert.equal(run('drawn.connections.end.portId'),run('snapPort.id'));
assert.equal(run('drawn.points[1].z'),900);
run('snapHost.ports.push({...clone(snapPort),id:"another",name:"Ambiguous"});');
assert.equal(run('servicePortSnap({x:2000,y:2000})'),null,'Overlaid ports need an explicit choice');
run('snapHost.ports.pop();snapPort.maxConnections="2";let loop=makeService({x:2000,y:2000},{x:2000,y:2000},state.model.activeLevelId);loop.points=[{x:2000,y:2000,z:0},{x:3000,y:3000,z:0},{x:2000,y:2000,z:0}];let loopCount=state.model.services.length;commitServiceObject(loop);');
assert.equal(run('state.model.services.length'),run('loopCount'),'Both new ends count against a shared port limit');
run('let extraPort=makeServicePort(snapHost);extraPort.system="water";extraPort.offset.x=100;extraPort.id="water-inlet";snapHost.ports.push(extraPort);let water=makeService({x:4000,y:0},{x:4000,y:1000},state.model.activeLevelId);state.model.services.push(water);connectServiceEndpoint(water,"end",{itemId:snapHost.id,portId:extraPort.id});');
assert.equal(run('serviceConnectionRow(water,"end").status'),'Linked','A point can serve a different system from its host item');
run('let beforeOverlays=JSON.stringify([state.model,quantityData(),state.history.length]);let wallsVisible=state.visibility.walls;setServiceOverlays(false);');
assert.equal(run('state.visibility.serviceConnections'),false);
assert.equal(run('state.visibility.serviceFittings'),false);
assert.equal(run('state.visibility.walls'),run('wallsVisible'));
run('setServiceOverlays(true);');assert.equal(run('state.visibility["service-drainage"]'),true);
assert.equal(run('JSON.stringify([state.model,quantityData(),state.history.length])'),run('beforeOverlays'));
console.log('Connection tests passed: snap/link, 3D gaps, capacities/systems, following movements, atomic edits, deletion/references, migration, CSV/schedules, layers/levels, undo/redo and ambiguity.');
