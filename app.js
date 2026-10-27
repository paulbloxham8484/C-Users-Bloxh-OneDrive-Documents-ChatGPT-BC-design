const STORAGE_KEY = "bc-design-model-v0.2";
const GRID_MINOR = 500;
const GRID_MAJOR = 1000;
const MIN_WALL_LENGTH = 100;
const FOUNDATION_JOIN_TOLERANCE = 150;
const READABLE_PLAN_LAYERS = new Set(['floors','walls','openings','rooms','decks','stairs','stairLandings','kitchen','dimensions','planSizes','notes']);

const canvas = document.querySelector("#designCanvas");
let ctx = canvas.getContext("2d");
const canvasShell = document.querySelector(".canvas-shell");
const els = {
  projectName: document.querySelector("#projectName"),
  saveDot: document.querySelector("#saveDot"),
  saveStatus: document.querySelector("#saveStatus"),
  examplePrompt: document.querySelector("#examplePrompt"),
  fileInput: document.querySelector("#fileInput"),
  levelSelect: document.querySelector("#levelSelect"),
  levelBadge: document.querySelector("#levelBadge"),
  modelStatus: document.querySelector("#modelStatus"),
  viewStatus: document.querySelector("#viewStatus"),
  stageTip: document.querySelector("#stageTip"),
  canvasEmpty: document.querySelector("#canvasEmpty"),
  drawingHud: document.querySelector("#drawingHud"),
  hudText: document.querySelector("#hudText"),
  finishDeckButton: document.querySelector("#finishDeckButton"),
  cancelDrawingButton: document.querySelector("#cancelDrawingButton"),
  exactLength: document.querySelector("#exactLength"),
  toolHelp: document.querySelector("#toolHelp"),
  selectionDetails: document.querySelector("#selectionDetails"),
  inspectorKicker: document.querySelector("#inspectorKicker"),
  inspectorTitle: document.querySelector("#inspectorTitle"),
  quantityCards: document.querySelector("#quantityCards"),
  quantityTable: document.querySelector("#quantityTable"),
  siteTakeoffHighlights: document.querySelector("#siteTakeoffHighlights"),
  customTakeoffList: document.querySelector("#customTakeoffList"),
  requestAuditList: document.querySelector("#requestAuditList"),
  disciplinePlanList: document.querySelector("#disciplinePlanList"),
  complianceList: document.querySelector("#complianceList"),
  jurisdictionSelect: document.querySelector("#jurisdictionSelect"),
  soilClassSelect: document.querySelector("#soilClassSelect"),
  newDialog: document.querySelector("#newDialog"),
};

const state = {
  model: createEmptyModel(),
  mode: "plan",
  planDisplayMode: "readable",
  planGridVisible: false,
  tool: "select",
  selected: null,
  history: [],
  future: [],
  drawing: null,
  deckDraft: [],
  floorDraft: [],
  roomDraft: [],
  serviceDraft: [],
  serviceError: "",
  serviceOverlayOpacity: 1,
  selectedClearancePair: null,
  selectedRouteBodyPair: null,
  floorFramingSelectedId: null,
  floorSupportSelectedId: null,
  floorFitSelectedId: null,
  floorAccessSelectedId: null,
  pointerAction: null,
  touchPointers: new Map(),
  touchGesture: null,
  view: { scale: 0.1, offsetX: 50, offsetY: 50, isoScale: 0.08, orbitX: 0, orbitY: 0, orbitYaw: -Math.PI / 4, orbitPitch: 0.53, walkthroughScope: 'site', initialized: false },
  width: 1,
  height: 1,
  dpr: 1,
  saveTimer: null,
  showExamplePrompt: true,
  statusMessage: "Ready",
  hidden3dLevels: new Set(),
  visibility: { endCutReferences:true, connectorPlates:true, connectorFasteners:true, foundationSetout:false, siteConcepts:true, deckEdges:true, deckPostMembers:true, deckPosts:true, deckPostFootings:true, deckSupports:true, deckBoards:true, stairRailReturns:true, stairRailConnections:true, stairRailMembers:true, stairHeadroom:true, floorOpenings:true, floorFraming:true, roofFraming:true, joinedRoofs:true, roofValleys:true, roofJunctions:true, serviceRouteVolumes:true, servicePhysicalChecks:true, serviceRouteBodyChecks:true, serviceClearanceChecks:true, serviceEnvelopes:true, serviceClearances:true, serviceConnections:true, serviceFittings:true, serviceFixtures:true, "service-water":true, "service-drainage":true, "service-electrical":true, "service-other":true, kitchen: true, planSizes: true, notes: true, dimensions: true, barriers: true, deckFraming: true, stairs: true, stairLandings: true, stairHandrails: true, stairBarriers: true, stairCoordination: true, rooms: true, roofs: true, foundations: true, pads: true, piers: true, reinforcement: true, floors: true, walls: true, openings: true, decks: true },
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptyModel() {
  const levelId = uid("level");
  return {
    schema: 30,
    app: "BC Design",
    name: "Untitled building",
    units: "mm",
    jurisdiction: "",
    soilClass: "",
    levels: [{ id: levelId, name: "Ground Floor", elevation: 0 }],
    activeLevelId: levelId,
    walls: [],
    openings: [],
    decks: [],
    floors: [],
    floorOpenings: [],
    floorFraming: [],
    floorSupportReviews: [],
    floorFitDetails: [],
    floorAccessReviews: [],
    foundations: [],
    pads: [],
    piers: [],
    roofs: [],
    roofJunctions: [],
    roofFraming: [],
    rooms: [],
    stairs: [],
    dimensions: [],
    notes: [],
    services: [],
    serviceItems: [],
    kitchenUnits: [],
    specifications: [],
    takeoffGroups: [],
    disciplinePlans: defaultDisciplinePlans(),
    sitePlan: { boundary: [], elements: [] },
    stockPlans: [],
    endCutDetails: [],
    connectorDetails: [],
    metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  };
}

function createExampleSitePlan(model) {
  const point=(x,y)=>({x,y}),rect=(x0,y0,x1,y1)=>[point(x0,y0),point(x1,y0),point(x1,y1),point(x0,y1)];
  const boundary=rect(0,0,250000,200000);
  const houseSource=model.floors.find(floor=>floor.id==='floor-house')?.points||rect(0,0,18000,17000);
  const houseOffset={x:70000,y:25000};
  const house=houseSource.map(value=>point(value.x+houseOffset.x,value.y+houseOffset.y));
  return {
    units:'mm',
    boundary:{id:'site-boundary',type:'boundary',label:'5 ha working boundary · 250 m × 200 m',points:boundary},
    elements:[
      {id:'site-landscape-zone',type:'landscape',label:'Landscape zone · lawn / gardens / rear open space',points:rect(12000,12000,238000,188000)},
      {id:'site-boundary-fence',type:'boundary-fence',label:'Whole-property boundary fence',points:boundary},
      {id:'site-house',type:'house',label:'Queenslander house · 3 bed / 2 bath',points:house},
      {id:'site-veranda',type:'veranda',label:'Wraparound veranda / deck',points:rect(66000,21000,92000,46000)},
      {id:'site-pool',type:'pool',label:'Rear pool · 10,000 × 6,000 mm',points:rect(72000,52000,82000,58000)},
      {id:'site-pool-wall',type:'pool-wall',label:'Concrete pool walls · preliminary shell envelope',points:rect(71800,51800,82200,58200)},
      {id:'site-pool-coping',type:'pool-coping',label:'Stone pool coping / capping · 32 m concept',points:rect(71600,51600,82400,58400)},
      {id:'site-pool-drainage',type:'pool-drainage',label:'Pool-edge channel / slot drain · 32 m allowance',points:rect(72100,52100,81900,57900)},
      {id:'site-pool-deck',type:'pool-deck',label:'Pool deck / paved surround',points:rect(67000,47500,87000,63000)},
      {id:'site-pool-screw-piers',type:'screw-piers',label:'Screw-pier foundation allowance · 44 nominal supports',points:rect(67000,47500,87000,63000)},
      {id:'site-pool-fence',type:'pool-fence',label:'Pool fence / safety barrier concept',points:rect(65500,46500,88500,64500)},
      {id:'site-pool-pump',type:'pool-pump',label:'Pool pump / filtration enclosure · 2,400 × 1,800 mm allowance',points:rect(89000,50500,91400,52300)},
      {id:'site-shed',type:'shed',label:'Rear shed / garage · 10,000 × 8,000 mm',points:rect(180000,173000,190000,181000)},
      {id:'site-shed-fence',type:'fence',label:'Shed / garage boundary fence',points:rect(179000,172000,191000,182000)},
      {id:'site-driveway',type:'driveway',label:'Concrete driveway · front gate → side of house → rear shed',points:[point(62000,0),point(68000,0),point(68000,173000),point(180000,173000),point(180000,181000),point(62000,181000)]},
      {id:'site-gate',type:'gate',label:'Electric vehicle gate on front boundary',a:point(62000,0),b:point(68000,0)},
      {id:'site-planting-entry',type:'planting',label:'Entry planting bed',points:[point(30000,12000),point(56000,12000),point(56000,22000),point(36000,22000)]},
      {id:'site-planting-pool',type:'planting',label:'Pool garden bed / low-litter screening',points:[point(88000,47500),point(93000,47500),point(93000,63000),point(88000,63000)]},
      {id:'site-planting-rear',type:'planting',label:'Rear boundary screening / orchard planting',points:[point(118000,140000),point(205000,140000),point(205000,164000),point(118000,164000)]},
      {id:'site-orchard',type:'orchard',label:'Productive orchard / garden zone close to rear shed',points:rect(108000,132000,168000,158000)},
      {id:'site-tree-entry',type:'tree',label:'Feature tree · entry',points:rect(42000,26000,50000,34000)},
      {id:'site-tree-house-west',type:'tree',label:'Shade tree · west of house',points:rect(54000,32000,62000,40000)},
      {id:'site-tree-house-east',type:'tree',label:'Shade tree · east of house',points:rect(98000,28000,106000,36000)},
      {id:'site-tree-pool',type:'tree',label:'Pool-side shade tree',points:rect(90000,61000,98000,69000)},
      {id:'site-tree-screen-1',type:'tree',label:'Screening tree',points:rect(132000,90000,142000,100000)},
      {id:'site-tree-screen-2',type:'tree',label:'Screening tree',points:rect(148000,90000,158000,100000)},
      {id:'site-tree-rear-1',type:'tree',label:'Rear property tree',points:rect(125000,150000,135000,160000)},
      {id:'site-tree-rear-2',type:'tree',label:'Rear property tree',points:rect(150000,155000,160000,165000)}
    ]
  };
}

function ensureExampleSafetyRecords(model){
  const isExample=Boolean(model.metadata?.designInspiration)||/Queenslander/i.test(model.name||'');
  if(!isExample)return;
  model.stairs.filter(candidate=>['stair-front-veranda','stair-rear-veranda'].includes(candidate.id)).forEach(stair=>{stair.width=3000;});
  const stairRail=(stair,kind,side,label)=>({...makeStairRail(kind),id:`${stair.id}-${kind}-${side}`,name:`${stair.name} ${label}`,target:'flight-1',side,height:kind==='barrier'?1000:900,offset:kind==='barrier'?120:80,startInset:150,endInset:150,bottomGap:kind==='barrier'?100:null,material:'Illustrative external-grade rail / barrier envelope',sectionReference:'Enter selected section or product',dimensionSource:'Example input only — verify on site',drawingRef:'Example stair rail coordination',designCriteria:'Confirm adopted NCC Housing Provisions and project criteria',loads:'Structural loading and support design required',connections:'Posts, brackets and anchorage require design',openings:kind==='barrier'?'Infill, openings and climbability require review':'',notes:'Preliminary example record; not a compliance or fabrication detail'});
  for(const stair of model.stairs.filter(candidate=>['stair-front-veranda','stair-rear-veranda'].includes(candidate.id))){if(!(stair.railRuns||[]).length)stair.railRuns=['handrail-left','handrail-right','barrier-left','barrier-right'].map(key=>{const [kind,side]=key.split('-');return stairRail(stair,kind,side,kind==='barrier'?`barrier — ${side}`:`handrail — ${side}`);});}
  if(Number(model.metadata?.exampleBalustradeVersion||0)<2 || model.decks.some(deck=>(deck.barriers||[]).length===0)){
    const makeBarrier=(deck,a,b,index)=>({id:`${deck.id}-balustrade-${index}`,name:`${deck.name} balustrade / handrail run ${index+1}`,ax:a.x,ay:a.y,bx:b.x,by:b.y,startElevation:deck.elevation,endElevation:deck.elevation,height:1000,material:'Illustrative external-grade balustrade envelope',openings:'Infill and opening schedule required; stair access openings are intentionally left clear where shown',climbability:'Climbability review required',loads:'Structural loading design required',connections:'Posts, fixings and end connections require design',handrail:'Continuous handrail intent along this run; returns and joints require design',drawingRef:'Example veranda balustrade coordination'});
    const edge=(deck,start,end,index)=>{const a=deck.points[start],b=deck.points[end];return a&&b?makeBarrier(deck,a,b,index):null;};
    const split=(deck,start,end,openStart,openEnd,index)=>{const a=deck.points[start],b=deck.points[end];if(!a||!b)return[];const length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,p1={x:a.x+ux*openStart,y:a.y+uy*openStart},p2={x:a.x+ux*openEnd,y:a.y+uy*openEnd},runs=[];if(openStart>1)runs.push(makeBarrier(deck,a,p1,index+runs.length));if(length-openEnd>1)runs.push(makeBarrier(deck,p2,b,index+runs.length));return runs;};
    model.decks.forEach((deck,index)=>{const runs=[];if(index===0){runs.push(...split(deck,0,1,9700,12700,0),edge(deck,3,0,2),edge(deck,1,2,3));}else if(index===1){runs.push(edge(deck,1,2,0),edge(deck,2,3,1));}else if(index===2){runs.push(edge(deck,2,3,0));}else if(index===3){runs.push(edge(deck,1,2,0),edge(deck,2,3,1));}else if(index===4){runs.push(...split(deck,2,3,5500,8500,0),edge(deck,3,0,2));}else if(index===5){runs.push(edge(deck,3,0,0));}deck.barriers=runs.filter(Boolean);});
    model.metadata={...(model.metadata||{}),exampleBalustradeVersion:2};
  }
  model.metadata.exampleCompletion={rails:true,stairs3m:true};
}

function ensureExampleFoundationRecords(model){
  const isExample=Boolean(model.metadata?.designInspiration)||/Queenslander/i.test(model.name||'');
  if(!isExample||!Array.isArray(model.foundations)||model.foundations.length||Number(model.metadata?.exampleFoundationVersion||0)>=1)return;
  const floor=model.floors?.find(candidate=>candidate.id==='floor-house')||model.floors?.[0],points=floor?.points||[];
  if(points.length<3)return;
  const levelId=model.activeLevelId||model.levels?.[0]?.id,elevation=(model.levels?.find(level=>level.id===levelId)?.elevation||0)-600;
  const make=(index,a,b)=>({id:`foundation-example-${index+1}`,levelId,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},width:450,depth:300,elevation,role:'external',status:'preliminary',specification:'Illustrative continuous perimeter footing envelope restored from the example brief; sizing, reinforcement, soil response and construction details require geotechnical and structural design'});
  model.foundations=[];for(let index=0;index<points.length;index++)model.foundations.push(make(index,points[index],points[(index+1)%points.length]));
  model.metadata={...(model.metadata||{}),exampleFoundationVersion:1};
}

function ensureExampleHandoverRecords(model){
  const isExample=Boolean(model.metadata?.designInspiration)||/Queenslander/i.test(model.name||'');
  if(!isExample||Number(model.metadata?.exampleHandoverVersion||0)>=1)return;
  const makeBoards=typeof makeDeckBoards==='function'?makeDeckBoards:()=>({enabled:false,width:null,thickness:null,gap:null,angle:null,firstOffset:null,topOffset:null,stockLength:null,productCode:'',source:'',drawingRef:'',supports:'',fixings:'',durability:'',notes:''});
  model.decks.forEach((deck,index)=>{const horizontal=Math.abs(deck.points[1].x-deck.points[0].x)>=Math.abs(deck.points[1].y-deck.points[0].y);deck.boards={...makeBoards(),enabled:true,width:90,thickness:19,gap:5,angle:horizontal?0:90,firstOffset:0,topOffset:0,stockLength:null,productCode:'',source:'Illustrative external decking envelope — select an approved product and record supplier evidence',drawingRef:'Handover coordination set · veranda decking layout',supports:'450 mm nominal joist centres; 1200 mm nominal bearer centres; verify spans, bearing, ventilation and movement joints',fixings:'External-grade stainless or approved proprietary decking screws; pilot holes, edge distances, end joints and corrosion compatibility to selected product/manufacturer',durability:'External exposure, moisture, termite and coating/treatment system to be confirmed for Queensland site conditions',notes:`Visible board layout for ${deck.name}; final board lengths, joints, waste and fixing schedule require project-specific selection and inspection`};deck.specificationId='spec-veranda-deck-finish';});
  model.specifications=Array.isArray(model.specifications)?model.specifications:[];
  const add=(record)=>{if(!model.specifications.some(spec=>spec.id===record.id))model.specifications.push(record);};
  add({id:'spec-veranda-deck-finish',name:'Veranda decking boards — handover finish concept',category:'External decking finish',manufacturer:'To be selected',productCode:'',grade:'External-grade product to be selected',finish:'90 × 19 mm board envelope; consistent line, 5 mm nominal gap concept, flush/trimmed edges and coating/treatment to approved product',unit:'m²',drawingRef:'Handover coordination set · veranda decking layout',notes:'Boards are visibly laid out on all six veranda/deck panels. Confirm board direction, joints, noggings, ventilation, moisture movement, edge trims and final product before construction.',coverage:'1',coverageUnit:'m²',orderUnit:'m²',allowancePercent:'10',packSize:'',procurementEvidence:'Record selected Australian supplier, product data, treatment/coating, installation guide and checked revision before order.'});
  add({id:'spec-veranda-balustrade-handrail',name:'Veranda balustrades and handrails — handover finish concept',category:'Balustrade / handrail',manufacturer:'To be selected',productCode:'',grade:'External-grade timber, aluminium or proprietary system to be selected',finish:'Continuous handrail intent, finished posts, rails, infill and weather-protected connections; final colour/coating to be selected',unit:'m',drawingRef:'Handover coordination set · veranda barriers and handrails',notes:'All veranda deck edges have a visible barrier/handrail coordination run. Check falls, openings, climbability, handrail continuity, stairs, landings, loading and anchorage against the adopted NCC and qualified design.',coverage:'1',coverageUnit:'m',orderUnit:'m',allowancePercent:'10',packSize:'',procurementEvidence:'Record selected system, section sizes, infill/opening schedule, loading evidence, corrosion category and installation instructions.'});
  add({id:'spec-external-envelope-finish',name:'External envelope and roof — handover finish concept',category:'External finishes',manufacturer:'To be selected',productCode:'',grade:'Project-specific wall, window, roof and coating systems required',finish:'Queenslander weatherboard character, sealed/painted external surfaces, roof covering, flashings, trims, gutters and downpipes coordinated as a complete envelope',unit:'allowance',drawingRef:'Architectural elevations / roof coordination',notes:'Finish schedule is a coordination concept only. Confirm junctions, flashings, penetrations, moisture management, roof drainage, coating system and final colour schedule.',coverage:'1',coverageUnit:'allowance',orderUnit:'allowance',allowancePercent:'0',packSize:'',procurementEvidence:'Attach manufacturer data, colour schedule, installation details and inspection records.'});
  add({id:'spec-handover-fixings',name:'Handover fixings and protection schedule',category:'Fixings / completion',manufacturer:'To be selected',productCode:'',grade:'Corrosion-compatible fixings for external Queensland exposure',finish:'Finished heads, plugs/caps, sealed penetrations, protected cut ends and coordinated touch-up/clean-down',unit:'allowance',drawingRef:'Handover fixing and completion schedule',notes:'Coordinate decking screws, balustrade posts, handrail returns, roof/deck connections, fence/gate hardware, pool barrier fixings and service penetrations. No loose or temporary fixing is represented as complete.',coverage:'1',coverageUnit:'allowance',orderUnit:'allowance',allowancePercent:'0',packSize:'',procurementEvidence:'Record exact fixing type, material, coating, spacing, edge distances, torque/installation method and inspection sign-off.'});
  add({id:'spec-interior-finish-handover',name:'Interior finishes and wet-area completion schedule',category:'Interior finishes / wet areas',manufacturer:'To be selected',productCode:'',grade:'Project-specific flooring, paint, joinery, sanitaryware and waterproofing systems required',finish:'Finished floors, walls, ceilings, trims, doors, ironmongery, kitchen, bathroom, ensuite, laundry and cleanable wet-area surfaces',unit:'allowance',drawingRef:'Architectural finishes / wet-area detail set',notes:'Coordinate waterproofing, falls, thresholds, sealants, movement joints, fixtures, access panels and final clean. Bathroom and ensuite finish selections remain to be approved.',coverage:'1',coverageUnit:'allowance',orderUnit:'allowance',allowancePercent:'0',packSize:'',procurementEvidence:'Attach product data, colour schedule, wet-area details, installation records and defects close-out.'});
  add({id:'spec-services-handover',name:'Services testing and handover records',category:'Services / commissioning',manufacturer:'To be selected',productCode:'',grade:'Licensed trade installation and commissioning records required',finish:'Installed and labelled outlets, controls, covers, grilles, access panels, pool plant, gate controls and external lighting',unit:'allowance',drawingRef:'Electrical / plumbing / mechanical / pool coordination plans',notes:'Coordinate final testing, balancing, labels, isolators, manuals, warranties and owner training for electrical, plumbing, stormwater, mechanical, pool and electric gate systems.',coverage:'1',coverageUnit:'allowance',orderUnit:'allowance',allowancePercent:'0',packSize:'',procurementEvidence:'Attach licensed trade certificates, test results, as-built information, warranties and operating manuals.'});
  if(!model.notes.some(note=>note.id==='handover-finish-note')){const levelId=model.activeLevelId;model.notes.push({id:'handover-finish-note',levelId,a:{x:21000,y:23000},b:{x:21000,y:23000},leader:false,text:'HANDOVER-STYLE COMPLETION SET\nVisible veranda decking boards, balustrades and handrails\nFinish and fixing records added for coordination\nFinal product selection, installation inspection, approvals and certification remain project responsibilities'});}
  model.metadata={...(model.metadata||{}),exampleHandoverVersion:1,handoverPackage:{stage:'Handover coordination concept',deckBoards:'Shown on all six veranda/deck panels',balustrades:'Shown on all veranda deck edges',handrails:'Shown on veranda and stair rail runs',finishes:'External deck, balustrade, envelope and roof finish records added',fixings:'Deck, balustrade, gate, fence, pool barrier and completion fixing schedule added',status:'Design coordination only — final site inspection, approvals and professional certification outstanding'}};
  model.metadata.exampleCompletion={...(model.metadata.exampleCompletion||{}),rails:true,stairs3m:true,deckBoards:true,finishSchedule:true,fixingSchedule:true};
}

function createExampleModel() {
  const model=createEmptyModel(),levelId=model.activeLevelId,elevation=1200,ceiling=3300;
  model.name='Modern Queenslander · 3 generous bedrooms + study · open living';model.jurisdiction='QLD';model.levels[0]={id:levelId,name:'Raised ground floor',elevation};
  model.metadata={...model.metadata,exampleSiteLayoutVersion:3,exampleTakeoffVersion:2,subfloorFraming:{status:'Illustrative layout inputs only — not a structural design',houseFloor:{nominalJoistCentres:450,nominalBearerCentres:1200},veranda:{nominalJoistCentres:450,nominalBearerCentres:1200},references:['NCC 2022 Volume Two H1D6(4) timber framing','NCC 2022 Volume Two H1D11 framed deck attachment','AS 1684.2:2021 residential timber-framed construction — non-cyclonic areas'],reviewNotes:['Confirm wind classification, span tables, timber species/grade, moisture/termite exposure, bracing, tie-down, fixings, posts, bearers, joists and footing capacities for the site.','The example does not claim NCC compliance or replace project-specific engineering/certification.']},carpentryReferences:[{title:'NCC 2022 Volume Two — Part H1 Structure',url:'https://ncc.abcb.gov.au/editions/ncc-2022/adopted/volume-two/h-class-1-and-10-buildings/part-h1-structure',scope:'H1D6 framing and H1D11 framed deck attachment conditions.'},{title:'NCC 2022 Housing Provisions',url:'https://ncc.abcb.gov.au/system/files/ncc/ncc2022-abcb-housing-provisions.pdf',scope:'Housing provisions including suspended-floor/subfloor ventilation and deck ancillary provisions.'},{title:'AS 1684.2:2021 — Standards Australia',url:'https://store.standards.org.au/product/as-1684-2-2021',scope:'Current residential timber-framed construction standard for non-cyclonic areas; licensed copy required for detailed use.'},{title:'NCC 2022 standards spotlight — residential timber framing',url:'https://www.standards.org.au/blog/ncc-2022-standards-spotlight-residential-timber-framing',scope:'Explains the NCC reference to AS 1684.2:2021.'},{title:'QBCC Timber Deck and Balcony Construction',url:'https://www.qbcc.qld.gov.au/resources/guide/timber-deck-balcony-construction',scope:'Queensland deck and balcony construction guidance.'},{title:'WoodSolutions Domestic Timber Deck Design',url:'https://www.woodsolutions.com.au/sites/default/files/2025-10/WS%20TDG%2021%20-%20Domestic%20Timber%20Deck%20Design.pdf',scope:'Deck joist spacing, wall gaps, bracing and common construction issues; use with the adopted NCC and project design.'}]};
  model.metadata.exampleSiteLayoutVersion=5;
  const point=(x,y)=>({x,y}),rect=(x0,y0,x1,y1)=>[point(x0,y0),point(x1,y0),point(x1,y1),point(x0,y1)];
  const wall=(id,x0,y0,x1,y1)=>({id,levelId,a:point(x0,y0),b:point(x1,y1),thickness:140,height:ceiling,status:'new',specification:'Illustrative layout; assembly and structural design to be specified'});
  model.walls=[wall('wall-front',0,0,18000,0),wall('wall-main-right',18000,0,18000,11500),wall('wall-main-rear',18000,11500,10000,11500),wall('wall-wing-right',10000,11500,10000,17000),wall('wall-back',10000,17000,0,17000),wall('wall-left',0,17000,0,0),
   wall('wall-living-hall',0,5800,7200,5800),wall('wall-kitchen-hall',9000,5800,18000,5800),wall('wall-bed1-hall',0,7400,7200,7400),wall('wall-bed23-hall',9000,7400,18000,7400),wall('wall-ensuite',5000,7400,5000,11500),wall('wall-ensuite-hall',7200,7400,7200,11500),wall('wall-bed2-hall',9000,7400,9000,11500),wall('wall-bed23-divider',13500,7400,13500,11500),wall('wall-suite-study',0,11500,7200,11500),wall('wall-bed2-back',9000,11500,10000,11500),wall('wall-study-hall',5000,11500,5000,17000),wall('wall-wet-hall',6600,13000,10000,13000),wall('wall-laundry-bath',6600,15200,10000,15200),wall('wall-wet-corridor',6600,13000,6600,17000),wall('wall-study-robe',0,13800,5000,13800),wall('wall-robe-store',3200,11500,3200,13800),wall('wall-pantry-front',16000,3800,18000,3800),wall('wall-pantry-side',16000,3800,16000,5800)];
  const opening=(id,wallId,type,offset,width,height=type==='door'?2400:1500,sill=type==='door'?0:900)=>({id,levelId,wallId,type,offset,width,height,sill,status:'new'});
  model.openings=[opening('door-front','wall-front','door',7500,1400),{...opening('door-living-veranda','wall-front','door',1000,3600),operation:'sliding'},opening('window-dining-front','wall-front','window',5000,1800),opening('window-kitchen-front','wall-front','window',13000,2400),{...opening('door-kitchen-veranda','wall-main-right','door',800,2800),operation:'sliding'},opening('window-bed3-side','wall-main-right','window',8600,1800),opening('window-bed3-rear','wall-main-rear','window',1000,2400),opening('window-bed2-rear','wall-main-rear','window',5000,2200),opening('door-side-veranda','wall-wing-right','door',250,1000),opening('window-bath-side','wall-wing-right','window',1850,1500,1000,1500),opening('window-laundry','wall-back','window',700,1500),opening('door-rear-corridor','wall-back','door',3600,1000),{...opening('door-study-rear','wall-back','door',6000,2400),operation:'sliding'},opening('window-study-rear','wall-back','window',8800,900),opening('window-study-west','wall-left','window',500,2000),opening('window-bed1-west','wall-left','window',6500,2400),opening('door-hall-west','wall-left','door',10000,1000),opening('window-living-west','wall-left','window',13000,2800),
   {...opening('door-living-hall','wall-living-hall','door',4500,1800),operation:'passage'},{...opening('door-kitchen-hall','wall-kitchen-hall','door',600,1800),operation:'passage'},opening('door-bed1','wall-bed1-hall','door',2600,1000),opening('door-bed2','wall-bed23-hall','door',1200,1000),opening('door-bed3','wall-bed23-hall','door',5700,1000),opening('door-ensuite','wall-ensuite','door',1100,920),opening('door-study','wall-study-hall','door',3000,1100),opening('door-laundry','wall-wet-corridor','door',2600,920),opening('door-bath','wall-wet-corridor','door',500,920),opening('door-robe','wall-suite-study','door',1400,920),opening('door-store','wall-study-hall','door',500,820),opening('door-pantry','wall-pantry-front','door',200,920)];
  const zone=(name,x0,y0,x1,y1,colour='green',use=name)=>({...makeRoom(rect(x0,y0,x1,y1),levelId,name),colour,use,ceilingHeight:ceiling,floorFinish:'Illustrative zone; finishes to be selected'});
  model.rooms=[zone('Living',70,70,7200,5730),zone('Dining',7200,70,12000,5730,'ochre'),zone('Kitchen',12000,70,17930,5730,'ochre'),zone('Gallery hall',70,5870,17930,7330),zone('Bedroom 1',70,7470,4930,11430,'blue','Bedroom'),zone('Ensuite',5070,7470,7130,11430,'mauve','Bathroom'),zone('Bedroom 2',9070,7470,13430,11430,'blue','Bedroom'),zone('Bedroom 3',13570,7470,17930,11430,'blue','Bedroom'),zone('Rear passage',7270,7400,8930,11500),zone('Study / library',70,13870,4930,16930,'blue','Study'),zone('Rear hall',5070,11570,9930,12930),zone('Utility hall',5070,13000,6530,16930),zone('Walk-in robe',70,11570,3130,13730,'blue'),zone('Linen / store',3270,11570,4930,13730,'ochre'),zone('Laundry',6670,15270,9930,16930,'ochre'),zone('Bathroom',6670,13070,9930,15130,'mauve','Bathroom'),zone('Walk-in pantry',16070,3870,17930,5730,'ochre')];
  model.rooms.find(r=>r.name==='Kitchen').points=[point(12000,70),point(17930,70),point(17930,3730),point(15930,3730),point(15930,5730),point(12000,5730)];
  const house=[point(0,0),point(18000,0),point(18000,11500),point(10000,11500),point(10000,17000),point(0,17000)];
  model.floors=[{id:'floor-house',levelId,points:house,elevation,thickness:100,status:'new',specification:'262 m² gross illustrative house footprint. Floor build-up and subfloor design unresolved.'}];
  const foundation=(id,a,b)=>({id,levelId,a,b,width:450,depth:300,elevation:elevation-600,role:'external',status:'preliminary',specification:'Illustrative continuous perimeter footing envelope; sizing, reinforcement, soil response and construction details require geotechnical and structural design'});
  model.foundations=[foundation('foundation-front',point(0,0),point(18000,0)),foundation('foundation-main-right',point(18000,0),point(18000,11500)),foundation('foundation-recess',point(18000,11500),point(10000,11500)),foundation('foundation-wing-right',point(10000,11500),point(10000,17000)),foundation('foundation-rear',point(10000,17000),point(0,17000)),foundation('foundation-left',point(0,17000),point(0,0))];
  model.sitePlan=createExampleSitePlan(model);
  model.metadata.designInspiration={checked:'2026-10-27',brief:'Spacious modern Queenslander: three larger bedrooms, separate study/library, continuous open living/dining/kitchen and covered 3 m veranda. Original example geometry, not a reproduction of a supplier plan.',references:[{title:'Garth Chapman — Jardine',url:'https://traditionalqueenslanders.com.au/traditional-home-styles/jardine/',usedFor:'Generous bedrooms, study and open living linked to outdoor entertaining.'},{title:'Garth Chapman — Georgina 199 Classic',url:'https://traditionalqueenslanders.com.au/classic-range/georgina-199-classic/',usedFor:'Builder-described enduringly popular Queenslander arrangement and kitchen-linked outdoor living; no popularity ranking inferred.'},{title:'Zauss House — Modern Queenslander concept',url:'https://www.zausshouse.com.au/project/modern-queenslander/',usedFor:'Contemporary raised-home character, protected outdoor spaces and separation of living/sleeping zones. Concept reference only; structural system not copied.'}],openLivingArea:101.0876,insideGrossArea:262,verandaGrossArea:246,designScope:'Dimensions are illustrative design inputs. No site, structural span, wind, footing, energy, access or building compliance approval is implied.'};
  const member=(id,role,a,b,width,depth,base)=>({id,role,ax:a.x,ay:a.y,bx:b.x,by:b.y,width,depth,elevation:base,material:'Illustrative framing envelope',design:'Example only; nominal joist centres 450 mm and bearer centres 1200 mm. Review NCC 2022 H1D6(4) / H1D11 and AS 1684.2:2021; sizes, spacing, spans and supports require designer verification.',standardRef:'NCC 2022 H1D6(4), H1D11; AS 1684.2:2021 — verify applicability',fixings:'Connections, bracing and tie-down not specified',drawingRef:'Example veranda subfloor framing'});
  const deck=(id,name,x0,y0,x1,y1,horizontal)=>{const joistSpacing=450,bearerSpacing=1200;const d={id,levelId,name,points:rect(x0,y0,x1,y1),elevation,thickness:0,status:'new',specification:'Continuous veranda; nominal joists at 450 mm centres and bearers at 1200 mm centres; outside envelope only, detailing and structural design required',members:[],posts:[],joistSpacing,bearerSpacing};const along=horizontal?x1-x0:y1-y0,across=horizontal?y1-y0:x1-x0,count=Math.ceil(along/joistSpacing),start=horizontal?x0:y0;
   for(let i=0;i<=count;i++){const v=start+along*i/count;d.members.push(member(`${id}-joist-${i}`,'joist',horizontal?point(v,y0):point(x0,v),horizontal?point(v,y1):point(x1,v),45,190,elevation-219));}
   const bearerPositions=[0];for(let offset=bearerSpacing;offset<across;offset+=bearerSpacing)bearerPositions.push(offset);if(bearerPositions.at(-1)!==across)bearerPositions.push(across);
   bearerPositions.forEach((offset,index)=>d.members.push(member(`${id}-bearer-${index}`,'bearer',horizontal?point(x0,y0+offset):point(x0+offset,y0),horizontal?point(x1,y0+offset):point(x0+offset,y1),90,240,elevation-459)));return d;};
  model.decks=[deck('deck-front-veranda','Front veranda',-3000,-3000,21000,0,true),deck('deck-right-veranda','Right veranda',18000,0,21000,14500,false),deck('deck-courtyard-veranda','Recess veranda',10000,11500,18000,14500,true),deck('deck-wing-veranda','Rear-wing veranda',10000,14500,13000,20000,false),deck('deck-back-veranda','Rear veranda',-3000,17000,10000,20000,true),deck('deck-left-veranda','Left veranda',-3000,0,0,17000,false)];
  const pitch=15,roofTop=elevation+ceiling,outerEave=roofTop-3000*Math.tan(pitch*Math.PI/180);
  const roof=(id,name,a,b,form)=>({...makeRoof(a,b,levelId,outerEave),id,name,form,pitch,overhang:3000,thickness:150,notes:'Illustrative continuous roof covering the full veranda. Roofing product, slope suitability, spans, drainage and tie-down require project design.'});
  model.roofs=[roof('roof-main-hip','Main hip and veranda roof',point(0,0),point(18000,11500),'hip'),roof('roof-rear-gable','Rear gable and veranda roof',point(0,9500),point(10000,17000),'gable')];
  model.roofJunctions=[{...makeRoofJunction('roof-main-hip'),id:'roof-main-wing-join',roofBId:'roof-rear-gable',name:'Hip / rear gable joined envelope',kind:'valley',joinMode:'upper',designRef:'Illustrative geometry only; flashing and drainage unresolved',notes:'Explicitly retain the upper envelope so overlapping roof panels do not remain stacked.'}];
  const support=(x,y,id)=>{const pad=makeSupport('pad',point(x,y),levelId,`pad-${id}`),pier=makeSupport('pier',point(x,y),levelId,`pier-${id}`,pad.id);pad.elevation=-700;pad.depth=400;pier.elevation=-300;pier.depth=elevation+300;model.pads.push(pad);model.piers.push(pier);};
  for(const y of [1500,5500,10000])for(const x of [1500,5250,9000,12750,16500])support(x,y,`house-${x}-${y}`);for(const y of [13500,16000])for(const x of [1500,5000,8500])support(x,y,`wing-${x}-${y}`);
  if (typeof prepareExampleFloorFraming === 'function') prepareExampleFloorFraming(model);
  const seen=new Set();model.decks.forEach((d,i)=>{const points=d.points,outer=i===0?[point(-2850,-2850),point(20850,-2850)]:i===1?[point(20850,0),point(20850,14350)]:i===2?[point(13150,14350),point(17850,14350)]:i===3?[point(12850,14650),point(12850,19850)]:i===4?[point(-2850,19850),point(9850,19850)]:[point(-2850,150),point(-2850,16850)];const count=Math.ceil(lengthBetween(...outer)/3000);for(let j=0;j<=count;j++){const p=add(outer[0],scale(sub(outer[1],outer[0]),j/count)),key=`${p.x},${p.y}`;if(seen.has(key))continue;seen.add(key);const id=`veranda-${i}-${j}`;support(p.x,p.y,id);if(typeof makeDeckPost==='function')d.posts.push({...makeDeckPost(),id:`post-${id}`,name:'Veranda roof post',shape:'rectangle',width:140,depth:140,angle:0,x:p.x,y:p.y,base:elevation,top:outerEave-150,source:'Illustrative envelope only; section and connections unverified'});}});
  const stair=(id,name,a,b,width)=>({...makeStair(a,b,levelId,0),id,name,width,rise:elevation,risers:8,material:'Illustrative stair envelope; construction details unverified'});
  model.stairs=[stair('stair-front-veranda','Wide front entry stairs',point(8200,-5100),point(8200,-3000),3000),stair('stair-rear-veranda','Rear veranda stairs',point(3000,22100),point(3000,20000),3000)];
  const stairRail=(id,kind,name,side)=>({...makeStairRail(kind),id,name,target:'flight-1',side,height:kind==='barrier'?1000:900,offset:kind==='barrier'?120:80,startInset:150,endInset:150,bottomGap:kind==='barrier'?100:null,material:'Illustrative external-grade rail / barrier envelope',sectionReference:'Enter selected section or product',dimensionSource:'Example input only — verify on site',drawingRef:'Example stair rail coordination',designCriteria:'Confirm adopted NCC Housing Provisions and project criteria',loads:'Structural loading and support design required',connections:'Posts, brackets and anchorage require design',openings:kind==='barrier'?'Infill, openings and climbability require review':'',notes:'Preliminary example record; not a compliance or fabrication detail'});
  model.stairs[0].railRuns=[stairRail('front-handrail-left','handrail','Front stair handrail — left','left'),stairRail('front-handrail-right','handrail','Front stair handrail — right','right'),stairRail('front-barrier-left','barrier','Front stair barrier — left','left'),stairRail('front-barrier-right','barrier','Front stair barrier — right','right')];
  model.stairs[1].railRuns=[stairRail('rear-handrail-left','handrail','Rear stair handrail — left','left'),stairRail('rear-handrail-right','handrail','Rear stair handrail — right','right'),stairRail('rear-barrier-left','barrier','Rear stair barrier — left','left'),stairRail('rear-barrier-right','barrier','Rear stair barrier — right','right')];
  if(typeof makeKitchenUnit==='function'){
   const unit=(id,kind,x,y,w,d,h=900,rotation=0)=>({...makeKitchenUnit(kind,point(x,y),levelId,elevation),id,name:({base:'Base cabinet',sink:'Sink cabinet',hob:'Cooktop cabinet',wall:'Wall cabinet',island:'Kitchen island',fridge:'Fridge space',pantry:'Pantry'})[kind],width:w,depth:d,height:h,rotation,source:'Example dimensions only — select actual products before construction'});
   model.kitchenUnits=[unit('kitchen-base-1','base',12900,370,1000,600),unit('kitchen-sink','sink',13900,370,1000,600),unit('kitchen-prep','base',14900,370,1000,600),unit('kitchen-cook','hob',15900,370,1000,600),unit('kitchen-base-2','base',16900,370,1000,600),unit('kitchen-island','island',14600,2400,3000,1100),unit('kitchen-fridge','fridge',17580,5200,1000,700,1800,90),unit('kitchen-pantry','pantry',17630,4250,600,600,2200,90),unit('kitchen-wall','wall',12900,245,1000,350,720)];
  }
  model.decks.forEach(deck=>deck.barriers=[]);
  
  model.dimensions=[{id:'dim-house-width',levelId,a:point(0,0),b:point(18000,0),offset:-4000,label:'House wall CL'}, {id:'dim-veranda-width',levelId,a:point(-3000,-3000),b:point(21000,-3000),offset:-1800,label:'Covered deck overall'}, {id:'dim-house-depth',levelId,a:point(0,0),b:point(0,17000),offset:4000,label:'House wall CL'}, {id:'dim-front-deck',levelId,a:point(18000,-3000),b:point(18000,0),offset:-4000,label:'Veranda depth'}];
  model.notes=[
    {id:'example-note',levelId,a:point(21000,19500),b:point(21000,19500),leader:false,text:'Modern Queenslander example\n3 generous bedrooms + study\n262 m² house · 3 m covered veranda\nOpen living / dining / kitchen\nAll dimensions in mm; project design required'},
    {id:'site-pool-note',levelId,a:point(79000,55000),b:point(96000,47000),leader:true,text:'REAR POOL\n10,000 × 6,000 mm · 60 m²\nLocated behind the house; barrier, drainage, plant, fencing and approvals require design'},
    {id:'site-landscape-note',levelId,a:point(118000,152000),b:point(112000,118000),leader:true,text:'LANDSCAPE CONCEPT\nRear lawn, native planting, screening trees, orchard planting, paving and irrigation\nCoordinate levels, drainage, roots, services and maintenance'},
    {id:'site-boundary-note',levelId,a:point(12000,20000),b:point(24000,8000),leader:true,text:'SITE BOUNDARY SET-OUT\n5 ha working assumption = 50,000 m²\nIllustrative rectangle 250 m × 200 m · perimeter 900 m\nConfirm title survey, easements, setbacks, levels and planning controls'},
    {id:'site-shed-note',levelId,a:point(185000,177000),b:point(211000,160000),leader:true,text:'REAR SHED / GARAGE + FENCE\nIllustrative 10,000 × 8,000 mm · 80 m²\nLocated up the back of the property; confirm turning, setbacks, drainage and fire separation'},
    {id:'site-gate-note',levelId,a:point(65000,0),b:point(47000,6000),leader:true,text:'ELECTRIC VEHICLE GATE\nFront boundary vehicle gate with pedestrian access concept\nConfirm clear opening, posts, controls, underground services and safety interlocks'},
    {id:'site-driveway-note',levelId,a:point(65000,90000),b:point(39000,70000),leader:true,text:'CONCRETE DRIVEWAY ROUTE\nFront gate → down the side of the house → rear shed\nIllustrative 6,000 mm lane plus rear turning connection; set levels, falls, joints, subgrade, drainage and crossover approval'},
    {id:'site-trees-note',levelId,a:point(138000,95000),b:point(170000,110000),leader:true,text:'TREES + PLANTING PLAN\nIndicative shade, feature and screening trees with entry, pool and rear planting beds\nConfirm species, root zones, irrigation, services, sightlines and maintenance before planting'}
  ];
  model.takeoffGroups=[createLandscapingTakeoff()];
  
  model.metadata.designInspiration.references.push({title:'The Artificial — Towers St, Ascot QLD (ArchiPro)',url:'https://archipro.com.au/project/towers-st-ascot-qld-the-artificial',usedFor:'Open living/dining/kitchen connected to a covered terrace and wraparound veranda; architectural principles only, no copied plan or dimensions.'});
  model.metadata.designInspiration.reviewNotes=['Example fridge moved to remove a 150 mm overlap with the pantry cabinet; 150 mm now separates their recorded envelopes. Product access, appliance ventilation and opening swings still need selected-product review.'];
  model.metadata.designInspiration.openLivingArea=model.rooms.filter(r=>['Living','Dining','Kitchen'].includes(r.name)).reduce((s,r)=>s+polygonArea(r.points)/1e6,0);
  model.metadata.exampleCompletion={rails:true,stairs3m:true};
  if(typeof prepareExampleSetout==='function')prepareExampleSetout(model);
  ensureExampleSafetyRecords(model);
  ensureExampleFoundationRecords(model);
  ensureExampleHandoverRecords(model);
  return model;
}

