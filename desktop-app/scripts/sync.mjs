import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(desktop, '..');
const files = JSON.parse(await readFile(resolve(root, 'distribution/workspace-files.json'), 'utf8'));
await mkdir(resolve(desktop, 'workspace'), { recursive: true });
for (const file of files) {
  await mkdir(dirname(resolve(desktop, 'workspace', file)), { recursive: true });
  if (file === 'index.html') {
    const html = await readFile(resolve(root, file), 'utf8');
    // A bundled desktop app loads its own files, never an old browser service worker.
    await writeFile(resolve(desktop, 'workspace', file), html.replace('</head>', '<script src="desktop-flags.js"></script></head>'));
  } else await copyFile(resolve(root, file), resolve(desktop, 'workspace', file));
}
await writeFile(resolve(desktop, 'workspace/desktop-flags.js'), 'window.BC_DESIGN_EMBEDDED = true;\n');
const pkg=JSON.parse(await readFile(resolve(desktop,'package.json'),'utf8'));
const appSource=await readFile(resolve(root,'app.js'),'utf8'),sheetSource=await readFile(resolve(root,'plan-sheet.js'),'utf8');
const schema=Number(appSource.match(/schema:\s*(\d+)/)?.[1]),source=sheetSource.match(/revision:'([^']+)'/)?.[1];
if(!Number.isInteger(schema)||!source)throw Error('Cannot identify canonical workspace revision/schema.');
const hashes={};for(const file of files)hashes[file]=createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
await writeFile(resolve(desktop,'workspace/build-info.json'),JSON.stringify({version:pkg.version,distribution:'desktop63',source,schema,hashes},null,2));
await writeFile(resolve(desktop, 'workspace/allowed-files.json'), JSON.stringify([...files, 'desktop-flags.js','build-info.json']));
await mkdir(resolve(desktop, 'build'), { recursive: true });
await copyFile(resolve(root, 'brand-mark.png'), resolve(desktop, 'build/icon.png'));
console.log('Desktop workspace synced from the canonical drawing source (explicit source-only allowlist).');
