/* Supplier-listed dimensions checked on 26 October 2026; optional reference copies only. */
const MATERIAL_REFERENCES=Object.freeze([
  {"code":"0549667","name":"SpecRite GL17 pre-oiled Merbau DAR post — 90 × 90 mm, 2.4 m","category":"Post envelope","manufacturer":"SpecRite","grade":"GL17","finish":"Pre-oiled DAR","unit":"m","length":2400,"width":90,"thickness":90,"url":"https://www.bunnings.com.au/90-x-90mm-2-4m-post-gl17-pre-oiled-merbau-dar_p0549667","geometryNote":"Listed outer dimensions only; project loading, exposure, support and connection design are not assessed."},
  {"code":"0497554","name":"Porta H3 primed finger-jointed pine bottom handrail — 66 × 42 mm, 2.7 m","category":"Rail profile envelope","manufacturer":"Porta","grade":"","finish":"H3 LOSP, primed","unit":"m","length":2700,"width":66,"thickness":42,"url":"https://www.bunnings.com.au/66-x-42mm-2-7m-h3-primed-fj-pine-bottom-handrail_p0497554","geometryNote":"Bottom rail profile; not a top/graspable handrail recommendation. Listed outer dimensions only: manufactured profile/rebates are not represented by a rectangular envelope."},
  {key:'stratco:PINE10904548',supplier:'Stratco Australia',codeLabel:'SKU',code:'PINE10904548',name:'Pine MGP10 — 90 × 45 mm, 4.8 m',category:'Timber',manufacturer:'',grade:'MGP10',finish:'',unit:'m',length:4800,width:90,thickness:45,url:'https://www.stratco.com.au/au/building-hardware/timber/framing-timber/structural-timber/pine-mgp10-90-x-45mm-x-4.8m-length-pine10904548/'},
  {key:'stratco:PINE101203560',supplier:'Stratco Australia',codeLabel:'SKU',code:'PINE101203560',name:'Pine MGP10 — 120 × 35 mm, 6.0 m',category:'Timber',manufacturer:'',grade:'MGP10',finish:'',unit:'m',length:6000,width:120,thickness:35,url:'https://www.stratco.com.au/au/building-hardware/timber/framing-timber/structural-timber/pine-mgp10-120-x-35mm-x-6m-length-pine101203560/'},
  {code:'8030020',name:'Untreated MGP10 pine — 70 × 35 mm, 5.4 m',category:'Timber',manufacturer:'',grade:'MGP10',finish:'Untreated',unit:'m',length:5400,width:70,thickness:35,url:'https://www.bunnings.com.au/70-x-35mm-framing-mgp10-untreated-pine-5-4m_p8030020'},
  {code:'8030888',name:'Untreated MGP10 pine — 140 × 45 mm, 3.6 m',category:'Timber',manufacturer:'',grade:'MGP10',finish:'Untreated',unit:'m',length:3600,width:140,thickness:45,url:'https://www.bunnings.com.au/140-x-45mm-framing-mgp10-untreated-pine-3-6m_p8030888'},
  {code:'8031026',name:'MGP10 H2 Blue pine — 90 × 45 mm, 3.6 m',category:'Timber',manufacturer:'',grade:'MGP10',finish:'H2 Blue (listing; verify treatment class and location)',unit:'m',length:3600,width:90,thickness:45,url:'https://www.bunnings.com.au/90-x-45mm-framing-mgp10-h2-blue-pine-3-6m_p8031026'},
  {code:'8030079',name:'Untreated MGP10 pine — 90 × 45 mm, 2.4 m',category:'Timber',manufacturer:'',grade:'MGP10',finish:'Untreated',unit:'m',length:2400,width:90,thickness:45,
    url:'https://www.bunnings.com.au/90-x-45mm-framing-mgp10-untreated-pine-2-4m_p8030079'},
  {code:'0731415',name:'CSR Gyprock plasterboard — 2400 × 1200 × 10 mm',category:'Plasterboard',manufacturer:'CSR Gyprock',grade:'',finish:'Recessed edge',unit:'m²',length:2400,width:1200,thickness:10,
    url:'https://www.bunnings.com.au/gyprock-csr-2400-x-1200-x-10mm-2-88sqm-plasterboard-re_p0731415'},
  {code:'0177416',name:'SpecRite joined Merbau decking — 90 × 19 mm, 5.7 m',category:'Decking',manufacturer:'SpecRite',grade:'',finish:'Pre-oiled',unit:'m',length:5700,width:90,thickness:19,
    url:'https://www.bunnings.com.au/90-x-19mm-5-7m-merbau-joined-set-length-pre-oiled-decking_p0177416'},
  {code:'8032264',name:'H3 outdoor framing pine — 140 × 45 mm, 2.4 m',category:'Timber',manufacturer:'',grade:'',finish:'H3 treated',unit:'m',length:2400,width:140,thickness:45,
    url:'https://www.bunnings.com.au/140-x-45mm-outdoor-framing-h3-treated-pine-2-4m_p8032264'},
  {code:'0390072',name:'STRUCTAply F14 formwork plywood — 2400 × 1200 × 17 mm',category:'Formwork plywood',manufacturer:'',grade:'F14',finish:'',unit:'m²',length:2400,width:1200,thickness:17,
    url:'https://www.bunnings.com.au/structaply-2400-x-1200-x-17mm-f14-plywood-formwork_p0390072'},
  {code:'0710090',name:'Durasheet fibre cement — 2400 × 1200 × 6 mm',category:'Fibre cement',manufacturer:'',grade:'',finish:'',unit:'m²',length:2400,width:1200,thickness:6,
    url:'https://www.bunnings.com.au/durasheet-2400-x-1200-x-6mm-2-88sqm-fibre-cement-cladding_p0710090'}
].map(ref=>Object.freeze({supplier:'Bunnings Australia',checked:'2026-10-26',codeLabel:'I/N',...ref})));
function materialReferenceKey(ref){return ref.key||ref.code;}
function materialReferenceSpecification(ref) {
  const spec={id:uid('spec'),...Object.fromEntries(SPEC_FIELDS.map(key=>[key,''])),
    name:ref.name,category:ref.category,manufacturer:ref.manufacturer,productCode:ref.code,grade:ref.grade,finish:ref.finish,unit:ref.unit,
    drawingRef:ref.url,notes:'Supplier: '+ref.supplier+'. Listing checked '+ref.checked+'. '+ref.codeLabel+' '+ref.code+'. Supplier-listed product dimensions: length '+ref.length+' mm; width '+ref.width+' mm; thickness '+ref.thickness+' mm. Basis: selected product title/listing, not a physical measurement or manufacturing tolerance. Recheck exact variant and manufacturer data for the project. Product selection, cutting, treatment, coverage, allowances and structural/design suitability need project review.'};
  if(ref.geometryNote)spec.notes+=' '+ref.geometryNote;validateSpecification(spec);return spec;
}
function addMaterialReference(code) {
  const ref=MATERIAL_REFERENCES.find(ref=>materialReferenceKey(ref)===code);if(!ref)return;
  if((state.model.specifications||[]).some(spec=>spec.productCode===ref.code&&spec.drawingRef===ref.url)){
    state.materialReferenceMessage='This reference is already in Project specifications.';renderMaterialReferences();return;
  }
  const spec=materialReferenceSpecification(ref);
  withHistory(()=>{(state.model.specifications ||= []).push(spec);});
  state.materialReferenceMessage='Added '+ref.code+' to Project specifications. Link it to an object after review.';renderMaterialReferences();
}
function renderMaterialReferences() {
  const el=document.querySelector('#materialReferenceList');if(!el)return;
  el.innerHTML=MATERIAL_REFERENCES.map(ref=>'<div class="foundation-schedule-row"><strong>'+escapeHtml(ref.name)+'</strong><span>'+escapeHtml(ref.supplier)+' · '+escapeHtml(ref.codeLabel)+' '+escapeHtml(ref.code)+' · L '+ref.length+' × W '+ref.width+' × T '+ref.thickness+' mm</span><small>Supplier listing checked '+escapeHtml(ref.checked)+' · exact variant shown</small><small>'+escapeHtml(ref.geometryNote||'')+'</small><a class="link-button" href="'+escapeHtml(ref.url)+'" target="_blank" rel="noopener noreferrer">Open '+escapeHtml(ref.supplier)+' product</a><button class="link-button" type="button" data-add-material="'+escapeHtml(materialReferenceKey(ref))+'">Add reference to project specifications</button></div>').join('');
  const status=document.querySelector('#materialReferenceStatus');if(status)status.textContent=state.materialReferenceMessage||'';
}