function landscapingTakeoffItems(){return[
  {category:'Pool shell',name:'Rear pool water area / shell allowance',quantity:60,unit:'m²',basis:'Illustrative 10,000 × 6,000 mm pool at the rear of the house. Excavation, structure, waterproofing, plant, drainage, barriers and approvals remain separate design items.'},
  {category:'Pool shell',name:'Pool excavation / spoil allowance',quantity:120,unit:'m³',basis:'Planning allowance only: 60 m² pool footprint × 2,000 mm excavation depth. Add working space, batter/shoring and over-excavation only after geotechnical and pool-builder set-out.'},
  {category:'Pool shell',name:'Concrete pool walls — preliminary N40 volume',quantity:11.52,unit:'m³',basis:'Concept calculation: 32 m internal perimeter × 1,800 mm wall depth × 200 mm wall thickness. Wall thickness, depth, concrete class, reinforcement, joints and water-retaining design require pool engineer approval.'},
  {category:'Pool shell',name:'Pool wall formwork / finish faces',quantity:115.2,unit:'m²',basis:'Concept two-face area: 32 m perimeter × 1.8 m wall depth × 2 faces. Excludes steps, benches, penetrations, bond beams, returns, waste and construction joints.'},
  {category:'Pool shell',name:'Pool floor concrete — preliminary N40 volume',quantity:9,unit:'m³',basis:'Concept calculation: 60 m² floor area × 150 mm slab thickness. Confirm hydrostatic uplift, subgrade, drainage, reinforcement, falls, penetrations and pool-builder structural design.'},
  {category:'Pool shell',name:'Pool shell concrete — 5% order allowance',quantity:21.55,unit:'m³',basis:'Combined preliminary wall and floor concrete 20.52 m³ × 1.05, rounded to 21.55 m³. This is an ordering allowance only; do not use it to set reinforcement, pour sequencing or structural dimensions.'},
  {category:'Pool shell',name:'Pool internal waterproofing / finish allowance',quantity:60,unit:'m²',basis:'Net internal water-area allowance only. Final membrane, render, tile, paint or pebble-finish system must be selected with the pool builder and manufacturer installation evidence.'},
  {category:'Pool deck',name:'Pool deck / paved surround — net area',quantity:240,unit:'m²',basis:'Outer 20,000 × 15,000 mm surround less the 60 m² pool = 240 m². Confirm whether the final surface is decking, stone, concrete or pavers, with falls, drainage, slip resistance and edge restraint.'},
  {category:'Pool deck',name:'Pool deck surface — order allowance including 10% waste',quantity:264,unit:'m²',basis:'240 m² net surround × 1.10 allowance. Waste is a planning allowance only; final cuts, joints, board direction and product pack sizes will change the order quantity.'},
  {category:'Pool deck',name:'Pool deck inner + outer edge trim / fascia',quantity:102,unit:'m',basis:'Outer perimeter 70 m plus pool-edge perimeter 32 m. Confirm actual openings, stair returns, drainage channels, fascia profile and selected finish.'},
  {category:'Pool deck',name:'Pool deck subframe / support-area allowance',quantity:240,unit:'m²',basis:'Matches the net deck surround for preliminary framing review. Joists, bearers, bracing, ventilation, corrosion category, spans and connection design are not inferred.'},
  {category:'Pool foundations',name:'Screw pier foundation planning allowance',quantity:44,unit:'count',basis:'Concept-only count: 102 m combined inner/outer deck edge support lines ÷ nominal 2.4 m spacing, rounded up. Not a structural pile schedule; confirm soil, loads, uplift, corrosion, embedment, installation torque and engineer-designed grid.'},
  {category:'Pool foundations',name:'Screw pier heads / adjustable brackets',quantity:44,unit:'count',basis:'One head/bracket allowance per preliminary screw pier. Select a compatible proprietary system after the pile design and deck framing are approved.'},
  {category:'Pool foundations',name:'Screw-pier installation / testing allowance',quantity:1,unit:'allowance',basis:'Include set-out, access, installation records, torque or refusal records, cut-off/extension, corrosion protection and as-built survey; price only after supplier and engineer review.'},
  {category:'Pool coping',name:'Stone pool coping / capping — linear length',quantity:32,unit:'m',basis:'Internal pool perimeter for the illustrative 10,000 × 6,000 mm rectangle. Include corners, returns, movement joints, adhesive/bed, sealants and finished edge detail.'},
  {category:'Pool coping',name:'Stone coping / capping — 400 mm average width',quantity:12.8,unit:'m²',basis:'32 m coping length × 400 mm average cap width. Add selected stone thickness, slip resistance, thermal behaviour, waste and edge profile after shop drawing.'},
  {category:'Pool coping',name:'Stone coping / capping — 10% order allowance',quantity:14.08,unit:'m²',basis:'12.8 m² concept coping area × 1.10 for cuts and breakage. Confirm slab sizes, corner mitres, returns, spare pieces and supplier pack sizes.'},
  {category:'Pool drainage',name:'Pool-edge channel / slot drain allowance',quantity:32,unit:'m',basis:'Planning allowance along the pool perimeter. Confirm falls, grate class, hydraulic capacity, clean-outs, discharge route and interface with the pool shell and deck.'},
  {category:'Pool plant',name:'Pool pump / filtration enclosure',quantity:1,unit:'count',basis:'One lockable, weather-protected plant enclosure allowance. Confirm equipment schedule, service access, acoustic treatment, ventilation, drainage, electrical isolation and manufacturer clearances.'},
  {category:'Pool plant',name:'Pump enclosure pad — 2.4 × 1.8 m',quantity:4.32,unit:'m²',basis:'Planning footprint allowance only. Confirm actual pump/filter/chlorinator dimensions and a concrete pad or support system independent of the pool shell.'},
  {category:'Pool plant',name:'Pump enclosure pad concrete — 100 mm planning thickness',quantity:0.432,unit:'m³',basis:'4.32 m² footprint × 100 mm planning thickness. Final thickness, reinforcement, joints, drainage and equipment anchorage require the plant layout and structural review.'},
  {category:'Pool fence',name:'Pool safety fence / barrier panels',quantity:82,unit:'m',basis:'Perimeter of the shown 23,000 × 18,000 mm barrier envelope. Queensland barrier location, height, openings, climbability, boundary interfaces and certifier inspection govern the final design.'},
  {category:'Pool fence',name:'Pool fence posts — nominal 2.4 m spacing allowance',quantity:35,unit:'count',basis:'82 m barrier ÷ nominal 2.4 m post spacing, rounded up. This is not a compliance spacing or footing schedule; confirm selected system, wind exposure, substrate and manufacturer instructions.'},
  {category:'Pool fence',name:'Self-closing / self-latching pool gate',quantity:1,unit:'count',basis:'One gate allowance within the barrier. Confirm clear opening, swing, latch height, hinges, non-climbable zones and inspection requirements under the adopted Queensland barrier pathway.'},
  {category:'Pool fence',name:'Pool barrier footing / anchor allowance',quantity:1,unit:'allowance',basis:'Allow for posts, anchors, local slabs or ground beams as selected. Final footing and anchorage design must suit substrate, edge distances and fence manufacturer evidence.'},
  {category:'Landscape planting',name:'Pool planting / screening bed',quantity:1,unit:'allowance',basis:'Low-litter planting and screening allowance beside the pool. Keep planting, furniture, irrigation hardware and stored objects outside required barrier clear zones until the certifier confirms the layout.'},
  {category:'Landscape planting',name:'Syzygium australe ‘Resilience’ screening plants',quantity:8,unit:'count',basis:'Preliminary screening palette; confirm mature width, root behaviour, litter, irrigation and pool-barrier clearances. Availability and cultivar identity must be checked with the nursery.'},
  {category:'Landscape planting',name:'Lomandra longifolia / ‘Lime Tuff’ feature grasses',quantity:24,unit:'count',basis:'Preliminary low-maintenance pool-edge palette. Confirm mature spread, leaf litter, irrigation and non-climbable-zone clearances before planting.'},
  {category:'Landscape planting',name:'Dianella caerulea ‘Little Jess’ accent plants',quantity:18,unit:'count',basis:'Preliminary accent planting palette for garden beds. Confirm local availability, mature size and maintenance requirements.'},
  {category:'Landscape planting',name:'Westringia fruticosa screening shrubs',quantity:12,unit:'count',basis:'Preliminary hardy screening palette for edge and entry beds. Confirm mature size, pruning regime, local provenance and pool-barrier clearances.'},
  {category:'Landscape planting',name:'Callistemon feature trees',quantity:3,unit:'count',basis:'Preliminary feature-tree allowance; keep away from pool water, paving joints, services and barrier sightlines until mature canopy and root zones are reviewed.'},
  {category:'Landscape planting',name:'Orchard / productive garden fruit trees',quantity:8,unit:'count',basis:'Preliminary orchard schedule near the rear shed. Confirm fruit drop, root zones, irrigation, mature height, access, pollination and separation from services.'},
  {category:'Landscape planting',name:'Garden beds',quantity:4,unit:'count',basis:'Four concept zones: arrival planting, pool screening, rear boundary screening and productive orchard/garden zone. Confirm soil depth, edging, drainage, irrigation and maintenance.'},
  {category:'Landscape planting',name:'Wraparound landscape works',quantity:1,unit:'allowance',basis:'Rear lawn, native planting, screening, feature trees, pool deck interface, orchard, paving, irrigation, drainage and maintenance concept; levels and planting schedule remain to be coordinated.'},
  {category:'Driveway',name:'Concrete driveway surface — N25 normal-class concrete',quantity:900,unit:'m²',basis:'Illustrative 6,000 mm-wide route over approximately 150,000 mm of route = 900 m². Brisbane driveway technical guidance uses N25 and 125 mm slab thickness for the referenced residential driveway standard; confirm the local council, road authority and site traffic classification.'},
  {category:'Driveway',name:'Concrete driveway volume — N25 at 125 mm',quantity:112.5,unit:'m³',basis:'900 m² × 0.125 m = 112.5 m³ theoretical placed volume. Add supplier waste, truck access, joints, thickened edges, falls, aprons and any turning-area changes only after the surveyed route is fixed.'},
  {category:'Driveway',name:'Concrete driveway order allowance — N25 with 5% waste',quantity:118.13,unit:'m³',basis:'112.5 m³ theoretical volume × 1.05 = 118.125 m³, shown rounded to 118.13 m³. Confirm the supplier minimum load, washout, access, pour breaks, thickened edges and final pavement design.'},
  {category:'Driveway',name:'Compacted granular sub-base — nominal 100 mm',quantity:90,unit:'m³',basis:'900 m² × 0.100 m = 90 m³ planning allowance. Confirm geotechnical report, pavement design, drainage and local authority requirements; this is not a universal site specification.'},
  {category:'Driveway',name:'Driveway reinforcement / mesh allowance',quantity:900,unit:'m²',basis:'One coverage allowance over the concrete area. Bar/mesh type, laps, chairs, cover, joints and thickened-edge reinforcement require pavement/structural design.'},
  {category:'Driveway',name:'Driveway edge formwork / restraint allowance',quantity:300,unit:'m',basis:'Two sides of the approximately 150 m route. Confirm actual route edges, turning apron, kerb interface, transitions and construction-joint details.'},
  {category:'Driveway',name:'Driveway control / isolation joints',quantity:1,unit:'allowance',basis:'Provide a joint layout and isolation details around structures, pits, posts and changes in width. Joint spacing and depth are construction details, not inferred from this concept.'},
  {category:'Driveway',name:'Driveway excavation / trim / disposal allowance',quantity:1,unit:'allowance',basis:'Survey and geotechnical-dependent allowance for stripping, cut/fill, unsuitable material, disposal, subgrade proof-roll and level control.'},
  {category:'Driveway',name:'Driveway drainage, pits and crossover approval',quantity:1,unit:'allowance',basis:'Coordinate falls, kerb/crossover permit, pits, grated drains, swales, discharge point and flood/stormwater requirements with the local authority.'},
  {category:'Site / boundary',name:'Site boundary area — 5 ha',quantity:50000,unit:'m²',basis:'Working assumption only: 5 hectares = 50,000 m². Confirm title survey, easements, flood/bushfire controls and planning requirements.'},
  {category:'Site / boundary',name:'Whole-property boundary fence',quantity:900,unit:'m',basis:'Continuous perimeter-fence concept around the illustrative 250,000 × 200,000 mm / 5 ha working boundary. Confirm surveyed alignment, height, posts, gates, terrain, wildlife/fire access, services, ownership and approvals.'},
  {category:'Site / boundary',name:'Property boundary set-out / perimeter',quantity:900,unit:'m',basis:'Illustrative rectangular working envelope 250,000 × 200,000 mm, giving 900 m perimeter. Replace with surveyed boundary geometry.'},
  {category:'Site / boundary',name:'Large rear shed / garage zone',quantity:80,unit:'m²',basis:'Illustrative 10,000 × 8,000 mm shed/garage located up the back of the property. Shed design, slab, services, setbacks, fire separation and approvals are excluded.'},
  {category:'Site / boundary',name:'Shed / garage boundary fence',quantity:36,unit:'m',basis:'Illustrative 2 × (10,000 + 8,000) mm fence run around the rear shed/garage zone. Confirm actual alignment, retaining, access, fire separation and ownership.'},
  {category:'Site / boundary',name:'Electric vehicle gate',quantity:1,unit:'count',basis:'Front boundary gate allowance at the driveway entry. Confirm clear opening, pedestrian access, posts, controls, underground services and safety interlocks.'}
].map(item=>({...item,id:uid('takeoff-item')}));}

function landscapingTakeoffReferences(){return[
  {title:'Queensland Government — Pool fences and barriers',url:'https://www.qld.gov.au/housing/buying-owning-home/pool-safety/pool-laws-and-standards/fences-and-barriers',scope:'Queensland pool barrier obligations, QDC MP 3.4, gate and climbability review prompts.'},
  {title:'QBCC — Build a pool',url:'https://www.qbcc.qld.gov.au/home-owner-hub/swimming-pools/build-pool',scope:'Pool construction process, temporary fencing and pool-fence coordination.'},
  {title:'QBCC — Swimming pool construction, installation and maintenance',url:'https://www.qbcc.qld.gov.au/licences/apply-licence/available-licences/other-trade/swimming-pool-construction-installation',scope:'Licensed pool-construction scope including concrete pools, paving and pool fencing.'},
  {title:'Standards Australia — AS 1926.1:2024',url:'https://store.standards.org.au/search?query=AS1926.1-SwimmingPoolSafety&status=Current_PendingRevision',scope:'Current published pool-barrier standard listing; confirm Queensland adoption and obtain the licensed document.'},
  {title:'Standards Australia — AS 3600 concrete structures',url:'https://store.standards.org.au/search?query=AS3600%3A2018%E2%80%93ConcreteStructures&status=Current_PendingRevision',scope:'Concrete design/construction reference for the pool shell, pad and other structural concrete.'},
  {title:'Standards Australia — AS 2159 piling design and installation',url:'https://store.standards.org.au/product/as-2159-1995-amdt-1',scope:'Pile design and installation reference for screw-pier / helical-pile engineering; confirm current edition and project applicability.'},
  {title:'Brisbane City Council — Driveway technical standards',url:'https://www.brisbane.qld.gov.au/laws-and-permits/licences-permits-regulations/apply-for-a-driveway-permit/technical-driveway-standards',scope:'Reference used for the N25 and 125 mm driveway planning basis; local authority requirements must be checked for the actual site.'},
  {title:'Daly’s Native Plants — Brisbane wholesale native nursery',url:'https://dalysnativeplants.com.au/',scope:'Supplier lead for native trees, shrubs and screening stock; availability and provenance to be confirmed.'},
  {title:'Native Plants Queensland — Where to buy',url:'https://npq.org.au/where-to-buy/',scope:'Directory of Queensland native-plant nurseries and local-provenance suppliers.'},
  {title:'Platypus Plants — Brisbane native plants',url:'https://www.platypusplants.com.au/collections/natives',scope:'Retail lead for Syzygium, Lomandra and Westringia palette examples; confirm cultivar, size and stock.'},
  {title:'Ridgey Didge Wholesale Nursery',url:'https://ridgeydidge.au/',scope:'South-east Queensland native wholesale supplier lead; confirm plant availability and delivery.'}
];}

function createLandscapingTakeoff(){return{id:'takeoff-landscaping',name:'Landscaping',scope:'Detailed preliminary site takeoff: pool shell, pool walls and floor, pool deck surround, screw-pier support allowance, stone coping, pool drainage, pump enclosure, pool safety barrier, planting species and suppliers, driveway concrete, boundary works and rear shed interfaces. Quantities are editable concept allowances, not engineering, approvals or supplier orders.',references:landscapingTakeoffReferences(),items:landscapingTakeoffItems()};}

function defaultDisciplinePlans(){return[
  {id:'plan-civil',discipline:'Civil Engineering',status:'Not started',planRefs:'Site boundary / perimeter fence / levels / driveway / drainage plan',notes:'Confirm title survey, 5 ha boundary, continuous perimeter fence, site levels, stormwater, front gate crossover, side driveway route to the rear shed, turning, and pool excavation interfaces.'},
  {id:'plan-structural',discipline:'Structural',status:'Not started',planRefs:'Footing / subfloor / roof / deck / stair structural plans',notes:'Design foundations, 450 mm joists, 1200 mm bearers, posts, bracing, tie-downs, stairs and balustrade connections for site conditions.'},
  {id:'plan-architectural',discipline:'Architectural',status:'Concept',planRefs:'Readable floor plan / elevations / sections / door-window schedule',notes:'Coordinate the 3 bedroom, 2 bathroom Queenslander layout, wraparound veranda, wet areas and finish schedule.'},
  {id:'plan-mechanical',discipline:'Mechanical',status:'Not started',planRefs:'HVAC / ventilation / hot-water plant plan',notes:'Coordinate ventilation, air-conditioning, plant clearances, penetrations and energy-efficiency inputs.'},
  {id:'plan-landscaping',discipline:'Landscaping',status:'Concept',planRefs:'Rear pool / pool deck / pool fence / garden beds / orchard / trees / boundary fence / gate / driveway landscape plan',notes:'Use the separate Landscaping takeoff for the rear pool, pool deck and safety fence, eight indicative trees, four garden beds, orchard zone, continuous 5 ha boundary fence concept, rear shed fence, front electric gate and concrete driveway route.'},
  {id:'plan-electrical',discipline:'Electrical',status:'Not started',planRefs:'Power / lighting / gate / pool equipment / data plan',notes:'Coordinate switchboards, external lighting, electric gate controls, pool plant, communications and underground services.'},
  {id:'plan-plumbing',discipline:'Plumbing',status:'Not started',planRefs:'Water / sanitary / stormwater / pool drainage plan',notes:'Coordinate bathrooms, ensuite, kitchen, laundry, roofwater, stormwater, pool drainage and service access.'}
];}

function normalizeDisciplinePlans(model){
  const statuses=new Set(['Not started','Concept','Review','Issued']);
  model.disciplinePlans=(Array.isArray(model.disciplinePlans)?model.disciplinePlans:defaultDisciplinePlans()).filter(Boolean).slice(0,30).map(plan=>({id:String(plan.id||uid('plan')),discipline:String(plan.discipline||'Discipline plan').slice(0,80),status:statuses.has(plan.status)?plan.status:'Not started',planRefs:String(plan.planRefs||'').slice(0,300),notes:String(plan.notes||'').slice(0,1000)}));
}

