# Current local package — 0.6.6, 27 October 2026

The verified Windows installer is [BC-Design-Setup-0.6.6.exe](release/0.6.6/BC-Design-Setup-0.6.6.exe), 237,166,754 bytes, SHA256 `0CA14078138977663EAB7FCE910608B11523B2AD22119E19AB327A1CF71DA292`. It includes the requested site context, interactive Site 3D, example-scope audit, top-level Architectural elevations and Discipline plans, direct Open plan view actions and migration of saved Queenslander examples to the continuous perimeter foundation set. `node verify-package.cjs` passed 61 files for both ARM64 and x64. The installed executable is `%LOCALAPPDATA%/Programs/BC Design/BC Design.exe`.

# BC Design for Windows

## Current local package — site, handover and interactive 3D update, 27 October 2026

The current installer includes the requested rear pool deck and pool-fence concept, four garden zones including the orchard, driveway/gate/boundary/shed site layout, corrected continuous veranda balustrade runs with clear stair access, visible decking boards, handrails, finish/fixing records and cursor-controlled schematic 3D orbit/pan/zoom controls.

Installer: [BC-Design-Setup-0.6.0.exe](release/0.6.0/BC-Design-Setup-0.6.0.exe), 237,158,080 bytes, SHA256 `908A0AC9E47D25B4EEB467E8C3A6B6DA9B6AB1B69257FE20722244E8A2F683A6`. Package integrity passed for both ARM64 and x64. The installed executable is `%LOCALAPPDATA%/Programs/BC Design/BC Design.exe`; the desktop shortcut was relaunched after the final build.

## Latest local package — 0.6.0 site concept refresh, 27 October 2026

The Windows workspace and combined ARM64/x64 installer were regenerated from the canonical source. The installer is [BC-Design-Setup-0.6.0.exe](release/0.6.0/BC-Design-Setup-0.6.0.exe), 237,150,639 bytes, SHA256 `A67FA3A07D102D81EC818A11D2CDB8DAF12A1F5F1C576760C236932BB336C0E4`. Package integrity passed with 61 allowlisted files per architecture. The installer was installed locally as `0.6.0.0`; the actual desktop shortcut was launched and visually verified with the Site plan rendered, including the pool, driveway, landscaping, fence, gate, shed and transparent annotation boxes. The app is currently open on that view. The blank-project starter prompt and persistent **Example house** header action are included.

## Latest local package — 0.6.0 site concept refresh, 27 October 2026

The Windows workspace and combined ARM64/x64 installer were regenerated from the canonical source. The installer is [BC-Design-Setup-0.6.0.exe](release/0.6.0/BC-Design-Setup-0.6.0.exe), 237,149,477 bytes, SHA256 `F8908819E5FC21F101EA34A09DAEBF6F2C0CF57EB577FBF79B245C9C0E0D6483`. Package integrity passed with 61 allowlisted files per architecture, and the packaged desktop smoke test passed. No installation over the existing user profile was performed.

## Local endcuts79 source — 27 October 2026

Canonical source and the future-package allowlist include member-end-cuts.js. No desktop sync/build/install occurred. Existing Windows0.5.2 and publicSite20/workspace74 remain older snapshots; immutable bytes and user profiles are preserved. See [verification](../test-results/endcuts79-verification.json) or http://127.0.0.1:4191/?local=endcuts79. Entered end-plane references do not alter source members or authorize fabrication.


## Local connectors78 source — 27 October 2026

Canonical source and the future-package allowlist include measured connector plate/shank references. No desktop sync/build/install occurred. Windows0.5.2 and publicSite20/workspace74 remain older separate snapshots; immutable release bytes and user profiles are preserved. See [verification](../test-results/connectors78-verification.json), or the local Expo preview at http://127.0.0.1:4191/?local=connectors78. Reference envelopes do not constitute fitted hardware design or physical acceptance.


## Local pdf77 integration — 27 October 2026

Canonical source and the future-package allowlist include direct vector PDF dependencies, fonts/licenses and exporter. No desktop sync/build/install was performed. Windows0.5.2 and publicSite20/workspace74 remain separate older snapshots; preserve immutable release bytes and user profiles. See [verification](../test-results/pdf77-verification.json). Local preview: http://127.0.0.1:4191/?local=pdf77. Physical printer/Surface Pen acceptance remains pending.


## Local stock76 source — 27 October 2026

Canonical stock76/schema30 adds independent entered stock-length plans, cut-position review and audit CSV. The source allowlist includes stock-planning.js for a future new version; no desktop sync/build/install or website package was performed. Windows0.5.2 and publicSite20/workspace74 remain separate older snapshots. Preserve old packages and profiles. See [verification](../test-results/stock76-verification.json).


## Local workspace75 integration — 27 October 2026

