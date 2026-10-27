const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const stub={value:'',classList:{add(){},remove(){}},getContext:()=>({}),addEventListener(){}};
const context=vm.createContext({console,document:{querySelector:()=>stub,querySelectorAll:()=>[]},window:{clearTimeout(){},setTimeout(){}}});
const scripts=require('./node-workspace-scripts.cjs')();
const pre=scripts.slice(0,scripts.indexOf('app.js'));
vm.runInContext(pre.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\n'+fs.readFileSync('app.js','utf8').split('document.querySelectorAll("[data-tool]")')[0],context);
const run=s=>vm.runInContext(s,context),get=s=>JSON.parse(JSON.stringify(run(s)));
run('render=()=>{};scheduleSave=()=>{};state.model=createEmptyModel();');
const plan={id:'p',formatVersion:1,name:'Entered timber cuts',specification:'Recorded rectangular material / grade / treatment',designRef:'Drawing revision A / compatible variants reviewed',notes:'',kerf:3,trimStart:10,trimEnd:10,pieces:[{id:'d',label:'Piece',demandRef:'Measured cut schedule A-2',length:1000,quantity:4}],stocks:[{id:'s',label:'3000 mm variant',supplier:'Test Australian supplier',sku:'EXAMPLE-3000',sourceUrl:'https://example.com/product',checkedDate:'2026-10-27',length:3000,quantity:2}]};
run('const fixture='+JSON.stringify(plan)+';');
let r=get('stockPlanReview(fixture)');assert.equal(r.status,'allocated');assert.equal(r.bars.length,2);assert.equal(r.evidence.length,0);assert.deepEqual(r.summary,{demanded:4,assigned:4,unallocated:0,usedBars:2,stockLength:6000,pieceLength:4000,kerfLength:12,trimLength:40,remaining:1948});
assert.deepEqual(r.bars[0].pieces.map(p=>[p.start,p.end,p.kerfAfter]),[[10,1010,3],[1013,2013,3]]);
assert.deepEqual(get('stockPlanReview(fixture)'),r,'deterministic / no mutation');
run('let x=clone(fixture);x.stocks[0].length=2026;x.stocks[0].quantity=2;');assert.equal(run('stockPlanReview(x).summary.remaining'),0);
run('x.stocks[0].length=2025.999;');assert.equal(run('stockPlanReview(x).unallocated.length'),2,'one micrometre short is not accepted');
run('x=clone(fixture);x.kerf=0;x.trimStart=0;x.trimEnd=0;x.pieces[0].length=.1;x.pieces[0].quantity=3;x.stocks[0].length=.3;x.stocks[0].quantity=1;');assert.equal(run('stockPlanReview(x).summary.remaining'),0,'decimal exact fit');
run('x=clone(fixture);x.kerf=null;');assert.equal(run('stockPlanReview(x).status'),'pending');assert.equal(run('stockPlanReview(x).summary'),null);assert.equal(run('stockPlanReview(x).bars.length'),0);
for(const key of ['length','quantity']){run(`x=clone(fixture);x.pieces[0].${key}=null;`);assert.equal(run('stockPlanReview(x).status'),'pending');run(`x=clone(fixture);x.stocks[0].${key}=null;`);assert.equal(run('stockPlanReview(x).status'),'pending');}
run('x=clone(fixture);x.stocks[0].quantity=1;');assert.equal(run('stockPlanReview(x).status'),'unallocated');assert.equal(run('stockPlanReview(x).unallocated.length'),2);
run('x=clone(fixture);x.trimStart=4000;');assert.equal(run('stockPlanReview(x).bars.length'),0,'trims consume whole stock');
run('x=clone(fixture);x.pieces[0].length=4000;');assert.equal(run('stockPlanReview(x).unallocated.length'),4,'no automatic splice');
run('x=clone(fixture);x.stocks[0].sku="";');assert.equal(run('stockPlanReview(x).status'),'allocated');assert.match(run('stockPlanReview(x).evidence.join()'),/sku/);
run('x=clone(fixture);x.kerf=0;x.trimStart=0;x.trimEnd=0;x.pieces[0].length=900;x.pieces[0].quantity=2;x.stocks.push({...x.stocks[0],id:"s-short",length:1000,quantity:1});');assert.equal(run('stockPlanReview(x).bars[0].stockId'),'s-short');
for(const mutate of ['x.kerf=-1','x.kerf=NaN','x.kerf="0"','x.kerf=.0001','x.trimEnd=Infinity','x.stocks[0].quantity=0','x.pieces[0].quantity=1.2','x.stocks[0].length=1000001','x.pieces.push({...x.pieces[0]})','x.pieces=null','x.stocks[0].sourceUrl="javascript:alert(1)"','x.stocks[0].checkedDate="2026-02-30"','x.formatVersion=2','x.stocks[0].label=12']){run('x=clone(fixture);'+mutate);assert.throws(()=>run('validateStockPlans({stockPlans:[x]})'),mutate);}
run('x=clone(fixture);x.pieces[0].quantity=1000;x.pieces.push({...x.pieces[0],id:"extra",quantity:1});');assert.throws(()=>run('validateStockPlans({stockPlans:[x]})'));
run('x=clone(fixture);x.stocks[0].quantity=1000;x.stocks.push({...x.stocks[0],id:"extra",quantity:1});');assert.throws(()=>run('validateStockPlans({stockPlans:[x]})'));
assert.throws(()=>run('validateStockPlans({stockPlans:null})'));
run('x=clone(fixture);x.pieces=Array.from({length:101},(_,i)=>({...x.pieces[0],id:"d"+i,quantity:1}));');assert.throws(()=>run('validateStockPlans({stockPlans:[x]})'));
assert.throws(()=>run('validateStockPlans({stockPlans:Array.from({length:33},(_,i)=>stockPlanNew("p"+i))})'));
run('x=clone(fixture);x.pieces[0].quantity=1000;x.stocks[0].quantity=1000;');assert.equal(run('stockPlanReview(x).summary.assigned'),1000);
assert.equal(run('stockPlanCsv([fixture, {...fixture,id:"separate"}]).split("\\n").filter(r=>r.startsWith(\'"BAR"\')).length'),4,'plans independently allocate their candidate stock');
run('state.model.stockPlans=[clone(fixture)];const before=clone(state.model);let saved=normalizeModel(clone(state.model));');assert.deepEqual(get('saved.stockPlans'),[plan]);
run('const legacy=clone(state.model);delete legacy.stockPlans;');assert.deepEqual(get('normalizeModel(legacy).stockPlans'),[]);
run('STOCK_PLAN_UI.selectedId="p";stockPlanningChange("piece","d","length","1100");');assert.equal(run('state.model.stockPlans[0].pieces[0].length'),1100);run('undo()');assert.equal(run('state.model.stockPlans[0].pieces[0].length'),1000);run('redo()');assert.equal(run('state.model.stockPlans[0].pieces[0].length'),1100);
run('const historyCount=state.history.length;stockPlanningChange("piece","d","length","-1");');assert.equal(run('state.history.length'),run('historyCount'));assert.equal(run('state.model.stockPlans[0].pieces[0].length'),1100);
assert.deepEqual(get('state.model.walls'),get('before.walls'));assert.deepEqual(get('state.model.levels'),get('before.levels'));
run('x=clone(fixture);x.name="=HYPERLINK(1)";x.pieces[0].label='+JSON.stringify('a, b"\nline')+';');
const csv=run('stockPlanCsv([x])');assert.ok(csv.includes("'=HYPERLINK"));
// Read CSV independently, including quoted commas/newlines; every row has a stable schema.
function parse(s){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';}else cell+=ch;}row.push(cell);rows.push(row);return rows;}
const rows=parse(csv);for(const row of rows)assert.equal(row.length,26,JSON.stringify(row));
const bars=rows.filter(r=>r[0]==='BAR');assert.equal(bars.reduce((n,r)=>n+Number(r[11]),0),6000);const cuts=rows.filter(r=>r[0]==='CUT');assert.equal(cuts.reduce((n,r)=>n+Number(r[11]),0),4000);assert.equal(cuts[1][12],'1013');
const pendingRows=parse(run('stockPlanCsv([{...fixture,kerf:null}])'));assert.ok(!pendingRows.some(r=>['BAR','CUT'].includes(r[0])));
// Random independent conservation/capacity audit across different variants and decimal cuts.
let seed=451;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
for(let test=0;test<100;test++){const p=structuredClone(plan);p.kerf=Math.round(random()*5000)/1000;p.trimStart=10;p.trimEnd=15;p.pieces=Array.from({length:8},(_,i)=>({id:'d'+i,label:'D'+i,demandRef:'a',length:Math.round(100000+random()*2500000)/1000,quantity:1+Math.floor(random()*4)}));p.stocks=Array.from({length:3},(_,i)=>({...plan.stocks[0],id:'s'+i,length:2000+i*1000,quantity:5}));run('x='+JSON.stringify(p));const a=get('stockPlanReview(x)'),occurrences=new Set();for(const b of a.bars){assert.ok(b.remaining>=0);const mic=n=>Math.round(n*1000);assert.equal(mic(b.length),mic(b.pieceLength)+mic(b.kerfLength)+mic(b.trimLength)+mic(b.remaining));for(const d of b.pieces){const key=d.demandId+':'+d.occurrence;assert.ok(!occurrences.has(key));occurrences.add(key);assert.ok(d.start>=p.trimStart);assert.ok(d.end+p.kerf<=b.length-p.trimEnd+1e-7);}}for(const d of a.unallocated){const key=d.demandId+':'+d.occurrence;assert.ok(!occurrences.has(key));occurrences.add(key);}assert.equal(occurrences.size,p.pieces.reduce((n,d)=>n+d.quantity,0));for(const v of a.variants){assert.ok(v.used<=v.entered);assert.equal(v.used+v.unused,v.entered);}}
console.log('Stock planning passed: exact decimal fits, kerf/trims, bounded variants, pending/unallocated states, invalid imports, history, CSV and 100 independent conservation cases.');