const disciplinePlanViews={
  'plan-civil':{mode:'site',message:'Civil Engineering plan view · boundary, driveway, gate, shed and site interfaces visible'},
  'plan-structural':{mode:'plan',display:'coordination',layers:['foundations','pads','piers','floors','floorFraming','decks','deckFraming','deckBoards','deckSupports','deckPosts','deckPostMembers','deckPostFootings','walls','roofs','roofFraming','roofJunctions','stairs','stairLandings','stairHandrails','stairBarriers','stairCoordination','stairHeadroom'],message:'Structural plan view · subfloor, deck, roof, footing and stair coordination layers visible'},
  'plan-architectural':{mode:'plan',display:'readable',layers:['floors','walls','openings','rooms','decks','stairs','stairLandings','kitchen','dimensions','planSizes','notes'],message:'Architectural plan view · readable floor plan and room/opening layout visible'},
  'plan-mechanical':{mode:'plan',display:'coordination',layers:['floors','walls','openings','rooms','roofs','dimensions','notes','service-other'],message:'Mechanical plan register opened · add or review HVAC, ventilation and plant geometry in Services'},
  'plan-landscaping':{mode:'site',message:'Landscaping plan view · pool, pool deck, pool fence, planting, orchard, boundary and driveway visible'},
  'plan-electrical':{mode:'plan',display:'coordination',layers:['floors','walls','openings','rooms','dimensions','notes','service-electrical','serviceFittings','serviceFixtures'],message:'Electrical plan register opened · add or review power, lighting, gate and pool-equipment geometry in Services'},
  'plan-plumbing':{mode:'plan',display:'coordination',layers:['floors','walls','openings','rooms','dimensions','notes','service-water','service-drainage','serviceFittings','serviceFixtures'],message:'Plumbing plan register opened · add or review water, sanitary, stormwater and pool-drainage geometry in Services'}
};
function openDisciplinePlan(planId){const view=disciplinePlanViews[planId];if(!view)return;state.selected=null;state.mode=view.mode;if(view.display)state.planDisplayMode=view.display;if(view.mode==='site'){state.tool='select';state.visibility.siteConcepts=true;}if(Array.isArray(view.layers))for(const layer of view.layers)state.visibility[layer]=true;state.view.initialized=false;state.statusMessage=view.message;fitView();render();}
function renderDisciplinePlans(){const plans=state.model.disciplinePlans||[];return `<p class="overview-copy">Plan register for coordinated consultant and trade information. Use <strong>Open plan view</strong> to bring the relevant model layers to the canvas. Status is a workflow label, not approval or certification.</p><div class="discipline-plan-list">${plans.map(plan=>`<article class="discipline-plan-card"><div class="section-row"><div><h4>${escapeHtml(plan.discipline)}</h4><span class="discipline-plan-scope">${disciplinePlanViews[plan.id]?'Model view available':'Register only'}</span></div><div class="discipline-plan-actions"><button class="link-button" type="button" data-discipline-action="open" data-discipline-plan="${escapeHtml(plan.id)}">Open plan view</button><select data-discipline-plan="${escapeHtml(plan.id)}" data-discipline-field="status" aria-label="${escapeHtml(plan.discipline)} status">${['Not started','Concept','Review','Issued'].map(status=>`<option value="${status}" ${plan.status===status?'selected':''}>${status}</option>`).join('')}</select></div></div><label>Plan references<input type="text" data-discipline-plan="${escapeHtml(plan.id)}" data-discipline-field="planRefs" value="${escapeHtml(plan.planRefs)}" maxlength="300"></label><label>Coordination notes<textarea rows="2" data-discipline-plan="${escapeHtml(plan.id)}" data-discipline-field="notes" maxlength="1000">${escapeHtml(plan.notes)}</textarea></label></article>`).join('')}</div>`;}
function updateDisciplinePlan(planId,field,value){const plan=(state.model.disciplinePlans||[]).find(candidate=>candidate.id===planId);if(!plan||!['status','planRefs','notes'].includes(field))return;if(field==='status'&&!['Not started','Concept','Review','Issued'].includes(value))return;withHistory(()=>plan[field]=String(value).slice(0,field==='notes'?1000:300));}
function exportDisciplinePlansCsv(){const rows=[['Discipline','Status','Plan references','Coordination notes'],...(state.model.disciplinePlans||[]).map(plan=>[plan.discipline,plan.status,plan.planRefs,plan.notes])];download('bc-design-discipline-plan-register.csv',rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');state.statusMessage='Discipline plan register CSV downloaded';render();}

function normalizeTakeoffGroups(model){
  const units=new Set(['m','m²','m³','count','allowance']);
  const source=Array.isArray(model.takeoffGroups)?model.takeoffGroups:(model.metadata?.designInspiration||/Queenslander/i.test(model.name||'')?[createLandscapingTakeoff()]:[]);
  model.takeoffGroups=source.filter(Boolean).slice(0,50).map(group=>({
    id:String(group.id||uid('takeoff')),
    name:String(group.name||'Site takeoff').slice(0,80),
    scope:String(group.scope||'User-entered preliminary takeoff scope.').slice(0,1000),
    references:(Array.isArray(group.references)?group.references:[]).filter(Boolean).slice(0,50).map(reference=>({title:String(reference.title||'Reference').slice(0,200),url:String(reference.url||'').slice(0,500),scope:String(reference.scope||'').slice(0,500)})).filter(reference=>/^https?:\/\//i.test(reference.url)),
    items:(Array.isArray(group.items)?group.items:[]).filter(Boolean).slice(0,200).map(item=>({
      id:String(item.id||uid('takeoff-item')),
      category:String(item.category||'General site works').slice(0,80),
      name:String(item.name||'Takeoff item').slice(0,160),
      quantity:Number.isFinite(Number(item.quantity))&&Number(item.quantity)>=0?Number(item.quantity):0,
      unit:units.has(item.unit)?item.unit:'allowance',
      basis:String(item.basis||'Enter the measured allowance and project evidence.').slice(0,1000)
    }))
  }));
}

function normalizeSitePlan(model){
  const exampleProject=Boolean(model.metadata?.designInspiration)||/Queenslander/i.test(model.name||'');
  const seedExample=!model.sitePlan&&exampleProject;
  const source=seedExample?createExampleSitePlan(model):(model.sitePlan&&typeof model.sitePlan==='object'?model.sitePlan:{boundary:[],elements:[]});
  const normalizePoints=points=>Array.isArray(points)?points.filter(value=>Number.isFinite(value?.x)&&Number.isFinite(value?.y)).map(value=>({x:Number(value.x),y:Number(value.y)})).slice(0,100):[];
  const boundary=source.boundary&&typeof source.boundary==='object'?{id:String(source.boundary.id||'site-boundary'),type:'boundary',label:String(source.boundary.label||'Site boundary').slice(0,200),points:normalizePoints(source.boundary.points)}:{id:'site-boundary',type:'boundary',label:'Site boundary',points:[]};
  const elements=Array.isArray(source.elements)?source.elements.filter(Boolean).slice(0,100).map(element=>({
    id:String(element.id||uid('site-element')),
    type:String(element.type||'site'),
    label:String(element.label||'Site element').slice(0,200),
    points:normalizePoints(element.points),
    a:Number.isFinite(element.a?.x)&&Number.isFinite(element.a?.y)?{x:Number(element.a.x),y:Number(element.a.y)}:null,
    b:Number.isFinite(element.b?.x)&&Number.isFinite(element.b?.y)?{x:Number(element.b.x),y:Number(element.b.y)}:null
  })).filter(element=>element.points.length>=2||(element.a&&element.b)):[];
  model.sitePlan={units:'mm',boundary,elements};
}

function renderTakeoffGroups(){
  const groups=state.model.takeoffGroups||[];
  if(!groups.length)return `<p class="overview-copy">No separate site takeoffs have been created.</p><button class="primary-button" type="button" data-takeoff-action="add-landscaping">Add Landscaping takeoff</button>`;
  const unitOptions=['m','m²','m³','count','allowance'];
  return groups.map(group=>{const categories=[...new Set(group.items.map(item=>item.category||'General site works'))];return `<article class="custom-takeoff-group"><div class="section-row"><div><p class="section-kicker">SEPARATE TAKEOFF · ${group.items.length} LINE ITEMS</p><label class="custom-takeoff-group-name">Name<input type="text" data-takeoff-group="${escapeHtml(group.id)}" data-takeoff-group-field="name" value="${escapeHtml(group.name)}" maxlength="80"></label></div><button class="link-button" type="button" data-takeoff-action="export" data-takeoff-group="${escapeHtml(group.id)}">Export CSV</button></div><label class="custom-takeoff-scope">Scope<textarea rows="3" data-takeoff-group="${escapeHtml(group.id)}" data-takeoff-group-field="scope" maxlength="1000">${escapeHtml(group.scope)}</textarea></label><div class="custom-takeoff-category-summary">${categories.map(category=>`<span>${escapeHtml(category)} · ${group.items.filter(item=>(item.category||'General site works')===category).length}</span>`).join('')}</div><div class="custom-takeoff-items">${categories.map(category=>`<section class="custom-takeoff-category"><h4>${escapeHtml(category)}</h4>${group.items.filter(item=>(item.category||'General site works')===category).map(item=>`<div class="custom-takeoff-item"><label>Item<input type="text" data-takeoff-group="${escapeHtml(group.id)}" data-takeoff-item="${escapeHtml(item.id)}" data-takeoff-item-field="name" value="${escapeHtml(item.name)}" maxlength="160"></label><label>Quantity<input type="number" min="0" step="any" data-takeoff-group="${escapeHtml(group.id)}" data-takeoff-item="${escapeHtml(item.id)}" data-takeoff-item-field="quantity" value="${item.quantity}"></label><label>Unit<select data-takeoff-group="${escapeHtml(group.id)}" data-takeoff-item="${escapeHtml(item.id)}" data-takeoff-item-field="unit">${unitOptions.map(unit=>`<option value="${unit}" ${item.unit===unit?'selected':''}>${unit}</option>`).join('')}</select></label><label class="custom-takeoff-basis">Assumption / basis<textarea rows="2" data-takeoff-group="${escapeHtml(group.id)}" data-takeoff-item="${escapeHtml(item.id)}" data-takeoff-item-field="basis" maxlength="1000">${escapeHtml(item.basis)}</textarea></label><button class="delete-button" type="button" data-takeoff-action="remove-item" data-takeoff-group="${escapeHtml(group.id)}" data-takeoff-item="${escapeHtml(item.id)}">Remove</button></div>`).join('')}</section>`).join('')}</div><button class="link-button" type="button" data-takeoff-action="add-item" data-takeoff-group="${escapeHtml(group.id)}">Add line item</button>${group.references?.length?`<details class="takeoff-references"><summary>Reference links and suppliers (${group.references.length})</summary><div class="takeoff-reference-list">${group.references.map(reference=>`<div class="takeoff-reference"><a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.title)}</a><small>${escapeHtml(reference.scope)}</small></div>`).join('')}</div></details>`:''}<p class="inspector-footnote">Separate preliminary allowances only. These records do not create pool, landscape, boundary, fence, gate or driveway geometry and are not supplier orders, survey set-out or compliance certification.</p></article>`;}).join('');
}

function siteQuantityChecks(){
  const elements=state.model.sitePlan?.elements||[],groups=state.model.takeoffGroups||[],items=groups.flatMap(group=>group.items||[]),area=type=>{const element=elements.find(e=>e.type===type);return element?.points?.length>=3?polygonArea(element.points)/1e6:null;},driveway=area('driveway'),deck=area('pool-deck'),pool=area('pool');
  return [{name:'Driveway surface',measured:driveway,item:items.find(item=>item.name.toLowerCase().includes('concrete driveway surface'))},{name:'Pool deck net surround',measured:deck===null||pool===null?null:Math.max(0,deck-pool),item:items.find(item=>item.name.toLowerCase().includes('pool deck / paved surround'))}].map(row=>({...row,recorded:row.item?.quantity??null,matches:row.measured!==null&&row.item?.unit==='m²'&&Math.abs(row.measured-row.item.quantity)<.01}));
}
function renderSiteTakeoffHighlights(){
  const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.name.trim().toLowerCase()==='landscaping');
  if(!group)return '<p class="overview-copy">Load the example house or add a Landscaping takeoff to see the pool, driveway and planting summary.</p>';
  const items=group.items||[],find=(text)=>items.find(item=>item.name.toLowerCase().includes(text));
  const driveway=find('concrete driveway volume'),walls=find('concrete pool walls'),floor=find('pool floor concrete'),deck=find('pool deck / paved surround'),barrier=find('pool safety fence'),plants=items.filter(item=>item.category==='Landscape planting'&&item.unit==='count');
  const cards=[
    ['Driveway',`${driveway?formatNumber(driveway.quantity)+' m³':'Not recorded'}`,`Recorded volume allowance · concrete class and thickness in schedule`],
    ['Pool shell',`Walls ${walls?formatNumber(walls.quantity):'—'} m³ + floor ${floor?formatNumber(floor.quantity):'—'} m³`,`Recorded shell allowance · structural design required`],
    ['Pool deck',`${deck?formatNumber(deck.quantity)+' m²':'Not recorded'} net surround`,`Order allowance and edge lengths in schedule`],
    ['Barrier / planting',`${barrier?formatNumber(barrier.quantity)+' m':'Not recorded'} barrier · ${plants.length} plant lines`,`Species and nursery references below`],
    ['Screw piers',`${find('screw pier foundation')?formatNumber(find('screw pier foundation').quantity,0)+' nominal supports':'Not recorded'}`,`Heads, installation and testing in schedule`],
    ['Stone coping',`${find('stone pool coping')?formatNumber(find('stone pool coping').quantity)+' m':'Not recorded'}`,`Cap width, order allowance and joints in schedule`],
    ['Pool pump enclosure',`${find('pool pump / filtration enclosure')?formatNumber(find('pool pump / filtration enclosure').quantity,0)+' enclosure':'Not recorded'}`,`Pad, concrete, ventilation and access in schedule`]
  ];
  return cards.map(([label,value,detail])=>`<div class="takeoff-highlight"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`).join('')+siteQuantityChecks().filter(row=>row.measured!==null&&!row.matches).map(row=>`<div class="takeoff-highlight"><span>${escapeHtml(row.name)} · review</span><strong>${formatNumber(row.measured)} m² drawn</strong><small>${row.recorded===null?'No area allowance recorded':formatNumber(row.recorded)+' m² recorded allowance'}. Reconcile the drawing and allowance before ordering.</small></div>`).join('');
}

function requestAuditItems(){
  const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.name.trim().toLowerCase()==='landscaping');
  const items=group?.items||[],elements=state.model.sitePlan?.elements||[],has=(text)=>items.some(item=>item.name.toLowerCase().includes(text)),hasElement=(type)=>elements.some(element=>element.type===type),plantLines=items.filter(item=>item.category==='Landscape planting'&&item.unit==='count').length;
  const renderCount=typeof REALISTIC_RENDER_VIEWS!=='undefined'&&Array.isArray(REALISTIC_RENDER_VIEWS)?REALISTIC_RENDER_VIEWS.length:3;
  return [
    {label:'More detailed landscaping',status:group&&hasElement('landscape')&&hasElement('planting')&&hasElement('orchard')?'Complete':'Needs setup',detail:group?'Site plan overlays, planting zones, orchard, lawn, drainage and editable landscape allowances are included.':'Load the complete example house to create the landscaping package.'},
    {label:'Pool deck surrounding the pool',status:has('pool deck / paved surround')&&has('pool deck surface')&&has('pool deck subframe')?'Complete':'Needs setup',detail:has('pool deck / paved surround')?'240 m² net surround, 264 m² order allowance, 102 m edge trim/fascia and 240 m² support-area allowance.':'Pool deck takeoff is not present in this model.'},
    {label:'Concrete pool walls and shell',status:has('concrete pool walls')&&has('pool floor concrete')&&has('pool wall formwork')?'Complete':'Needs setup',detail:has('concrete pool walls')?'N40 preliminary walls 11.52 m³, wall form/finish faces 115.2 m², floor 9.00 m³ and shell order allowance 21.55 m³.':'Pool shell takeoff is not present in this model.'},
    {label:'Screw-pier foundations',status:has('screw pier foundation')&&has('screw pier heads')&&has('screw-pier installation')?'Complete':'Needs setup',detail:has('screw pier foundation')?'44 nominal screw piers, 44 heads/brackets and one installation/testing allowance; the 3D view now shows the support grid.':'Screw-pier takeoff is not present in this model.'},
    {label:'Stone capping / coping',status:has('stone pool coping')&&has('stone coping / capping')?'Complete':'Needs setup',detail:has('stone pool coping')?'32 m coping, 12.80 m² at 400 mm average width and 14.08 m² order allowance with 10% cuts/breakage.':'Coping takeoff is not present in this model.'},
    {label:'Pool pump enclosure',status:has('pool pump')&&has('pump enclosure pad')&&has('pad concrete')?'Complete':'Needs setup',detail:has('pool pump')?'One enclosure, 4.32 m² planning pad and 0.432 m³ pad concrete allowance; plant access and ventilation remain to be designed.':'Pool plant takeoff is not present in this model.'},
    {label:'Pool fence / safety barrier',status:has('pool safety fence')&&has('pool fence posts')&&has('self-closing')?'Complete':'Needs setup',detail:has('pool safety fence')?'82 m barrier, 35 posts, one self-closing/latching gate and one footing/anchor allowance with Queensland barrier references.':'Pool barrier takeoff is not present in this model.'},
    {label:'All pool detail layers visible',status:hasElement('pool-wall')&&hasElement('pool-coping')&&hasElement('pool-drainage')&&hasElement('screw-piers')&&hasElement('pool-pump')?'Complete':'Review',detail:'Pool wall, coping, drainage, screw-pier and pump-enclosure layers are represented in the site plan and Site 3D view.'},
    {label:'Driveway concrete type / MPa',status:has('concrete driveway surface')?'Complete':'Needs setup',detail:has('concrete driveway surface')?'N25 / 25 MPa normal-class concrete at a 125 mm planning thickness, subject to local authority and pavement design.':'Driveway concrete specification is not present in this model.'},
    {label:'Driveway concrete volume',status:has('concrete driveway volume')&&has('order allowance')?'Complete':'Needs setup',detail:has('concrete driveway volume')?'112.50 m³ theoretical placed volume and 118.13 m³ with 5% waste for the 900 m² route allowance.':'Driveway volume calculation is not present in this model.'},
    {label:'Takeoffs for everything',status:'Partial',detail:group?`${items.length} landscaping/site allowance lines and measured building schedules are available. Detailed wall assemblies, all-trade procurement and model/allowance reconciliation remain to complete.`:'Add the Landscaping takeoff and measured building geometry.'},
    {label:'Plant species and suppliers',status:plantLines>=6&&((group?.references||[]).length>=4)?'Complete':'Review',detail:plantLines>=6?`${plantLines} species / orchard planting lines and ${group.references.length} Queensland supplier or reference links are included.`:'Species and supplier references need to be added.'},
    {label:'References and created detail',status:group&&((group.references||[]).length>=10)&&hasElement('pool-wall')?'Complete':'Review',detail:group?`${group.references.length} Australian reference/supplier links plus editable concept geometry, assumptions and coordination notes are included.`:'Reference records are not present in this model.'},
    {label:'More realistic rendered drawings',status:renderCount>=3?'Complete':'Review',detail:`${renderCount} published presentation renders: Queenslander/pool exterior, pool-edge detail and full-property aerial.`},
    {label:'Domain can host the workspace',status:'Verified',detail:'The custom domain is active with SSL and serves the BC Design landing page and app.'},
    {label:'URL problem — requested paths',status:'Verified',detail:'Both /bc-design/ and /bc-design/app/ are live on bloxhamconstruction.com and the www fallback route.'},
    {label:'Measured building, roofs, stairs and decks',status:'Available',detail:'Editable millimetre geometry, levels, framing records, openings, rooms, stair/rail/deck details and independent Plan/3D layers are included.'},
    {label:'Save, recover and transfer projects',status:'Available',detail:'JSON, autosave, undo/redo and reopen are included. Browser and desktop keep separate local saves; transfer with Save JSON / Open.'},
    {label:'Scaled drawings and construction outputs',status:'Partial',detail:'Scaled SVG/PDF, selected-level sets, floor/wall layout pages, elevations, model-study images and CSV exports are included. General building sections and physical printer acceptance remain open.'},
    {label:'Door and window product library',status:'Partial',detail:'Custom dimensions and supplier reference records are available. The complete manufacturer/range library with separate frame, stud and clear-opening dimensions remains open.'},
    {label:'Whole-building and renovation takeoffs',status:'Partial',detail:'Measured component schedules, specification coverage and stock allocation are available. Complete wall assemblies, all finishes/services, renovation ordering reconciliation and reviewed residential/commercial examples remain open.'},
    {label:'Australian source and edition checks',status:'Partial',detail:'Official-source prompts and evidence fields are available. The separately developed jurisdiction/date-aware standards module still requires integration and review.'},
    {label:'Surface Pen and physical acceptance',status:'Device test required',detail:'Pointer/pen drawing is implemented. Actual pen, palm rejection, long-session use and physical print calibration still require device testing.'},
    {label:'Advanced detailing and procurement',status:'Partial',detail:'Connector, end-cut and stock-length studies are available. Fitted holes/hardware, obstruction corridors, supplier-ready orders and physical fabrication remain open.'},
    {label:'Deferred integrations',status:'Deferred',detail:'The AI assistant and separate Data analysis were deferred. Cloud sync/account access and production mobile delivery remain separate outstanding work; automatic work stays off.'}
  ];
}

function renderRequestAudit(){
  return requestAuditItems().map(item=>`<div class="request-audit-row"><span class="request-audit-status ${item.status==='Complete'||item.status==='Verified'?'is-complete':'is-review'}">${item.status==='Complete'||item.status==='Verified'?'✓':'!'}</span><div><div class="request-audit-row-head"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.status)}</span></div><small>${escapeHtml(item.detail)}</small></div></div>`).join('');
}

function exportRequestAuditCsv(){
  const rows=[['Requested deliverable','Status','Detail'],...requestAuditItems().map(item=>[item.label,item.status,item.detail])];
  download('bc-design-request-audit.csv',rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');
  state.statusMessage='Request audit CSV downloaded';render();
}

function updateTakeoffGroup(groupId,field,value){const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.id===groupId);if(!group||!['name','scope'].includes(field))return;withHistory(()=>group[field]=String(value).slice(0,field==='name'?80:1000));}
function updateTakeoffItem(groupId,itemId,field,value){const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.id===groupId),item=group?.items.find(candidate=>candidate.id===itemId);if(!item||!['category','name','quantity','unit','basis'].includes(field))return;const units=new Set(['m','m²','m³','count','allowance']);if(field==='quantity'&&(!String(value).trim()||!Number.isFinite(Number(value))||Number(value)<0)){state.statusMessage='Takeoff quantity must be zero or greater';render();return;}if(field==='unit'&&!units.has(value))return;withHistory(()=>item[field]=field==='quantity'?Number(value):String(value).slice(0,field==='name'?160:field==='category'?80:1000));}
function addLandscapingTakeoff(){if((state.model.takeoffGroups||[]).some(group=>group.name.trim().toLowerCase()==='landscaping'))return;withHistory(()=>state.model.takeoffGroups.push(createLandscapingTakeoff()));}
function addTakeoffItem(groupId){const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.id===groupId);if(!group||group.items.length>=200)return;withHistory(()=>group.items.push({id:uid('takeoff-item'),name:'New site item',quantity:0,unit:'allowance',basis:'Enter the measured allowance, assumption and project evidence.'}));}
function removeTakeoffItem(groupId,itemId){const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.id===groupId);if(!group)return;withHistory(()=>group.items=group.items.filter(item=>item.id!==itemId));}
function exportTakeoffGroupCsv(groupId){const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.id===groupId);if(!group)return;const rows=[['Takeoff','Category','Item','Quantity','Unit','Assumption / basis'],...group.items.map(item=>[group.name,item.category||'General site works',item.name,item.quantity,item.unit,item.basis])];download(`${group.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()||'site-takeoff'}.csv`,rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');state.statusMessage=`${group.name} takeoff CSV downloaded`;render();}


function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeModel(raw) {
  if (!raw || typeof raw !== "object") throw new Error("The file is not a project object.");
  if (!Array.isArray(raw.levels) || !Array.isArray(raw.walls) || !Array.isArray(raw.openings) || !Array.isArray(raw.decks)) throw new Error("This file is missing BC Design model data.");
  if(Array.isArray(raw.roofJunctions))for(const r of raw.roofJunctions)if(r?.valleyWidth!==undefined&&r.valleyWidth!==null&&!Number.isFinite(r.valleyWidth))throw new Error('Invalid roof trim preview width.');
  validateRoofFramingList(raw.roofFraming);
  validateStairImport(raw.stairs);
  validateCoordinationDatums(raw);
  validateFloorOpenings(raw);
  if (typeof validateFloorFraming === 'function') validateFloorFraming(raw);
  if (typeof validateFloorFitDetails === 'function') validateFloorFitDetails(raw);
  if (typeof validateStockPlans === 'function') validateStockPlans(raw);
  if (typeof validateConnectorDetails === 'function') validateConnectorDetails(raw);
  if (typeof validateEndCuts === 'function') validateEndCuts(raw);
  validateHeadroomTargets(raw);
  validateDeckBoardImports(raw);
  validateDeckSupportImports(raw);
  validateDeckPostImports(raw);
  validateDeckPostMemberImports(raw);
  validateDeckEdgeImports(raw);
  if(typeof validateKitchenUnits==='function')validateKitchenUnits(raw);
  const model = clone(raw);
  model.kitchenUnits ||= [];
  model.schema = 30;
  model.app = "BC Design";
  model.name = typeof model.name === "string" && model.name.trim() ? model.name.slice(0, 80) : "Imported building";
  model.units = "mm";
  model.jurisdiction = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].includes(model.jurisdiction) ? model.jurisdiction : "";
  model.soilClass = ["A", "S", "M", "H1", "H2", "E", "P"].includes(model.soilClass) ? model.soilClass : "";
  model.levels = model.levels.map((level, index) => ({ id: String(level.id || uid("level")), name: String(level.name || `Level ${index + 1}`), elevation: finiteNumber(level.elevation, 0) }));
  if (!model.levels.length) throw new Error("A project needs at least one level.");
  normalizeFloorOpenings(model);
  const levelIds = new Set(model.levels.map((level) => level.id));
  const fallbackLevel = model.levels[0].id;
  model.activeLevelId = levelIds.has(model.activeLevelId) ? model.activeLevelId : fallbackLevel;
  model.walls = model.walls.filter((wall) => wall && wall.a && wall.b).map((wall) => ({ ...wall, id: String(wall.id || uid("wall")), levelId: levelIds.has(wall.levelId) ? wall.levelId : fallbackLevel, a: point(wall.a), b: point(wall.b), thickness: positiveNumber(wall.thickness, 140), height: positiveNumber(wall.height, 2700), status: wall.status || "new" }));
  const wallIds = new Set(model.walls.map((wall) => wall.id));
  model.openings = model.openings.filter((opening) => opening && wallIds.has(opening.wallId)).map((opening) => ({ ...opening, id: String(opening.id || uid("opening")), type: opening.type === "window" ? "window" : "door", levelId: levelIds.has(opening.levelId) ? opening.levelId : fallbackLevel, wallId: String(opening.wallId), operation: ["hinged","sliding","passage"].includes(opening.operation)?opening.operation:"hinged", offset: nonNegativeNumber(opening.offset, 0), width: positiveNumber(opening.width, opening.type === "window" ? 1200 : 900), height: positiveNumber(opening.height, opening.type === "window" ? 1200 : 2100), sill: nonNegativeNumber(opening.sill, opening.type === "window" ? 900 : 0), status: opening.status || "new" }));
  model.decks = model.decks.filter((deck) => Array.isArray(deck.points) && deck.points.length >= 3).map((deck) => ({ ...deck, id: String(deck.id || uid("deck")), levelId: levelIds.has(deck.levelId) ? deck.levelId : fallbackLevel, points: deck.points.map(point), elevation: finiteNumber(deck.elevation, 0), thickness: nonNegativeNumber(deck.thickness, 0), status: deck.status || "new" }));
  model.floors = (Array.isArray(model.floors) ? model.floors : []).filter((floor) => Array.isArray(floor.points) && floor.points.length >= 3).map((floor) => ({ ...floor, id: String(floor.id || uid("floor")), levelId: levelIds.has(floor.levelId) ? floor.levelId : fallbackLevel, points: floor.points.map(point), elevation: finiteNumber(floor.elevation, 0), thickness: positiveNumber(floor.thickness, 100), status: floor.status || "new" }));
  model.foundations = (Array.isArray(model.foundations) ? model.foundations : []).filter((foundation) => foundation && foundation.a && foundation.b).map((foundation) => ({ ...foundation, id: String(foundation.id || uid("foundation")), levelId: levelIds.has(foundation.levelId) ? foundation.levelId : fallbackLevel, a: point(foundation.a), b: point(foundation.b), width: positiveNumber(foundation.width, 450), depth: positiveNumber(foundation.depth, 300), elevation: finiteNumber(foundation.elevation, -600), role: foundation.role === "internal" ? "internal" : "external", status: foundation.status || "preliminary" }));
  normalizeSupports(model, levelIds, fallbackLevel);
  if (typeof normalizeFloorFraming === 'function') normalizeFloorFraming(model);
  if (typeof normalizeFloorFitDetails === 'function') normalizeFloorFitDetails(model);
  if (typeof normalizeStockPlans === 'function') normalizeStockPlans(model);
  if (typeof normalizeConnectorDetails === 'function') normalizeConnectorDetails(model);
  if (typeof normalizeEndCuts === 'function') normalizeEndCuts(model);
  normalizeRoofs(model, levelIds, fallbackLevel);
  normalizeRoofJunctions(model);
  normalizeRoofFraming(model);
  normalizeRooms(model, levelIds, fallbackLevel);
  normalizeStairs(model, levelIds, fallbackLevel);
  normalizeDeckFraming(model);
  normalizeDeckBoards(model);
  normalizeDeckSupportReviews(model);
  normalizeDeckPosts(model);
  normalizeDeckPostMemberReviews(model);
  normalizeDeckEdges(model);
  normalizeDimensions(model);
  normalizeNotes(model);
  normalizeServices(model);
  normalizeSpecifications(model);
  normalizeTakeoffGroups(model);
  normalizeDisciplinePlans(model);
  normalizeSitePlan(model);
  const exampleProject=/Queenslander/i.test(model.name||'')||Boolean(model.metadata?.designInspiration);
  if(exampleProject&&Number(model.metadata?.exampleTakeoffVersion||0)<2){
    model.metadata={...(model.metadata||{}),exampleTakeoffVersion:2};
  }
  if(exampleProject&&Number(model.metadata?.exampleSiteLayoutVersion||0)<5){
    model.metadata={...(model.metadata||{}),exampleSiteLayoutVersion:5};
  }
  ensureExampleSafetyRecords(model);
  ensureExampleFoundationRecords(model);
  ensureExampleHandoverRecords(model);
  model.metadata = { ...(model.metadata || {}), updatedAt: new Date().toISOString() };
  return model;
}

function finiteNumber(value, fallback) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function positiveNumber(value, fallback) { const number = finiteNumber(value, fallback); return number > 0 ? number : fallback; }
function nonNegativeNumber(value, fallback) { const number = finiteNumber(value, fallback); return number >= 0 ? number : fallback; }
function point(value) { return { x: finiteNumber(value.x, 0), y: finiteNumber(value.y, 0) }; }

function activeLevel() { return state.model.levels.find((level) => level.id === state.model.activeLevelId) || state.model.levels[0]; }
function levelName(levelId) { return state.model.levels.find((level) => level.id === levelId)?.name || "Unknown level"; }
function activeWalls() { return state.model.walls.filter((wall) => wall.levelId === state.model.activeLevelId); }
function activeOpenings() { return state.model.openings.filter((opening) => opening.levelId === state.model.activeLevelId); }
function activeDecks() { return state.model.decks.filter((deck) => deck.levelId === state.model.activeLevelId); }
function activeFloors() { return state.model.floors.filter((floor) => floor.levelId === state.model.activeLevelId); }
function activeFoundations() { return state.model.foundations.filter((foundation) => foundation.levelId === state.model.activeLevelId); }
function allPoints({includeAnnotations=true}={}) { return state.model.walls.flatMap((wall) => [wall.a, wall.b]).concat(state.model.decks.flatMap((deck) => deck.points), state.model.floors.flatMap((floor) => floor.points), state.model.foundations.flatMap((foundation) => [foundation.a, foundation.b]), supportBounds(), typeof endCutBounds==='function'?endCutBounds():[], typeof connectorBounds==='function'?connectorBounds():[], roofBounds(), roofFramingBounds(), typeof floorFramingBounds === 'function' ? floorFramingBounds() : [], typeof floorFramingReviewBounds === 'function' ? floorFramingReviewBounds() : [], roomBounds(), stairBounds(), stairMemberBounds(), railEndBounds(), stairRailBounds(), stairCoordinationBounds(), stairHeadroomBounds(), floorOpeningBounds(), deckEdgeBounds(), deckPostMemberBounds(), deckPostBounds(), deckSupportBounds(), deckBoardBounds(), deckFramingBounds(), deckBarrierBounds(), includeAnnotations?(state.model.dimensions||[]).flatMap(d=>{const g=dimensionGeometry(d);return [d.a,d.b,g.a,g.b];}):[], includeAnnotations?buildingPlanNotes().flatMap(n=>[n.a,n.b]):[],serviceBounds(),typeof kitchenBounds==='function'?kitchenBounds():[]); }
function foundationEndpointConnections(foundation, endpoint) { return state.model.foundations.filter((candidate) => candidate.role !== "internal" && candidate.id !== foundation.id && candidate.levelId === foundation.levelId).reduce((count, candidate) => count + (lengthBetween(endpoint, candidate.a) <= 1 ? 1 : 0) + (lengthBetween(endpoint, candidate.b) <= 1 ? 1 : 0), 0); }
function foundationConnectionIssues() { const issues = []; for (const foundation of state.model.foundations.filter((candidate) => candidate.role !== "internal")) { if (!foundationEndpointConnections(foundation, foundation.a)) issues.push({ foundation, endpoint: "start", point: foundation.a }); if (!foundationEndpointConnections(foundation, foundation.b)) issues.push({ foundation, endpoint: "end", point: foundation.b }); } return issues; }

function lengthBetween(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(vector, factor) { return { x: vector.x * factor, y: vector.y * factor }; }
function unit(vector) { const length = Math.hypot(vector.x, vector.y) || 1; return scale(vector, 1 / length); }
function dot(a, b) { return a.x * b.x + a.y * b.y; }
function distanceToSegment(pointValue, a, b) { const segment = sub(b, a); const denominator = dot(segment, segment) || 1; const t = Math.max(0, Math.min(1, dot(sub(pointValue, a), segment) / denominator)); const closest = add(a, scale(segment, t)); return { distance: lengthBetween(pointValue, closest), t, point: closest }; }
function polygonArea(points) { let area = 0; for (let i = 0; i < points.length; i += 1) { const a = points[i]; const b = points[(i + 1) % points.length]; area += a.x * b.y - b.x * a.y; } return Math.abs(area) / 2; }
function formatNumber(value, digits = 2) { return Number(value || 0).toLocaleString("en-AU", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function formatArea(squareMillimetres) { return `${formatNumber(squareMillimetres / 1000000)} m²`; }
function formatLength(millimetres) { return `${formatNumber(millimetres / 1000)} m`; }
function quantityValue(value, unit) { if (unit === "m²") return value / 1000000; if (unit === "m³") return value / 1000000000; return value; }
function formatQuantity(value, unit) { return formatNumber(quantityValue(value, unit), unit === "count" ? 0 : 2); }

function quantityData() {
  let grossWallArea = 0;
  let wallLength = 0;
  for (const wall of state.model.walls) { const length = lengthBetween(wall.a, wall.b); wallLength += length; grossWallArea += length * wall.height; }
  let openingArea = 0;
  for (const opening of state.model.openings) openingArea += opening.width * opening.height;
  const netWallArea = Math.max(0, grossWallArea - openingArea);
  const deckArea = state.model.decks.reduce((sum, deck) => sum + polygonArea(deck.points), 0);
  const floorArea = state.model.floors.reduce((sum, floor) => sum + floorMeasuredGeometry(floor).area, 0);
  const foundationVolume = state.model.foundations.reduce((sum, foundation) => sum + lengthBetween(foundation.a, foundation.b) * foundation.width * foundation.depth, 0);
  const openFoundationPoints = foundationConnectionIssues().length;
  const wallWaste = netWallArea * 0.1;
  const deckWaste = deckArea * 0.1;
  const rows = [
    { label: "Wall surface area", net: netWallArea, waste: wallWaste, order: netWallArea + wallWaste, unit: "m²", basis: `${formatLength(wallLength)} gross wall length less ${formatArea(openingArea)} openings` },
    { label: "Deck surface area", net: deckArea, waste: deckWaste, order: deckArea + deckWaste, unit: "m²", basis: `${state.model.decks.length} deck outline${state.model.decks.length === 1 ? "" : "s"}; support specification required` },
    { label: "Floor slab area", net: floorArea, waste: floorArea * 0.05, order: floorArea * 1.05, unit: "m²", basis: `${state.model.floors.length} floor outline${state.model.floors.length === 1 ? "" : "s"}; ${floorCutReviewSummary()}; build-up specification required` },
    { label: "Foundation concrete", net: foundationVolume, waste: foundationVolume * 0.05, order: foundationVolume * 1.05, unit: "m³", basis: `${state.model.foundations.length} strip foundation${state.model.foundations.length === 1 ? "" : "s"}; structural sizing required` },
    { label: "Unconnected external footing points", net: openFoundationPoints, waste: 0, order: openFoundationPoints, unit: "count", basis: "Every external footing endpoint must connect before perimeter review" },
    { label: "Wall centreline length", net: wallLength / 1000, waste: 0, order: wallLength / 1000, unit: "m", basis: "Measured wall centrelines" },
    { label: "Doors", net: state.model.openings.filter((opening) => opening.type === "door").length, waste: 0, order: state.model.openings.filter((opening) => opening.type === "door").length, unit: "count", basis: "Opening schedule; product selection required" },
    { label: "Windows", net: state.model.openings.filter((opening) => opening.type === "window").length, waste: 0, order: state.model.openings.filter((opening) => opening.type === "window").length, unit: "count", basis: "Opening schedule; product selection required" },
  ];
  rows.push(...supportQuantityRows());
  rows.push(...roofQuantityRows(),...roofFramingQuantityRows());
  rows.push(...roomQuantityRows());
  rows.push(...stairQuantityRows(),...stairRailQuantityRows(),...stairMemberQuantityRows(),...railEndQuantityRows(),...serviceQuantityRows());
  rows.push(...deckEdgeQuantityRows(), ...deckPostQuantityRows(), ...deckBoardQuantityRows(), ...deckFramingQuantityRows(), ...deckBarrierQuantityRows());
  if (typeof floorFramingQuantityRows === 'function') rows.push(...floorFramingQuantityRows());
  if (typeof floorFitQuantityRows === 'function') rows.push(...floorFitQuantityRows());
  if (typeof connectorQuantityRows === 'function') rows.push(...connectorQuantityRows());
  return { grossWallArea, openingArea, netWallArea, deckArea, floorArea, foundationVolume, openFoundationPoints, wallLength, rows, waste: wallWaste + deckWaste + floorArea * 0.05 + foundationVolume * 0.05 };
}

function snapshot() { return clone(state.model); }
function withHistory(mutator) { state.history.push(snapshot()); if (state.history.length > 100) state.history.shift(); state.future = []; mutator(); state.model.metadata.updatedAt = new Date().toISOString(); scheduleSave(); render(); }
function undo() { if (!state.history.length) return; state.serviceDraft=[];state.serviceError=""; state.future.push(snapshot()); state.model = state.history.pop(); state.selected = null; scheduleSave(); render(); }
function redo() { if (!state.future.length) return; state.serviceDraft=[];state.serviceError=""; state.history.push(snapshot()); state.model = state.future.pop(); state.selected = null; scheduleSave(); render(); }

function scheduleSave() {
  els.saveStatus.textContent = "Saving locally…";
  els.saveDot.classList.add("is-saving");
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(persist, 300);
}

function persist() {
  try {
    state.model.name = els.projectName.value.trim() || "Untitled building";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.model));
    els.saveStatus.textContent = "Saved locally";
    els.saveDot.classList.remove("is-saving");
  } catch (error) {
    els.saveStatus.textContent = "Local save unavailable";
    els.saveDot.classList.remove("is-saving");
    console.warn("BC Design could not save locally.", error);
  }
}

function isBlankSavedModel(model) {
  const noGeometry = !model?.walls?.length && !model?.openings?.length && !model?.floors?.length && !model?.decks?.length && !model?.roofs?.length && !model?.rooms?.length && !model?.stairs?.length && !model?.sitePlan?.boundary?.points?.length && !model?.sitePlan?.elements?.length;
  return noGeometry && (model?.name === "Untitled building" || /Queenslander/i.test(model?.name || ""));
}

function isExampleSiteModel(model) {
  return /Queenslander/i.test(model?.name || "") || (model?.sitePlan?.elements || []).some(element => ["pool", "driveway", "landscape", "fence", "gate"].includes(element.type));
}

function restoreSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const restored = normalizeModel(JSON.parse(saved));
    // A valid saved project, including a deliberately empty or renamed example,
    // always wins over the starter example.
    state.showExamplePrompt = false;
    state.model = restored;
    if (isExampleSiteModel(restored)) { state.mode = "site"; state.tool = "select"; state.visibility.siteConcepts = true; state.view.initialized = false; }
    els.projectName.value = state.model.name;
    return true;
  } catch (error) { console.warn("BC Design could not restore the local model.", error); return false; }
}

