const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const noteStore = require('./noteStore');
const windowManager = require('./windowManager');
const trayManager = require('./trayManager');
const hotkeyManager = require('./hotkeyManager');
const screenshotService = require('./screenshotService');
const reportService = require('./reportService');

const DEFAULT_TOGGLE_NOTES_HOTKEY = 'Ctrl+Alt+H';

app.setName('KKTap');
app.setPath('userData', path.join(app.getPath('appData'), 'KKTap'));

app.whenReady().then(() => {
  noteStore.load();
  noteStore.registerIpcHandlers((newStack) => {
    windowManager.createStackWindow(newStack);
  });

  registerFileHandlers();
  registerWindowHandlers();
  registerScreenshotHandlers();
  screenshotService.prepareOverlay();

  trayManager.createTray(windowManager, noteStore);
  registerGlobalHotkeys();

  const stacks = noteStore.getAllStacks();
  if (stacks.length === 0) {
    const newStack = noteStore.createStack({
      type: 'text',
      content: '',
      images: []
    });
    windowManager.createStackWindow(newStack);
  } else {
    stacks.forEach((stack) => windowManager.createStackWindow(stack));
  }
});

app.on('before-quit', () => {
  noteStore.save();
  hotkeyManager.unregister();
  trayManager.destroyTray();
});

app.on('window-all-closed', () => {});

function registerFileHandlers() {
  ipcMain.handle('files:open-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const srcPath = result.filePaths[0];
    const ext = path.extname(srcPath).toLowerCase();
    const filename = `img-${Date.now()}${ext}`;
    const buffer = fs.readFileSync(srcPath);
    noteStore.saveImage(buffer, filename);
    return { filename };
  });

  ipcMain.handle('files:read-image', (_event, filename) => {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };
    const mime = mimeTypes[ext] || 'image/png';

    try {
      const filePath = noteStore.getImagePath(filename);
      const buffer = fs.readFileSync(filePath);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch (_) {
      return null;
    }
  });
}

function registerWindowHandlers() {
  ipcMain.handle('window:resize', (event, { width, height, save, stackId }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.setSize(
        Math.max(180, Math.min(600, Math.round(width))),
        Math.max(180, Math.min(600, Math.round(height)))
      );
    }

    if (save && stackId) {
      const targetWin = BrowserWindow.fromWebContents(event.sender);
      if (targetWin && !targetWin.isDestroyed()) {
        const [x, y] = targetWin.getPosition();
        const [w, h] = targetWin.getSize();
        noteStore.updateStackGeometry(stackId, { x, y }, { width: w, height: h });
      }
    }
  });

  ipcMain.handle('window:open-history', () => {
    const win = new BrowserWindow({
      width: 500,
      height: 400,
      resizable: true,
      title: '历史记录 - KKTap',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false
      }
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'history', 'index.html'));
    win.setMenuBarVisibility(false);
  });

  ipcMain.handle('window:open-settings', () => {
    const win = new BrowserWindow({
      width: 560,
      height: 620,
      resizable: false,
      title: '设置 - KKTap',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false
      }
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'index.html'));
    win.setMenuBarVisibility(false);
  });

  ipcMain.handle('window:activate', (_event, stackId) => {
    return windowManager.promoteStackWindow(stackId);
  });

  ipcMain.handle('settings:refresh-hotkeys', () => {
    return registerGlobalHotkeys();
  });

  ipcMain.handle('stacks:collapse-all', (_event, { anchorStackId } = {}) => {
    return windowManager.collapseAllWindows(anchorStackId);
  });

  ipcMain.handle('stacks:spread', (_event, { stackId, activeNoteId } = {}) => {
    return windowManager.spreadStackWindow(stackId, activeNoteId);
  });

  ipcMain.handle('reports:generate-daily', async (event) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    const position = callerWin && !callerWin.isDestroyed()
      ? (() => {
          const [x, y] = callerWin.getPosition();
          return { x, y };
        })()
      : undefined;

    const result = await reportService.generateDailyReport(noteStore);
    const stack = noteStore.createStack({
      type: 'text',
      content: result.content,
      images: []
    }, position);
    windowManager.createStackWindow(stack);
    const historyItem = noteStore.saveReportHistoryItem({
      title: result.title,
      content: result.content,
      rawText: result.rawText,
      createdAt: result.createdAt
    });

    return {
      stackId: stack.id,
      noteId: stack.notes[0].id,
      reportId: historyItem.id,
      rawText: result.rawText
    };
  });
}

function registerScreenshotHandlers() {
  ipcMain.handle('screenshot:capture', () => {
    screenshotService.startCapture(windowManager);
  });

  ipcMain.handle('screenshot:region-selected', (_event, bounds) => {
    screenshotService.onRegionSelected(bounds, windowManager);
  });

  ipcMain.handle('screenshot:cancel', () => {
    screenshotService.cancelCapture(windowManager);
  });
}

function registerGlobalHotkeys() {
  const settings = noteStore.getSettings();
  const screenshotHotkey = (settings.screenshotHotkey || 'Ctrl+Alt+Z').trim() || 'Ctrl+Alt+Z';
  const toggleNotesHotkey = (settings.toggleNotesHotkey || DEFAULT_TOGGLE_NOTES_HOTKEY).trim() || DEFAULT_TOGGLE_NOTES_HOTKEY;

  hotkeyManager.unregister();

  const screenshotRegistered = settings.screenshotHotkeyEnabled !== false
    ? hotkeyManager.registerShortcut('screenshot', screenshotHotkey, () => {
        screenshotService.startCapture(windowManager);
      })
    : false;

  const toggleNotesRegistered = hotkeyManager.registerShortcut('toggle-notes', toggleNotesHotkey, () => {
    windowManager.toggleAllWindowsVisibility();
  });

  return {
    screenshotRegistered,
    toggleNotesRegistered,
    screenshotHotkey,
    toggleNotesHotkey
  };
}
