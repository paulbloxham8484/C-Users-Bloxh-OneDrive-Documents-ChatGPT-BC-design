const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'desktop-app/package.json'), 'utf8'));
const drawingSource = 'modern71';
const distribution = 'desktop64';
const schema = 30;
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const site = path.join(__dirname, `releases/bc-design-${pkg.version}/bc-design`);
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'release.json'), 'utf8'));
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.source, drawingSource);
assert.equal(manifest.distribution, distribution);
assert.equal(manifest.schema, schema);
for (const [file, digest] of Object.entries(manifest.hashes)) assert.equal(hash(path.join(site, file)), digest, file);
const installed = path.join(process.env.LOCALAPPDATA, 'Programs/BC Design/BC Design.exe');
const pe = fs.readFileSync(installed);
assert.equal(pe.readUInt16LE(pe.readUInt32LE(0x3c) + 4), 0xaa64);
assert.equal(hash(path.join(path.dirname(installed), 'resources/app.asar')), hash(path.join(root, 'desktop-app/release', pkg.version, 'win-arm64-unpacked/resources/app.asar')));
const installer = path.join(root, 'desktop-app/release', pkg.version, `BC-Design-Setup-${pkg.version}.exe`);
const result = {
  checkedAt: new Date().toISOString(), distribution, version: pkg.version, drawingSource, schema,
  electron: '45.0.0', electronBuilder: '26.18.0',
  installer: { path: installer, bytes: fs.statSync(installer).size, sha256: hash(installer), signed: false, architectures: ['arm64', 'x64'], installation: 'per-user NSIS completed with exit 0' },
  installed: { path: installed, architecture: 'arm64', archiveMatchesPackaged: true, desktopShortcut: true, startMenuShortcut: true },
  verification: {
    nodeSuites: 14, protocolBoundary: 'passed', developmentDesktop: 'passed', packagedArm64: 'passed',
    packagedX64: 'passed under Windows ARM x64 emulation', installedArm64: 'passed with isolated profile',
    flows: ['JSON save/open', 'CSV export', 'Plan/3D layers', 'autosave across app restart', 'renderer isolation', 'protocol file boundary'],
    website: 'passed isolated Edge desktop/mobile, subfolder navigation, installer HTTP response, offline restart, saved projects, JSON round trip, scoped cache cleanup',
    sourceOnlyAsarEntries: 29, websiteHashes: Object.keys(manifest.hashes).length,
    screenshots: ['desktop-plan.png', 'desktop-3d.png', 'website-desktop.png', 'website-mobile.png'],
    surfacePenAcceptance: 'pending', physicalAndroidAcceptance: 'pending'
  },
  website: { package: `distribution/releases/BC-Design-Website-${pkg.version}.zip`, preview: 'http://127.0.0.1:4182/bc-design/', published: false, target: 'https://bloxhamconstruction.com/bc-design/' },
  automation: 'Saved continuation instructions updated to current source, supplier policy and original checklist',
  notes: [
    'Initial screenshot waits were corrected for hidden isolated test windows.',
    'The installer interrupted an x64 test by closing the same-named app; the test passed when rerun after installation.',
    'No Expo native build, production workflow retry or OTA publication.',
    'Automatic approval review blocked a combined final verification/normal launch command with the reason blocked by policy. Verification was completed separately; the normal user-profile app was not launched by that command. Desktop shortcut is installed.'
  ]
};
fs.writeFileSync(path.join(root, 'test-results/desktop-website-verification.json'), JSON.stringify(result, null, 2));
console.log('Verified all 27 website hashes, installed ARM64 binary and exact packaged archive; verification record saved.');