function resizeCanvas() {
  const bounds = canvasShell.getBoundingClientRect();
  state.width = Math.max(1, bounds.width);
  state.height = Math.max(1, bounds.height);
  state.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  if (!state.view.initialized) fitView();
  render();
}

function sitePlanPoints(){
  const plan=state.model.sitePlan||{};
  return [...(plan.boundary?.points||[]),...(plan.elements||[]).flatMap(element=>element.points||[]),...(plan.elements||[]).flatMap(element=>element.a&&element.b?[element.a,element.b]:[])];
}

function fitSitePlan(){
  state.view.initialized=true;
  const points=sitePlanPoints();
  const minX=points.length?Math.min(...points.map(value=>value.x))-2500:-10000;
  const maxX=points.length?Math.max(...points.map(value=>value.x))+2500:10000;
  const minY=points.length?Math.min(...points.map(value=>value.y))-2500:-10000;
  const maxY=points.length?Math.max(...points.map(value=>value.y))+2500:10000;
  const rail=Math.min(320,Math.max(220,state.width*.3));
  state.view.scale=clamp(Math.min((state.width-rail-70)/Math.max(1000,maxX-minX),(state.height-90)/Math.max(1000,maxY-minY)),.0008,1.2);
  state.view.offsetX=40-minX*state.view.scale;
  state.view.offsetY=45-minY*state.view.scale;
}

function fitView() {
  state.view.initialized = true;
  if (state.mode === "site") { fitSitePlan(); return; }
  if (state.mode === "3d") { fit3d(); return; }
  const points = allPoints();
  const minX = points.length ? Math.min(...points.map((p) => p.x)) - 600 : 0;
  const maxX = points.length ? Math.max(...points.map((p) => p.x)) + 600 : 10000;
  const minY = points.length ? Math.min(...points.map((p) => p.y)) - 600 : 0;
  const maxY = points.length ? Math.max(...points.map((p) => p.y)) + 600 : 7000;
  state.view.scale = clamp(Math.min((state.width - 80) / Math.max(1000, maxX - minX), (state.height - 80) / Math.max(1000, maxY - minY)), 0.025, 1.2);
  state.view.offsetX = 40 - minX * state.view.scale;
  state.view.offsetY = 40 - minY * state.view.scale;
  // Include rendered text, leaders and dimensions, not only model endpoints.
  if(typeof createPlanVectorRecorder==='function'&&state.width>160&&state.height>160){
    const live=ctx;
    try{for(let pass=0;pass<4;pass++){const recorder=createPlanVectorRecorder(live);ctx=recorder;renderPlan({grid:false});const b=recorder.result().bounds;if(!b)break;const factor=Math.min(1,(state.width-90)/Math.max(1,b.maxX-b.minX),(state.height-90)/Math.max(1,b.maxY-b.minY));state.view.scale*=factor;state.view.offsetX=state.width/2+(state.view.offsetX-(b.minX+b.maxX)/2)*factor;state.view.offsetY=state.height/2+(state.view.offsetY-(b.minY+b.maxY)/2)*factor;if(factor>.999&&pass>0)break;}}
    catch(error){state.statusMessage='Fit uses model bounds: '+error.message;}finally{ctx=live;}
  }
}

function fit3d() {
  state.view.orbitYaw = -Math.PI / 4;
  state.view.orbitPitch = 0.53;
  const points = [...allPoints({includeAnnotations:false}), ...(state.view.walkthroughScope === 'site' ? siteWalkthroughPoints3d() : [])];
  const heights = [0, ...state.model.walls.flatMap((wall) => { const base = state.model.levels.find((level) => level.id === wall.levelId)?.elevation || 0; return [base, base + wall.height]; }), ...foundationMembers().flatMap(({ item }) => [item.elevation, item.elevation + item.depth]), ...state.model.floors.map((item) => item.elevation), ...state.model.decks.map((item) => item.elevation)];
  if(typeof kitchenBounds==='function')heights.push(...kitchenBounds().map(p=>p.z));
  if(typeof connectorBounds==='function')heights.push(...connectorBounds().map(p=>p.z));
  if(typeof endCutBounds==='function')heights.push(...endCutBounds().map(p=>p.z));
  heights.push(...deckEdgeBounds().map(p=>p.z),...deckPostMemberBounds().map(p=>p.z),...deckPostBounds().map(p=>p.z),...deckSupportBounds().map(p=>p.z),...deckBoardBounds().map(p=>p.z),...stairMemberBounds().map(p=>p.z),...railEndBounds().map(p=>p.z),...stairHeadroomBounds().map(p=>p.z),...floorOpeningBounds().map(p=>p.z).filter(Number.isFinite),...stairCoordinationBounds().map(p=>p.z),...stairRailBounds().map(p=>p.z),...roofHeights(),...roofFramingBounds().map(p=>p.z));
  heights.push(...state.model.rooms.map((room) => state.model.levels.find((level) => level.id === room.levelId)?.elevation || 0));
  heights.push(...state.model.stairs.flatMap((stair) => { const geometry = stairGeometry(stair); return [stair.elevation, ...geometry.flights.flatMap((flight) => [flight.elevation, flight.top]), ...(geometry.landing ? [geometry.landing.top, geometry.landing.top - (geometry.landing.thickness || 0)] : [])]; }));
  heights.push(...state.model.decks.flatMap(d => (d.members || []).flatMap(m => [m.elevation, m.elevation + m.depth])));
  heights.push(...deckBarrierBounds().map(p => p.z),...serviceBounds().map(p=>p.z));
  const minZ = Math.min(...heights), maxZ = Math.max(...heights);
  const projected = (points.length ? points : [{ x: 0, y: 0 }, { x: 10000, y: 8000 }]).flatMap((p) => [minZ, maxZ].map((z) => project3dCoordinates(p, z, 1)));
  const minX = Math.min(...projected.map((p) => p.x)), maxX = Math.max(...projected.map((p) => p.x));
  const minY = Math.min(...projected.map((p) => p.y)), maxY = Math.max(...projected.map((p) => p.y));
  state.view.isoScale = clamp(Math.min((state.width - 100) / Math.max(1000, maxX - minX), (state.height - 100) / Math.max(1000, maxY - minY)), .002, .35);
  state.view.orbitX = -(minX + maxX) / 2 * state.view.isoScale;
  state.view.orbitY = state.height * .2 - (minY + maxY) / 2 * state.view.isoScale;
}

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function worldToScreen(pointValue) { return { x: pointValue.x * state.view.scale + state.view.offsetX, y: pointValue.y * state.view.scale + state.view.offsetY }; }
function screenToWorld(x, y) { return { x: (x - state.view.offsetX) / state.view.scale, y: (y - state.view.offsetY) / state.view.scale }; }
function eventPoint(event) { const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; }

function snapPoint(value, origin) {
  let result = { x: Math.round(value.x / 100) * 100, y: Math.round(value.y / 100) * 100 };
  const candidates = state.model.walls.flatMap((wall) => [wall.a, wall.b]).concat(state.model.foundations.flatMap((foundation) => [foundation.a, foundation.b]));
  candidates.push(...[...state.model.pads, ...state.model.piers].filter((item) => item.levelId === state.model.activeLevelId).map((item) => item.center));
  candidates.push(...state.model.rooms.filter((room) => room.levelId === state.model.activeLevelId).flatMap((room) => room.points));
  for (const candidate of candidates) if (lengthBetween(candidate, result) < 130) result = { ...candidate };
  if (origin) {
    if (Math.abs(result.x - origin.x) < 130) result.x = origin.x;
    if (Math.abs(result.y - origin.y) < 130) result.y = origin.y;
  }
  return result;
}

function clearCanvas() { ctx.clearRect(0, 0, state.width, state.height); ctx.fillStyle = "#fbfcfb"; ctx.fillRect(0, 0, state.width, state.height); }

function render() {
  clearCanvas();
  if (state.mode === "3d") render3d(); else if(state.mode === "site") renderSitePlan(); else renderPlan();
  renderUi();
}

function siteElementColour(type){return {boundary:'#167a7c','boundary-fence':'#54735a',landscape:'#5e8664',house:'#1c6243',veranda:'#a66b39',pool:'#137b9a','pool-wall':'#865d43','pool-coping':'#b68a4a','pool-drainage':'#1b9aaa','pool-deck':'#a66b39','screw-piers':'#4d6166','pool-fence':'#2e9ab1',barrier:'#2e9ab1','pool-pump':'#627a79',shed:'#a66b39',fence:'#8e633e',driveway:'#66727a',gate:'#0d6d78',planting:'#6b995e',orchard:'#4f8b4d',tree:'#2f7b4f'}[type]||'#344d43';}
function siteScreenBounds(){
  const points=state.model.sitePlan?.boundary?.points||sitePlanPoints();
  const screens=points.map(worldToScreen);
  if(!screens.length)return {left:40,right:state.width-40,top:40,bottom:state.height-40};
  return {left:Math.min(...screens.map(value=>value.x)),right:Math.max(...screens.map(value=>value.x)),top:Math.min(...screens.map(value=>value.y)),bottom:Math.max(...screens.map(value=>value.y))};
}
function drawSitePolygon(points,fill,stroke,dash=[]){
  if(!points||points.length<2)return;
  const screens=points.map(worldToScreen);ctx.save();ctx.beginPath();ctx.moveTo(screens[0].x,screens[0].y);for(const value of screens.slice(1))ctx.lineTo(value.x,value.y);if(points.length>2)ctx.closePath();ctx.fillStyle=fill;if(points.length>2)ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.setLineDash(dash);ctx.stroke();ctx.restore();
}
function siteRenderElements(elements){
  const order={'landscape':0,'driveway':1,'boundary-fence':2,'house':3,'veranda':3,'pool-deck':4,'screw-piers':5,'pool':6,'pool-wall':7,'pool-coping':8,'pool-drainage':9,'pool-fence':10,'pool-pump':11,'planting':12,'tree':13};
  return [...elements].sort((a,b)=>(order[a.type]??3)-(order[b.type]??3));
}
function drawSitePierMarkers(points,colour){
  if(!points||points.length<3)return;
  const minX=Math.min(...points.map(pointValue=>pointValue.x)),maxX=Math.max(...points.map(pointValue=>pointValue.x)),minY=Math.min(...points.map(pointValue=>pointValue.y)),maxY=Math.max(...points.map(pointValue=>pointValue.y)),perimeter=2*((maxX-minX)+(maxY-minY)),count=44;
  const pointAt=(distance)=>{let d=((distance%perimeter)+perimeter)%perimeter;if(d<=maxX-minX)return{x:minX+d,y:minY};d-=maxX-minX;if(d<=maxY-minY)return{x:maxX,y:minY+d};d-=maxY-minY;if(d<=maxX-minX)return{x:maxX-d,y:maxY};return{x:minX,y:maxY-(d-(maxX-minX))};};
  ctx.save();ctx.fillStyle=colour;for(let index=0;index<count;index++){const screen=worldToScreen(pointAt(perimeter*index/count));ctx.beginPath();ctx.arc(screen.x,screen.y,3,0,Math.PI*2);ctx.fill();}ctx.restore();
}
function drawSiteTree(points,colour){
  if(!points||points.length<2)return;
  const screens=points.map(worldToScreen),minX=Math.min(...screens.map(value=>value.x)),maxX=Math.max(...screens.map(value=>value.x)),minY=Math.min(...screens.map(value=>value.y)),maxY=Math.max(...screens.map(value=>value.y)),cx=(minX+maxX)/2,cy=(minY+maxY)/2,r=Math.max(4,Math.min(14,Math.max(maxX-minX,maxY-minY)/2));
  ctx.save();ctx.fillStyle='rgba(47,123,79,.28)';ctx.strokeStyle=colour;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#795548';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx,cy+r*.55);ctx.lineTo(cx,cy+r+4);ctx.stroke();ctx.restore();
}
function siteAnnotationBox(anchor,lines,index,total){
  ctx.save();ctx.font='9px Segoe UI';const width=Math.min(210,Math.max(150,...lines.map(annotationTextWidth),0)+14),height=lines.length*12+10;ctx.restore();
  const bounds=siteScreenBounds(),rightX=bounds.right+18,leftX=bounds.left-width-18,canRight=rightX+width<=state.width-8,canLeft=leftX>=8;
  let side=canRight?'right':canLeft?'left':'bottom',x,y;
  if(side==='right'){
    x=rightX;y=clamp(42+index*(height+6),8,state.height-height-8);
  }else if(side==='left'){
    x=leftX;y=clamp(42+index*(height+6),8,state.height-height-8);
  }else{
    const columns=Math.max(1,Math.min(3,Math.floor((state.width-16)/(width+8)))),column=index%columns,row=Math.floor(index/columns);
    x=clamp(8+column*(width+8),8,state.width-width-8);y=clamp(bounds.bottom+14+row*(height+6),8,state.height-height-8);
  }
  return {x,y,width,height,left:x,right:x+width,top:y,bottom:y+height,side,font:9,lineHeight:12,lines};
}
function drawSitePlan(){
  const plan=state.model.sitePlan||{};const boundary=plan.boundary?.points||[];if(!boundary.length){ctx.fillStyle='#61766b';ctx.font='13px Segoe UI';ctx.fillText('No site concept geometry recorded',24,34);return;}
  if(state.visibility.siteConcepts===false){ctx.fillStyle='#61766b';ctx.font='13px Segoe UI';ctx.fillText('Site concept overlays are hidden. Turn on Site concept overlays in Layers.',24,34);return;}
  ctx.save();ctx.fillStyle='rgba(89,196,213,.035)';ctx.strokeStyle='#167a7c';ctx.lineWidth=2;ctx.setLineDash([10,6]);const boundaryScreen=boundary.map(worldToScreen);ctx.beginPath();ctx.moveTo(boundaryScreen[0].x,boundaryScreen[0].y);for(const value of boundaryScreen.slice(1))ctx.lineTo(value.x,value.y);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  const elements=siteRenderElements(plan.elements||[]);
  for(const element of elements){const colour=siteElementColour(element.type);if(element.type==='landscape'){drawSitePolygon(element.points,'rgba(94,134,100,.08)',colour,[7,5]);continue;}if(element.type==='boundary-fence'){drawSitePolygon(element.points,'rgba(0,0,0,0)',colour,[9,4]);continue;}if(element.type==='planting'){drawSitePolygon(element.points,'rgba(107,153,94,.22)',colour,[2,3]);continue;}if(element.type==='orchard'){drawSitePolygon(element.points,'rgba(79,139,77,.18)',colour,[5,3]);continue;}if(element.type==='tree'){drawSiteTree(element.points,colour);continue;}if(element.type==='driveway'){drawSitePolygon(element.points,'rgba(102,114,122,.23)',colour,[3,3]);continue;}if(element.type==='house'){drawSitePolygon(element.points,'rgba(28,98,67,.18)',colour,[]);continue;}if(element.type==='veranda'){drawSitePolygon(element.points,'rgba(181,138,76,.16)',colour,[3,3]);continue;}if(element.type==='pool-deck'){drawSitePolygon(element.points,'rgba(181,138,76,.22)',colour,[3,3]);continue;}if(element.type==='pool-wall'){drawSitePolygon(element.points,'rgba(134,93,67,.18)',colour,[]);continue;}if(element.type==='pool-coping'){drawSitePolygon(element.points,'rgba(182,138,74,.2)',colour,[2,2]);continue;}if(element.type==='pool-drainage'){drawSitePolygon(element.points,'rgba(27,154,170,.08)',colour,[2,3]);continue;}if(element.type==='screw-piers'){drawSitePolygon(element.points,'rgba(77,97,102,.05)',colour,[4,3]);drawSitePierMarkers(element.points,colour);continue;}if(element.type==='pool-pump'){drawSitePolygon(element.points,'rgba(98,122,121,.18)',colour,[]);continue;}if(element.type==='pool'){drawSitePolygon(element.points,'rgba(19,123,154,.3)',colour,[]);continue;}if(element.type==='pool-fence'||element.type==='barrier'){drawSitePolygon(element.points,'rgba(0,0,0,0)',colour,[4,4]);continue;}if(element.type==='shed'){drawSitePolygon(element.points,'rgba(166,107,57,.2)',colour,[]);continue;}if(element.type==='fence'){drawSitePolygon(element.points,'rgba(0,0,0,0)',colour,[6,4]);continue;}if(element.type==='gate'&&element.a&&element.b){const a=worldToScreen(element.a),b=worldToScreen(element.b);ctx.save();ctx.strokeStyle=colour;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();}}
  const labels=[
    {anchor:boundary[0],text:'SITE BOUNDARY\n5 ha · 250,000 × 200,000 mm\n≈ 900 m fence concept'},
    {anchor:elements.find(element=>element.type==='house')?.points?.[1]||{x:9000,y:8500},text:'HOUSE + VERANDA\n3 bedrooms · 2 bathrooms\nQueenslander concept'},
    {anchor:elements.find(element=>element.type==='pool')?.points?.[2]||{x:82000,y:58000},text:'POOL + DECK\n10,000 × 6,000 mm · 60 m² water\nWall · coping · drain · piers · fence · pump'},
    {anchor:elements.find(element=>element.type==='driveway')?.points?.[3]||{x:180000,y:173000},text:'DRIVEWAY + SHED\n6,000 mm concept lane to 10,000 × 8,000 mm shed\nGate, falls, joints and drainage to design'},
    {anchor:elements.find(element=>element.type==='landscape')?.points?.[2]||{x:238000,y:188000},text:'LANDSCAPE SYSTEM\nLawn · planting · orchard · trees · irrigation\nSpecies, roots, levels and services to confirm'}
  ];
  ctx.save();ctx.fillStyle='#203b2b';ctx.font='12px Segoe UI';ctx.textAlign='left';ctx.fillText('SITE CONCEPT PLAN · PRELIMINARY',16,22);ctx.restore();
  labels.forEach((label,index)=>{const anchor=worldToScreen(label.anchor),lines=annotationTextLines(label.text,190),types=['boundary','house','pool','driveway','landscape'];drawAnnotationBox(anchor,siteAnnotationBox(anchor,lines,index,labels.length),siteElementColour(types[index]),true);});
  ctx.save();ctx.fillStyle='#49655a';ctx.font='9px Segoe UI';ctx.textAlign='left';ctx.fillText('Layers represented: boundary fence · gate · pool wall · coping · drainage · deck · screw piers · pump enclosure · safety barrier · planting · orchard · trees.',16,state.height-26);ctx.fillText('Concept geometry only · confirm survey, easements, setbacks, levels, approvals and professional design.',16,state.height-14);ctx.restore();
}

function renderSitePlan(){
  if(!state.view.initialized) fitSitePlan();
  drawSitePlan();
}

function renderPlan({grid=state.planGridVisible,respectPlanDisplay=true}={}) {
  const originalVisibility = state.visibility;
  const readable = respectPlanDisplay && state.planDisplayMode === 'readable';
  if (readable) state.visibility = Object.fromEntries(Object.entries(originalVisibility).map(([key, visible]) => [key, visible && READABLE_PLAN_LAYERS.has(key)]));
  try {
  if(grid) drawGrid();
  if (state.visibility.foundations) for (const foundation of activeFoundations()) drawFoundation(foundation, state.selected?.type === "foundation" && state.selected.id === foundation.id);
  if (state.visibility.floors) for (const floor of activeFloors()) drawFloor(floor, state.selected?.type === "floor" && state.selected.id === floor.id);
  if (state.visibility.decks) for (const deck of activeDecks()) drawDeck(deck, state.selected?.type === "deck" && state.selected.id === deck.id);
  drawRoomsPlan();
  if (typeof drawFloorFraming === 'function') drawFloorFraming();
  if (typeof drawFloorSupportReviews === 'function') drawFloorSupportReviews();
  drawStairsPlan();
  drawStairCoordination("plan");
  drawStairHeadroom("plan");
  drawStairMembers("plan"); drawRailEnds("plan");
  drawStairRails("plan");
  drawDeckFraming();
  drawDeckBoards();
  drawDeckBarriers();
  drawDeckSupports();
  if (state.visibility.walls) for (const wall of activeWalls()) drawWall(wall, state.selected?.type === "wall" && state.selected.id === wall.id);
  if (state.visibility.openings) for (const opening of activeOpenings()) drawOpening(opening, state.selected?.type === "opening" && state.selected.id === opening.id);
  drawSupportsPlan();
  drawDeckPosts();
  drawDeckEdges();
  drawRoofsPlan();
  drawJoinedRoofs();
  drawRoofDraft();
  drawRoomDraft();
  drawStairDraft();
  drawNotesPlan();
  drawServices();
  drawRoofJunctions();
  drawRoofValleys();
  drawRoofFraming();
  drawFloorOpenings("plan");
  drawDeckPostFootings();
  drawDeckPostMembers();
  drawServiceDraft();
  if(["dimension","note","service"].includes(state.drawing?.kind)) drawDraftWall(state.drawing.start,state.drawing.current);
  if (state.drawing?.kind === "foundation") drawDraftWall(state.drawing.start, state.drawing.current);
  if (state.drawing?.kind === "wall") drawDraftWall(state.drawing.start, state.drawing.current);
  if (state.deckDraft.length) drawDraftDeck();
  if (state.floorDraft.length) drawDraftFloor();
  if(typeof drawKitchen==='function')drawKitchen();
  drawPlanLabels();
  drawDimensionsPlan();
  if(typeof drawFoundationSetout==='function')drawFoundationSetout();
  if(typeof drawConnectors==='function')drawConnectors();
  if(typeof drawEndCuts==='function')drawEndCuts();
  } finally {
    state.visibility = originalVisibility;
  }
}

function drawGrid() {
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(state.width, state.height);
  const startX = Math.floor(topLeft.x / GRID_MINOR) * GRID_MINOR;
  const endX = Math.ceil(bottomRight.x / GRID_MINOR) * GRID_MINOR;
  const startY = Math.floor(topLeft.y / GRID_MINOR) * GRID_MINOR;
  const endY = Math.ceil(bottomRight.y / GRID_MINOR) * GRID_MINOR;
  ctx.save();
  ctx.lineWidth = 1;
  for (let x = startX; x <= endX; x += GRID_MINOR) { const major = Math.abs(x % GRID_MAJOR) < 1; const screen = worldToScreen({ x, y: 0 }); ctx.strokeStyle = major ? "#dfe8e1" : "#edf2ee"; ctx.beginPath(); ctx.moveTo(screen.x, 0); ctx.lineTo(screen.x, state.height); ctx.stroke(); }
  for (let y = startY; y <= endY; y += GRID_MINOR) { const major = Math.abs(y % GRID_MAJOR) < 1; const screen = worldToScreen({ x: 0, y }); ctx.strokeStyle = major ? "#dfe8e1" : "#edf2ee"; ctx.beginPath(); ctx.moveTo(0, screen.y); ctx.lineTo(state.width, screen.y); ctx.stroke(); }
  ctx.fillStyle = "#a7b5ac"; ctx.font = "9px Segoe UI"; ctx.fillText("N", 12, 20); ctx.strokeStyle = "#91a99a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, 45); ctx.lineTo(18, 27); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, 27); ctx.lineTo(14, 34); ctx.moveTo(18, 27); ctx.lineTo(22, 34); ctx.stroke();
  ctx.restore();
}

function drawWall(wall, selected) {
  const a = worldToScreen(wall.a); const b = worldToScreen(wall.b);
  ctx.save(); ctx.lineCap = "butt"; ctx.lineJoin = "round"; ctx.strokeStyle = selected ? "#ed1c24" : "#214b37"; ctx.lineWidth = Math.max(2, wall.thickness * state.view.scale); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = selected ? "rgba(237,28,36,.25)" : "rgba(255,255,255,.34)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
}

// These labels derive from the current model; they never become saved geometry.
function planMeasureNumber(n) { return Number(n.toFixed(1)).toLocaleString('en-AU'); }
function roomPlanSize(room) {
  const points=room.points,edges=points.map((p,i)=>sub(points[(i+1)%points.length],p)),lengths=edges.map(e=>Math.hypot(e.x,e.y));
  const rectangle=points.length===4&&lengths.every(n=>n>0)&&edges.every((e,i)=>Math.abs(e.x*edges[(i+1)%4].x+e.y*edges[(i+1)%4].y)<=lengths[i]*lengths[(i+1)%4]*1e-9);
  return rectangle?`Zone ${planMeasureNumber(lengths[0])} × ${planMeasureNumber(lengths[1])} mm`:`Zone perimeter ${planMeasureNumber(lengths.reduce((a,b)=>a+b,0))} mm`;
}
function planMeasurementLabels() {
  const result=[],level=state.model.activeLevelId,sizes=state.visibility.planSizes!==false;
  if(state.visibility.rooms)for(const room of state.model.rooms.filter(r=>r.levelId===level))result.push({kind:'room',id:room.id,anchor:roomLabelPoint(room),lines:[room.name,formatArea(polygonArea(room.points)),...(sizes?[roomPlanSize(room)]:[])],colour:'#20342a'});
  if(!sizes)return result;
  if(state.visibility.openings)for(const opening of activeOpenings()){
    const wall=state.model.walls.find(w=>w.id===opening.wallId&&w.levelId===level);if(!wall)continue;
    const d=unit(sub(wall.b,wall.a));result.push({kind:'opening',id:opening.id,anchor:add(wall.a,scale(d,opening.offset+opening.width/2)),normal:{x:-d.y,y:d.x},lines:[`${opening.type==='door'?'Door':'Window'} ${planMeasureNumber(opening.width)} mm`],colour:opening.type==='door'?'#815016':'#245f80'});
  }
  if(state.visibility.walls)for(const wall of activeWalls()){
    const d=unit(sub(wall.b,wall.a));result.push({kind:'wall',id:wall.id,anchor:scale(add(wall.a,wall.b),.5),normal:{x:d.y,y:-d.x},lines:[`${planMeasureNumber(lengthBetween(wall.a,wall.b))} mm CL`],colour:'#344d43'});
  }
  return result;
}
function planLabelLayout() {
  const occupied=[],placed=[];
  for(const label of planMeasurementLabels()){
    const anchor=worldToScreen(label.anchor);let lines=[...label.lines],font=11;
    if(label.kind==='room'){
      const room=state.model.rooms.find(r=>r.id===label.id),points=room.points.map(worldToScreen);
      const availableWidth=Math.max(25,Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))-8),availableHeight=Math.max(20,Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))-8);
      lines=lines.map(l=>l.replace(/^Zone /,''));font=10;ctx.font=font+'px Segoe UI';
      lines=lines.flatMap(l=>{if(ctx.measureText(l).width<=availableWidth)return [l];const split=l.includes(' × ')?l.replace(' × ',' ×|'):l.replace(' ','|');return split.split('|');});
      if(lines.length*12+4>availableHeight)lines=lines.filter(l=>!l.includes('m²'));
      if(lines.length*12+4>availableHeight)lines=[room.name];
      font=Math.max(8,Math.min(font,10*availableWidth/Math.max(...lines.map(l=>ctx.measureText(l).width))));
    }else{
      if(label.kind==='wall'&&lengthBetween(...['a','b'].map(k=>state.model.walls.find(w=>w.id===label.id)[k]))*state.view.scale<190&&state.selected?.id!==label.id)continue;
      if(label.kind==='opening')lines=lines.map(l=>l.replace('Door ','D ').replace('Window ','W ').replace(' mm',''));
      font=10;
    }
    ctx.font=font+'px Segoe UI';const width=Math.max(...lines.map(t=>ctx.measureText(t).width))+6,lineHeight=font+2,height=lines.length*lineHeight+4,normal=label.normal||{x:0,y:1};
    const candidates=label.kind==='room'?[anchor]:[];
    if(label.kind!=='room')for(const distance of [12,24,36,48])for(const sign of [1,-1])for(const along of [0,18,-18])candidates.push({x:anchor.x+normal.x*distance*sign-normal.y*along,y:anchor.y+normal.y*distance*sign+normal.x*along});
    const boxes=candidates.map(p=>({...p,left:p.x-width/2,right:p.x+width/2,top:p.y-height/2,bottom:p.y+height/2}));
    const overlaps=b=>occupied.some(o=>b.left<o.right+3&&b.right>o.left-3&&b.top<o.bottom+3&&b.bottom>o.top-3);
    const box=label.kind==='room'?boxes[0]:boxes.find(b=>!overlaps(b));
    // Crowded secondary sizes appear as the user zooms in; room labels stay in their zones.
    if(!box)continue;occupied.push(box);placed.push({...label,anchor,lines,font,lineHeight,width,height,box});
  }
  return placed;
}
function drawPlanLabels() {
  ctx.save();ctx.lineWidth=.7;ctx.lineJoin='round';ctx.textAlign='center';
  const labels=planLabelLayout();
  for(const l of labels)if(l.kind!=='room'){ctx.strokeStyle=l.colour;ctx.beginPath();ctx.moveTo(l.anchor.x,l.anchor.y);ctx.lineTo(l.box.x,l.box.y);ctx.stroke();}
  for(const l of labels){ctx.font=l.font+'px Segoe UI';ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(l.box.left,l.box.top,l.width,l.height);ctx.strokeStyle='rgba(111,137,121,.42)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(l.box.left,l.box.top);ctx.lineTo(l.box.right,l.box.top);ctx.lineTo(l.box.right,l.box.bottom);ctx.lineTo(l.box.left,l.box.bottom);ctx.closePath();ctx.stroke();ctx.fillStyle=l.colour;l.lines.forEach((line,i)=>ctx.fillText(line,l.box.x,l.box.top+l.font+1+i*l.lineHeight));}
  ctx.restore();
}

function openingPlanGeometry(opening,wall) {
  const direction=unit(sub(wall.b,wall.a)),normal={x:-direction.y,y:direction.x};
  const start=add(wall.a,scale(direction,opening.offset)),end=add(start,scale(direction,opening.width));
  const hinge=add(start,scale(normal,wall.thickness/2));
  return {direction,normal,start,end,hinge,leaf:add(hinge,scale(normal,opening.width)),angle:Math.atan2(direction.y,direction.x)};
}

function drawOpening(opening, selected) {
  const wall = state.model.walls.find((candidate) => candidate.id === opening.wallId); if (!wall) return;
  const direction = unit(sub(wall.b, wall.a)); const normal = { x: -direction.y, y: direction.x }; const centre = add(wall.a, scale(direction, opening.offset + opening.width / 2)); const start = add(centre, scale(direction, -opening.width / 2)); const end = add(centre, scale(direction, opening.width / 2)); const a = worldToScreen(start); const b = worldToScreen(end); const thickness = Math.max(6, wall.thickness * state.view.scale + 5);
  ctx.save(); ctx.lineCap = "butt"; ctx.strokeStyle = "#fbfcfb"; ctx.lineWidth = thickness; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = selected ? "#ed1c24" : opening.type === "door" ? "#bd7a22" : "#397ca0"; ctx.lineWidth = selected ? 3 : 2;
  const geometry=openingPlanGeometry(opening,wall);
  if(opening.type==='door'&&opening.operation==='sliding') {
    const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};ctx.beginPath();ctx.moveTo(a.x-normal.x*2,a.y-normal.y*2);ctx.lineTo(middle.x+direction.x*8-normal.x*2,middle.y+direction.y*8-normal.y*2);ctx.moveTo(middle.x-direction.x*8+normal.x*2,middle.y-direction.y*8+normal.y*2);ctx.lineTo(b.x+normal.x*2,b.y+normal.y*2);ctx.stroke();
  } else if(opening.type==='door'&&opening.operation==='passage') {
    ctx.beginPath();for(const p of [a,b]){ctx.moveTo(p.x-normal.x*thickness/2,p.y-normal.y*thickness/2);ctx.lineTo(p.x+normal.x*thickness/2,p.y+normal.y*thickness/2);}ctx.stroke();
  } else if(opening.type==='door') {
    const hinge=worldToScreen(geometry.hinge),leaf=worldToScreen(geometry.leaf);
    ctx.beginPath();ctx.moveTo(hinge.x,hinge.y);ctx.lineTo(leaf.x,leaf.y);ctx.stroke();
    ctx.beginPath();ctx.arc(hinge.x,hinge.y,opening.width*state.view.scale,geometry.angle,geometry.angle+Math.PI/2);ctx.stroke();
  } else {
    ctx.beginPath();for(const offset of [-3,3]){ctx.moveTo(a.x+normal.x*offset,a.y+normal.y*offset);ctx.lineTo(b.x+normal.x*offset,b.y+normal.y*offset);}ctx.stroke();
  }
  ctx.restore();
}

