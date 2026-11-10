# BC Design Surface review and upgrade proposal

Reviewed 10 November 2026 (Australia/Brisbane). PAU-26 remains open. No physical Surface test has passed in this review.

## Release identity and accessibility

| Item | Verified result |
| --- | --- |
| Latest GitHub Windows release | **0.6.8**, published 27 October 2026; public release and downloadable installer |
| Release/source commit | `1b7b2e53c54d5d34191d7b9e47f328f0dedcb051`; `main` and tag `v0.6.8` matched at review |
| Installer | `BC-Design-Setup-0.6.8.exe`, 257,304,305 bytes; downloaded into the isolated review workspace, never executed |
| SHA-256 | `5ce497223691ea3f0d42b54350b384734ce01f29ed9510b974a07411fdab5226`; calculated hash matches GitHub's asset digest |
| Architectures | Extracted both embedded payloads without installing; executable PE machine types are ARM64 (`0xaa64`) and x64 (`0x8664`) |
| Bundled source | All **58 canonical workspace files** in each payload match the release commit, with the expected desktop flag injection in `index.html` |
| Both application archives | SHA-256 `024b60b9e4d24dffceec5ef8b451c22972cad4468cb253b3897c045db94dd8ff`; packaged application version 0.6.8 |
| Recorded 0.6.6 installer | README link returns GitHub **404** at the reviewed commit. Release directory is ignored by git, the release list exposes 0.6.8 only, and filename search did not locate a Library copy. Local Windows availability remains unknown. |
| Signing | GitHub release explicitly says 0.6.8 is unsigned. Windows execution and signature validation were not performed here. |
| Proposed upgrade | Source manifest **0.7.0-preview.1**, with its own output directory. No upgraded installer was built, installed or published. |

The earlier 0.3.0 website download is a separate historical release. This review verifies GitHub availability of 0.6.8; it does not establish the current version served by the Bloxham Construction website.

