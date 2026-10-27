// Export only generated measured sheet SVGs. No raster/HTML printing fallback.
const VECTOR_PDF_LIMITS = Object.freeze({ pages: 64, vectors: 500000, bytes: 32 * 1024 * 1024 });
let vectorPdfFontsReady, vectorPdfBusy = false;
async function prepareVectorPdfFonts() {
  if (!window.jspdf?.jsPDF || typeof window.jspdf.jsPDF.API.svg !== 'function' || !window.BC_PDF_FONTS) throw Error('Bundled PDF components are unavailable. Reload the local workspace.');
  if (!vectorPdfFontsReady) vectorPdfFontsReady = Promise.all(Object.entries(window.BC_PDF_FONTS).map(async ([style, data]) => {
    const face = new FontFace('BCSheet', `url(data:font/ttf;base64,${data})`, { weight: style === 'bold' ? '700' : '400' });
    await face.load(); document.fonts.add(face);
  })).catch(error => { vectorPdfFontsReady = null; throw error; });
  await vectorPdfFontsReady;
}
function vectorPdfMeasureContext() {
  const context = document.createElement('canvas').getContext('2d');
  return new Proxy(context, {
    get(target, key) { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; },
    set(target, key, value) { target[key] = key === 'font' ? String(value).replace(/(px\s+).+$/, '$1BCSheet') : value; return true; }
  });
}
function vectorPdfCapture(kind, settings, measureContext) {
  let sheets;
  if (kind === 'plan') sheets = [makePlanSheet(settings, measureContext)];
  else if (kind === 'site') sheets = [makeSitePlanSheet(settings, measureContext)];
  else if (kind === 'set') {
    if (!Array.isArray(settings.levelIds) || !settings.levelIds.length || new Set(settings.levelIds).size !== settings.levelIds.length || settings.levelIds.length > VECTOR_PDF_LIMITS.pages) throw Error('Select 1 to 64 distinct levels for PDF export.');
    sheets = settings.levelIds.map((levelId, i) => makePlanSheet({ ...settings, levelId, sheetIndex: i + 1, sheetCount: settings.levelIds.length, coverage: `One PDF page per selected level (${settings.levelIds.length}); same paper and scale; all enabled Plan content; no cropping.` }, measureContext));
  } else if (kind === 'layout') {
    const descriptors = layoutSheetDescriptors(settings);
    if (!descriptors.length || descriptors.length > VECTOR_PDF_LIMITS.pages) throw Error('Choose a layout set containing 1 to 64 pages.');
    sheets = descriptors.map((item, i) => makeLayoutPlanSheet({ ...settings, ...item, sheetIndex: i + 1, sheetCount: descriptors.length, coverage: `${descriptors.length} dedicated floor/wall PDF pages at one paper size and scale; no cropping; preliminary review only.` }, measureContext));
  } else throw Error('Unknown vector PDF drawing scope.');
  if (sheets.reduce((n, s) => n + s.vectorCount, 0) > VECTOR_PDF_LIMITS.vectors) throw Error('PDF exceeds the total 500,000 vector element limit; reduce sheet selection or enabled layers.');
  return sheets;
}
function vectorPdfSvg(sheet, logo, pdf) {
  const doc = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw Error('Measured sheet SVG could not be read.');
  const svg = doc.documentElement, image = svg.querySelector('image');
  // svg2pdf interprets percentage rect lengths differently from browsers.
  // Our generated page background is exactly the root viewport in SVG units.
  const viewport = svg.getAttribute('viewBox').trim().split(/\s+/).map(Number);
  for (const rect of svg.children) if (rect.localName === 'rect') {
    if (rect.getAttribute('width') === '100%') rect.setAttribute('width', viewport[2]);
    if (rect.getAttribute('height') === '100%') rect.setAttribute('height', viewport[3]);
  }
  if (!image || image.getAttribute('href') !== '__BC_SHEET_LOGO__') throw Error('Unexpected sheet logo reference.');
  const brand = new DOMParser().parseFromString(logo, 'image/svg+xml');
  if (brand.querySelector('parsererror')) throw Error('Brand logo SVG could not be read.');
  const nested = doc.importNode(brand.documentElement, true);
  for (const key of ['x', 'y', 'width', 'height']) nested.setAttribute(key, image.getAttribute(key));
  image.replaceWith(nested);
  const allowed = new Set(['svg', 'g', 'path', 'rect', 'text', 'title', 'metadata', 'line', 'circle', 'ellipse', 'polyline', 'polygon']);
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    if (!allowed.has(node.localName)) throw Error(`Unsupported PDF vector element: ${node.localName}. Nothing was downloaded.`);
    if ([...node.attributes].some(a => /^on/i.test(a.name) || /href/i.test(a.name) || /url\(/i.test(a.value))) throw Error('External or interactive SVG content is not allowed in a PDF sheet.');
  }
  for (const text of svg.querySelectorAll('text')) {
    text.setAttribute('font-family', 'BCSheet');
    text.setAttribute('xml:space', 'preserve');
    const style = /^(bold|[6-9]00)$/.test(text.getAttribute('font-weight') || '') ? 'bold' : 'normal';
    pdf.setFont('BCSheet', style);
    const font = pdf.internal.getFont().metadata;
    for (const char of text.textContent) if (!/\s/.test(char) && (!font.characterToGlyph || !font.characterToGlyph(char.codePointAt(0)))) throw Error(`PDF font does not contain ${char} (U+${char.codePointAt(0).toString(16).toUpperCase()}). Use a supported label; no PDF was downloaded.`);
    // Both text bounds and PDF text use this bundled font; no OS-font substitution.
    text.removeAttribute('textLength'); text.removeAttribute('lengthAdjust');
  }
  // Metadata is also stored in the PDF document; titles/metadata need no drawing nodes.
  svg.querySelectorAll('metadata,title').forEach(n => n.remove());
  return svg;
}
async function vectorPdfBuild(sheets, logo, progress = () => {}) {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > VECTOR_PDF_LIMITS.pages) throw Error('PDF requires 1 to 64 measured sheets.');
  const first = sheets[0].settings;
  const pdf = new window.jspdf.jsPDF({ orientation: first.orientation, unit: 'mm', format: [first.width, first.height], compress: true, putOnlyUsedFonts: true, precision: 10 });
  for (const [style, data] of Object.entries(window.BC_PDF_FONTS)) { const name = `LiberationSans-${style}.ttf`; pdf.addFileToVFS(name, data); pdf.addFont(name, 'BCSheet', style); }
  pdf.setProperties({ title: 'BC Design measured drawing set', author: 'Bloxham Building & Construction', subject: 'Preliminary geometry review. Print actual size and verify calibration. Not for construction or certification.', creator: 'BC Design vector PDF' });
  pdf.viewerPreferences({ PrintScaling: 'None' });
  const metadata = { format: 'BC Design vector sheets', version: 1, textFont: 'Liberation Sans Regular/Bold (embedded)', pages: sheets.map(s => s.metadata) };
  pdf.addMetadata(JSON.stringify(metadata));
  // Preflight all pages before serialising any content; unsupported glyphs fail the whole set.
  const nodes = sheets.map(sheet => vectorPdfSvg(sheet, logo, pdf));
  const host = document.createElement('div');host.setAttribute('aria-hidden', 'true');host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';document.body.append(host);
  try {
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i].settings;
      if (i) pdf.addPage([s.width, s.height], s.orientation);
      const node = nodes[i]; host.replaceChildren(node);
      progress(i + 1, sheets.length);
      await pdf.svg(node, { x: 0, y: 0, width: s.width, height: s.height, loadImages: false });
    }
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    if (bytes.length > VECTOR_PDF_LIMITS.bytes) throw Error('PDF exceeds the 32 MiB export limit; reduce sheet selection.');
    return bytes;
  } finally { host.remove(); }
}
function vectorPdfDownload(name, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > VECTOR_PDF_LIMITS.bytes) throw Error('Invalid PDF export bytes.');
  if (window.ReactNativeWebView) {
    let binary = '';for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'export', name, mime: 'application/pdf', encoding: 'base64', content: btoa(binary) }));
  } else download(name, bytes, 'application/pdf');
}
async function exportVectorPdf(kind) {
  if (vectorPdfBusy) return;
  const prefix = { plan: 'planSheet', site: 'siteSheet', set: 'sheetSet', layout: 'layoutSheet' }[kind];
  if (!prefix) return;
  const output = document.querySelector(`#${prefix}Coverage`);
  vectorPdfBusy = true;document.querySelectorAll('[data-vector-pdf]').forEach(b => b.disabled = true);
  try {
    output.textContent = 'Preparing embedded fonts and vector PDF…';
    await prepareVectorPdfFonts();
    const response = await fetch('brand-logo.svg');if (!response.ok) throw Error('Brand logo could not be loaded.');const logo = await response.text();
    // Capture synchronously after all loading. Later edits cannot alter this complete snapshot.
    const settings = kind === 'plan' ? readPlanSheetSettings() : kind === 'site' ? readSiteSheetSettings() : kind === 'set' ? readSheetSetSettings() : readLayoutSheetSettings();
    const sheets = vectorPdfCapture(kind, settings, vectorPdfMeasureContext());
    const bytes = await vectorPdfBuild(sheets, logo, (i, total) => { output.textContent = `Building vector PDF page ${i} of ${total}…`; });
    vectorPdfDownload(`bc-design-${kind}-${settings.paper.toLowerCase()}-1-${settings.scale}.pdf`, bytes);
    output.textContent = `${sheets.length} vector PDF page${sheets.length === 1 ? '' : 's'} exported at 1:${settings.scale}. Print actual size on ${settings.paper}; verify each 50 mm calibration bar.`;
    state.statusMessage = output.textContent;
  } catch (error) { output.textContent = `PDF export failed: ${error.message}`; }
  finally { vectorPdfBusy = false;document.querySelectorAll('[data-vector-pdf]').forEach(b => b.disabled = false);render(); }
}
function initVectorPdf() {
  for (const [kind, prefix] of [['plan', 'planSheet'], ['site', 'siteSheet'], ['set', 'sheetSet'], ['layout', 'layoutSheet']]) {
    const existing = document.querySelector(`#${prefix}Download`);if (!existing || document.querySelector(`#${prefix}Pdf`)) continue;
    const button = document.createElement('button');button.id = `${prefix}Pdf`;button.type = 'button';button.className = 'primary-button';button.dataset.vectorPdf = kind;button.textContent = 'Download vector PDF';button.addEventListener('click', () => exportVectorPdf(kind));existing.before(button);
    const note = document.createElement('p');note.className = 'overview-copy';note.textContent = 'PDF uses embedded Liberation Sans, with text coverage checked again before export. One PDF contains all selected pages. Maximum 64 pages / 32 MiB; print actual size and check the calibration bar.';existing.parentElement.before(note);
  }
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('DOMContentLoaded', initVectorPdf);