function drawDeck(deck, selected) {
  if (deck.points.length < 3) return; const points = deck.points.map(worldToScreen); ctx.save(); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const pointValue of points.slice(1)) ctx.lineTo(pointValue.x, pointValue.y); ctx.closePath(); ctx.fillStyle = selected ? "rgba(237,28,36,.18)" : "rgba(72, 142, 101, .17)"; ctx.fill(); ctx.strokeStyle = selected ? "#ed1c24" : "#4c8b62"; ctx.lineWidth = selected ? 3 : 2; ctx.stroke(); ctx.strokeStyle = selected ? "rgba(237,28,36,.4)" : "rgba(28,98,67,.24)"; ctx.lineWidth = 1; if (!deck.boards?.enabled) for (let i = 1; i < 10; i += 1) { const t = i / 10; const left = { x: deck.points[0].x + (deck.points[3]?.x - deck.points[0].x || 0) * t, y: deck.points[0].y + (deck.points[3]?.y - deck.points[0].y || 0) * t }; const right = { x: deck.points[1].x + (deck.points[2]?.x - deck.points[1].x || 0) * t, y: deck.points[1].y + (deck.points[2]?.y - deck.points[1].y || 0) * t }; const a = worldToScreen(left); const b = worldToScreen(right); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } ctx.restore();
}

function drawFloor(floor, selected) {
  if(drawCutFloor(floor,selected))return;
  if (floor.points.length < 3) return; const points = floor.points.map(worldToScreen); ctx.save(); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const pointValue of points.slice(1)) ctx.lineTo(pointValue.x, pointValue.y); ctx.closePath(); ctx.fillStyle = selected ? "rgba(237,28,36,.12)" : "rgba(190, 154, 93, .14)"; ctx.fill(); ctx.strokeStyle = selected ? "#ed1c24" : "#b58a4c"; ctx.lineWidth = selected ? 3 : 1.5; ctx.setLineDash(selected ? [] : [5, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
}

function drawFoundation(foundation, selected) { const direction = unit(sub(foundation.b, foundation.a)); const normal = { x: -direction.y, y: direction.x }; const half = foundation.width / 2; const points = [add(foundation.a, scale(normal, -half)), add(foundation.b, scale(normal, -half)), add(foundation.b, scale(normal, half)), add(foundation.a, scale(normal, half))].map(worldToScreen); ctx.save(); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const pointValue of points.slice(1)) ctx.lineTo(pointValue.x, pointValue.y); ctx.closePath(); ctx.fillStyle = selected ? "rgba(128,99,154,.35)" : "rgba(128,99,154,.16)"; ctx.fill(); ctx.strokeStyle = selected ? "#ed1c24" : "#80639a"; ctx.lineWidth = selected ? 3 : 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); if (foundation.role !== "internal") { for (const endpoint of [foundation.a, foundation.b]) if (!foundationEndpointConnections(foundation, endpoint)) { const screen = worldToScreen(endpoint); ctx.fillStyle = "#ed1c24"; ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(screen.x, screen.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } } ctx.restore(); }