Sources: [release](https://github.com/paulbloxham8484/C-Users-Bloxh-OneDrive-Documents-ChatGPT-BC-design/releases/tag/v0.6.8), [release source](https://github.com/paulbloxham8484/C-Users-Bloxh-OneDrive-Documents-ChatGPT-BC-design/tree/1b7b2e53c54d5d34191d7b9e47f328f0dedcb051), [PAU-26](https://linear.app/paul-bloxham/issue/PAU-26/verify-surface-laptop-pen-touch-and-keyboard-compatibility).

## Reproduced release-source defects

The original focused input harness passed 5 of 14 cases and failed 9. These are code-level event simulations against the matching release source, with rendering, pointer capture and browser dispatch stubbed. They are not results from running the Windows installer.

| Reproduction | Observed before fix | Proposed behavior |
| --- | --- | --- |
| Pen drag ends beyond the last move event | Wall/footing ends at the previous move position | Use final release coordinates |
| Touch moves during pen contact | View moves underneath the pen stroke | Active pen/mouse owns the gesture; concurrent touch is ignored |
| Touch already down when pen starts | Touch can continue moving the view, including after pen release | Discard pre-existing touch tracking; require a fresh touch contact |
| Unrelated touch is cancelled | Active pen drawing is discarded | Cancel only the owning pointer |
| Another pointer moves/presses during pen drawing | Preview endpoint or entire draft is overwritten | Ignore non-owning pointers |
| Right mouse button, pen barrel/eraser contact | Can create a wall | Non-drawing buttons cannot create geometry; mouse middle-drag pans |
| Two-finger gesture becomes one finger | Remaining finger moves view by -90 px instead of +10 px in the fixture | Rebase gesture center when a contact ends |
| One-finger drag in 3D | Changes the unused Plan offset; visible camera does not orbit | One finger orbits; two fingers pan and pinch |
| Pointer capture is lost during a stroke | Unfinished stroke is committed in the harness | Discard draft on capture loss/cancel; preserve completed geometry |

Source inspection also found exact wall/footing lengths were snapped again after calculation. The upgrade tests verify an entered **1234 mm stays 1234 mm**, including with angle locking.

## Major upgrade scope implemented in the draft

- Drawing controls: default pen plus touch navigation, explicit finger-drawing mode, and pen/mouse-only canvas mode.
- In finger mode, one finger draws/selects in Plan; a second finger cancels the unfinished action and begins navigation. Point-placement tools commit on tap release, preventing the first contact of a pinch from placing an object.
- Snap spacing: no grid, 10, 25, 50, 100, 250, 500 or 1000 mm. Existing endpoint snapping remains available. Wall/footing angle locks: free, 45° or 90° steps. Exact lengths take priority over grid rounding.
- Optional larger touch targets, a visible input explanation, middle-mouse pan and corrected 3D touch navigation.
- Project recovery dialog: create, inspect, export and restore local checkpoints; restore is undoable and first checkpoints the current drawing.
- Automatic checkpoints before New, Open JSON, Load example and Restore; previous autosave checkpoints are attempted at five-minute intervals when saving changes.
- Recovery retains up to eight newest copies within a 1,500,000-character store limit. Unreadable original autosave text is preserved for export. Checkpoint failure blocks project replacement; failure of optional history does not block ordinary saving of a valid project. Corrupt originals are not overwritten unless copied successfully.
- The new recovery asset is included in the desktop allowlist and the scoped offline shell. Cache revision is advanced to v88. Project schema remains 30 and the existing autosave key/profile path remains unchanged.

Input settings reset to the safe navigation default on launch. Pen pressure/tilt/haptics and eraser actions are not implemented. Application-level touch suppression during contact does not establish Windows/digitizer palm rejection. Checkpoints use device/browser storage and can be lost if that storage is cleared; independent JSON backups remain necessary.

## Validation actually executed

| Validation | Result | Boundary |
| --- | --- | --- |
| Existing non-browser Node checks, including desktop path security | 40 scripts pass | Original first run was 39/40 because TypeScript was absent; after providing the repository-pinned TypeScript 6.0.3 in the isolated test environment, that script passed |
| Surface input regression suite | 20 tests pass | Direct code-level events; no digitizer, layout, native pointer capture or browser dispatch |
| Checkpoint storage suite | 4 tests pass | In-memory storage; bounded retention, quota errors, malformed records, exact original text preservation |
| Service-worker shell simulation | Pass | In-memory Cache API and simulated network failure; cached navigation/assets and scope isolation checked |
| DOM integration | Pass | Complete source bootstrap and actual control handlers; drawing settings, large-control class, checkpoint create/restore/undo, dialog actions, safe text insertion. Canvas, layout and native dialogs stubbed. |
| Generated desktop workspace | 59 canonical files match | Source bundle only; no upgraded Windows binary |
| JavaScript syntax and git whitespace checks | Pass | Includes the prepared browser regression |
| Actual browser regression | **Not executed successfully** | System Chromium could not create an AF_UNIX socket. Escalation was rejected by the environment approval policy. The bundled Playwright headless-shell download also failed archive validation. |
| Windows executable launch / installation / upgrade | **Not run** | Review host is Linux; no access to the user's Windows device |
| Actual Surface pen, touch, palm rejection and performance | **Not run** | Exact Surface and pen hardware remain unconfirmed |

Total: **43 non-browser test scripts plus one separate DOM integration script passed**. The 24 focused tests are included in those script counts; they are not 24 additional suites. Browser/physical offline restart, pointer dispatch, rendering and performance remain release gates.

Reproduction commands, from the repository root:

```sh
node --test surface-input.test.cjs project-recovery.test.cjs
node offline-shell.test.cjs
BC_JSDOM_MODULE=/path/to/jsdom node drawing-controls.dom.test.cjs
node desktop-app/scripts/sync.mjs
```

The DOM test used jsdom 26.1.0. Existing `vector-pdf.test.cjs` expects the locked TypeScript dependency in `expo-app/node_modules/typescript`. The new `surface-workspace.browser.test.cjs` is prepared but **unverified**; run it on an authorised browser-capable development machine with Playwright and Edge (or an explicit `BC_BROWSER_EXECUTABLE`). It covers CDP pen/finger emulation, keyboard history, controls, checkpoints, autosave reload, browser offline reload and JSON export. Also run the existing desktop `desktop.test.cjs`/`upgrade.test.cjs`, service, workspace and vector-PDF offline browser workflows in their documented environments. No older test result is being inherited as a new pass.

## Physical Surface acceptance procedure

**All rows below are NOT RUN. Do not mark PAU-26 Done from automated results.**

Before testing, record the exact Surface model (Settings → System → About / Surface app), CPU architecture, RAM, Windows build, firmware/driver version, display scaling, Edge version, installed app version and pen model/firmware/battery status. Confirm that this exact Surface model supports that pen using its manufacturer's documentation. “Surface Pro 12” remains an assumption, not a hardware finding.

Before any installation or consequential device change, show the user the exact candidate version, download source, checksum, signing state, install/launch method, backup locations and rollback method, and obtain approval. First complete browser tests and build a fresh candidate; this draft is not yet ready for an installation approval request.

After approval, prefer launching a verified unpacked candidate with **`BC_DESIGN_TEST_PROFILE` set to a new isolated folder** before installing. Use synthetic models and copied JSON files only. Export each current working project with Save JSON, retain originals unchanged and make a copy of `%APPDATA%/BC Design` while the app is closed. Do not use the real profile for crash, storage or corruption tests. Keep the known-working executable/installer available; do not overwrite an existing version's release files.

| ID | Procedure on actual device | Pass evidence required |
| --- | --- | --- |
| H1 | With pen, draw 20 short/long/diagonal walls and footings; vary speed and release beyond the last visible move. Repeat mouse and finger mode. | Correct endpoints, no missed/duplicate strokes or stuck drawing. Record any latency or drift. |
| H2 | Draw a 6000 × 4000 mm room outline, add a door/window and floor/deck outline. Test 25/100 mm grid, free/45°/90° and exact 1234 mm. | Inspect stored dimensions, alignment and closure; undo/redo returns exactly to the prior drawing. No pressure-dependent dimensional changes. |
| H3 | Select 10 narrow/overlapping targets with pen and finger; edit dimensions with keyboard and Windows touch keyboard; use Tab, Shift+Tab, Escape and Ctrl+Z/redo. | Correct selection, editable values and focus. Typing W/D/N/F/2/3 in fields does not switch tools/views. Native text undo remains in the field. |
| H4 | Rest palm before pen contact, during a slow stroke, during fast strokes and just after lift; test left/right hand, edges of screen and pen hover. Repeat 20 times. Compare default and pen/mouse-only modes. | No unintended geometry or view movement. Record Windows “ignore touch when using pen” setting. Do not count software simulations as this pass. |
| H5 | Plan: one-finger pan, two-finger pinch and simultaneous pan. Lift each finger in either order; add/remove a third contact. In finger mode introduce a second finger mid-stroke/tap. | No jumps, accidental walls/supports or stuck gestures. View stays stable when the pen owns contact. |
| H6 | Exterior/Site 3D: one finger orbits, two fingers pan/pinch; mouse drag, Shift/middle-drag, wheel and Fit. | Visible navigation works, sensible zoom/pitch limits, model geometry unchanged. |
| H7 | Rotate portrait/landscape, attach/detach keyboard if supported, resize, switch apps, sleep/resume during and after drawing. | No stale stroke/camera, usable controls and no lost completed edits. Unsupported physical rotations are N/A with the model recorded. |
| H8 | Disable Wi-Fi/network before a cold Windows app launch. Draw, inspect 3D, dimension, Save JSON, export PDF, close, reopen and reimport a saved copy. Separately warm the browser offline shell then repeat a browser offline restart. | Local model, fonts, views and exports work without network. External reference websites may need network. Record desktop/browser results separately. |
| H9 | Create checkpoint; edit project; restore; undo restore. Test New/Open/Load example then recover the prior test drawing. Export a checkpoint and import into another isolated profile. | Names, counts, dimensions and takeoffs retained. Cancelled/invalid imports do not change current model. Earlier originals remain intact. |
| H10 | In the isolated test profile only, close normally and reopen after confirmed save; then test force-close after saved edits and separately within the 300 ms autosave debounce. | Confirm recovery of completed saves; document any unsaved-edit window precisely. Do not promise recovery of changes never written. Corruption/quota injection belongs only in a disposable test profile. |
| H11 | Run a small synthetic building and a representative larger multi-level/framed model for 30 minutes. Record model counts, cold/warm launch time, redraw/input latency, pan/3D frame times, memory and export duration on battery and mains. | Proposed pilot targets: routine controls respond within 100 ms, sustained navigation at least 30 fps, no freezes/crashes, no sustained memory growth after repeated open/close cycles. Record actual values; agree exceptions before acceptance. |

For each row record tester, local date/time, exact build/hash/profile, model filename and object counts, input hardware, steps, expected/actual behavior, pass/fail/blocked/N/A and evidence. A failure needs reproducible steps and its own linked defect. Stop the pilot if completed drawings disappear, unexpected geometry is created or originals are at risk. Roll back using the retained known-working package and profile copy; do not downgrade the real profile in place without a compatible backup.

## Remaining decisions

1. Finish actual browser checks and visual review of the new controls; fix any failures before building the preview installer.
2. Identify Surface/pen hardware and prepare the isolated device trial with explicit user approval.
3. Complete the physical matrix and measured performance/offline recovery evidence. Keep PAU-26 open until those results are reviewed.
4. Obtain separate approval for merging/publishing/installing. This review changed only the proposed development branch and test artifacts; existing projects and saved drawings were not accessed or modified.
