'use strict';
const { app, BrowserWindow, Menu, protocol, session, shell, dialog } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { workspaceFile, externalLink } = require('./paths.cjs');
const workspace = path.join(__dirname, 'workspace');
const allowedFiles = new Set(require('./workspace/allowed-files.json'));
const startUrl = 'bcdesign://app/index.html';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'";
app.setName('BC Design');
// Automated tests use their own temporary profile; normal launches keep a stable profile across upgrades.
if (process.env.BC_DESIGN_TEST_PROFILE) app.setPath('userData', path.resolve(process.env.BC_DESIGN_TEST_PROFILE));
else app.setPath('userData', path.join(app.getPath('appData'), 'BC Design'));
protocol.registerSchemesAsPrivileged([{ scheme: 'bcdesign', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const hasLock = app.requestSingleInstanceLock();
let win;
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId('au.com.bloxham.bcdesign');
    protocol.handle('bcdesign', async request => {
      const name = workspaceFile(request.url, allowedFiles);
      if (!name || request.method !== 'GET') return new Response('Not found', { status: 404 });
      try {
        return new Response(await readFile(path.join(workspace, name)), { headers: {
          'Content-Type': mime[path.extname(name)] || 'application/octet-stream',
          'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff'
        } });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    win = new BrowserWindow({ width: 1440, height: 1000, minWidth: 800, minHeight: 600,
      title: 'BC Design', backgroundColor: '#f5f7f5', icon: path.join(workspace, 'brand-mark.png'),
      show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, backgroundThrottling: false }
    });
    const openExternal = url => { const safe = externalLink(url); if (safe) shell.openExternal(safe).catch(() => {}); };
    win.webContents.setWindowOpenHandler(({ url }) => {
      const asset=workspaceFile(url,allowedFiles);
      if(asset&&asset.startsWith('assets/realistic-renders/')&&asset.endsWith('.png'))return {action:'allow',overrideBrowserWindowOptions:{width:1200,height:850,autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false}}};
      openExternal(url); return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (workspaceFile(url, allowedFiles) === 'index.html') return;
      event.preventDefault(); openExternal(url);
    });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    session.defaultSession.on('will-download', (event, item, contents) => {
      if (contents !== win?.webContents || !item.getURL().startsWith('blob:bcdesign://app/')) { event.preventDefault(); return; }
      item.setSaveDialogOptions({ title: 'Save BC Design export', defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())) });
    });
    const click = id => () => win?.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)})?.click()`).catch(() => {});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Project', submenu: [
        { label: 'New project', accelerator: 'CmdOrCtrl+N', click: click('newProjectButton') },
        { label: 'Open JSON…', accelerator: 'CmdOrCtrl+O', click: click('openButton') },
        { label: 'Save JSON…', accelerator: 'CmdOrCtrl+S', click: click('saveButton') },
        { type: 'separator' }, { role: 'quit' }
      ] },
      { label: 'Edit', submenu: [{ label: 'Undo drawing change', accelerator: 'CmdOrCtrl+Z', click: click('undoButton') }, { label: 'Redo drawing change', accelerator: 'CmdOrCtrl+Shift+Z', click: click('redoButton') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: 'Help', submenu: [{ label: 'About BC Design', click: () => dialog.showMessageBox(win, {
        type: 'info', title: 'BC Design', message: `BC Design ${app.getVersion()}`,
        detail: 'Bloxham Building & Construction\n\nMeasured building workspace. Projects autosave on this computer. Use Save JSON for backups or to move between the website, desktop and Expo app.\n\nDesign preview: project-specific professional review remains required.'
      }) }] }
    ]));
    win.once('ready-to-show', () => { if (!process.env.BC_DESIGN_TEST_PROFILE) win.show(); });
    win.on('closed', () => { win = null; });
    await win.loadURL(startUrl);
  }).catch(error => { dialog.showErrorBox('BC Design could not start', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