function drawDraftWall(start, current) { if (!start || !current) return; const a = worldToScreen(start); const b = worldToScreen(current); ctx.save(); ctx.strokeStyle = "#ed1c24"; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = "#9f2428"; ctx.font = "11px Segoe UI"; ctx.fillText(`${formatLength(lengthBetween(start, current))}`, b.x + 8, b.y - 8); ctx.restore(); }
function drawDraftDeck() { const points = state.deckDraft.map(worldToScreen); ctx.save(); ctx.strokeStyle = "#ed1c24"; ctx.fillStyle = "rgba(237,28,36,.12)"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const pointValue of points.slice(1)) ctx.lineTo(pointValue.x, pointValue.y); ctx.stroke(); if (points.length > 2) { ctx.lineTo(points[0].x, points[0].y); ctx.fill(); } ctx.setLineDash([]); for (const pointValue of points) { ctx.fillStyle = "white"; ctx.strokeStyle = "#ed1c24"; ctx.beginPath(); ctx.arc(pointValue.x, pointValue.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.restore(); }
function drawDraftFloor() { const points = state.floorDraft.map(worldToScreen); if (!points.length) return; ctx.save(); ctx.strokeStyle = "#b58a4c"; ctx.fillStyle = "rgba(181,138,76,.12)"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const pointValue of points.slice(1)) ctx.lineTo(pointValue.x, pointValue.y); ctx.stroke(); if (points.length > 2) { ctx.lineTo(points[0].x, points[0].y); ctx.fill(); } ctx.setLineDash([]); for (const pointValue of points) { ctx.fillStyle = "white"; ctx.strokeStyle = "#b58a4c"; ctx.beginPath(); ctx.arc(pointValue.x, pointValue.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.restore(); }

function project3dCoordinates(pointValue, z, scale=1) {
  const yaw=Number.isFinite(state.view.orbitYaw)?state.view.orbitYaw:-Math.PI/4;
  const pitch=clamp(Number.isFinite(state.view.orbitPitch)?state.view.orbitPitch:.53,.18,1.3);
  const right=pointValue.x*Math.cos(yaw)+pointValue.y*Math.sin(yaw);
  const depth=-pointValue.x*Math.sin(yaw)+pointValue.y*Math.cos(yaw);
  return {x:right*scale*.778,y:(depth*scale*.78*Math.sin(pitch))-(z*scale*.814*Math.cos(pitch))};
}
function isoPoint(pointValue, z) { const projected=project3dCoordinates(pointValue,z,state.view.isoScale); return { x: state.width / 2 + projected.x + state.view.orbitX, y: state.height * .3 + projected.y + state.view.orbitY }; }
function polygon(points, fill, stroke) { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const pointValue of points.slice(1)) ctx.lineTo(pointValue.x, pointValue.y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
function siteModelOffset() {
  const floor=state.model.floors.find(item=>item.id==='floor-house')||state.model.floors[0],house=(state.model.sitePlan?.elements||[]).find(item=>item.id==='site-house');
  if(!floor?.points?.length||!house?.points?.length)return {x:0,y:0};
  return {x:Math.min(...house.points.map(pointValue=>pointValue.x))-Math.min(...floor.points.map(pointValue=>pointValue.x)),y:Math.min(...house.points.map(pointValue=>pointValue.y))-Math.min(...floor.points.map(pointValue=>pointValue.y))};
}
function siteTo3dPoint(pointValue) { const offset=siteModelOffset(); return {x:pointValue.x-offset.x,y:pointValue.y-offset.y}; }
function site3dElementPoints(element) { return (element?.points||[]).map(siteTo3dPoint); }
function siteWalkthroughPoints3d() {
  const plan=state.model.sitePlan||{},points=[];
  const allSiteGeometry=state.view.presentationSite===true;
  const focusTypes=new Set(['house','veranda','pool','pool-wall','pool-coping','pool-drainage','pool-deck','screw-piers','pool-fence','pool-pump']);
  const elements=(plan.elements||[]).filter(element=>allSiteGeometry||focusTypes.has(element.type));
  if(allSiteGeometry&&plan.boundary?.points?.length)points.push(...plan.boundary.points.map(siteTo3dPoint));
  for(const element of elements){points.push(...site3dElementPoints(element));if(element.a&&element.b)points.push(siteTo3dPoint(element.a),siteTo3dPoint(element.b));}
  return points;
}
function site3dPolygon(points,z,fill,stroke='#a7b8a8') { if(!points||points.length<3)return;polygon(points.map(pointValue=>isoPoint(pointValue,z)),fill,stroke); }
function site3dBox(points,bottom,height,topFill,sideFill,stroke='#8b9b87') {
  if(!points||points.length<3)return;const top=points.map(pointValue=>isoPoint(pointValue,bottom+height)),low=points.map(pointValue=>isoPoint(pointValue,bottom));
  polygon(top,topFill,stroke);for(let i=0;i<points.length;i++){const next=(i+1)%points.length;polygon([low[i],low[next],top[next],top[i]],sideFill,stroke);}
}
function site3dLine(points,z,colour,width=1.5,dash=[]) {
  if(!points||points.length<2||!ctx||typeof ctx.beginPath!=='function'||typeof ctx.moveTo!=='function'||typeof ctx.lineTo!=='function'||typeof ctx.stroke!=='function')return;ctx.save();ctx.strokeStyle=colour;ctx.lineWidth=width;if(typeof ctx.setLineDash==='function')ctx.setLineDash(dash);ctx.beginPath();const first=isoPoint(points[0],z);ctx.moveTo(first.x,first.y);for(const pointValue of points.slice(1)){const next=isoPoint(pointValue,z);ctx.lineTo(next.x,next.y);}ctx.stroke();ctx.restore();
}
function site3dPost(pointValue,z,height,colour='#55745a',radius=3) {
  if(!ctx||typeof ctx.beginPath!=='function'||typeof ctx.moveTo!=='function'||typeof ctx.lineTo!=='function'||typeof ctx.stroke!=='function'||typeof ctx.arc!=='function'||typeof ctx.fill!=='function')return;const base=isoPoint(pointValue,z),top=isoPoint(pointValue,z+height);ctx.save();ctx.strokeStyle=colour;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(top.x,top.y);ctx.stroke();ctx.fillStyle=colour;ctx.beginPath();ctx.arc(top.x,top.y,radius,0,Math.PI*2);ctx.fill();ctx.restore();
}
function site3dRectFromPoints(points,inset=0){if(!points||points.length<3)return[];const minX=Math.min(...points.map(p=>p.x))+inset,maxX=Math.max(...points.map(p=>p.x))-inset,minY=Math.min(...points.map(p=>p.y))+inset,maxY=Math.max(...points.map(p=>p.y))-inset;return[{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}];}
function site3dDeckSupportPoints(points){if(!points||points.length<3)return[];const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),mx=(minX+maxX)/2,my=(minY+maxY)/2;return[{x:minX,y:minY},{x:mx,y:minY},{x:maxX,y:minY},{x:maxX,y:my},{x:maxX,y:maxY},{x:mx,y:maxY},{x:minX,y:maxY},{x:minX,y:my}];}
function site3dDeckSupports(deckPoints,poolPoints){if(!ctx||typeof ctx.beginPath!=='function'||typeof ctx.moveTo!=='function'||typeof ctx.lineTo!=='function'||typeof ctx.stroke!=='function'||typeof ctx.arc!=='function'||typeof ctx.fill!=='function')return;for(const pointValue of site3dDeckSupportPoints(deckPoints).concat(site3dDeckSupportPoints(poolPoints||[]))){const base=isoPoint(pointValue,-850),top=isoPoint(pointValue,0);ctx.save();ctx.strokeStyle='#4d6166';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(top.x,top.y);ctx.stroke();ctx.fillStyle='#72878a';ctx.beginPath();ctx.arc(top.x,top.y,3,0,Math.PI*2);ctx.fill();ctx.restore();}}
function site3dScrewPierGrid(points){
  if(!points||points.length<3)return;
  const minX=Math.min(...points.map(pointValue=>pointValue.x)),maxX=Math.max(...points.map(pointValue=>pointValue.x)),minY=Math.min(...points.map(pointValue=>pointValue.y)),maxY=Math.max(...points.map(pointValue=>pointValue.y)),perimeter=2*((maxX-minX)+(maxY-minY)),count=44;
  const pointAt=(distance)=>{let d=((distance%perimeter)+perimeter)%perimeter;if(d<=maxX-minX)return{x:minX+d,y:minY};d-=maxX-minX;if(d<=maxY-minY)return{x:maxX,y:minY+d};d-=maxY-minY;if(d<=maxX-minX)return{x:maxX-d,y:maxY};return{x:minX,y:maxY-(d-(maxX-minX))};};
  for(let index=0;index<count;index++){const pointValue=pointAt(perimeter*index/count);site3dPost(pointValue,-850,850,'#4d6166',2);}
}
function site3dDeckBoards(points,z){const rect=site3dRectFromPoints(points,180);if(rect.length<4)return;const minX=rect[0].x,maxX=rect[1].x,minY=rect[0].y,maxY=rect[2].y;for(let x=minX;x<=maxX;x+=450)site3dLine([{x,y:minY},{x,y:maxY}],z,'rgba(95,64,35,.55)',.8);for(let y=minY;y<=maxY;y+=450)site3dLine([{x:minX,y},{x:maxX,y}],z,'rgba(255,245,220,.22)',.5);}
function site3dTree(element) {
  if(!ctx||typeof ctx.beginPath!=='function'||typeof ctx.moveTo!=='function'||typeof ctx.lineTo!=='function'||typeof ctx.stroke!=='function'||typeof ctx.createRadialGradient!=='function'||typeof ctx.ellipse!=='function'||typeof ctx.fill!=='function')return;const points=site3dElementPoints(element);if(points.length<3)return;const cx=points.reduce((sum,p)=>sum+p.x,0)/points.length,cy=points.reduce((sum,p)=>sum+p.y,0)/points.length,rx=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),ry=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)),radius=Math.max(450,Math.max(rx,ry)/2),base=isoPoint({x:cx,y:cy},0),canopy=isoPoint({x:cx,y:cy},3600);
  ctx.save();ctx.strokeStyle='#7a5534';ctx.lineWidth=Math.max(2,radius*state.view.isoScale*.06);ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(canopy.x,canopy.y);ctx.stroke();const gradient=ctx.createRadialGradient(canopy.x-radius*.12*state.view.isoScale,canopy.y-radius*.18*state.view.isoScale,2,canopy.x,canopy.y,Math.max(12,radius*state.view.isoScale*.8));gradient.addColorStop(0,'#b7d98d');gradient.addColorStop(.55,'#5f9b5e');gradient.addColorStop(1,'#2f6e49');ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(canopy.x,canopy.y,Math.max(13,radius*state.view.isoScale*.72),Math.max(10,radius*state.view.isoScale*.5),0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#2f6e49';ctx.lineWidth=1;ctx.stroke();ctx.restore();
}
function drawSiteContext3d() {
  const plan=state.model.sitePlan||{},elements=siteRenderElements(plan.elements||[]),scope=state.view.walkthroughScope||'house';if(!elements.length)return;
  const local=element=>site3dElementPoints(element);
  if(scope==='site'&&plan.boundary?.points?.length){const boundary=plan.boundary.points.map(siteTo3dPoint);site3dPolygon(boundary,0,'#e7f0e2','#b8cbb7');}
  const landscape=elements.find(element=>element.type==='landscape');if(scope==='site'&&landscape)site3dPolygon(local(landscape),12,'rgba(112,156,100,.18)','#94b28f');
  const poolElement=elements.find(element=>element.type==='pool'),poolPoints=poolElement?local(poolElement):[];
  for(const element of elements){const points=local(element);if(element.type==='house'||element.type==='veranda'||element.type==='landscape')continue;
    if(element.type==='driveway'){site3dPolygon(points,28,'#aeb8b5','#87928e');continue;}
    if(element.type==='planting'){site3dBox(points,0,90,'#8ebf76','#709d60','#5e8955');continue;}
    if(element.type==='orchard'){site3dBox(points,0,80,'#83b86b','#679958','#54824e');const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));for(let x=minX+(maxX-minX)*.2;x<maxX;x+=(maxX-minX)*.3)for(let y=minY+(maxY-minY)*.25;y<maxY;y+=(maxY-minY)*.45)site3dTree({points:[{x:x-550,y:y-550},{x:x+550,y:y-550},{x:x+550,y:y+550},{x:x-550,y:y+550}]});continue;}
    if(element.type==='pool-deck'){site3dDeckSupports(points,poolPoints);site3dBox(points,0,160,'#c6a16d','#9b774d','#7e633e');site3dDeckBoards(points,168);continue;}
    if(element.type==='pool-wall'){site3dLine([...points,points[0]],920,'#865d43',3);site3dLine([...points,points[0]],120,'#6e4d3b',2);continue;}
    if(element.type==='pool-coping'){site3dLine([...points,points[0]],210,'#b68a4a',9);const inner=site3dRectFromPoints(points,260);site3dLine([...inner,inner[0]],220,'#ead8ad',4);continue;}
    if(element.type==='pool-drainage'){site3dLine([...points,points[0]],65,'#1b9aaa',3,[4,3]);continue;}
    if(element.type==='screw-piers'){site3dScrewPierGrid(points);continue;}
    if(element.type==='pool-pump'){site3dBox(points,0,1500,'rgba(216,225,224,.58)','rgba(123,143,143,.5)','#627a79');for(const pointValue of points)site3dPost(pointValue,0,1500,'#627a79',2);continue;}
    if(element.type==='pool'){site3dBox(points,0,120,'#68c6dd','#3c8ea2','#2e7284');const water=site3dRectFromPoints(points,420);site3dPolygon(water,112,'rgba(118,214,232,.82)','#d6fbff');site3dLine([...site3dRectFromPoints(points,160),site3dRectFromPoints(points,160)[0]],132,'#c9a96e',2);continue;}
    if(element.type==='shed'){site3dBox(points,0,3000,'#b27b4c','#815838','#66452f');continue;}
    if(element.type==='tree'){site3dTree(element);continue;}
    if(element.type==='boundary-fence'||element.type==='fence'||element.type==='pool-fence'){const barrier=element.type==='pool-fence';site3dLine([...points,points[0]],barrier?1100:1800,barrier?'#2e9ab1':'#55745a',barrier?2:2.5,[6,4]);if(barrier)site3dLine([...points,points[0]],180,'rgba(46,154,177,.7)',1);for(const pointValue of points)site3dPost(pointValue,0,barrier?1100:1800,barrier?'#2e9ab1':'#55745a',2);continue;}
    if(element.type==='gate'&&element.a&&element.b){const a=siteTo3dPoint(element.a),b=siteTo3dPoint(element.b);site3dLine([a,b],1800,'#0d6d78',4);site3dPost(a,0,1800,'#0d6d78',3);site3dPost(b,0,1800,'#0d6d78',3);}
  }
}
function isLevelVisible3d(item) { return !state.hidden3dLevels.has(item.levelId); }
function renderLevelVisibility() {
  const container = document.querySelector("#levelVisibility"); if (!container) return;
  container.innerHTML = state.model.levels.map(level => `<label class="layer-toggle"><input type="checkbox" data-visible-level="${escapeHtml(level.id)}" ${state.hidden3dLevels.has(level.id) ? "" : "checked"} /><span>${escapeHtml(level.name)}</span></label>`).join("");
}
function normalizeDimensions(model) {
  if (model.dimensions !== undefined && !Array.isArray(model.dimensions)) throw new Error('Dimensions must be a list.');
  model.dimensions ||= [];
  for (const d of model.dimensions) {
    validateDimension(d);
    if (!model.levels.some(l=>l.id===d.levelId)) d.levelId=model.activeLevelId;
  }
}
function normalizeNotes(model) {
  if(model.notes!==undefined && !Array.isArray(model.notes))throw new Error('Notes must be a list.');
  model.notes ||= [];
  for(const n of model.notes){validateNote(n);if(!model.levels.some(l=>l.id===n.levelId))n.levelId=model.activeLevelId;}
}
const SPEC_FIELDS=['name','category','manufacturer','productCode','grade','finish','unit','drawingRef','notes','coverage','coverageUnit','orderUnit','allowancePercent','packSize','procurementEvidence'];
function normalizeSpecifications(model){
  if(model.specifications!==undefined&&!Array.isArray(model.specifications))throw new Error('Specifications must be a list.');
  model.specifications ||= [];
  const ids=new Set();for(const s of model.specifications){for(const k of ['coverage','coverageUnit','orderUnit','allowancePercent','packSize','procurementEvidence'])if(s[k]===undefined)s[k]='';validateSpecification(s);if(ids.has(s.id))throw new Error('Duplicate specification ID.');ids.add(s.id);}
}
function validateSpecification(s){if(!s||typeof s.id!=='string'||!s.id||SPEC_FIELDS.some(k=>typeof s[k]!=='string'||s[k].length>2000)||!s.name.trim())throw new Error('Specification needs a name and text fields up to 2000 characters.');for(const k of ['coverage','allowancePercent','packSize'])if(s[k].trim()&&(!Number.isFinite(Number(s[k]))||(k!=='allowancePercent'?Number(s[k])<=0:Number(s[k])<0)))throw new Error('Coverage and pack size must be positive; allowance must be zero or positive. Leave unspecified inputs blank.');}
function addSpecification(){withHistory(()=>{(state.model.specifications ||= []).push({id:uid('spec'),...Object.fromEntries(SPEC_FIELDS.map(k=>[k,''])),name:`Specification ${(state.model.specifications||[]).length+1}`,category:'Unspecified'});});}
function specificationOrderEstimate(spec,measure){
  if(!spec)return {orderEstimate:'',orderUnit:'',orderReview:'No linked product coverage'};
  const missing=['coverage','coverageUnit','orderUnit','allowancePercent'].filter(k=>!spec[k]?.trim());
  if(missing.length)return {orderEstimate:'',orderUnit:spec.orderUnit||'',orderReview:`Specify ${missing.join(', ')}`};
  if(spec.coverageUnit.trim()!==measure.measuredUnit)return {orderEstimate:'',orderUnit:spec.orderUnit,orderReview:'Coverage unit differs from measured unit; no automatic conversion'};
  const quantity=measure.quantity*(1+Number(spec.allowancePercent)/100)/Number(spec.coverage);
  if(!Number.isFinite(quantity))return {orderEstimate:'',orderUnit:spec.orderUnit,orderReview:'Estimate exceeds numeric limits'};
  return {orderEstimate:quantity,orderUnit:spec.orderUnit,orderReview:'Unrounded per-object coverage estimate only; verify product coverage/laps, waste and stock ordering'};
}
function renderSpecifications(){
  const container=document.querySelector('#specificationList');if(!container)return;
  container.innerHTML=(state.model.specifications||[]).map((s,i)=>`<details><summary class="roof-summary">${escapeHtml(s.name)}</summary><div class="field-grid">${SPEC_FIELDS.map(k=>`<label class="inspector-field">${escapeHtml(k)}<input aria-label="Specification ${i+1} ${k}" data-spec-id="${escapeHtml(s.id)}" data-spec-field="${k}" maxlength="2000" value="${escapeHtml(s[k])}" /></label>`).join('')}</div></details>`).join('')||'<p class="overview-copy">No project specifications. Add records using designer/supplier evidence; no approved product library is inferred.</p>';
}
function updateSpecification(id,field,raw){const s=(state.model.specifications||[]).find(s=>s.id===id);if(!s||!SPEC_FIELDS.includes(field))return;const next={...s,[field]:raw.slice(0,2000)};try{validateSpecification(next);}catch(error){state.statusMessage=error.message;render();return;}withHistory(()=>Object.assign(s,next));}
function renderSpecificationLink(object){
  const specs=state.model.specifications||[],unresolved=object.specificationId&&!specs.some(s=>s.id===object.specificationId);
  return `<h3 class="reinforcement-heading">Project specification link</h3><label>Specification record<select data-field="specificationId"><option value="">Unspecified</option>${unresolved?`<option selected value="${escapeHtml(object.specificationId)}">Unresolved saved reference</option>`:''}${specs.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===object.specificationId?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}</select></label><p class="overview-copy">Reference only. Linking does not change geometry, quantities, structural design or existing free-text specifications.</p>`;
}
function exportSpecificationCsv(){const rows=[['ID',...SPEC_FIELDS],...(state.model.specifications||[]).map(s=>[s.id,...SPEC_FIELDS.map(k=>s[k])])];download('bc-design-specifications.csv',rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');}
function specificationLibraryData(){return {format:'BC Design specification library',version:1,specifications:(state.model.specifications||[]).map(s=>({id:s.id,...Object.fromEntries(SPEC_FIELDS.map(k=>[k,s[k]||'']))}))};}
function exportSpecificationLibrary(){download('bc-design-specification-library.json',JSON.stringify(specificationLibraryData(),null,2),'application/json');}
function parseSpecificationLibrary(raw){
  if(!raw||raw.format!=='BC Design specification library'||raw.version!==1||!Array.isArray(raw.specifications))throw new Error('Expected a BC Design specification library version 1, not a project file.');
  if(raw.specifications.length>500)throw new Error('Import at most 500 specification records per library.');
  const used=new Set((state.model.specifications||[]).map(s=>s.id));
  return raw.specifications.map(record=>{
    if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Invalid specification record.');
    let id=uid('spec');while(used.has(id))id=uid('spec');used.add(id);
    const s={id};for(const field of SPEC_FIELDS){s[field]=record[field]===undefined?'':record[field];}
    validateSpecification(s);return s;
  });
}
function importSpecificationLibraryData(raw){const records=parseSpecificationLibrary(raw);if(!records.length){state.statusMessage='Library contains no records';render();return;}withHistory(()=>{(state.model.specifications ||= []).push(...records);});state.statusMessage=`Imported ${records.length} specification records with new IDs; existing links unchanged`;render();}
async function importSpecificationLibraryFile(file){try{if(file.size>2*1024*1024)throw new Error('Library file must be no larger than 2 MiB.');importSpecificationLibraryData(JSON.parse(await file.text()));}catch(error){state.statusMessage=`Library import failed: ${error.message}`;render();}}
function specificationScheduleRows(){
  const collections={service:'services',serviceItem:'serviceItems',wall:'walls',opening:'openings',deck:'decks',floor:'floors',foundation:'foundations',pad:'pads',pier:'piers',roof:'roofs',room:'rooms',stair:'stairs'};
  return Object.entries(collections).flatMap(([type,key])=>(state.model[key]||[]).map(object=>{
    const spec=(state.model.specifications||[]).find(s=>s.id===object.specificationId),issues=[];
    if(!object.specificationId)issues.push('No specification linked');else if(!spec)issues.push('Unresolved specification reference');
    if(spec)for(const [field,label]of [['category','category'],['manufacturer','manufacturer'],['productCode','product code'],['unit','declared unit'],['drawingRef','drawing / evidence reference']])if(!spec[field].trim()||spec[field]==='Unspecified')issues.push(`Missing ${label}`);
    const measure=objectSpecificationMeasure(type,object);
    if(spec?.unit.trim() && spec.unit.trim()!==measure.measuredUnit)issues.push(`Declared unit ${spec.unit.trim()} differs from measured ${measure.measuredUnit}; no conversion applied`);
    return {type,id:object.id,level:levelName(object.levelId),name:object.name||`${type} ${object.id}`,specificationId:object.specificationId||'',specification:spec?.name||'',manufacturer:spec?.manufacturer||'',productCode:spec?.productCode||'',unit:spec?.unit||'',...measure,...specificationOrderEstimate(spec,measure),issues};
  }));
}
function objectSpecificationMeasure(type,o){
  if(type==='serviceItem')return {quantity:1,measuredUnit:'count',unitBasis:'One explicitly placed '+o.kind+' record; no inferred parts or product approval'};
  if(type==='service')return {quantity:serviceGeometry(o).length/1000,measuredUnit:'m',unitBasis:'3D service centreline only; no fittings, waste or system design'};
  if(type==='wall')return {quantity:wallOpeningGeometry3d(o).surfaceArea/1e6,measuredUnit:'m²',unitBasis:'One-face wall area less union of rectangular openings clipped to wall; no finishes, waste or framing'};
  if(type==='opening')return {quantity:1,measuredUnit:'count',unitBasis:'One opening object; product dimensions and selection need review'};
  if(type==='floor'){const g=floorMeasuredGeometry(o);return {quantity:g.pending?null:g.area/1e6,measuredUnit:'m²',unitBasis:g.pending?g.reason:'Floor outline less union of opted-in clipped cuts; separate floors not unioned; no build-up/waste/product conversion'};}
  if(['deck','room'].includes(type))return {quantity:polygonArea(o.points)/1e6,measuredUnit:'m²',unitBasis:`${type} outline area; overlaps not deducted; no build-up, waste or product conversion`};
  if(type==='foundation')return {quantity:lengthBetween(o.a,o.b)*o.width*o.depth/1e9,measuredUnit:'m³',unitBasis:'Gross strip volume; intersections and reinforcement not deducted; no waste'};
  if(['pad','pier'].includes(type))return {quantity:supportVolume(o)/1e9,measuredUnit:'m³',unitBasis:'Gross individual support volume; overlaps not deducted; no waste'};
  if(type==='roof')return {quantity:roofMeasuredGeometry(o).surfaceArea/1e6,measuredUnit:'m²',unitBasis:'Retained sloping surface for explicit joined groups; independent overlaps remain; no laps, openings, waste or framing'};
  if(type==='stair')return {quantity:stairGeometry(o).treads,measuredUnit:'count',unitBasis:'Separate treads in measured flights only; excludes pending continuations, landings, stringers and rails'};
  throw new Error('No measured specification basis for this object type.');
}
function renderSpecificationSchedule(){
  const container=document.querySelector('#linkedSpecificationSchedule');if(!container)return;
  const rows=specificationScheduleRows();
  container.innerHTML=`<p class="overview-copy">${rows.length} building objects · ${rows.filter(r=>r.issues.length).length} need record review. Record completeness is not compliance or order readiness.</p>`+rows.map(r=>`<button type="button" class="foundation-schedule-row" data-spec-object="${escapeHtml(r.id)}" data-spec-type="${r.type}"><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.level)} · ${escapeHtml(r.specification||'Unspecified / unresolved')}</span><small>${formatNumber(r.quantity,r.measuredUnit==='count'?0:3)} ${r.measuredUnit} · ${escapeHtml(r.unitBasis)}</small><small>Coverage estimate: ${r.orderEstimate===''?'Not calculated':formatNumber(r.orderEstimate,3)+' '+escapeHtml(r.orderUnit)} · ${escapeHtml(r.orderReview)}</small><small>${escapeHtml(r.issues.join('; ')||'Listed record fields supplied; designer/product review still required')}</small></button>`).join('');
}
function groupedSpecificationEstimates(rows=specificationScheduleRows()){
  const groups=new Map(),excluded=[];
  for(const row of rows){
    if(row.orderEstimate===''||!Number.isFinite(row.orderEstimate)){excluded.push(row);continue;}
    // Keep distinct object types separate: a room and slab may describe the same surface.
    const key=JSON.stringify([row.specificationId,row.orderUnit,row.measuredUnit,row.type]);
    if(!groups.has(key))groups.set(key,{specificationId:row.specificationId,name:row.specification,orderUnit:row.orderUnit,measuredUnit:row.measuredUnit,type:row.type,quantity:0,estimate:0,ids:[],reviews:0});
    const g=groups.get(key);g.quantity+=row.quantity;g.estimate+=row.orderEstimate;g.ids.push(row.id);if(row.issues.length)g.reviews++;
  }
  return {groups:[...groups.values()].map(g=>({...g,...draftPackageEstimate(g)})),excluded};
}
function draftPackageEstimate(group,spec=(state.model.specifications||[]).find(s=>s.id===group.specificationId)){
  const blocked=message=>({packages:'',roundedQuantity:'',packageReview:message});
  if(!spec?.packSize?.trim())return blocked('Specify order units per package');
  if(!spec.procurementEvidence?.trim())return blocked('Record supplier/product coverage and packaging evidence');
  if(group.reviews)return blocked('Resolve linked specification review inputs first');
  const pack=Number(spec.packSize),ratio=group.estimate/pack;
  if(!(pack>0)||!Number.isFinite(ratio)||ratio<0)return blocked('Invalid package calculation');
  const nearest=Math.round(ratio),adjusted=Math.abs(ratio-nearest)<=Number.EPSILON*8*Math.max(1,Math.abs(ratio))?nearest:ratio;
  const packages=Math.ceil(adjusted),roundedQuantity=packages*pack;
  if(!Number.isSafeInteger(packages)||!Number.isFinite(roundedQuantity))return blocked('Package result exceeds safe numeric limits');
  return {packages,roundedQuantity,packageReview:'DRAFT ONLY — recorded inputs, not verified supplier approval; check overlaps, pack sizes and delivery before ordering'};
}
function renderGroupedSpecifications(){
  const el=document.querySelector('#groupedSpecificationEstimates');if(!el)return;
  const {groups,excluded}=groupedSpecificationEstimates();
  el.innerHTML=`<p class="overview-copy">${groups.length} provisional groups · ${excluded.length} objects excluded from estimates. Groups remain separate by specification, measured unit, order unit and object type to avoid mixing room/slab or incompatible quantities.</p>`+groups.map(g=>`<div class="foundation-schedule-row"><strong>${escapeHtml(g.name)} · ${escapeHtml(g.type)}</strong><span>${formatNumber(g.estimate,3)} ${escapeHtml(g.orderUnit)} unrounded · ${g.ids.length} objects</span><small>${formatNumber(g.quantity,3)} ${escapeHtml(g.measuredUnit)} measured · ${g.reviews} records need review. Not an approved order.</small><small>Draft packages: ${g.packages===''?'Not calculated':g.packages+' packages → '+formatNumber(g.roundedQuantity,3)+' '+escapeHtml(g.orderUnit)} · ${escapeHtml(g.packageReview)}</small></div>`).join('')+`<details><summary class="roof-summary">Excluded objects (${excluded.length})</summary>${excluded.map(r=>`<p class="overview-copy">${escapeHtml(r.name)}: ${escapeHtml(r.orderReview)}</p>`).join('')}</details>`;
}
function exportGroupedSpecificationCsv(){
  const {groups,excluded}=groupedSpecificationEstimates();
  const rows=[['Status','Specification ID','Specification name','Object type','Measured quantity','Measured unit','Unrounded coverage estimate (not order)','Order unit','Object IDs','Draft package count','Draft rounded quantity','Package review','Review'],...groups.map(g=>['PROVISIONAL',g.specificationId,g.name,g.type,g.quantity,g.measuredUnit,g.estimate,g.orderUnit,g.ids.join('; '),g.packages,g.roundedQuantity,g.packageReview,`${g.reviews} records need review; overlaps not deducted; no stock rounding or approval`]),...excluded.map(r=>['EXCLUDED',r.specificationId,r.specification,r.type,r.quantity,r.measuredUnit,'',r.orderUnit,r.id,'','','Not calculated',r.orderReview])];
  download('bc-design-grouped-estimates.csv',rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');
}
function exportLinkedSpecificationCsv(){
  const rows=[['Object type','Object ID','Object name','Level','Specification ID','Specification name','Manufacturer','Product code','Declared specification unit','Object count (not order quantity)','Measured quantity','Measured unit','Measurement basis (not order quantity)','Coverage estimate (unrounded, not order)','Order unit','Coverage review','Review inputs'],...specificationScheduleRows().map(r=>[r.type,r.id,r.name,r.level,r.specificationId,r.specification,r.manufacturer,r.productCode,r.unit,1,r.quantity,r.measuredUnit,r.unitBasis,r.orderEstimate,r.orderUnit,r.orderReview,r.issues.join('; ')||'Listed fields supplied; qualified review still required'])];
  download('bc-design-linked-specifications.csv',rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');
}
function buildingPlanNotes(){return (state.model.notes||[]).filter(note=>!['site-boundary-note','site-pool-note','site-shed-note','site-gate-note','site-driveway-note','site-trees-note','site-landscape-note'].includes(note.id)&&note.scope!=='site');}
function validateNote(n){if(!n||typeof n.id!=='string'||typeof n.text!=='string'||n.text.length>1000||typeof n.leader!=='boolean'||![n.a?.x,n.a?.y,n.b?.x,n.b?.y].every(Number.isFinite))throw new Error('Note needs finite anchor/text coordinates, a leader choice and text up to 1000 characters.');}
function commitNote(){
  const {start,current}=state.drawing;state.drawing=null;
  const n={id:uid('note'),levelId:state.model.activeLevelId,a:{...start},b:{...current},text:'Project note',leader:true};
  withHistory(()=>{(state.model.notes ||= []).push(n);state.selected={type:'note',id:n.id};state.visibility.notes=true;});
}
function annotationPlanBounds(){
  const points=[];
  for(const wall of activeWalls())points.push(wall.a,wall.b);
  for(const floor of activeFloors())points.push(...floor.points);
  for(const deck of activeDecks())points.push(...deck.points);
  for(const room of state.model.rooms.filter(room=>room.levelId===state.model.activeLevelId))points.push(...room.points);
  for(const foundation of activeFoundations())points.push(foundation.a,foundation.b);
  for(const stair of state.model.stairs.filter(stair=>stair.levelId===state.model.activeLevelId))points.push(stair.a,stair.b);
  for(const item of activeSupports('pad').concat(activeSupports('pier')))points.push(item.center);
  const screens=points.filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)).map(worldToScreen);
  if(!screens.length)return {left:48,right:state.width-48,top:48,bottom:state.height-48,centerX:state.width/2,centerY:state.height/2};
  const pad=28,left=Math.min(...screens.map(point=>point.x))-pad,right=Math.max(...screens.map(point=>point.x))+pad,top=Math.min(...screens.map(point=>point.y))-pad,bottom=Math.max(...screens.map(point=>point.y))+pad;
  return {left,right,top,bottom,centerX:(left+right)/2,centerY:(top+bottom)/2};
}
function annotationTextWidth(value){return typeof ctx.measureText==='function'?ctx.measureText(String(value)).width:String(value).length*6;}
function annotationTextLines(text,maxWidth){
  const lines=[];for(const raw of String(text).split('\n')){let line='';for(const word of raw.split(/\s+/)){const candidate=line?`${line} ${word}`:word;if(line&&annotationTextWidth(candidate)>maxWidth){lines.push(line);line=word;}else line=candidate;}lines.push(line||' ');}return lines;
}
function outsideAnnotationBox(anchor,lines,index,total,kind){
  const bounds=annotationPlanBounds(),font=kind==='note'?11:10;ctx.font=`${font}px Segoe UI`;
  const maxWidth=kind==='note'?230:210,width=Math.min(maxWidth,Math.max(86,...lines.map(annotationTextWidth))+14),lineHeight=font+4,height=lines.length*lineHeight+10;
  const leftSpace=bounds.left-10,rightSpace=state.width-bounds.right-10,preferLeft=anchor.x<=bounds.centerX;
  let side=preferLeft&&leftSpace>=width?'left':!preferLeft&&rightSpace>=width?'right':rightSpace>=width?'right':leftSpace>=width?'left':anchor.y<=bounds.centerY?'top':'bottom';
  let x,y;
  if(side==='left'||side==='right'){
    x=side==='left'?bounds.left-width-12:bounds.right+12;
    y=clamp(anchor.y-height/2,8,state.height-height-8);
  }else{
    x=clamp(anchor.x-width/2,8,state.width-width-8);
    y=side==='top'?bounds.top-height-12:bounds.bottom+12;
    y=clamp(y,8,state.height-height-8);
  }
  // Keep stacked annotations readable when several labels share one side.
  if(total>1&&side!=='top'&&side!=='bottom')y=clamp(y+(index-(total-1)/2)*(height+4),8,state.height-height-8);
  return {x,y,width,height,left:x,right:x+width,top:y,bottom:y+height,side,font,lineHeight,lines};
}
function drawAnnotationBox(anchor,box,colour,leader=true){
  const edge=box.side==='left'?{x:box.right,y:clamp(anchor.y,box.top+6,box.bottom-6)}:box.side==='right'?{x:box.left,y:clamp(anchor.y,box.top+6,box.bottom-6)}:box.side==='top'?{x:clamp(anchor.x,box.left+8,box.right-8),y:box.bottom}:{x:clamp(anchor.x,box.left+8,box.right-8),y:box.top};
  ctx.save();ctx.strokeStyle=colour;ctx.fillStyle='rgba(251,252,251,.68)';ctx.lineWidth=.8;ctx.lineJoin='round';
  if(leader){ctx.setLineDash([3,2]);ctx.beginPath();ctx.moveTo(anchor.x,anchor.y);ctx.lineTo(edge.x,edge.y);ctx.stroke();ctx.setLineDash([]);}
  ctx.fillRect(box.x,box.y,box.width,box.height);ctx.beginPath();ctx.moveTo(box.left,box.top);ctx.lineTo(box.right,box.top);ctx.lineTo(box.right,box.bottom);ctx.lineTo(box.left,box.bottom);ctx.closePath();ctx.stroke();
  ctx.fillStyle=colour;ctx.textAlign='left';box.lines.forEach((line,lineIndex)=>ctx.fillText(line,box.x+7,box.y+box.font+2+lineIndex*box.lineHeight));ctx.restore();
}
function drawNotesPlan(){
  if(!state.visibility.notes)return;
  const notes=buildingPlanNotes().filter(n=>n.levelId===state.model.activeLevelId);for(const [index,n] of notes.entries()){const anchor=worldToScreen(n.a),colour=state.selected?.id===n.id?'#ed1c24':'#344d43';ctx.save();ctx.font='11px Segoe UI';const lines=annotationTextLines(n.text,230);ctx.restore();drawAnnotationBox(anchor,outsideAnnotationBox(anchor,lines,index,notes.length,'note'),colour,n.leader);}
}
function hitNote(p){if(!state.visibility.notes)return null;const notes=buildingPlanNotes().filter(n=>n.levelId===state.model.activeLevelId);const screen=worldToScreen(p);for(let index=notes.length-1;index>=0;index--){const n=notes[index],anchor=worldToScreen(n.a);ctx.save();ctx.font='11px Segoe UI';const lines=annotationTextLines(n.text,230);ctx.restore();const box=outsideAnnotationBox(anchor,lines,index,notes.length,'note');if(screen.x>=box.left&&screen.x<=box.right&&screen.y>=box.top&&screen.y<=box.bottom)return {type:'note',id:n.id};if(lengthBetween(p,n.b)<16/state.view.scale||(n.leader&&distanceToSegment(p,n.a,n.b).distance<8/state.view.scale))return {type:'note',id:n.id};}return null;}
function renderNoteDetails(n){return `<div class="detail-head"><h3>Plan note / leader</h3><button class="delete-button" data-action="delete">Delete</button></div><label for="noteText">Note text</label><textarea id="noteText" data-field="text" maxlength="1000" rows="4">${escapeHtml(n.text)}</textarea><div class="field-grid">${detailInput('Anchor X','startX',n.a.x,'mm')}${detailInput('Anchor Y','startY',n.a.y,'mm')}${detailInput('Text X','endX',n.b.x,'mm')}${detailInput('Text Y','endY',n.b.y,'mm')}<label>Leader<select data-field="leader"><option value="true" ${n.leader?'selected':''}>Show</option><option value="false" ${!n.leader?'selected':''}>Text only</option></select></label></div><p class="overview-copy">Independent plan annotation, not linked to an object. Select near its text origin or leader. Text has no compliance or material-quantity meaning.</p>`;}
function updateNoteField(field,raw){if(state.selected?.type!=='note')return false;const n=selectedObject(),next=clone(n),v=raw.trim()?Number(raw):NaN;if(field==='startX')next.a.x=v;else if(field==='startY')next.a.y=v;else if(field==='endX')next.b.x=v;else if(field==='endY')next.b.y=v;else if(field==='text')next.text=raw.slice(0,1000);else if(field==='leader')next.leader=raw==='true';else return true;try{validateNote(next);}catch(error){state.statusMessage=error.message;render();return true;}withHistory(()=>Object.assign(n,next));return true;}
function validateDimension(d) {
  if (!d || typeof d.id!=='string' || typeof d.label!=='string' || d.label.length>500 || ![d.a?.x,d.a?.y,d.b?.x,d.b?.y,d.offset].every(Number.isFinite) || lengthBetween(d.a,d.b)<1) throw new Error('Dimension needs finite endpoints/offset, non-zero length and a label up to 500 characters.');
}
function dimensionGeometry(d) {
  const direction=unit(sub(d.b,d.a)), normal={x:-direction.y,y:direction.x};
  return {a:add(d.a,scale(normal,d.offset)),b:add(d.b,scale(normal,d.offset)),length:lengthBetween(d.a,d.b)};
}
function commitDimension() {
  const {start,current}=state.drawing;state.drawing=null;
  const d={id:uid('dimension'),levelId:state.model.activeLevelId,a:{...start},b:{...current},offset:400,label:''};
  try{validateDimension(d);}catch(error){state.statusMessage=error.message;render();return;}
  withHistory(()=>{(state.model.dimensions ||= []).push(d);state.selected={type:'dimension',id:d.id};state.visibility.dimensions=true;});
}
function drawDimensionsPlan() {
  if(!state.visibility.dimensions)return;
  const dimensions=(state.model.dimensions||[]).filter(d=>d.levelId===state.model.activeLevelId);for(const [index,d] of dimensions.entries()) {
    if(d.levelId!==state.model.activeLevelId)continue;
    const g=dimensionGeometry(d), a=worldToScreen(g.a),b=worldToScreen(g.b);
    ctx.save();ctx.strokeStyle=state.selected?.id===d.id?'#ed1c24':'#344d43';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;
    for(const [p,q]of [[worldToScreen(d.a),a],[worldToScreen(d.b),b],[a,b]]){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    for(const p of [a,b]){ctx.beginPath();ctx.moveTo(p.x-4,p.y+4);ctx.lineTo(p.x+4,p.y-4);ctx.stroke();}
    const text=`${d.label?d.label+' · ':''}${planMeasureNumber(g.length)} mm`,colour=ctx.fillStyle;ctx.font='10px Segoe UI';ctx.textAlign='center';const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2-7},width=ctx.measureText(text).width+8;ctx.fillStyle='#fbfcfb';ctx.fillRect(mid.x-width/2,mid.y-11,width,15);ctx.fillStyle=colour;ctx.fillText(text,mid.x,mid.y);ctx.restore();
  }
}
function hitDimension(p) {
  if(!state.visibility.dimensions)return null;
  const d=[...(state.model.dimensions||[])].reverse().find(d=>d.levelId===state.model.activeLevelId && distanceToSegment(p,dimensionGeometry(d).a,dimensionGeometry(d).b).distance<10/state.view.scale);
  return d?{type:'dimension',id:d.id}:null;
}
function renderDimensionDetails(d) {
  return `<div class="detail-head"><h3>Measured dimension</h3><button class="delete-button" data-action="delete">Delete</button></div><div class="field-grid">${detailInput('Label','label',d.label,'',false)}${detailInput('Start X','startX',d.a.x,'mm')}${detailInput('Start Y','startY',d.a.y,'mm')}${detailInput('End X','endX',d.b.x,'mm')}${detailInput('End Y','endY',d.b.y,'mm')}${detailInput('Signed line offset','offset',d.offset,'mm')}</div><p class="overview-copy">Measured length: ${formatNumber(dimensionGeometry(d).length,0)} mm. Independent reference points, not attached to walls. Label does not override the measured value. Plan only; no material quantity or regulatory interpretation.</p>`;
}
function updateDimensionField(field,raw) {
  if(state.selected?.type!=='dimension')return false;
  const d=selectedObject(),next=clone(d),value=field==='label'?raw.slice(0,500):(raw.trim()?Number(raw):NaN);
  if(field==='startX')next.a.x=value;else if(field==='startY')next.a.y=value;else if(field==='endX')next.b.x=value;else if(field==='endY')next.b.y=value;else if(['label','offset'].includes(field))next[field]=value;else return true;
  try{validateDimension(next);}catch(error){state.statusMessage=error.message;render();return true;}
  withHistory(()=>Object.assign(d,next));return true;
}
function wallOpeningGeometry3d(wall) {
  const length = lengthBetween(wall.a, wall.b), height = wall.height;
  const openings = state.model.openings.filter(o => o.wallId === wall.id).map(o => ({
    opening: o, x0: clamp(o.offset, 0, length), x1: clamp(o.offset + o.width, 0, length),
    z0: clamp(o.sill, 0, height), z1: clamp(o.sill + o.height, 0, height)
  })).filter(o => o.x1 > o.x0 && o.z1 > o.z0);
  const xs = [...new Set([0, length, ...openings.flatMap(o => [o.x0, o.x1])])].sort((a,b)=>a-b);
  const zs = [...new Set([0, height, ...openings.flatMap(o => [o.z0, o.z1])])].sort((a,b)=>a-b);
  const solid = (i,j) => i >= 0 && i < xs.length-1 && j >= 0 && j < zs.length-1 && !openings.some(o => (xs[i]+xs[i+1])/2 > o.x0 && (xs[i]+xs[i+1])/2 < o.x1 && (zs[j]+zs[j+1])/2 > o.z0 && (zs[j]+zs[j+1])/2 < o.z1);
  const cells=[];
  for(let i=0;i<xs.length-1;i++) for(let j=0;j<zs.length-1;j++) if(solid(i,j)) cells.push({x0:xs[i],x1:xs[i+1],z0:zs[j],z1:zs[j+1],left:!solid(i-1,j),right:!solid(i+1,j),bottom:!solid(i,j-1),top:!solid(i,j+1)});
  return {length, cells, openings, surfaceArea:cells.reduce((s,c)=>s+(c.x1-c.x0)*(c.z1-c.z0),0)};
}
function drawWallOpenings3d(wall) {
  const g=wallOpeningGeometry3d(wall), direction=unit(sub(wall.b,wall.a)), normal={x:-direction.y,y:direction.x}, half=wall.thickness/2;
  const base=state.model.levels.find(l=>l.id===wall.levelId)?.elevation || 0;
  const p=(x,y,z)=>isoPoint(add(add(wall.a,scale(direction,x)),scale(normal,y)),base+z);
  for(const c of g.cells) {
    for(const y of [-half,half]) polygon([p(c.x0,y,c.z0),p(c.x1,y,c.z0),p(c.x1,y,c.z1),p(c.x0,y,c.z1)],y<0?'#dce8df':'#bcd2c3',y<0?'#dce8df':'#bcd2c3');
    if(c.left) polygon([p(c.x0,-half,c.z0),p(c.x0,half,c.z0),p(c.x0,half,c.z1),p(c.x0,-half,c.z1)],'#a7c2af','#789b83');
    if(c.right) polygon([p(c.x1,-half,c.z0),p(c.x1,half,c.z0),p(c.x1,half,c.z1),p(c.x1,-half,c.z1)],'#a7c2af','#789b83');
    if(c.bottom) polygon([p(c.x0,-half,c.z0),p(c.x1,-half,c.z0),p(c.x1,half,c.z0),p(c.x0,half,c.z0)],'#adc6b4','#789b83');
    if(c.top) polygon([p(c.x0,-half,c.z1),p(c.x1,-half,c.z1),p(c.x1,half,c.z1),p(c.x0,half,c.z1)],'#e8f0ea','#789b83');
  }
  if(!state.visibility.openings)return; // Keep the void; hide only the schematic joinery.
  for(const o of g.openings) {
    const border=Math.min(40,(o.x1-o.x0)/4,(o.z1-o.z0)/4), colour=o.opening.type==='door'?'#bd7a22':'#397ca0';
    const rect=(x0,x1,z0,z1,fill)=>polygon([p(x0,0,z0),p(x1,0,z0),p(x1,0,z1),p(x0,0,z1)],fill,colour);
    rect(o.x0,o.x1,o.z0,o.z0+border,colour);rect(o.x0,o.x1,o.z1-border,o.z1,colour);
    rect(o.x0,o.x0+border,o.z0,o.z1,colour);rect(o.x1-border,o.x1,o.z0,o.z1,colour);
    if(o.opening.operation!=='passage')rect(o.x0+border,o.x1-border,o.z0+border,o.z1-border,o.opening.type==='door'&&o.opening.operation!=='sliding'?'#e4d6bc':'rgba(170,212,234,.45)');
  }
}
function render3d({presentation=false}={}) {
  ctx.save(); ctx.fillStyle = "#f8fbf8"; ctx.fillRect(0, 0, state.width, state.height); ctx.strokeStyle = "#e3ece5"; ctx.lineWidth = 1;
  if(presentation){
    const backdrop=ctx.createLinearGradient(0,0,0,state.height);backdrop.addColorStop(0,"#e8eff0");backdrop.addColorStop(1,"#f8f7f0");ctx.fillStyle=backdrop;ctx.fillRect(0,0,state.width,state.height);
    ctx.save();ctx.shadowColor="rgba(30,50,35,.18)";ctx.shadowBlur=24;ctx.shadowOffsetY=12;for(const item of [...state.model.floors,...state.model.decks].filter(isLevelVisible3d)){polygon(item.points.map(p=>isoPoint(p,0)),"#e0e7d9","#e0e7d9");}ctx.restore();
  }
  const ground = [isoPoint({ x: -30000, y: -30000 }, 0), isoPoint({ x: 50000, y: -30000 }, 0), isoPoint({ x: 50000, y: 50000 }, 0), isoPoint({ x: -30000, y: 50000 }, 0)]; if(!presentation)polygon(ground, "#f4f8f4", "#e3ece5");
  if(state.visibility.siteConcepts&&state.model.levels.some(level=>!state.hidden3dLevels.has(level.id)))drawSiteContext3d();
  if (state.visibility.foundations) for (const foundation of state.model.foundations.filter(isLevelVisible3d)) { const direction = unit(sub(foundation.b, foundation.a)); const normal = { x: -direction.y, y: direction.x }; const half = foundation.width / 2; const a0 = add(foundation.a, scale(normal, -half)); const a1 = add(foundation.a, scale(normal, half)); const b0 = add(foundation.b, scale(normal, -half)); const b1 = add(foundation.b, scale(normal, half)); const bottom = foundation.elevation; const top = bottom + foundation.depth; polygon([isoPoint(a0, bottom), isoPoint(b0, bottom), isoPoint(b0, top), isoPoint(a0, top)], "#d8cbe1", "#80639a"); polygon([isoPoint(a1, bottom), isoPoint(b1, bottom), isoPoint(b1, top), isoPoint(a1, top)], "#c6b4d0", "#80639a"); }
  if (state.visibility.floors) for (const floor of state.model.floors.filter(isLevelVisible3d)) { if(drawCutFloor(floor,false,true))continue; const points = floor.points.map((pointValue) => isoPoint(pointValue, floor.elevation)); polygon(points, "rgba(181,138,76,.22)", "#b58a4c"); }
  if (state.visibility.decks) for (const deck of state.model.decks.filter(isLevelVisible3d)) { const points = deck.points.map((pointValue) => isoPoint(pointValue, deck.elevation)); polygon(points, "rgba(76,139,98,.28)", "#4c8b62"); }
  drawSupports3d();
  if (typeof drawFloorFraming === 'function') drawFloorFraming(true);
  drawDeckPosts(true);
  drawDeckEdges(true);
  drawRooms3d();
  drawStairs3d();
  drawStairMembers("3d"); drawRailEnds("3d");
  drawStairRails("3d");
  drawDeckFraming(true);
  drawDeckBoards(true);
  drawDeckBarriers(true);
  drawDeckSupports(true);
  if(typeof drawKitchen==='function')drawKitchen(true);
  const walls = state.model.walls.filter(isLevelVisible3d).sort((a, b) => (a.a.x + a.a.y) - (b.a.x + b.a.y));
  if (state.visibility.walls) for (const wall of walls) drawWallOpenings3d(wall);
  drawRoofs3d();
  drawJoinedRoofs(true);
  drawServices(true);
  drawRoofJunctions(true);
  drawRoofValleys(true);
  drawRoofFraming(true);
  drawStairCoordination("3d");
  drawStairHeadroom("3d");
  drawFloorOpenings("3d");
  drawDeckPostFootings(true);
  drawDeckPostMembers(true);
  if(typeof drawConnectors==='function')drawConnectors(true);
  if(typeof drawEndCuts==='function')drawEndCuts(true);
  ctx.fillStyle = "#7d9384"; ctx.font = "11px Segoe UI"; if(!presentation){ctx.fillText("Interactive schematic walkthrough · not a certified 3D model", 18, 24);ctx.fillText("Drag to orbit · Shift-drag or middle-drag to pan · wheel to zoom · Fit resets the view", 18, state.height-18);} ctx.restore();
}

function renderUi() {
  const walls = state.model.walls.length; const openings = state.model.openings.length; const decks = state.model.decks.length; const floors = state.model.floors.length; const foundations = state.model.foundations.length; els.modelStatus.textContent = `${foundations} foundation${foundations === 1 ? "" : "s"} · ${floors} floor${floors === 1 ? "" : "s"} · ${walls} wall${walls === 1 ? "" : "s"} · ${openings} opening${openings === 1 ? "" : "s"} · ${decks} deck${decks === 1 ? "" : "s"}`;
  els.viewStatus.textContent = state.mode === "3d" ? (state.view.walkthroughScope === 'site' ? "Interactive property walkthrough · preliminary" : "Interactive exterior 3D · schematic") : state.mode === "site" ? "Site concept plan · preliminary" : state.mode === "quantities" ? "Plan + takeoffs" : state.planDisplayMode === "readable" ? "Readable plan · architectural layers" : "Coordination plan · all review layers";
  els.modelStatus.textContent += ` · ${state.model.pads.length} pads · ${state.model.piers.length} piers · ${state.model.roofs.length} roofs · ${state.model.rooms.length} rooms`;
  els.modelStatus.textContent += ` · ${state.model.stairs.length} stairs`;
  els.modelStatus.textContent += ` · ${(state.model.services||[]).length} service routes · ${(state.model.serviceItems||[]).length} fittings/fixtures`;
  els.stageTip.textContent = state.mode === "3d" ? (state.view.walkthroughScope === 'site' ? "Site walkthrough · drag to orbit · Shift-drag to pan · wheel to zoom · Fit" : "Exterior walkthrough · drag to orbit · Shift-drag to pan · wheel to zoom · Fit") : "W wall · D door · N window · F floor · B foundation · K deck · V select";
  els.canvasEmpty.classList.toggle("is-hidden", walls + openings + decks + floors + foundations + state.model.pads.length + state.model.piers.length + state.model.roofs.length + state.model.rooms.length + state.model.stairs.length + (state.model.floorOpenings||[]).length + (state.model.dimensions||[]).length + (state.model.kitchenUnits||[]).length + (state.model.notes||[]).length + (state.model.services||[]).length + (state.model.serviceItems||[]).length + state.serviceDraft.length > 0 || state.mode === "3d");
  if (els.examplePrompt) els.examplePrompt.hidden = !state.showExamplePrompt;
  els.levelSelect.innerHTML = state.model.levels.map((level) => `<option value="${escapeHtml(level.id)}" ${level.id === state.model.activeLevelId ? "selected" : ""}>${escapeHtml(level.name)}</option>`).join("");
  els.levelBadge.textContent = activeLevel()?.name?.replace(" Floor", "") || "Level";
  document.querySelectorAll(".mode-tab").forEach((button) => { const active = button.dataset.mode === state.mode; button.classList.toggle("is-active", active); button.setAttribute("aria-selected", String(active)); });
  document.querySelectorAll(".tool-button").forEach((button) => button.classList.toggle("is-active", button.dataset.tool === state.tool));
  document.querySelectorAll("[data-layer]").forEach((checkbox) => { checkbox.checked = state.visibility[checkbox.dataset.layer] !== false; });
  document.querySelector("#undoButton").disabled = !state.history.length;
  document.querySelector("#redoButton").disabled = !state.future.length;
  renderInspector();
  if(typeof kitchenSchedule==='function')kitchenSchedule();
  if(typeof renderFoundationSetout==='function')renderFoundationSetout();
  renderSpecifications();
  renderMaterialReferences();
  renderServiceSchedule();
  renderServiceConnectionSchedule();
  renderServiceEnvelopeSchedule();
  renderServiceClearanceSchedule();
  renderServiceRouteBodySchedule();
  renderServiceVolumeSchedule();
  renderServicePhysicalSchedule();
  document.querySelector("#serviceOverlayOpacity").value = Math.round(state.serviceOverlayOpacity*100);
  document.querySelector("#serviceOverlayOpacityValue").textContent = Math.round(state.serviceOverlayOpacity*100)+"%";
  renderSpecificationSchedule();
  renderGroupedSpecifications();
  if(selectedObject()&&!["kitchen","floorOpening","note","dimension","roofJunction","roofFraming"].includes(state.selected.type)) els.selectionDetails.innerHTML+=renderSpecificationLink(selectedObject());
  if (state.selected?.type === 'deck') els.selectionDetails.innerHTML += renderDeckBoardDetails(selectedObject()) + renderDeckSupportDetails(selectedObject()) + renderDeckPostDetails(selectedObject()) + renderDeckEdgeDetails(selectedObject()) + renderDeckFramingDetails(selectedObject()) + renderDeckBarrierDetails(selectedObject());
  renderFoundationSchedule();
  renderRoofSchedule();
  renderRoofJunctionSchedule();
  renderRoofFramingSchedule();
  renderRoomSchedule();
  renderStairSchedule();
  renderStairRailSchedule(); renderStairMemberSchedule(); renderRailEndSchedule();
  renderCoordinationSchedule();
  renderStairHeadroomSchedule();
  renderFloorOpeningSchedule();
  renderFloorCutSchedule();
  if (typeof renderFloorFramingSchedule === 'function') renderFloorFramingSchedule();
  renderDeckBoardSchedule();
  renderDeckSupportSchedule();
  renderDeckPostSchedule();
  renderDeckEdgeSchedule();
  renderDeckPostMemberSchedule();
  if(state.selected?.type==="floor" && typeof renderFloorFramingDetails === 'function') els.selectionDetails.innerHTML+=renderFloorFramingDetails(selectedObject());
  if(state.selected?.type==="floor" && typeof renderFloorFitDetails === 'function') els.selectionDetails.innerHTML+=renderFloorFitDetails(selectedObject());
  if(state.selected?.type==="floor") els.selectionDetails.innerHTML+=renderFloorCutDetails(selectedObject());
  if(state.selected?.type==="floor") els.selectionDetails.innerHTML+='<h3 class="reinforcement-heading">Opening references</h3><button type="button" class="link-button" data-action="add-floor-opening">Add opening reference</button><p class="overview-copy">Enter a proposed rectangular aperture. Separate Plan/3D overlay and schedule. Reference mode preserves slabs; explicit cut mode changes geometric quantities.</p>';
  renderLevelDatums();
  renderLevelVisibility();
  if(state.tool==="dimension") els.toolHelp.textContent="Drag between two measured reference points. Select the dimension line to edit its label, endpoints and signed offset. Independent plan annotation; not linked to walls.";
  if(window.BCWorkspace) window.BCWorkspace.sync();
  if(typeof stockPlanningRender === 'function') stockPlanningRender();
  if(typeof connectorRender === 'function') connectorRender();
  if(typeof endCutRender === 'function') endCutRender();
  updateHud();
}

function updateHud() {
  const wallDrawing = state.drawing?.kind === "wall";
  const foundationDrawing = state.drawing?.kind === "foundation";
  const deckDrawing = state.deckDraft.length > 0;
  const floorDrawing = state.floorDraft.length > 0;
  const roofDrawing = state.drawing?.kind === "roof";
  const roomDrawing = state.roomDraft.length > 0;
  const stairDrawing = state.drawing?.kind === "stair";
  const serviceDrawing = state.serviceDraft.length > 0;
  const active = serviceDrawing || wallDrawing || foundationDrawing || deckDrawing || floorDrawing || roofDrawing || roomDrawing || stairDrawing;
  els.drawingHud.hidden = !active;
  els.finishDeckButton.hidden = !(serviceDrawing || deckDrawing || floorDrawing || roomDrawing);
  els.finishDeckButton.textContent = serviceDrawing ? "Finish route" : "Finish outline";
  if (serviceDrawing) els.hudText.textContent = `Service route · ${state.serviceDraft.length} points · tap more points or Finish route`;
  else if (stairDrawing) els.hudText.textContent = `Stair run · ${formatLength(lengthBetween(state.drawing.start, state.drawing.current))} · lower → upper`;
  else if (roofDrawing) els.hudText.textContent = `Roof footprint · ${formatLength(Math.abs(state.drawing.current.x - state.drawing.start.x))} × ${formatLength(Math.abs(state.drawing.current.y - state.drawing.start.y))}`;
  else if (wallDrawing) els.hudText.textContent = `Wall preview · ${formatLength(lengthBetween(state.drawing.start, state.drawing.current))}`;
  else if (foundationDrawing) els.hudText.textContent = `Foundation preview · ${formatLength(lengthBetween(state.drawing.start, state.drawing.current))}`;
  else if (deckDrawing) els.hudText.textContent = `Deck outline · ${state.deckDraft.length} point${state.deckDraft.length === 1 ? "" : "s"}`;
  else if (floorDrawing) els.hudText.textContent = `Floor outline · ${state.floorDraft.length} point${state.floorDraft.length === 1 ? "" : "s"}`;
  else if (roomDrawing) els.hudText.textContent = `Room boundary · ${state.roomDraft.length} points`;
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }
function selectedObject() { if (!state.selected) return null; const collection = { kitchen: "kitchenUnits", floorOpening: "floorOpenings", roofFraming: "roofFraming", roofJunction: "roofJunctions", service: "services", serviceItem: "serviceItems", note: "notes", dimension: "dimensions", stair: "stairs", room: "rooms", roof: "roofs", wall: "walls", opening: "openings", deck: "decks", floor: "floors", foundation: "foundations", pad: "pads", pier: "piers" }[state.selected.type]; return collection ? state.model[collection].find((item) => item.id === state.selected.id) : null; }

function complianceData() { const openPoints = foundationConnectionIssues().length; const jurisdiction = state.model.jurisdiction; const jurisdictionName = { ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory", QLD: "Queensland", SA: "South Australia", TAS: "Tasmania", VIC: "Victoria", WA: "Western Australia" }[jurisdiction]; const soilClass = state.model.soilClass; return [{ label: "External footing continuity", status: openPoints ? "Action" : "Pass", tone: openPoints ? "action" : "pass", detail: openPoints ? `${openPoints} endpoint${openPoints === 1 ? "" : "s"} must connect to another external footing point.` : "External footing endpoints are connected in this model." }, { label: "Footings and slabs", status: "Review", tone: "review", detail: "Check NCC Volume Two H1D4 and ABCB Housing Provisions Section 4, then confirm the applicable design standard such as AS 2870 or AS 3600 with the project engineer." }, { label: "Site / soil inputs", status: soilClass ? "Recorded" : "Input needed", tone: soilClass ? "review" : "action", detail: soilClass ? `Site class ${soilClass} recorded from the project input; verify the full report, bearing conditions, drainage and site hazards.` : "Soil classification, bearing conditions, drainage and site hazards are not supplied." }, { label: "Structural design", status: "Professional", tone: "review", detail: "Footing dimensions, reinforcement, tie-down and movement design require a qualified practitioner." }, { label: "State / territory variation", status: jurisdictionName ? "Selected" : "Input needed", tone: jurisdictionName ? "review" : "action", detail: jurisdictionName ? `${jurisdictionName} selected; confirm its current adoption, variations and approval pathway.` : "Select the approving jurisdiction and confirm local legislation." }]; }

function renderInspector() {
  const object = selectedObject();
  if (!object) { els.inspectorKicker.textContent = "MODEL"; els.inspectorTitle.textContent = state.mode === "quantities" ? "Takeoff summary" : state.mode === "site" ? "Site concept plan" : "Project overview"; els.selectionDetails.innerHTML = renderOverview(); }
  else if (state.selected.type === "kitchen") { els.inspectorKicker.textContent="KITCHEN";els.inspectorTitle.textContent="Unit properties";els.selectionDetails.innerHTML=renderKitchenDetails(object); }
  else if (state.selected.type === "wall") { els.inspectorKicker.textContent = "WALL"; els.inspectorTitle.textContent = "Wall properties"; els.selectionDetails.innerHTML = renderWallDetails(object); }
  else if (state.selected.type === "opening") { els.inspectorKicker.textContent = object.type.toUpperCase(); els.inspectorTitle.textContent = `${object.type === "door" ? "Door" : "Window"} properties`; els.selectionDetails.innerHTML = renderOpeningDetails(object); }
  else if (state.selected.type === "deck") { els.inspectorKicker.textContent = "DECK"; els.inspectorTitle.textContent = "Deck properties"; els.selectionDetails.innerHTML = renderDeckDetails(object); }
  else if (state.selected.type === "floorOpening") { els.inspectorKicker.textContent = "FLOOR OPENING"; els.inspectorTitle.textContent = "Opening reference"; els.selectionDetails.innerHTML = renderFloorOpeningDetails(object); }
  else if (state.selected.type === "floor") { els.inspectorKicker.textContent = "FLOOR"; els.inspectorTitle.textContent = "Floor properties"; els.selectionDetails.innerHTML = renderFloorDetails(object); }
  else if (state.selected.type === "roofFraming") { els.inspectorKicker.textContent="ROOF FRAMING"; els.inspectorTitle.textContent="Members and spacing"; els.selectionDetails.innerHTML=renderRoofFramingDetails(object); }
  else if (state.selected.type === "roofJunction") { els.inspectorKicker.textContent="ROOF JUNCTION"; els.inspectorTitle.textContent="Roof junction review"; els.selectionDetails.innerHTML=renderRoofJunctionDetails(object); }
  else if (state.selected.type === "roof") { els.inspectorKicker.textContent = "ROOF"; els.inspectorTitle.textContent = "Roof properties"; els.selectionDetails.innerHTML = renderRoofDetails(object); }
  else if (state.selected.type === "room") { els.inspectorKicker.textContent = "ROOM"; els.inspectorTitle.textContent = "Room properties"; els.selectionDetails.innerHTML = renderRoomDetails(object); }
  else if(state.selected.type==="serviceItem"){els.inspectorKicker.textContent="SERVICE ITEM";els.inspectorTitle.textContent="Fitting / fixture properties";els.selectionDetails.innerHTML=renderServiceItemDetails(object);}
  else if(state.selected.type==="service"){els.inspectorKicker.textContent="SERVICE";els.inspectorTitle.textContent="Service properties";els.selectionDetails.innerHTML=renderServiceDetails(object);}
  else if(state.selected.type==="note"){els.inspectorTitle.textContent="Note properties";els.selectionDetails.innerHTML=renderNoteDetails(object);}
  else if (state.selected.type === "dimension") { els.inspectorTitle.textContent="Dimension properties"; els.selectionDetails.innerHTML=renderDimensionDetails(object); }
  else if (state.selected.type === "stair") { els.inspectorKicker.textContent = "STAIR"; els.inspectorTitle.textContent = "Stair properties"; els.selectionDetails.innerHTML = renderStairDetails(object); }
  else if (["pad", "pier"].includes(state.selected.type)) { els.inspectorKicker.textContent = state.selected.type.toUpperCase(); els.inspectorTitle.textContent = "Support properties"; els.selectionDetails.innerHTML = renderSupportDetails(object, state.selected.type); }
  else { els.inspectorKicker.textContent = "FOUNDATION"; els.inspectorTitle.textContent = "Foundation properties"; els.selectionDetails.innerHTML = renderFoundationDetails(object).replace("Top elevation relative to level", "Base elevation (project datum)"); }
  if (object && ["foundation", "pad", "pier"].includes(state.selected.type)) els.selectionDetails.innerHTML += renderReinforcementDetails(object, state.selected.type);
  const quantities = quantityData();
  const siteSummary = state.mode === "quantities" && state.model.takeoffGroups?.length ? `<div class="quantity-site-summary"><div><p class="section-kicker">SITE TAKEOFF AT A GLANCE</p><strong>Pool, driveway, foundations, fence and planting</strong><small>Open Separate takeoff groups below for every measured allowance, basis and supplier reference.</small></div><div class="takeoff-highlights">${renderSiteTakeoffHighlights()}</div></div>` : "";
  els.quantityCards.innerHTML = `<div class="quantity-card"><span>Net wall area</span><strong>${formatArea(quantities.netWallArea)}</strong><small>after openings</small></div><div class="quantity-card"><span>Floor area</span><strong>${formatArea(quantities.floorArea)}</strong><small>applied cuts deducted; check pending floors</small></div><div class="quantity-card"><span>Deck area</span><strong>${formatArea(quantities.deckArea)}</strong><small>outline area</small></div>${siteSummary}`;
  els.quantityTable.innerHTML = quantities.rows.map((row) => `<div class="quantity-row"><span>${escapeHtml(row.label)}</span><strong>${formatQuantity(row.order, row.unit)} ${row.unit}</strong><small>${escapeHtml(row.basis)}${row.waste ? ` · includes ${formatQuantity(row.waste, row.unit)} ${row.unit} waste` : ""}</small></div>`).join("");
  if(els.siteTakeoffHighlights)els.siteTakeoffHighlights.innerHTML=renderSiteTakeoffHighlights();
  if(els.customTakeoffList)els.customTakeoffList.innerHTML=renderTakeoffGroups();
  if(els.requestAuditList)els.requestAuditList.innerHTML=renderRequestAudit();
  if(els.disciplinePlanList)els.disciplinePlanList.innerHTML=renderDisciplinePlans();
  els.jurisdictionSelect.value = state.model.jurisdiction || "";
  els.soilClassSelect.value = state.model.soilClass || "";
  els.complianceList.innerHTML = complianceData().map((item) => `<div class="compliance-row"><div class="compliance-row-head"><strong>${escapeHtml(item.label)}</strong><span class="compliance-status ${item.tone}">${escapeHtml(item.status)}</span></div><small>${escapeHtml(item.detail)}</small></div>`).join("");
  els.complianceList.innerHTML += foundationReviewHtml();
  if (state.model.roofs.length) els.complianceList.innerHTML += `<div class="compliance-row"><strong>Roof design</strong><small>${state.model.roofs.filter((roof) => roofIssues(roof).length).length} roof(s) have design items for review. See the roof schedule.</small></div>`;
  if (state.model.stairs.length) els.complianceList.innerHTML += `<div class="compliance-row"><strong>Stair design</strong><small>${state.model.stairs.filter((stair) => stairIssues(stair).length).length} flight(s) have project details to review. Calculated riser/going values are not a compliance assessment.</small></div>`;
}

function renderExampleScope(){const isExample=/Queenslander/i.test(state.model.name||'')||Boolean(state.model.metadata?.designInspiration);if(!isExample)return '';const elements=state.model.sitePlan?.elements||[],has=type=>elements.some(element=>element.type===type),hasLabel=text=>elements.some(element=>element.label?.toLowerCase().includes(text));const checks=[['House brief','3 bedrooms · 2 bathrooms · L-shaped Queenslander · hip + gable roof',state.model.rooms.filter(room=>room.use==='Bedroom').length>=3&&state.model.rooms.filter(room=>room.use==='Bathroom').length>=2],['Wraparound veranda','Six deck panels with visible board layouts, 450 mm joists and 1200 mm bearers',state.model.decks.length>=6&&state.model.decks.every(deck=>deck.boards?.enabled&&deck.joistSpacing===450&&deck.bearerSpacing===1200)],['Balustrades and stairs','Continuous recorded barrier runs with clear stair access and 3 m stairs',state.model.decks.every(deck=>(deck.barriers||[]).length>0)&&state.model.stairs.some(stair=>stair.width===3000)],['Rear pool and pool deck','10,000 × 6,000 mm pool with surrounding deck and safety-fence concept',has('pool')&&has('pool-deck')&&has('pool-fence')],['Driveway, gate and property boundary','Front electric gate, concrete route to rear shed and 5 ha working boundary',has('gate')&&has('driveway')&&has('boundary-fence')&&state.model.sitePlan?.boundary?.points?.length===4],['Rear shed / garage','10,000 × 8,000 mm shed zone with local fence',has('shed')&&has('fence')],['Trees, beds and orchard','Eight indicative trees, four garden zones and a rear orchard',elements.filter(element=>element.type==='tree').length>=8&&elements.filter(element=>element.type==='planting').length>=3&&has('orchard')],['Separate takeoff and plan register','Landscaping takeoff plus Civil, Structural, Architectural, Mechanical, Landscaping, Electrical and Plumbing registers',state.model.takeoffGroups.some(group=>group.name.trim().toLowerCase()==='landscaping')&&(state.model.disciplinePlans||[]).length>=7]];return `<section class="example-scope"><div class="section-row"><div><p class="section-kicker">EXAMPLE SCOPE AUDIT</p><h3>Requested property scope</h3></div><span class="scope-audit-note">Loaded geometry · review before construction</span></div><div class="scope-audit-grid">${checks.map(([label,detail,ok])=>`<div class="scope-audit-row"><span class="scope-audit-mark ${ok?'is-ok':'is-review'}">${ok?'✓':'!'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></div>`).join('')}</div><p class="inspector-footnote">The checklist confirms model records and concept geometry are present. It does not certify survey, structural adequacy, pool safety, approvals, NCC compliance or construction handover.</p></section>`;}
function renderOverview() { const q = quantityData(); const foundationReview = q.openFoundationPoints ? `<div class="warning-note foundation-warning">${q.openFoundationPoints} external footing point${q.openFoundationPoints === 1 ? " is" : "s are"} unconnected. Join the perimeter before construction review.</div>` : ""; const handover=state.model.metadata?.handoverPackage;const completion=handover?`<div class="review-note"><strong>Handover coordination set loaded.</strong><br>${escapeHtml(handover.deckBoards)} · ${escapeHtml(handover.balustrades)} · ${escapeHtml(handover.handrails)}<br>${state.model.specifications?.length||0} finish / fixing / services records are available in Project → Specifications.<br><small>${escapeHtml(handover.status)}</small></div>`:`<div class="warning-note">Specifications are not yet supplied. Framing, finishes, structural members and services remain incomplete.</div>`; return `<p class="overview-copy">Draw the measured building on the plan. The same model drives the schematic 3D view and preliminary takeoffs.</p><div class="overview-grid"><div class="stat-card"><span>Wall length</span><strong>${formatLength(q.wallLength)}</strong><small>centreline total</small></div><div class="stat-card"><span>Openings</span><strong>${state.model.openings.length}</strong><small>doors + windows</small></div><div class="stat-card"><span>Levels</span><strong>${state.model.levels.length}</strong><small>active: ${escapeHtml(activeLevel().name)}</small></div><div class="stat-card"><span>Net wall area</span><strong>${formatArea(q.netWallArea)}</strong><small>one-face estimate</small></div></div>${foundationReview}${state.model.walls.length ? completion+renderExampleScope() : "<p class=\"empty-selection\">Select an object to edit its measured properties.</p>"}`; }
function renderWallDetails(wall) { return `<div class="detail-head"><div><p class="detail-type">${escapeHtml(levelName(wall.levelId))}</p><h3>Measured wall</h3></div><button class="delete-button" data-action="delete">Delete</button></div><div class="readout"><span>Centreline length</span><strong>${formatLength(lengthBetween(wall.a, wall.b))}</strong></div><p class="field-group-label">Wall geometry</p><div class="field-grid"><div class="inspector-field"><label for="wallStartX">Start X</label><input id="wallStartX" data-field="startX" type="number" step="100" value="${wall.a.x}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label for="wallStartY">Start Y</label><input id="wallStartY" data-field="startY" type="number" step="100" value="${wall.a.y}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label for="wallEndX">End X</label><input id="wallEndX" data-field="endX" type="number" step="100" value="${wall.b.x}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label for="wallEndY">End Y</label><input id="wallEndY" data-field="endY" type="number" step="100" value="${wall.b.y}" /><span class="field-unit">mm</span></div></div><p class="field-group-label">Construction properties</p><div class="field-grid"><div class="inspector-field"><label for="wallThickness">Thickness</label><input id="wallThickness" data-field="thickness" type="number" min="1" step="1" value="${wall.thickness}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label for="wallHeight">Height</label><input id="wallHeight" data-field="height" type="number" min="1" step="10" value="${wall.height}" /><span class="field-unit">mm</span></div><div class="inspector-field full"><label for="wallStatus">Renovation status</label><select id="wallStatus" data-field="status"><option value="new" ${wall.status === "new" ? "selected" : ""}>New work</option><option value="existing" ${wall.status === "existing" ? "selected" : ""}>Existing</option><option value="demolished" ${wall.status === "demolished" ? "selected" : ""}>Demolished</option></select></div></div><div class="warning-note">Wall assembly, framing and finish quantities are not inferred from geometry.</div>`; }
function renderOpeningDetails(opening) { const wall = state.model.walls.find((candidate) => candidate.id === opening.wallId); const maxOffset = wall ? Math.max(0, lengthBetween(wall.a, wall.b) - opening.width) : 0; return `<div class="detail-head"><div><p class="detail-type">${escapeHtml(levelName(opening.levelId))}</p><h3>${opening.type === "door" ? "Door opening" : "Window opening"}</h3></div><button class="delete-button" data-action="delete">Delete</button></div><div class="field-grid"><div class="inspector-field"><label>Offset from wall start</label><input data-field="offset" type="number" min="0" max="${maxOffset}" step="10" value="${opening.offset}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label>Width</label><input data-field="width" type="number" min="100" step="10" value="${opening.width}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label>Height</label><input data-field="height" type="number" min="100" step="10" value="${opening.height}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label>Sill height</label><input data-field="sill" type="number" min="0" step="10" value="${opening.sill}" /><span class="field-unit">mm</span></div></div><div class="readout"><span>Wall</span><strong>${wall ? formatLength(lengthBetween(wall.a, wall.b)) : "Missing"}</strong></div>${opening.type==='door'?`<label>Plan operation<select data-field="operation">${['hinged','sliding','passage'].map(value=>`<option value="${value}" ${(opening.operation||'hinged')===value?'selected':''}>${value}</option>`).join('')}</select></label><p class="inspector-footnote">Schematic operation only; panel configuration, clear opening and hardware require product details.</p>`:''}`; }
function renderDeckDetails(deck) { const boards=deck.boards||{},barriers=deck.barriers||[];const boardStatus=boards.enabled?`Decking boards visible · ${boards.width || '—'} × ${boards.thickness || '—'} mm · ${boards.gap ?? '—'} mm nominal gap`:'Decking board layout not modelled';return `<div class="detail-head"><div><p class="detail-type">${escapeHtml(levelName(deck.levelId))}</p><h3>Deck outline</h3></div><button class="delete-button" data-action="delete">Delete</button></div><div class="readout"><span>Measured outline area</span><strong>${formatArea(polygonArea(deck.points))}</strong></div><div class="field-grid"><div class="inspector-field full"><label>Relative elevation</label><input data-field="elevation" type="number" step="10" value="${deck.elevation}" /><span class="field-unit">mm</span></div></div><div class="review-note"><strong>${escapeHtml(boardStatus)}</strong><br>${barriers.length} balustrade / handrail coordination run${barriers.length===1?'':'s'} · joists ${deck.joistSpacing||'—'} mm centres · bearers ${deck.bearerSpacing||'—'} mm centres</div><div class="warning-note">Finish and fixing records are entered for coordination. Confirm selected product, spans, joints, movement gaps, edge distances, anchorage, durability, inspection and adopted NCC/standards before construction or handover certification.</div>`; }
function renderFloorDetails(floor) { return `<div class="detail-head"><div><p class="detail-type">${escapeHtml(levelName(floor.levelId))}</p><h3>Floor slab outline</h3></div><button class="delete-button" data-action="delete">Delete</button></div><div class="readout"><span>Measured outline area</span><strong>${formatArea(polygonArea(floor.points))}</strong></div><div class="field-grid"><div class="inspector-field"><label>Slab thickness</label><input data-field="thickness" type="number" min="1" step="10" value="${floor.thickness}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label>Recorded top elevation from project datum (mm)</label><input data-field="elevation" type="number" step="any" value="${floor.elevation}" /><span class="field-unit">mm</span></div></div><div class="warning-note">Sub-base, reinforcement, edge beams, moisture control and finish build-up require specified construction details.</div>`; }
function renderFoundationDetails(foundation) { const openStart = foundationEndpointConnections(foundation, foundation.a) === 0; const openEnd = foundationEndpointConnections(foundation, foundation.b) === 0; const connectionStatus = foundation.role === "internal" ? "Internal support · perimeter connection rule not applied" : openStart || openEnd ? "Open endpoint · connect this run" : "Connected to footing runs"; return `<div class="detail-head"><div><p class="detail-type">${escapeHtml(levelName(foundation.levelId))}</p><h3>Strip foundation</h3></div><button class="delete-button" data-action="delete">Delete</button></div><div class="readout"><span>Centreline length</span><strong>${formatLength(lengthBetween(foundation.a, foundation.b))}</strong></div><div class="readout"><span>Connection status</span><strong>${escapeHtml(connectionStatus)}</strong></div><div class="field-grid"><div class="inspector-field"><label>Width</label><input data-field="width" type="number" min="1" step="10" value="${foundation.width}" /><span class="field-unit">mm</span></div><div class="inspector-field"><label>Depth</label><input data-field="depth" type="number" min="1" step="10" value="${foundation.depth}" /><span class="field-unit">mm</span></div><div class="inspector-field full"><label>Role</label><select data-field="role"><option value="external" ${foundation.role === "external" ? "selected" : ""}>External perimeter</option><option value="internal" ${foundation.role === "internal" ? "selected" : ""}>Internal support</option></select></div><div class="inspector-field full"><label>Top elevation relative to level</label><input data-field="elevation" type="number" step="10" value="${foundation.elevation}" /><span class="field-unit">mm</span></div></div><div class="warning-note">Preliminary geometry only. Review against NCC 2022 Volume Two H1D4 and ABCB Housing Provisions Section 4, the applicable design standard such as AS 2870 or AS 3600, and project-specific structural and geotechnical advice.</div>`; }

function updateSelectedField(field, rawValue) {
  if(state.selected?.type==='opening'&&field==='operation'){if(['hinged','sliding','passage'].includes(rawValue))withHistory(()=>{selectedObject().operation=rawValue;});return;}
  const object = selectedObject(); if (!object) return; const before = snapshot();
  if(field==='specificationId'){if(['note','dimension','roofJunction','roofFraming'].includes(state.selected.type)||rawValue&&!(state.model.specifications||[]).some(s=>s.id===rawValue))return;withHistory(()=>object.specificationId=rawValue);return;}
  if (updateRoofFramingField(field, rawValue)) return;
  if (updateRoofJunctionField(field, rawValue)) return;
  if (updateRoomField(field, rawValue)) return;
  if(updateServiceField(field,rawValue))return;
  if(typeof updateKitchenField==='function'&&updateKitchenField(field,rawValue))return;
  if(updateNoteField(field,rawValue))return;
  if (updateDimensionField(field, rawValue)) return;
  if (updateStairField(field, rawValue)) return;
  if (updateFloorOpening(field, rawValue)) return;
  if (updateCoordinationFloorField(field, rawValue)) return;
  if (updateRoofField(field, rawValue)) return;
  if (updateFoundationField(object, field, rawValue)) return;
  const numericFields = ["thickness", "depth", "height", "offset", "width", "sill", "elevation", "startX", "startY", "endX", "endY"];
  const value = numericFields.includes(field) ? Number(rawValue) : rawValue;
  if (["thickness", "depth", "height", "width"].includes(field) && (!Number.isFinite(value) || value <= 0)) { state.statusMessage = "Value must be greater than zero"; render(); return; }
  if (["offset", "sill"].includes(field) && (!Number.isFinite(value) || value < 0)) { state.statusMessage = "Value cannot be negative"; render(); return; }
  if (field === "elevation" && (!Number.isFinite(value) || (state.selected.type !== "foundation" && value < 0))) { state.statusMessage = "Elevation cannot be negative for this object"; render(); return; }
  if (["startX", "startY", "endX", "endY"].includes(field) && !Number.isFinite(value)) { state.statusMessage = "Coordinate must be a number"; render(); return; }
  if (state.selected.type === "wall") {
    if (field === "startX") object.a.x = value;
    else if (field === "startY") object.a.y = value;
    else if (field === "endX") object.b.x = value;
    else if (field === "endY") object.b.y = value;
    else object[field] = value;
    const wallLength = lengthBetween(object.a, object.b);
    const wallOpenings = state.model.openings.filter((opening) => opening.wallId === object.id);
    if (wallLength < MIN_WALL_LENGTH || wallOpenings.some((opening) => opening.offset + opening.width > wallLength)) { state.model = before; state.statusMessage = "Wall geometry would make an opening no longer fit"; render(); return; }
  } else object[field] = value;
  if (state.selected.type === "opening") { const wall = state.model.walls.find((candidate) => candidate.id === object.wallId); const wallLength = wall ? lengthBetween(wall.a, wall.b) : 0; if (!wall || object.offset + object.width > wallLength || activeOpenings().some((opening) => opening.id !== object.id && opening.wallId === object.wallId && object.offset < opening.offset + opening.width && object.offset + object.width > opening.offset)) { state.model = before; state.statusMessage = "Opening does not fit on the selected wall"; render(); return; } }
  state.history.push(before); state.future = []; scheduleSave(); render();
}

function deleteSelected() { if (!state.selected) return; const before = snapshot(); const { type, id } = state.selected; if(type==="kitchen")state.model.kitchenUnits=(state.model.kitchenUnits||[]).filter(u=>u.id!==id); else if (type === "wall") { state.model.walls = state.model.walls.filter((wall) => wall.id !== id); state.model.openings = state.model.openings.filter((opening) => opening.wallId !== id); } else if (type === "opening") state.model.openings = state.model.openings.filter((opening) => opening.id !== id); else if (type === "deck") state.model.decks = state.model.decks.filter((deck) => deck.id !== id); else if (type === "floor") { state.model.floors = state.model.floors.filter((floor) => floor.id !== id); state.model.floorFraming = (state.model.floorFraming || []).filter(member => member.floorId !== id); const memberIds = new Set(state.model.floorFraming.map(member => member.id)); state.model.floorSupportReviews = (state.model.floorSupportReviews || []).filter(review => memberIds.has(review.memberId)); state.model.floorFitDetails = (state.model.floorFitDetails || []).filter(fit => fit.floorId !== id); state.model.floorAccessReviews = (state.model.floorAccessReviews || []).filter(review => review.floorId !== id); } else if (type === "foundation") state.model.foundations = state.model.foundations.filter((foundation) => foundation.id !== id); state.history.push(before); state.future = []; state.selected = null; state.floorFramingSelectedId = null; state.floorFitSelectedId = null; state.floorAccessSelectedId = null; scheduleSave(); render(); }

function hitTest(worldPoint) {
  if(typeof hitKitchen==='function'){const hit=hitKitchen(worldPoint);if(hit)return hit;}
  const floorOpeningHit=hitFloorOpening(worldPoint);if(floorOpeningHit)return floorOpeningHit;
  const headroomHit=hitStairHeadroom(worldPoint);if(headroomHit)return headroomHit;
  const coordinationHit=hitStairCoordination(worldPoint);if(coordinationHit)return coordinationHit;
  const serviceHit=hitService(worldPoint);if(serviceHit)return serviceHit;
  const frameHit=hitRoofFraming(worldPoint);if(frameHit)return frameHit;
  const valleyHit=hitRoofValley(worldPoint);if(valleyHit)return valleyHit;
  const junctionHit = hitRoofJunction(worldPoint); if (junctionHit) return junctionHit;
  const roofHit = hitRoof(worldPoint); if (roofHit) return roofHit;
  const noteHit=hitNote(worldPoint);if(noteHit)return noteHit;
  const dimensionHit = hitDimension(worldPoint); if(dimensionHit)return dimensionHit;
  const endHit=hitRailEnd(worldPoint);if(endHit)return endHit;
  const memberHit=hitStairMember(worldPoint);if(memberHit)return memberHit;
  const stairHit = hitStair(worldPoint); if (stairHit) return stairHit;
  const postMemberHit=hitDeckPostMember(worldPoint);if(postMemberHit)return postMemberHit;
  const edgeHit=hitDeckEdge(worldPoint);if(edgeHit)return edgeHit;
  const postHit=hitDeckPost(worldPoint);if(postHit)return postHit;
  const floorFramingHit=typeof hitFloorFraming === 'function' ? hitFloorFraming(worldPoint) : null;if(floorFramingHit)return floorFramingHit;
  const supportHit = hitSupport(worldPoint); if (supportHit) return supportHit;
  const roomHit = hitRoom(worldPoint); if (roomHit) return roomHit;
  const openings = state.visibility.openings ? activeOpenings() : []; for (const opening of openings) { const wall = state.model.walls.find((candidate) => candidate.id === opening.wallId); if (!wall) continue; const hit = distanceToSegment(worldPoint, add(wall.a, scale(unit(sub(wall.b, wall.a)), opening.offset)), add(wall.a, scale(unit(sub(wall.b, wall.a)), opening.offset + opening.width))); if (hit.distance < 220) return { type: "opening", id: opening.id }; }
  const supportReviewHit=hitDeckSupport(worldPoint);if(supportReviewHit)return supportReviewHit;
  const boardHit=hitDeckBoard(worldPoint);if(boardHit)return boardHit;
  if (state.visibility.decks) for (const deck of activeDecks()) if (pointInPolygon(worldPoint, deck.points)) return { type: "deck", id: deck.id };
  if (state.visibility.floors) for (const floor of activeFloors()) if (floorContainsPoint(floor, worldPoint)) return { type: "floor", id: floor.id };
  let nearest = null; if (state.visibility.walls) for (const wall of activeWalls()) { const hit = distanceToSegment(worldPoint, wall.a, wall.b); if (hit.distance < Math.max(220, wall.thickness / 2 + 100) && (!nearest || hit.distance < nearest.distance)) nearest = { type: "wall", id: wall.id, distance: hit.distance }; } if (nearest) return { type: nearest.type, id: nearest.id }; if (state.visibility.foundations) for (const foundation of activeFoundations()) { const hit = distanceToSegment(worldPoint, foundation.a, foundation.b); if (hit.distance < Math.max(260, foundation.width / 2 + 120)) return { type: "foundation", id: foundation.id }; } return null;
}

function pointInPolygon(pointValue, polygonPoints) { let inside = false; for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) { const xi = polygonPoints[i].x; const yi = polygonPoints[i].y; const xj = polygonPoints[j].x; const yj = polygonPoints[j].y; const intersect = yi > pointValue.y !== yj > pointValue.y && pointValue.x < ((xj - xi) * (pointValue.y - yi)) / (yj - yi) + xi; if (intersect) inside = !inside; } return inside; }

function commitWall() {
  if (!state.drawing) return; const start = state.drawing.start; let end = state.drawing.current; const exactLength = Number(els.exactLength.value); if (exactLength > 0) { const rawDirection = sub(end, start); const direction = lengthBetween(start, end) >= 1 ? unit(rawDirection) : { x: 1, y: 0 }; end = add(start, scale(direction, exactLength)); } end = snapPoint(end, start); const length = lengthBetween(start, end); if (length < MIN_WALL_LENGTH) { state.statusMessage = "Wall is too short"; state.drawing = null; render(); return; } withHistory(() => { state.model.walls.push({ id: uid("wall"), levelId: state.model.activeLevelId, a: start, b: end, thickness: 140, height: 2700, status: "new", specification: "Unspecified wall assembly" }); }); state.drawing = null; state.statusMessage = `Wall added at ${formatLength(length)}`; }

function commitFoundation() { if (!state.drawing) return; const start = state.drawing.start; let end = state.drawing.current; const exactLength = Number(els.exactLength.value); if (exactLength > 0) { const rawDirection = sub(end, start); const direction = lengthBetween(start, end) >= 1 ? unit(rawDirection) : { x: 1, y: 0 }; end = add(start, scale(direction, exactLength)); } end = snapPoint(end, start); const length = lengthBetween(start, end); if (length < MIN_WALL_LENGTH) { state.statusMessage = "Foundation is too short"; state.drawing = null; render(); return; } withHistory(() => { state.model.foundations.push({ id: uid("foundation"), levelId: state.model.activeLevelId, a: start, b: end, width: 450, depth: 300, elevation: (activeLevel()?.elevation || 0) - 600, status: "preliminary", specification: "Foundation sizing and reinforcement require engineering" }); }); state.drawing = null; state.statusMessage = `Foundation added at ${formatLength(length)}`; render(); }

function openingFits(wall, offset, width) { return offset >= 0 && offset + width <= lengthBetween(wall.a, wall.b) && !activeOpenings().some((opening) => opening.wallId === wall.id && offset < opening.offset + opening.width && offset + width > opening.offset); }
function placeOpening(type, worldPoint) { let nearest = null; for (const wall of activeWalls()) { const hit = distanceToSegment(worldPoint, wall.a, wall.b); if (hit.distance < Math.max(260, wall.thickness / 2 + 120) && (!nearest || hit.distance < nearest.hit.distance)) nearest = { wall, hit }; } if (!nearest) { state.statusMessage = "Tap near a wall to place an opening"; render(); return; } const width = type === "window" ? 1200 : 900; const offset = Math.round((nearest.hit.t * lengthBetween(nearest.wall.a, nearest.wall.b) - width / 2) / 100) * 100; if (!openingFits(nearest.wall, offset, width)) { state.statusMessage = "That opening overlaps another opening"; render(); return; } withHistory(() => { state.model.openings.push({ id: uid("opening"), levelId: nearest.wall.levelId, wallId: nearest.wall.id, type, offset: Math.max(0, offset), width, height: type === "window" ? 1200 : 2100, sill: type === "window" ? 900 : 0, status: "new" }); }); state.statusMessage = `${type === "window" ? "Window" : "Door"} opening added`; }

function addDeckPoint(worldPoint) { const snapped = snapPoint(worldPoint); if (state.deckDraft.length >= 3 && lengthBetween(snapped, state.deckDraft[0]) < 180) { finishDeck(); return; } state.deckDraft.push(snapped); state.statusMessage = `${state.deckDraft.length} deck points`; render(); }
function finishDeck() { if (state.deckDraft.length < 3) { state.statusMessage = "A deck needs at least three points"; render(); return; } const points = state.deckDraft.slice(); state.deckDraft = []; withHistory(() => { state.model.decks.push({ id: uid("deck"), levelId: state.model.activeLevelId, points, elevation: 0, thickness: 0, status: "new", specification: "Deck board and support specification required" }); }); state.statusMessage = `Deck added at ${formatArea(polygonArea(points))}`; render(); }
function addFloorPoint(worldPoint) { const snapped = snapPoint(worldPoint); if (state.floorDraft.length >= 3 && lengthBetween(snapped, state.floorDraft[0]) < 180) { finishFloor(); return; } state.floorDraft.push(snapped); state.statusMessage = `${state.floorDraft.length} floor points`; render(); }
function finishFloor() { if (state.floorDraft.length < 3) { state.statusMessage = "A floor needs at least three points"; render(); return; } const points = state.floorDraft.slice(); state.floorDraft = []; withHistory(() => { state.model.floors.push({ id: uid("floor"), levelId: state.model.activeLevelId, points, elevation: activeLevel().elevation, thickness: 100, status: "new", specification: "Floor build-up specification required" }); }); state.statusMessage = `Floor added at ${formatArea(polygonArea(points))}`; render(); }
function finishOutline() { if (state.serviceDraft.length) finishServiceRoute(); else if (state.roomDraft.length) finishRoom(); else if (state.floorDraft.length) finishFloor(); else finishDeck(); }
function cancelDrawing() { state.drawing = null; state.deckDraft = []; state.floorDraft = []; state.roomDraft = []; state.serviceDraft = []; state.serviceError = ""; state.pointerAction = null; render(); }

function panBy(dx, dy) { state.view.offsetX += dx; state.view.offsetY += dy; render(); }
function zoomAt(factor, x, y) { if (state.mode === "3d") { state.view.isoScale = clamp(state.view.isoScale * factor, .02, .5); render(); return; } const world = screenToWorld(x, y); state.view.scale = clamp(state.view.scale * factor, .025, 1.2); state.view.offsetX = x - world.x * state.view.scale; state.view.offsetY = y - world.y * state.view.scale; render(); }
function touchCenter() { const points = [...state.touchPointers.values()]; return { x: points.reduce((sum, pointValue) => sum + pointValue.x, 0) / points.length, y: points.reduce((sum, pointValue) => sum + pointValue.y, 0) / points.length }; }
function touchDistance() { const points = [...state.touchPointers.values()]; return points.length < 2 ? 0 : Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y); }

function onPointerDown(event) {
  const screen = eventPoint(event);
  if (event.pointerType === "touch") { canvas.setPointerCapture(event.pointerId); state.touchPointers.set(event.pointerId, screen); state.touchGesture = { center: touchCenter(), distance: touchDistance() }; return; }
  canvas.setPointerCapture(event.pointerId);
  const world = screenToWorld(screen.x, screen.y);
  if (state.mode === "3d" || state.tool === "pan") { state.pointerAction = { kind: state.mode === "3d" ? ((event.shiftKey || event.button === 1 || event.button === 2) ? "pan3d" : "orbit") : "pan", pointerId: event.pointerId, last: screen }; if(state.mode==='3d')canvas.style.cursor='grabbing'; return; }
  if (["wall", "foundation", "roof", "stair", "dimension", "note", "service"].includes(state.tool)) { const start = snapPoint(world); state.drawing = { kind: state.tool, start, current: start, pointerId: event.pointerId }; render(); return; }
  if(state.tool==='kitchen'){placeKitchen(world);return;}
  if(state.tool==='kitchenMove'){moveKitchen(world);return;}
  if (state.tool === "service-route") { addServicePoint(world); return; }
  if (["service-fitting","service-fixture"].includes(state.tool)) { placeServiceItem(state.tool==="service-fitting"?"fitting":"fixture",world); return; }
  if (state.tool === "deck") { addDeckPoint(world); return; }
  if (state.tool === "floor") { addFloorPoint(world); return; }
  if (state.tool === "room") { addRoomPoint(world); return; }
  if (state.tool === "pad" || state.tool === "pier") { placeSupport(state.tool, world); return; }
  if (state.tool === "door" || state.tool === "window") { placeOpening(state.tool, world); return; }
  state.selected = state.tool === "select" ? hitTest(world) : null; state.statusMessage = state.selected ? "Object selected" : "Ready"; render();
}

function onPointerMove(event) {
  const screen = eventPoint(event);
  if (["roof", "stair", "dimension", "note", "service"].includes(state.drawing?.kind) && state.drawing.pointerId === event.pointerId) { state.drawing.current = snapPoint(screenToWorld(screen.x, screen.y)); render(); return; }
  if (event.pointerType === "touch") { state.touchPointers.set(event.pointerId, screen); if (state.touchPointers.size === 1 && state.touchGesture) { const center = touchCenter(); panBy(center.x - state.touchGesture.center.x, center.y - state.touchGesture.center.y); state.touchGesture.center = center; } else if (state.touchPointers.size >= 2 && state.touchGesture) { const distance = touchDistance(); if (state.touchGesture.distance > 0) zoomAt(distance / state.touchGesture.distance, screen.x, screen.y); state.touchGesture.distance = distance; state.touchGesture.center = touchCenter(); } return; }
  if (state.drawing?.kind === "wall" || state.drawing?.kind === "foundation") { state.drawing.current = snapPoint(screenToWorld(screen.x, screen.y), state.drawing.start); render(); return; }
  if (!state.pointerAction) return;
  const dx = screen.x - state.pointerAction.last.x; const dy = screen.y - state.pointerAction.last.y;
  if (state.pointerAction.kind === "pan") panBy(dx, dy);
  else if (state.pointerAction.kind === "pan3d") { state.view.orbitX += dx; state.view.orbitY += dy; render(); }
  else { state.view.orbitYaw += dx * .012; state.view.orbitPitch = clamp(state.view.orbitPitch - dy * .009, .18, 1.3); render(); }
  state.pointerAction.last = screen;
}

function onPointerUp(event) {
  if (event.type === "pointercancel") { state.drawing = null; state.pointerAction = null; state.touchPointers.delete(event.pointerId); state.touchGesture = null; if (state.mode==='3d')canvas.style.cursor='grab'; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); render(); return; }
  if (["roof", "stair", "dimension", "note", "service"].includes(state.drawing?.kind) && state.drawing.pointerId === event.pointerId) { const screen = eventPoint(event); state.drawing.current = snapPoint(screenToWorld(screen.x, screen.y)); if(state.drawing.kind==="service")commitService();else if(state.drawing.kind==="note")commitNote();else if(state.drawing.kind==="dimension") commitDimension(); else if (state.drawing.kind === "stair") commitStair(); else commitRoof(); }
  if (event.pointerType === "touch") { state.touchPointers.delete(event.pointerId); if (!state.touchPointers.size) state.touchGesture = null; return; }
  if ((state.drawing?.kind === "wall" || state.drawing?.kind === "foundation") && state.drawing.pointerId === event.pointerId) { if (state.drawing.kind === "foundation") commitFoundation(); else commitWall(); state.pointerAction = null; }
  else if (state.pointerAction?.pointerId === event.pointerId) { state.pointerAction = null; if(state.mode==='3d')canvas.style.cursor='grab'; }
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

function setTool(tool) { state.tool = tool; state.statusMessage = tool === "wall" ? "Draw a measured wall" : tool === "foundation" ? "Draw a preliminary strip foundation" : tool === "deck" ? "Add deck outline points" : tool === "floor" ? "Add floor outline points" : tool === "room" ? "Add room boundary points" : tool === "pan" ? "Drag to pan the view" : "Ready"; state.drawing = null; if (tool !== "deck") state.deckDraft = []; if (tool !== "floor") state.floorDraft = []; if (tool !== "room") state.roomDraft = []; if (tool !== "service-route") state.serviceDraft = []; state.serviceError = ""; render(); }
function setMode(mode) { const previousMode=state.mode; state.mode = mode; if(canvas?.style)canvas.style.cursor=mode==='3d'?'grab':'crosshair'; if(mode==='site'){state.tool='select';state.visibility.siteConcepts=true;} if(mode==='3d'&&previousMode!=='3d')state.view.walkthroughScope='house'; state.selected = null; state.drawing = null; state.deckDraft = []; state.floorDraft = []; state.roomDraft = []; state.serviceDraft = []; state.serviceError = ""; state.view.initialized = false; fitView(); render(); }

function setAllLayers(visible) { state.hidden3dLevels.clear(); for (const key of Object.keys(state.visibility)) state.visibility[key] = visible; state.selected = null; render(); }

function loadExample(options = {}) { const focusSite = options.focusSite === true; state.showExamplePrompt = false; if (focusSite) { state.mode = "site"; state.tool = "select"; state.visibility.siteConcepts = true; } withHistory(() => { state.model = createExampleModel(); els.projectName.value = state.model.name; state.selected = null; state.roomDraft = []; state.serviceDraft = []; state.serviceError = ""; state.floorDraft = []; state.deckDraft = []; state.drawing = null; state.view.initialized = false; fitView(); }); if(!focusSite&&typeof kitchenPlan==='function')kitchenPlan();state.statusMessage = focusSite ? "Example house loaded · Site plan shows the pool, driveway, landscaping, fence and gate" : "Example house loaded · Interior plan, Exterior 3D, Kitchen and Elevations are ready";render(); }
function newProject() { state.showExamplePrompt = false; state.model = createEmptyModel(); els.projectName.value = state.model.name; state.history = []; state.future = []; state.selected = null; state.deckDraft = []; state.floorDraft = []; state.roomDraft = []; state.serviceDraft = []; state.serviceError = ""; state.drawing = null; state.view.initialized = false; scheduleSave(); fitView(); render(); }
function download(name, content, type) { const blob = new Blob([content], { type }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function drawingSheetHtml({name,level,view,image,logo,layers,levels,date}) {
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image))throw new Error('Sheet requires a local PNG snapshot.');
  if(!logo.startsWith('data:image/svg+xml,'))throw new Error('Sheet requires an embedded brand logo.');
  const e=escapeHtml;
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${e(name)} — BC Design sheet</title><style>@page{size:A3 landscape;margin:12mm}*{box-sizing:border-box}body{font:14px 'Segoe UI',sans-serif;color:#203b2b;margin:20px}header{display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid #1c6243;padding:12px}header img{width:240px}h1{font-size:23px;margin:0}h2{font-size:16px;margin:5px 0}.drawing{height:65vh;display:flex;justify-content:center;align-items:center;border:1px solid #b7c8bd;margin-top:15px}.drawing img{max-width:100%;max-height:100%;object-fit:contain}footer{border-top:2px solid #1c6243;padding-top:10px;margin-top:15px;font-size:12px}.warning{color:#9a252b;font-weight:bold}.print-help{background:#eef5ef;padding:10px}@media print{body{margin:0}.print-help{display:none}.drawing{height:205mm}header img{width:60mm}footer{break-inside:avoid}}</style></head><body><div class="print-help">Use your browser's Print → Save as PDF if needed. A3 landscape, 100% recommended for layout only. This snapshot is NOT TO SCALE; use written dimensions and verify on site.</div><header><img alt="Bloxham Building &amp; Construction" src="${e(logo)}"><div><h1>${e(name)}</h1><h2>${e(view)} · ${e(level)}</h2><span>BC Design · Preliminary review sheet</span></div></header><main class="drawing"><img alt="Captured BC Design drawing" src="${image}"></main><footer><div><strong>Sheet 1 of 1 · NOT TO SCALE · ${e(date)}</strong></div><p>Build layers shown: ${e(layers)}<br>3D levels shown: ${e(levels)}. Plan follows the active level. Quantities and project JSON are separate exports.</p><p class="warning">PRELIMINARY — NOT FOR CONSTRUCTION OR CERTIFICATION</p><p>Current viewport snapshot; off-screen geometry or text may be omitted. Not a complete drawing set. Check written dimensions, project specifications, adopted NCC/standards, approvals and qualified design review. Frame, barrier and reinforcement graphics remain schematic. No approval or compliance is inferred.</p></footer></body></html>`;
}
async function exportDrawingSheet() {
  const button=document.querySelector('#sheetButton');button.disabled=true;
  try {
    if(state.drawing||state.serviceDraft.length||state.deckDraft.length||state.floorDraft.length||state.roomDraft.length)throw new Error('Finish or cancel the current drawing before exporting a sheet.');
    const logoResponse=await fetch('brand-logo.svg');if(!logoResponse.ok)throw new Error('Brand logo could not be loaded.');
    const logo='data:image/svg+xml,'+encodeURIComponent(await logoResponse.text());
    const selected=state.selected;state.selected=null;try{if(state.mode==='3d')render3d();else renderPlan();}finally{state.selected=selected;}
    const image=canvas.toDataURL('image/png');
    const html=drawingSheetHtml({name:els.projectName.value.trim()||state.model.name,level:activeLevel().name,view:state.mode==='3d'?'Schematic 3D':'Plan',image,logo,layers:Object.entries(state.visibility).filter(([,v])=>v).map(([key])=>key).join(', '),levels:state.model.levels.filter(l=>!state.hidden3dLevels.has(l.id)).map(l=>l.name).join(', ')||'None',date:new Date().toLocaleDateString('en-AU',{timeZone:'Australia/Brisbane'})});
    download('bc-design-review-sheet.html',html,'text/html');state.statusMessage='Review sheet downloaded — not to scale';
  }catch(error){state.statusMessage=`Sheet export failed: ${error.message}`;}
  finally{button.disabled=false;render();}
}
function saveJson() { persist(); const safeName = (els.projectName.value.trim() || "bc-design-project").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); download(`${safeName || "bc-design-project"}.json`, JSON.stringify(state.model, null, 2), "application/json"); state.statusMessage = "Project JSON downloaded"; render(); }
function openJson(file) { const reader = new FileReader(); reader.addEventListener("load", () => { try { const model = normalizeModel(JSON.parse(reader.result)); state.showExamplePrompt = false; state.history.push(snapshot()); state.future = []; state.model = model; els.projectName.value = model.name; state.selected = null; state.roomDraft = []; state.serviceDraft = []; state.serviceError = ""; state.floorDraft = []; state.deckDraft = []; state.drawing = null; state.view.initialized = false; scheduleSave(); fitView(); render(); state.statusMessage = "Project JSON opened"; } catch (error) { state.statusMessage = `Open failed: ${error.message}`; render(); } }); reader.readAsText(file); }
function exportCsv() { const q = quantityData(); const lines = [["Package","Net quantity","Waste allowance","Order quantity","Unit","Basis"], ...q.rows.map((row) => [row.label, quantityValue(row.net, row.unit), quantityValue(row.waste, row.unit), quantityValue(row.order, row.unit), row.unit, row.basis])]; download("bc-design-quantities.csv", lines.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv"); state.statusMessage = "Quantities CSV downloaded"; render(); }
function exportCompleteTakeoffCsv(){
  const q=quantityData(),groups=state.model.takeoffGroups||[];
  const lines=[['Source','Category','Item','Net quantity','Waste allowance','Order quantity','Unit','Basis'],...q.rows.map(row=>['Building','Measured building quantities',row.label,quantityValue(row.net,row.unit),quantityValue(row.waste,row.unit),quantityValue(row.order,row.unit),row.unit,row.basis])];
  for(const group of groups)lines.push(...group.items.map(item=>[group.name,item.category||'General site works',item.name,item.quantity,'',item.quantity,item.unit,item.basis]));
  for(const row of siteQuantityChecks().filter(row=>row.measured!==null))lines.push(['Site geometry','Drawing / allowance reconciliation',row.name,row.measured,'','','m²',`Drawn polygon area; recorded allowance ${row.recorded??'missing'} m²; ${row.matches?'matches':'review required'}. Comparison only; do not add to allowance rows.`]);
  download('bc-design-complete-takeoff.csv',lines.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');
  state.statusMessage='Complete takeoff CSV downloaded';render();
}

function pointFieldValue(field, value) { return Number(value); }

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
document.querySelector("#fitButton").addEventListener("click", () => { state.view.initialized = false; fitView(); render(); });
document.querySelector("#exteriorViewButton")?.addEventListener("click", () => { state.mode = "3d"; state.view.walkthroughScope = "house"; state.view.initialized = false; fitView(); render(); });
document.querySelector("#siteWalkthroughButton")?.addEventListener("click", () => { state.mode = "3d"; state.view.walkthroughScope = "site"; state.view.initialized = false; fitView(); render(); });
document.querySelector("#undoButton").addEventListener("click", undo);
document.querySelector("#redoButton").addEventListener("click", redo);
document.querySelector("#csvButton").addEventListener("click", exportCsv);
document.querySelector("#exportCompleteTakeoffButton").addEventListener("click", exportCompleteTakeoffCsv);
document.querySelector("#requestAuditCsvButton").addEventListener("click", exportRequestAuditCsv);
document.querySelector('#sheetButton').addEventListener('click',exportDrawingSheet);
document.querySelector('#planSheetButton').addEventListener('click',openPlanSheet);
document.querySelector('#siteSheetButton').addEventListener('click',openSitePlanSheet);
document.querySelector('#sheetSetButton').addEventListener('click',openSheetSet);
document.querySelector('#layoutSheetsButton').addEventListener('click',openLayoutSheets);
document.querySelector('#disciplinePlansTab')?.addEventListener('click',()=>{if(window.BCWorkspace?.showTab)window.BCWorkspace.showTab('right','project');const target=document.querySelector('#disciplinePlanList');if(target)setTimeout(()=>target.closest('section')?.scrollIntoView({block:'start'}),0);});
document.querySelector('#floorOpeningCsvButton').addEventListener('click',exportFloorOpeningCsv);
document.querySelector('#floorCutCsvButton').addEventListener('click',exportFloorCutCsv);
document.querySelector('#floorCutSchedule').addEventListener('click',event=>{const b=event.target.closest('[data-cut-floor-id]');if(b)selectCutFloor(b.dataset.cutFloorId);});
document.querySelector('#floorOpeningSchedule').addEventListener('click',event=>{const b=event.target.closest('[data-floor-opening-id]');if(b)selectFloorOpening(b.dataset.floorOpeningId);});
document.querySelector('#planSheetDialog').addEventListener('input',reviewPlanSheet);
document.querySelector('#planSheetDownload').addEventListener('click',exportPlanSheet);
document.querySelector('#planSheetClose').addEventListener('click',()=>document.querySelector('#planSheetDialog').close());
document.querySelector('#siteSheetDialog').addEventListener('input',reviewSitePlanSheet);
document.querySelector('#siteSheetDownload').addEventListener('click',exportSitePlanSheet);
document.querySelector('#siteSheetClose').addEventListener('click',()=>document.querySelector('#siteSheetDialog').close());
document.querySelector('#sheetSetDialog').addEventListener('input',reviewSheetSet);
document.querySelector('#sheetSetDownload').addEventListener('click',exportSheetSet);
document.querySelector('#sheetSetClose').addEventListener('click',()=>document.querySelector('#sheetSetDialog').close());
document.querySelector('#layoutSheetDialog').addEventListener('input',reviewLayoutSheets);
document.querySelector('#layoutSheetDownload').addEventListener('click',exportLayoutSheets);
document.querySelector('#layoutSheetClose').addEventListener('click',()=>document.querySelector('#layoutSheetDialog').close());
document.querySelector('#addSpecificationButton').addEventListener('click',addSpecification);
document.querySelector('#specificationCsvButton').addEventListener('click',exportSpecificationCsv);
document.querySelector('#specificationLibraryExport').addEventListener('click',exportSpecificationLibrary);
document.querySelector('#specificationLibraryImport').addEventListener('click',()=>document.querySelector('#specificationLibraryFile').click());
document.querySelector('#specificationLibraryFile').addEventListener('change',event=>{const file=event.target.files[0];if(file)importSpecificationLibraryFile(file);event.target.value='';});
document.querySelector('#linkedSpecificationCsvButton').addEventListener('click',exportLinkedSpecificationCsv);
document.querySelector('#groupedSpecificationCsvButton').addEventListener('click',exportGroupedSpecificationCsv);
document.querySelector('#landscapingTakeoffCsvButton').addEventListener('click',()=>{const group=(state.model.takeoffGroups||[]).find(candidate=>candidate.name.trim().toLowerCase()==='landscaping');if(group)exportTakeoffGroupCsv(group.id);else addLandscapingTakeoff();});
document.querySelector('#customTakeoffList').addEventListener('change',event=>{if(event.target.dataset.takeoffGroupField)updateTakeoffGroup(event.target.dataset.takeoffGroup,event.target.dataset.takeoffGroupField,event.target.value);else if(event.target.dataset.takeoffItemField)updateTakeoffItem(event.target.dataset.takeoffGroup,event.target.dataset.takeoffItem,event.target.dataset.takeoffItemField,event.target.value);});
document.querySelector('#customTakeoffList').addEventListener('click',event=>{const button=event.target.closest('[data-takeoff-action]');if(!button)return;const action=button.dataset.takeoffAction;if(action==='add-landscaping')addLandscapingTakeoff();else if(action==='add-item')addTakeoffItem(button.dataset.takeoffGroup);else if(action==='remove-item')removeTakeoffItem(button.dataset.takeoffGroup,button.dataset.takeoffItem);else if(action==='export')exportTakeoffGroupCsv(button.dataset.takeoffGroup);});
document.querySelector('#disciplinePlanCsvButton').addEventListener('click',exportDisciplinePlansCsv);
document.querySelector('#disciplinePlanList').addEventListener('change',event=>{if(event.target.dataset.disciplineField)updateDisciplinePlan(event.target.dataset.disciplinePlan,event.target.dataset.disciplineField,event.target.value);});
document.querySelector('#disciplinePlanList').addEventListener('click',event=>{const button=event.target.closest('[data-discipline-action="open"]');if(button)openDisciplinePlan(button.dataset.disciplinePlan);});
document.querySelector('#linkedSpecificationSchedule').addEventListener('click',event=>{const button=event.target.closest('[data-spec-object]');if(!button)return;state.selected={type:button.dataset.specType,id:button.dataset.specObject};const object=selectedObject();if(!object){state.selected=null;return;}state.model.activeLevelId=object.levelId;render();document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});});
document.querySelector('#specificationList').addEventListener('change',event=>{if(event.target.dataset.specField)updateSpecification(event.target.dataset.specId,event.target.dataset.specField,event.target.value);});
document.querySelector("#foundationCsvButton").addEventListener("click", exportFoundationCsv);
document.querySelector("#roofCsvButton").addEventListener("click", exportRoofCsv);
document.querySelector("#roomCsvButton").addEventListener("click", exportRoomCsv);
document.querySelector("#stairCsvButton").addEventListener("click", exportStairCsv);
document.querySelector("#deckPostMemberCsvButton").addEventListener("click",exportDeckPostMemberCsv);
document.querySelector("#deckPostMemberSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-post-member-deck]");if(b)selectDeckPostMember(b.dataset.postMemberDeck,b.dataset.postMemberId);});
document.querySelector("#deckEdgeCsvButton").addEventListener("click",exportDeckEdgeCsv);
document.querySelector("#deckEdgeSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-edge-deck]");if(b)selectDeckEdge(b.dataset.edgeDeck,b.dataset.edgeId);});
document.querySelector("#deckPostCsvButton").addEventListener("click",exportDeckPostCsv);
document.querySelector("#deckPostSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-post-deck]");if(b)selectDeckPost(b.dataset.postDeck,b.dataset.postId);});
document.querySelector("#deckSupportCsvButton").addEventListener("click",exportDeckSupportCsv);
document.querySelector("#deckSupportSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-support-deck]");if(b)selectDeckSupport(b.dataset.supportDeck,Number(b.dataset.supportRow));});
document.querySelector("#deckBoardCsvButton").addEventListener("click",exportDeckBoardCsv);
document.querySelector("#deckBoardSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-board-deck]");if(b)selectDeckBoard(b.dataset.boardDeck);});
document.querySelector("#railEndCsvButton").addEventListener("click",exportRailEndCsv);
document.querySelector("#railEndSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-rail-end-owner]");if(b)selectRailEnd(b.dataset.railEndOwner,b.dataset.railEndRun,b.dataset.railEndSide);});
document.querySelector("#stairMemberCsvButton").addEventListener("click",exportStairMemberCsv);
document.querySelector("#stairMemberSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-member-stair]");if(b)selectStairMember(b.dataset.memberStair,b.dataset.memberRun);});
document.querySelector("#stairRailCsvButton").addEventListener("click", exportStairRailCsv);
document.querySelector("#stairHeadroomCsvButton").addEventListener("click",exportStairHeadroomCsv);
document.querySelector("#stairHeadroomSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-headroom-stair]");if(b)selectStairHeadroom(b.dataset.headroomStair);});
document.querySelector("#stairCoordinationCsvButton").addEventListener("click", exportStairCoordinationCsv);
document.querySelector("#stairCoordinationSchedule").addEventListener("click",event=>{const b=event.target.closest("[data-coordination-stair]");if(b)selectStairCoordination(b.dataset.coordinationStair);});
document.querySelector("#levelDatumEditor").addEventListener("change",event=>{if(event.target.dataset.levelField)updateLevelDatum(event.target.dataset.levelDatum,event.target.dataset.levelField,event.target.value);});
document.querySelector("#stairRailSchedule").addEventListener("click", event=>{const b=event.target.closest("[data-stair-rail-owner]");if(b)selectStairRail(b.dataset.stairRailOwner,b.dataset.stairRailId);});
document.querySelector('#showServiceOverlays').addEventListener('click',()=>setServiceOverlays(true));
document.querySelector('#hideServiceOverlays').addEventListener('click',()=>setServiceOverlays(false));
document.querySelector('#serviceOverlayOpacity').addEventListener('input',event=>{state.serviceOverlayOpacity=clamp(Number(event.target.value)/100,.2,1);render();});
document.querySelector('#materialReferenceList').addEventListener('click',event=>{const b=event.target.closest('[data-add-material]');if(b)addMaterialReference(b.dataset.addMaterial);});
document.querySelector('#serviceClearanceCsvButton').addEventListener('click',exportServiceClearanceCsv);
document.querySelector('#isolateServiceClearanceChecksButton').addEventListener('click',isolateServiceClearanceChecks);
function onClearanceReviewClick(event){const b=event.target.closest('button');if(!b)return;if(b.dataset.clearancePair)selectServiceClearancePair(b.dataset.clearancePair,b.dataset.overlapItem);else if(b.dataset.uncheckedClearance)selectServiceConnection(null,b.dataset.uncheckedClearance);}
document.querySelector('#serviceClearanceSchedule').addEventListener('click',onClearanceReviewClick);
els.selectionDetails.addEventListener('click',onClearanceReviewClick);
document.querySelector('#serviceRouteBodyCsvButton').addEventListener('click',exportServiceRouteBodyCsv);
document.querySelector('#isolateServiceRouteBodyButton').addEventListener('click',isolateServiceRouteBodyChecks);
document.querySelector('#serviceRouteBodySchedule').addEventListener('click',onServiceRouteBodyClick);
els.selectionDetails.addEventListener('click',onServiceRouteBodyClick);
document.querySelector('#serviceVolumeCsvButton').addEventListener('click',exportServiceVolumeCsv);
document.querySelector('#servicePhysicalCsvButton').addEventListener('click',exportServicePhysicalCsv);
document.querySelector('#isolateServicePhysicalButton').addEventListener('click',isolateServicePhysicalChecks);
document.querySelector('#serviceVolumeSchedule').addEventListener('click',onServicePhysicalClick);
document.querySelector('#servicePhysicalSchedule').addEventListener('click',onServicePhysicalClick);
els.selectionDetails.addEventListener('click',onServicePhysicalClick);
document.querySelector('#serviceEnvelopeCsvButton').addEventListener('click',exportServiceEnvelopeCsv);
document.querySelector('#serviceEnvelopeSchedule').addEventListener('click',event=>{const b=event.target.closest('[data-envelope-item]');if(b)selectServiceConnection(null,b.dataset.envelopeItem);});
document.querySelector('#serviceConnectionCsvButton').addEventListener('click',exportServiceConnectionCsv);
document.querySelector('#serviceConnectionSchedule').addEventListener('click',event=>{const b=event.target.closest('button');if(b)selectServiceConnection(b.dataset.connectionRoute,b.dataset.connectionItem,b.dataset.portId);});
els.selectionDetails.addEventListener('click',event=>{const b=event.target.closest('[data-select-connection-route]');if(b)selectServiceConnection(b.dataset.selectConnectionRoute);});
document.querySelector('#serviceCsvButton').addEventListener('click',exportServiceCsv);
document.querySelector('#serviceSegmentCsvButton').addEventListener('click',exportServiceSegmentCsv);
document.querySelector('#serviceItemCsvButton').addEventListener('click',exportServiceItemCsv);
document.querySelector('#serviceItemSchedule').addEventListener('click',event=>{const button=event.target.closest('[data-service-item-id]');if(!button)return;state.serviceError='';state.selected={type:'serviceItem',id:button.dataset.serviceItemId};state.model.activeLevelId=selectedObject().levelId;state.serviceDraft=[];render();document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});});
document.querySelector('#serviceSchedule').addEventListener('click',event=>{const button=event.target.closest('[data-service-id]');if(!button)return;state.serviceError='';state.serviceDraft=[];state.selected={type:'service',id:button.dataset.serviceId};const s=selectedObject();state.model.activeLevelId=s.levelId;render();document.querySelector('#selectionSection').scrollIntoView({block:'nearest'});});
document.querySelector("#stairSchedule").addEventListener("click", (event) => { const button = event.target.closest("[data-stair-id]"); if (!button) return; state.selected = { type: "stair", id: button.dataset.stairId }; state.model.activeLevelId = selectedObject().levelId; render(); document.querySelector("#selectionSection").scrollIntoView({ block: "nearest" }); });
document.querySelector("#roomSchedule").addEventListener("click", (event) => { const button = event.target.closest("[data-room-id]"); if (!button) return; state.selected = { type: "room", id: button.dataset.roomId }; state.model.activeLevelId = selectedObject().levelId; render(); document.querySelector("#selectionSection").scrollIntoView({ block: "nearest" }); });
document.querySelector("#floorFramingCsvButton").addEventListener("click", exportFloorFramingCsv);
document.querySelector("#floorFramingSchedule").addEventListener("click", (event) => { const button = event.target.closest("[data-floor-framing-id]"); if (button) selectFloorFraming(button.dataset.floorFramingId, button.dataset.floorId); });
document.querySelector('#addRoofFramingButton').addEventListener('click',addRoofFraming);
 document.querySelector('#roofFramingCsvButton').addEventListener('click',()=>exportRoofFramingCsv());
 document.querySelector('#roofFramingMembersCsvButton').addEventListener('click',()=>exportRoofFramingCsv(true));
 document.querySelector('#roofFramingSchedule').addEventListener('click',event=>{const b=event.target.closest('[data-roof-framing-id]');if(b)selectRoofFraming(b.dataset.roofFramingId);});
 els.selectionDetails.addEventListener('click',event=>{const b=event.target.closest('[data-rf-product]');if(b)applyRoofFrameReference(b.dataset.rfProduct);});
 document.querySelector('#roofValleyCsvButton').addEventListener('click',exportRoofValleyCsv);