Canonical source is now workspace75/schema30 with refined panel navigation and rendered drawings. Existing Windows0.5.2 packages and the installed app are unchanged separate snapshots. No desktop sync, rebuild or installation was performed for this milestone. Any future package must use a new immutable version and preserve user profiles. See [verification](../test-results/workspace75-verification.json). Older entries below are historical.

## Current local package — 0.6.0 / endcuts79 / schema30, 27 October 2026

The new Windows package combines the latest local schema30 workspace: readable/coordination plans, workspace75 panels and rendered studies, stock-length planning, direct vector PDF export, connector plate/fastener references and rectangular-member end-cut studies. It is versioned separately from the preserved 0.5.2 release and does not replace user profiles.

Canonical source is endcuts79/schema30 with workspace75 navigation, stock76 planning, pdf77 vector export, connectors78 and end-cut references. The preserved Windows 0.5.2 package remains at `release/0.5.2/BC-Design-Setup-0.5.2.exe`; the new 0.6.0 package will be written to `release/0.6.0/BC-Design-Setup-0.6.0.exe`. Physical Surface Pen acceptance remains pending.


The prior 0.5.2, 0.5.1 and 0.5.0 packages remain preserved. Use Save JSON and Open to move projects between browser and desktop; profiles remain local to each runtime.

Canonical source is deckedges60/schema30 with independent measured deck edge/fascia runs. Installed/release Windows0.3.0 and generated desktop workspace still contain framing45/schema17; no desktop sync/build/reinstall occurred. Next delivery task is a verified versioned Windows refresh using the updated allowlist including deck-edges.js, preserving autosave/profile identity and existing projects, then main-site browser/download refresh. Physical Surface Pen acceptance remains pending. See ../test-results/deck-edges-verification.json.

Canonical source is postmembers59/schema29 with selected post/member interface geometry review. Installed/release Windows0.3.0 and generated desktop workspace still contain framing45/schema17; no desktop resync/build/reinstall occurred. A later release must sync the updated allowlist including deck-post-members.js. See ../test-results/deck-post-members-verification.json.

Canonical source is deckposts58/schema 28 with measured deck posts and optional pad/pier geometry review. Installed/release Windows 0.3.0 and generated desktop workspace still contain framing45/schema17; no desktop resync/build/reinstall occurred. A later release must sync the updated allowlist including deck-posts.js. See ../test-results/deck-posts-verification.json.

Canonical source is decksupports57/schema 27 with selected board/support review. Installed/release Windows 0.3.0 and generated desktop workspace still contain framing45/schema17; no desktop sync/build/reinstall occurred. A later release must sync the updated allowlist including deck-supports.js. See ../test-results/deck-supports-verification.json.

Canonical source is now deckboards56/schema 26 with measured decking-board layouts. Installed/release Windows 0.3.0 and generated desktop workspace still contain framing45/schema17; no desktop resync/build/reinstall occurred. A later release must sync the updated distribution allowlist including deck-boards.js. See ../test-results/deck-boards-verification.json.

Canonical source is now railends55/schema 25 with optional return envelopes and base-end connection review. Installed/release Windows 0.3.0 and generated desktop workspace remain framing45/schema17; no desktop resync/rebuild or reinstall occurred. A later release must sync the updated distribution allowlist including stair-rail-ends.js. See ../test-results/rail-ends-verification.json.

Canonical source is now railmembers54/schema 24 with optional stair rail/post envelopes. Installed/release Windows 0.3.0 and generated desktop workspace remain framing45/schema17; no desktop resync/rebuild or reinstall occurred. A later versioned release must sync the updated distribution allowlist, including stair-rail-members.js. See ../test-results/stair-members-verification.json.

Canonical source is now headroom53/schema 23 with selected-floor stair footprint/headroom review. Installed/release Windows 0.3.0 and its generated workspace still contain framing45/schema 17; no desktop rebuild/resync or reinstall occurred. A later versioned release is required. See ../test-results/stair-headroom-verification.json.

Canonical source is now floorcuts52/schema 22 with opt-in slab apertures and net quantities. Installed/release Windows 0.3.0 and its generated workspace still contain framing45/schema 17; no desktop rebuild/resync or reinstall occurred. A later versioned release is required. See ../test-results/floor-cuts-verification.json.

Canonical source is now openings51/schema 21 with measured floor-opening reference records and review overlays. Installed/release Windows 0.3.0 and its generated workspace remain framing45/schema 17; no desktop rebuild/resync or reinstall occurred. A later versioned release is required. See ../test-results/floor-openings-verification.json.

Canonical source is now sheets50/schema 20 with scaled Plan SVG export. Installed/release Windows 0.3.0 and its generated workspace remain framing45/schema 17; no desktop rebuild/resync or reinstall occurred. A later versioned release is required. See ../test-results/plan-sheet-verification.json.

Canonical source is now levels49/schema 20 with stair/floor/level elevation coordination. Installed/release Windows 0.3.0 remains framing45/schema 17 and was not rebuilt or resynced. A later explicit versioned release is needed to include local changes. See ../test-results/stair-coordination-verification.json.

