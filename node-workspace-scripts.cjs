// Geometry suites run in a deliberately small DOM stub. Browser-only vendor
// initialisers are exercised by vector-pdf.browser.test.cjs in real Edge instead.
const fs=require('node:fs');
module.exports=function nodeWorkspaceScripts(){
  const vendor=new Set(['pdf-jspdf.js','pdf-svg2pdf.js','pdf-fonts.js']);
  return [...fs.readFileSync('index.html','utf8').matchAll(/<script src="([^?]+)\?[^\"]+" defer>/g)].map(m=>m[1]).filter(file=>!vendor.has(file));
};