document.querySelector('#addRoofJunctionButton').addEventListener('click',addRoofJunction);
document.querySelector('#roofJunctionCsvButton').addEventListener('click',exportRoofJunctionCsv);
document.querySelector('#roofJunctionSchedule').addEventListener('click',event=>{const b=event.target.closest('[data-roof-junction-id]');if(b)selectRoofJunction(b.dataset.roofJunctionId);});
document.querySelector("#roofSchedule").addEventListener("click", (event) => { const button = event.target.closest("[data-roof-id]"); if (!button) return; state.selected = { type: "roof", id: button.dataset.roofId }; state.model.activeLevelId = selectedObject().levelId; render(); document.querySelector("#selectionSection").scrollIntoView({ block: "nearest" }); });
document.querySelector("#foundationSchedule").addEventListener("click", (event) => { const button = event.target.closest("[data-member-id]"); if (!button) return; state.selected = { type: button.dataset.memberType, id: button.dataset.memberId }; state.model.activeLevelId = selectedObject().levelId; render(); document.querySelector("#selectionSection").scrollIntoView({ block: "nearest" }); });
document.querySelector("#saveButton").addEventListener("click", saveJson);
document.querySelector("#openButton").addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => { if (els.fileInput.files[0]) openJson(els.fileInput.files[0]); els.fileInput.value = ""; });
document.querySelector("#loadExampleButton").addEventListener("click", loadExample);
document.querySelector("#emptyExampleButton").addEventListener("click", loadExample);
document.querySelector("#loadExampleTopButton").addEventListener("click", loadExample);
document.querySelector("#examplePromptButton").addEventListener("click", loadExample);
document.querySelector("#examplePromptDismiss").addEventListener("click", () => { state.showExamplePrompt = false; render(); });
document.querySelector("#newProjectButton").addEventListener("click", () => { if (els.newDialog.showModal) els.newDialog.showModal(); else if (window.confirm("Start a new building?")) newProject(); });
els.newDialog.addEventListener("close", () => { if (els.newDialog.returnValue === "confirm") newProject(); });
document.querySelector("#addLevelButton").addEventListener("click", () => { const name = window.prompt("Level name", `Level ${state.model.levels.length + 1}`); if (!name?.trim()) return; withHistory(() => { const level = { id: uid("level"), name: name.trim().slice(0, 40), elevation: state.model.levels.length * 2700 }; state.model.levels.push(level); state.model.activeLevelId = level.id; }); state.statusMessage = "Level added"; });
els.levelSelect.addEventListener("change", () => { state.model.activeLevelId = els.levelSelect.value; state.serviceDraft=[];state.serviceError=""; state.selected = null; state.statusMessage = `Active level: ${levelName(els.levelSelect.value)}`; render(); });
els.projectName.addEventListener("input", scheduleSave);
document.querySelector("#openQuantitiesButton").addEventListener("click", () => setMode("quantities"));
document.querySelectorAll("[data-layer]").forEach((checkbox) => checkbox.addEventListener("change", () => { state.visibility[checkbox.dataset.layer] = checkbox.checked; const selectedType = { deckEdges:"deck", deckPostMembers:"deck", deckPosts:"deck", deckPostFootings:"deck", deckSupports:"deck", deckBoards:"deck", stairRailReturns:"stair", stairRailConnections:"stair", stairRailMembers:"stair", stairHeadroom: "stair", floorOpenings: "floorOpening", notes: "note", dimensions: "dimension", stairs: "stair", stairLandings: "stair", stairHandrails: "stair", stairBarriers: "stair", stairCoordination: "stair", rooms: "room", roofs: "roof", roofJunctions:"roofJunction", roofFraming:"roofFraming", foundations: "foundation", pads: "pad", piers: "pier", floors: "floor", walls: "wall", openings: "opening", decks: "deck" }[checkbox.dataset.layer]; if (!checkbox.checked && ((state.selected?.type === selectedType && (selectedType !== "deck" || (!state.visibility.decks && !state.visibility.deckBoards && !state.visibility.deckSupports && !state.visibility.deckPosts && !state.visibility.deckPostFootings && !state.visibility.deckPostMembers && !state.visibility.deckEdges)) && (selectedType !== "stair" || (!state.visibility.stairs && !state.visibility.stairLandings && !state.visibility.stairHandrails && !state.visibility.stairBarriers && !state.visibility.stairCoordination && !state.visibility.stairHeadroom && !state.visibility.stairRailMembers && !state.visibility.stairRailReturns && !state.visibility.stairRailConnections))) || ["service","serviceItem"].includes(state.selected?.type) && selectedObject() && serviceLayer(selectedObject())===checkbox.dataset.layer)) state.selected = null; render(); }));
els.jurisdictionSelect.addEventListener("change", () => { state.model.jurisdiction = els.jurisdictionSelect.value; state.model.metadata.updatedAt = new Date().toISOString(); scheduleSave(); render(); });
els.soilClassSelect.addEventListener("change", () => { state.model.soilClass = els.soilClassSelect.value; state.model.metadata.updatedAt = new Date().toISOString(); scheduleSave(); render(); });
document.querySelector("#levelVisibility").addEventListener("change", event => { const id = event.target.dataset.visibleLevel; if (!id) return; if (event.target.checked) state.hidden3dLevels.delete(id); else state.hidden3dLevels.add(id); state.statusMessage = "3D level visibility changed; plan and schedules unchanged"; render(); });
document.querySelector("#showAllLayersButton").addEventListener("click", () => setAllLayers(true));
els.selectionDetails.addEventListener("change", (event) => { if(event.target.dataset.floorMemberField) updateFloorMember(Number(event.target.dataset.floorMember),event.target.dataset.floorMemberField,event.target.value); else if(event.target.dataset.floorReviewField) updateFloorSupportReview(event.target.dataset.floorReview,event.target.dataset.floorReviewField,event.target.value); else if(event.target.dataset.floorFitField) updateFloorFitDetail(event.target.dataset.floorFitId,event.target.dataset.floorFitField,event.target.value); else if(event.target.dataset.floorAccessField) updateFloorAccessReview(event.target.dataset.floorAccessId,event.target.dataset.floorAccessField,event.target.value); else if(event.target.dataset.edgeField) updateDeckEdge(event.target.dataset.edgeId,event.target.dataset.edgeField,event.target.value); else if(event.target.dataset.postReviewField) updateDeckPostMember(event.target.dataset.postReviewId,event.target.dataset.postReviewField,event.target.value); else if(event.target.dataset.postField) updateDeckPost(event.target.dataset.deckPost,event.target.dataset.postField,event.target.value); else if(event.target.dataset.deckSupportField) updateDeckSupport(event.target.dataset.deckSupportField,event.target.value); else if(event.target.dataset.supportMember) toggleDeckSupportMember(event.target.dataset.supportMember,event.target.checked); else if(event.target.dataset.deckBoardField) updateDeckBoard(event.target.dataset.deckBoardField,event.target.value); else if(event.target.dataset.railEndField) updateRailEnd(Number(event.target.dataset.railEndIndex),event.target.dataset.railEnd,event.target.dataset.railEndField,event.target.value); else if (event.target.dataset.stairMemberField) updateStairMember(Number(event.target.dataset.stairMember),event.target.dataset.memberRole,event.target.dataset.stairMemberField,event.target.value); else if (event.target.dataset.headroomField) updateStairHeadroom(event.target.dataset.headroomField,event.target.value); else if (event.target.dataset.coordinationField) updateStairCoordination(event.target.dataset.coordinationField, event.target.value); else if (event.target.dataset.stairRailField) updateStairRail(Number(event.target.dataset.stairRail), event.target.dataset.stairRailField, event.target.value); else if (event.target.dataset.barrierField) updateDeckBarrier(Number(event.target.dataset.deckBarrier), event.target.dataset.barrierField, event.target.value); else if (event.target.dataset.memberField) updateDeckMember(Number(event.target.dataset.deckMember), event.target.dataset.memberField, event.target.value); else if (event.target.dataset.field) updateSelectedField(event.target.dataset.field, event.target.value); });
els.selectionDetails.addEventListener('click', event => { const button = event.target.closest('button'); if (button) { deckEdgeAction(button.dataset.action,button.dataset.edgeId,Number(document.querySelector("#de-"+button.dataset.edgeIndex+"-edge")?.value)); deckPostAction(button.dataset.action,button.dataset.postId); if(button.dataset.action==='copy-deck-board-reference')copyDeckBoardReference(document.querySelector('#db-reference').value); if(button.dataset.action==='add-floor-opening')addFloorOpening(); stairRailAction(button.dataset.action, Number(button.dataset.index)); deckMemberAction(button.dataset.action, Number(button.dataset.index)); deckBarrierAction(button.dataset.action, Number(button.dataset.index)); floorFramingAction(button.dataset.action, Number(button.dataset.index), button.dataset.reviewId); floorFitAction(button.dataset.action, button.dataset.fitId); floorAccessAction(button.dataset.action, button.dataset.accessId); } });
els.selectionDetails.addEventListener("click", (event) => { const button = event.target.closest("button"); if (!button) return; if (["service","serviceItem"].includes(state.selected?.type)) { serviceAction(button.dataset.action,Number(button.dataset.index)); return; } if (button.dataset.action === "delete") { if(state.selected?.type==="floorOpening")deleteFloorOpening();else if(state.selected?.type==="note")withHistory(()=>{state.model.notes=state.model.notes.filter(n=>n.id!==state.selected.id);state.selected=null;});else if(state.selected?.type==="dimension") withHistory(()=>{state.model.dimensions=state.model.dimensions.filter(d=>d.id!==state.selected.id);state.selected=null;}); else if (state.selected?.type === "stair") deleteStair(); else if (state.selected?.type === "room") deleteRoom(); else if (state.selected?.type === "roof") deleteRoof(); else if(state.selected?.type === "roofJunction") deleteRoofJunction(); else if(state.selected?.type === "roofFraming") deleteRoofFraming(); else if (["pad", "pier"].includes(state.selected?.type)) deleteSupport(); else deleteSelected(); } if (button.dataset.action === "add-bar") addReinforcementRow(); if (button.dataset.action === "remove-bar") removeReinforcementRow(Number(button.dataset.index)); });
els.finishDeckButton.addEventListener("click", finishOutline);
els.cancelDrawingButton.addEventListener("click", cancelDrawing);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("wheel", (event) => { event.preventDefault(); const screen = eventPoint(event); zoomAt(event.deltaY < 0 ? 1.1 : .9, screen.x, screen.y); }, { passive: false });