Canonical drawing source has advanced to rails48/schema 19, adding attached stair handrail/barrier reference geometry. Windows installed/release 0.3.0 still contains framing45/schema 17 and needs a later explicit versioned rebuild; generated desktop files were not resynced in this milestone. See ../test-results/stair-rails-verification.json.

The installed Windows app, versioned 0.3.0 installer and release website snapshot still contain framing45/schema 17. The canonical root has advanced to stairs47/schema 18 (measured stair landings and turns), verified locally through Expo. A later explicit desktop sync/build/new release is needed to include it; this milestone did not rebuild or reinstall Windows.

BC Design 0.4.0 packages the canonical measured workspace in a dedicated Windows app. Electron 45.0.0 provides native ARM64 and x64 runtimes. The combined NSIS installer selects the appropriate architecture, installs for the current user and creates Desktop and Start menu shortcuts. It does not need Expo, Metro, Node or a browser server at runtime.

This is the sheetsets61 drawing engine, schema30, with desktop63 distribution work. Source drawing files stay at the repository root. Generated `workspace/`, `build/` and `release/` are not editable source. The source-only allowlist is `../distribution/workspace-files.json`; no saved projects, account data or signing helpers enter the installer.

## Build locally

Use pnpm in this folder; its independent lockfile keeps desktop dependencies separate from the existing Expo project:

```powershell
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm test
pnpm run build:win
```

Electron 45 installs its runtime through `install-electron`. `electron-winstaller` install scripts are explicitly disabled because this project uses NSIS, not Squirrel. `pnpm start` syncs the workspace and starts the development desktop app. `pnpm run build:win` builds ARM64 and x64 into the versioned `release/0.6.0/BC-Design-Setup-0.6.0.exe`, with publishing disabled. Build configuration deliberately preserves app data on uninstall.

The current local installer is unsigned. Windows may show an unknown publisher prompt. No certificate has been purchased and no Microsoft Store release has been made. Keep Electron current for future releases; see [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [electron-builder NSIS documentation](https://www.electron.build/docs/nsis/).

## Projects and data

Autosave lives in the current Windows user's `%APPDATA%/BC Design` profile and remains stable across app upgrades. Browser/Expo autosaves are separate. Use **Save JSON** and **Open** to transfer or back up a project. The desktop app does not read browser profiles or silently import projects. Exports use the Windows save dialog. Project menu shortcuts are Ctrl+N, Ctrl+O and Ctrl+S; drawing undo/redo are in the Edit menu and toolbar.

Only bundled allowlisted files are served through `bcdesign://app/`. The renderer has Node disabled, context isolation and sandbox enabled, with a restrictive Content Security Policy. It has no privileged preload bridge. HTTP(S) reference links open in the system browser; other external protocols and embedded remote windows are blocked. Browser service workers are disabled inside the desktop package because files ship with the executable.

## Verification

`desktop.test.cjs` uses an isolated temporary profile, never the user's project profile. Set `BC_PLAYWRIGHT_MODULE` to an available Playwright installation. It checks renderer isolation, file boundaries, JSON input/output, CSV download, Plan/3D layers and persistence after restarting. Set `BC_DESIGN_TEST_EXE` to test a packaged or installed executable; otherwise it uses the development Electron runtime. `paths.test.cjs` checks protocol boundaries separately.

Additional release verification: run `node verify-package.cjs` for architecture/source hashes and `node upgrade.test.cjs` with explicit `BC_DESIGN_LEGACY_EXE` and `BC_DESIGN_TEST_EXE` for a generated old-project migration in a temporary profile. `BC_DESIGN_TEST_LABEL` distinguishes architecture screenshots/results.

Physical Surface Pen acceptance remains pending. A working desktop build does not establish structural compliance or hardware acceptance.

On 26 October 2026 the local installer completed successfully and selected ARM64 on this Surface. The installed app is `%LOCALAPPDATA%/Programs/BC Design/BC Design.exe`, with Desktop and Start menu shortcuts. Isolated development, packaged ARM64, packaged x64 (under Windows ARM emulation) and installed ARM64 workflows passed. The installed source archive exactly matched the ARM64 package. Fourteen original Node suites and the Edge website/offline flow passed; inspected screenshots and the result record are in `../test-results/desktop-website-verification.json`. No user project profiles were used for testing.

## Website package — next delivery

Public Sitev14 and distribution/releases/bc-design-0.3.0 are historical framing45/schema17 snapshots. The new Windows installer is ready, but distribution/build-website.mjs and verify-release.cjs still hardcode the previous release path and metadata. Update them before generating the0.4.0 website package, then use the Sites workflow for the existing website-main-publish checkout/project. Preserve business content, Gantt links, public audience and existing hosting. No website refresh was published with desktop61.
