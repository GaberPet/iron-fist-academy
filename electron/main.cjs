// Electron main process: window, local JSON persistence, import/export dialogs.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !!process.env.IFA_DEV_URL;
const dataDir = () => path.join(app.getPath('userData'), 'data');
const KEY_RE = /^[a-z0-9-]{1,64}$/;

function fileFor(key) {
  if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
  return path.join(dataDir(), `${key}.json`);
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.renameSync(tmp, file);
}

function createWindow() {
  const win = new BrowserWindow({
    show: !process.env.IFA_SMOKE,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0d12',
    title: 'Iron Fist Academy',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep polling the controller at full rate even when the window is in the background.
      backgroundThrottling: false,
    },
  });
  // Links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isDev && url.startsWith(process.env.IFA_DEV_URL)) return;
    if (!url.startsWith('file://')) e.preventDefault();
  });
  if (isDev) win.loadURL(process.env.IFA_DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (process.env.IFA_SMOKE) runSmokeTest(win);
}

// `IFA_SMOKE=1 electron .` : load the packaged UI offscreen, round-trip storage through the
// preload bridge, report and exit. Used to verify a build without a display.
function runSmokeTest(win) {
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        await new Promise((r) => setTimeout(r, 1500));
        const key = 'smoke-test';
        await window.ifaApi.save(key, { ok: true, at: Date.now() });
        const back = await window.ifaApi.load(key);
        const info = await window.ifaApi.info();
        return { bridge: !!window.ifaApi, roundTrip: back && back.ok === true, title: document.title,
          h1: document.querySelector('h1') && document.querySelector('h1').textContent, gamepadApi: typeof navigator.getGamepads, dataDir: info.dataDir };
      })()`);
      console.log('SMOKE_RESULT ' + JSON.stringify(result));
      if (process.env.IFA_SMOKE_OUT) fs.writeFileSync(process.env.IFA_SMOKE_OUT, JSON.stringify(result));
      fs.rmSync(fileFor('smoke-test'), { force: true });
      fs.rmSync(fileFor('smoke-test') + '.bak', { force: true });
      app.exit(result.roundTrip && result.h1 ? 0 : 1);
    } catch (e) {
      console.log('SMOKE_RESULT ' + JSON.stringify({ error: String(e) }));
      if (process.env.IFA_SMOKE_OUT) fs.writeFileSync(process.env.IFA_SMOKE_OUT, JSON.stringify({ error: String(e) }));
      app.exit(1);
    }
  });
}

ipcMain.handle('store:load', (_e, key) => {
  const file = fileFor(key);
  for (const f of [file, `${file}.bak`]) {
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      /* fall through to the backup */
    }
  }
  return null;
});

ipcMain.handle('store:save', (_e, key, value) => {
  writeAtomic(fileFor(key), JSON.stringify(value));
  return true;
});

ipcMain.handle('store:info', () => ({ dataDir: dataDir(), version: app.getVersion(), platform: process.platform }));

ipcMain.handle('file:export', async (e, defaultName, text) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, text, 'utf8');
  return r.filePath;
});

ipcMain.handle('file:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

ipcMain.handle('shell:openData', () => shell.openPath(dataDir()));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
