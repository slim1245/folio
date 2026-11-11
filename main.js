const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { pathToFileURL } = require('url');
let win;
const ROOT = () => app.getPath('userData');
const LIB = () => path.join(ROOT(), 'library');
const DB = () => path.join(ROOT(), 'data.json');
const uid = () => Math.random().toString(36).slice(2, 10);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' };

function loadData() {
  try { const d = JSON.parse(fs.readFileSync(DB(), 'utf8')); d.projects = d.projects || []; d.files = d.files || []; return d; }
  catch (e) { return { projects: [], files: [] }; }
}
function uniq(dir, name) {
  let p = path.join(dir, name), i = 1; const ext = path.extname(name), base = path.basename(name, ext);
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
function addFiles(paths) {
  const out = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p); if (!st.isFile()) continue;
      const id = uid(), ext = path.extname(p), stored = id + ext;
      fs.copyFileSync(p, path.join(LIB(), stored));
      out.push({ id, name: path.basename(p), stored, size: st.size });
    } catch (e) {}
  }
  return out;
}
async function renderPage(html) {
  const tmp = path.join(os.tmpdir(), 'folio-' + uid() + '.html');
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, width: 1100, height: 900 });
  await w.loadFile(tmp);
  await new Promise(r => setTimeout(r, 500));
  return { w, tmp };
}
async function toPDF(html) {
  const { w, tmp } = await renderPage(html);
  const buf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } });
  w.destroy(); fs.unlink(tmp, () => {}); return buf;
}
async function toPNG(html) {
  const { w, tmp } = await renderPage(html);
  const h = await w.webContents.executeJavaScript('document.documentElement.scrollHeight');
  w.setContentSize(1100, Math.min(Math.max(h, 600), 16000));
  await new Promise(r => setTimeout(r, 500));
  const img = await w.webContents.capturePage();
  w.destroy(); fs.unlink(tmp, () => {}); return img.toPNG();
}
function createWindow() {
  win = new BrowserWindow({ width: 1360, height: 860, minWidth: 980, minHeight: 640, title: 'Folio Studio', backgroundColor: '#0e0f13', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => {
  fs.mkdirSync(LIB(), { recursive: true });
  ipcMain.handle('init', () => ({ data: loadData(), libURL: pathToFileURL(LIB()).href + '/' }));
  ipcMain.handle('save', (e, d) => { const t = DB() + '.tmp'; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, DB()); return true; });
  ipcMain.handle('importDialog', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Импорт файлов в Folio', properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : addFiles(r.filePaths);
  });
  ipcMain.handle('importPaths', (e, paths) => addFiles(paths));
  ipcMain.handle('exportFiles', async (e, list) => {
    const r = await dialog.showOpenDialog(win, { title: 'Куда выгрузить файлы', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return 0;
    let n = 0;
    for (const f of list) { try { fs.copyFileSync(path.join(LIB(), f.stored), uniq(r.filePaths[0], f.name)); n++; } catch (x) {} }
    shell.openPath(r.filePaths[0]); return n;
  });
  ipcMain.handle('saveAs', async (e, name, b64) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name });
    if (r.canceled) return false; fs.writeFileSync(r.filePath, Buffer.from(b64, 'base64')); shell.showItemInFolder(r.filePath); return true;
  });
  ipcMain.handle('caseExport', async (e, kind, html, name) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name + '.' + kind });
    if (r.canceled) return false;
    const buf = kind === 'pdf' ? await toPDF(html) : kind === 'png' ? await toPNG(html) : Buffer.from(html);
    fs.writeFileSync(r.filePath, buf); shell.showItemInFolder(r.filePath); return true;
  });
  ipcMain.handle('casePackage', async (e, p) => {
    const r = await dialog.showOpenDialog(win, { title: 'Куда сохранить пакет кейса', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return false;
    const dir = uniq(r.filePaths[0], p.name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, p.name + '.html'), p.html);
    fs.writeFileSync(path.join(dir, p.name + '.md'), p.md);
    fs.writeFileSync(path.join(dir, p.name + '.json'), p.json);
    fs.writeFileSync(path.join(dir, p.name + '.pdf'), await toPDF(p.html));
    fs.writeFileSync(path.join(dir, p.name + '.png'), await toPNG(p.html));
    for (const [sub, list] of [['finals', p.finals], ['images', p.images]]) {
      if (!list.length) continue; fs.mkdirSync(path.join(dir, sub));
      for (const f of list) { try { fs.copyFileSync(path.join(LIB(), f.stored), uniq(path.join(dir, sub), f.name)); } catch (x) {} }
    }
    shell.openPath(dir); return true;
  });
  ipcMain.handle('dataURLs', (e, list) => {
    const o = {};
    for (const s of list) { try { o[s] = 'data:' + (MIME[path.extname(s).slice(1).toLowerCase()] || 'application/octet-stream') + ';base64,' + fs.readFileSync(path.join(LIB(), s)).toString('base64'); } catch (x) {} }
    return o;
  });
  ipcMain.handle('backup', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Куда сохранить резервную копию', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return false;
    const dir = uniq(r.filePaths[0], 'Folio-backup-' + new Date().toISOString().slice(0, 10)); fs.mkdirSync(dir);
    if (fs.existsSync(DB())) fs.copyFileSync(DB(), path.join(dir, 'data.json'));
    fs.cpSync(LIB(), path.join(dir, 'library'), { recursive: true }); shell.openPath(dir); return true;
  });
  ipcMain.handle('restore', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Выберите папку резервной копии Folio', properties: ['openDirectory'] });
    if (r.canceled) return null;
    const src = r.filePaths[0];
    if (!fs.existsSync(path.join(src, 'data.json'))) { dialog.showErrorBox('Folio', 'В этой папке нет data.json. Выберите папку Folio-backup-…'); return null; }
    fs.copyFileSync(path.join(src, 'data.json'), DB());
    if (fs.existsSync(path.join(src, 'library'))) fs.cpSync(path.join(src, 'library'), LIB(), { recursive: true });
    return loadData();
  });
  ipcMain.handle('reveal', (e, s) => shell.showItemInFolder(path.join(LIB(), s)));
  ipcMain.handle('open', (e, s) => shell.openPath(path.join(LIB(), s)));
  ipcMain.handle('remove', (e, s) => { try { fs.unlinkSync(path.join(LIB(), s)); } catch (x) {} return true; });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
