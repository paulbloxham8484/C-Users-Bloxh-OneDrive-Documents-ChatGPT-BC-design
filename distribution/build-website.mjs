import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkg = JSON.parse(await readFile(resolve(root, 'desktop-app/package.json'), 'utf8'));
const drawingSource = 'modern71';
const distribution = 'desktop64';
const schema = 30;
const release = resolve(here, 'releases', `bc-design-${pkg.version}`);
const site = join(release, 'bc-design');
const files = JSON.parse(await readFile(join(here, 'workspace-files.json'), 'utf8'));
const installerName = `BC-Design-Setup-${pkg.version}.exe`;
const installer = resolve(root, 'desktop-app/release', pkg.version, installerName);
// A release must never advertise a missing download.
await stat(installer);
await mkdir(join(site, 'app'), { recursive: true });
await mkdir(join(site, 'downloads'), { recursive: true });
for (const file of files) await copyFile(join(root, file), join(site, 'app', file));
await copyFile(join(root, 'brand-logo.svg'), join(site, 'brand-logo.svg'));
await copyFile(installer, join(site, 'downloads', installerName));
await copyFile(join(here, 'website.css'), join(site, 'website.css'));
const bytes = (await stat(installer)).size;
const html = (await readFile(join(here, 'website.html'), 'utf8'))
  .replaceAll('{{version}}', pkg.version).replaceAll('{{installer}}', installerName)
  .replaceAll('{{size}}', (bytes / 1024 / 1024).toFixed(0));
await writeFile(join(site, 'index.html'), html);
const paths = ['index.html', 'website.css', 'brand-logo.svg', ...files.map(f => 'app/' + f), 'downloads/' + installerName];
const hashes = {};
for (const file of paths) hashes[file] = createHash('sha256').update(await readFile(join(site, file))).digest('hex');
const chunkSize = 16 * 1024 * 1024;
const installerBytes = await readFile(installer);
const chunks = [];
for (let offset = 0, index = 0; offset < installerBytes.length; offset += chunkSize, index += 1) {
  const part = installerBytes.subarray(offset, Math.min(offset + chunkSize, installerBytes.length));
  const filename = `${drawingSource}-${pkg.version}-${String(index).padStart(3, '0')}.bin`;
  const relative = `downloads/parts/${filename}`;
  await mkdir(join(site, 'downloads', 'parts'), { recursive: true });
  await writeFile(join(site, relative), part);
  chunks.push({ path: `/bc-design/${relative}`, bytes: part.length, sha256: createHash('sha256').update(part).digest('hex') });
  hashes[relative] = chunks.at(-1).sha256;
}
const installerSha256 = hashes[`downloads/${installerName}`];
await writeFile(join(site, 'release.json'), JSON.stringify({
  version: pkg.version, source: drawingSource, distribution, schema,
  builtAt: new Date().toISOString(), signed: false, hashes,
  hosting: 'bloxhamconstruction.com/bc-design/',
  download: { filename: installerName, bytes, sha256: installerSha256, chunkSize, chunks }
}, null, 2));
await writeFile(join(release, 'WEBSITE-INSTRUCTIONS.md'), `# Add BC Design to the existing website\n\nUpload only the bc-design folder beside the existing website pages. Do not replace the existing homepage or delete other files. Use HTTPS and serve /bc-design/ and /bc-design/app/ with their index.html files. The package works under another folder too because its links are relative.\n\nAdd a website menu link: <a href="/bc-design/">BC Design</a>. To embed the workspace, use <iframe src="/bc-design/app/" title="BC Design building workspace" style="width:100%;height:85vh;border:0" allow="fullscreen"></iframe> and provide an Open full screen link. Check the host's frame policy before embedding. Full screen is recommended for Surface Pen.\n\nThe browser version saves only in that browser profile. The desktop app has its own local autosave. Transfer projects with Save JSON / Open. There is no account login, collaboration server or cross-device sync. Save JSON before clearing site data.\n\nServe downloads as application/octet-stream or application/vnd.microsoft.portable-executable and do not route them through an HTML fallback. release.json contains SHA-256 hashes. The Windows installer includes native ARM64 and x64 builds. This local preview build is unsigned; Windows may show an unknown publisher prompt. No signing certificate was purchased.\n\nThe app service worker is scoped to its app/ folder and only manages caches named for that scope. It does not cache the installer or delete other website caches. Exclude index.html, sw.js and release.json from long-lived hosting caches; fingerprinted scripts may be cached normally.\n\nNo saved projects, account data, signing helpers, repository history, source maps, tests or node_modules are included.\n\nDeployment remains pending the confirmed website address and hosting access. This folder is a local release, not evidence of publication.\n`);
console.log(`Website package ready: ${release}\nInstaller: ${(bytes / 1024 / 1024).toFixed(1)} MiB; ${paths.length} files hashed. No publication performed.`);