document.addEventListener("keydown", (event) => { const key = event.key.toLowerCase(); const modifier = event.ctrlKey || event.metaKey; if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); } else if (modifier && key === "y") { event.preventDefault(); redo(); } else if (!modifier && key === "escape") cancelDrawing(); else if (!modifier && key === "v") setTool("select"); else if (!modifier && key === "w") setTool("wall"); else if (!modifier && key === "d") setTool("door"); else if (!modifier && key === "n") setTool("window"); else if (!modifier && key === "f") setTool("floor"); else if (!modifier && key === "b") setTool("foundation"); else if (!modifier && key === "k") setTool("deck"); else if (!modifier && key === "p") setTool("pan"); else if (!modifier && key === "2") setMode("plan"); else if (!modifier && key === "3") setMode("3d"); });
window.addEventListener("resize", resizeCanvas);
document.addEventListener("keydown", (event) => { if (event.target.matches("input, select, textarea, [contenteditable]")) event.stopImmediatePropagation(); }, true);
window.addEventListener("beforeunload", () => { window.clearTimeout(state.saveTimer); persist(); });
if ("serviceWorker" in navigator && !window.BC_DESIGN_EMBEDDED) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

if(typeof initKitchen==='function')initKitchen();
if(typeof initFoundationSetout==='function')initFoundationSetout();
if(typeof initElevations==='function')initElevations();
const restoredSavedModel = restoreSaved();
if (!restoredSavedModel) loadExample({ focusSite: true });
resizeCanvas();
