const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = (c) => (...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('api', {
  init: call('init'), save: call('save'),
  importDialog: call('importDialog'), importPaths: call('importPaths'),
  exportFiles: call('exportFiles'), saveAs: call('saveAs'),
  caseExport: call('caseExport'), casePackage: call('casePackage'),
  dataURLs: call('dataURLs'), backup: call('backup'), restore: call('restore'),
  reveal: call('reveal'), open: call('open'), remove: call('remove'),
  pathFor: (f) => webUtils.getPathForFile(f)
});
