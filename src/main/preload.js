const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 便利贴数据
  notes: {
    getAll: () => ipcRenderer.invoke('notes:get-all'),
    create: (data) => ipcRenderer.invoke('notes:create', data),
    updateContent: (data) => ipcRenderer.invoke('notes:update-content', data),
    updateGeometry: (data) => ipcRenderer.invoke('notes:update-geometry', data),
    updateOrder: (data) => ipcRenderer.invoke('notes:update-order', data),
    delete: (data) => ipcRenderer.invoke('notes:delete', data),
    getHistory: () => ipcRenderer.invoke('notes:get-history'),
    restore: (data) => ipcRenderer.invoke('notes:restore', data),
    permanentDelete: (data) => ipcRenderer.invoke('notes:permanent-delete', data)
  },

  // 堆操作
  stacks: {
    mergeCheck: (data) => ipcRenderer.invoke('stacks:merge-check', data),
    split: (data) => ipcRenderer.invoke('stacks:split', data),
    collapseAll: (data) => ipcRenderer.invoke('stacks:collapse-all', data),
    spread: (data) => ipcRenderer.invoke('stacks:spread', data)
  },

  // 截图
  screenshot: {
    capture: () => ipcRenderer.invoke('screenshot:capture'),
    regionSelected: (data) => ipcRenderer.invoke('screenshot:region-selected', data),
    cancel: () => ipcRenderer.invoke('screenshot:cancel')
  },

  // 文件操作
  files: {
    openImage: () => ipcRenderer.invoke('files:open-image'),
    readImage: (filename) => ipcRenderer.invoke('files:read-image', filename)
  },

  // 设置
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    refreshHotkeys: () => ipcRenderer.invoke('settings:refresh-hotkeys')
  },

  reports: {
    generateDaily: () => ipcRenderer.invoke('reports:generate-daily'),
    getHistory: () => ipcRenderer.invoke('reports:get-history'),
    restore: (data) => ipcRenderer.invoke('reports:restore', data),
    permanentDelete: (data) => ipcRenderer.invoke('reports:permanent-delete', data)
  },

  // 窗口操作
  windowResize: (data) => ipcRenderer.invoke('window:resize', data),
  openHistory: () => ipcRenderer.invoke('window:open-history'),
  openSettings: () => ipcRenderer.invoke('window:open-settings'),
  activateWindow: (stackId) => ipcRenderer.invoke('window:activate', stackId),

  // 通用
  app: {
    getPath: () => ipcRenderer.invoke('app:get-path')
  },

  // 事件监听
  onStackData: (cb) => {
    ipcRenderer.on('stack:data', (_e, data) => cb(data));
  },
  onScreenshotImage: (cb) => {
    ipcRenderer.on('screenshot:image', (_e, data) => cb(data));
  }
});
