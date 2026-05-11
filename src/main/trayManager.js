const { Tray, Menu, app, nativeImage, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

function createTray(windowManager, noteStore) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon-tray.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : createFallbackIcon();

  tray = new Tray(icon);
  updateTrayMenu(windowManager, noteStore);

  tray.on('click', () => {
    const newStack = noteStore.createStack({
      type: 'text',
      content: '',
      images: []
    });
    windowManager.createStackWindow(newStack);
  });
}

function createFallbackIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    buffer[i * 4] = 0xFF;
    buffer[i * 4 + 1] = 0xF9;
    buffer[i * 4 + 2] = 0xC4;
    buffer[i * 4 + 3] = 0xFF;
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

function updateTrayMenu(windowManager, noteStore) {
  const menu = Menu.buildFromTemplate([
    {
      label: '新建 KKTap',
      click: () => {
        const newStack = noteStore.createStack({
          type: 'text',
          content: '',
          images: []
        });
        windowManager.createStackWindow(newStack);
      }
    },
    {
      label: '显示全部 KKTap',
      click: () => {
        windowManager.showAllWindows();
      }
    },
    { type: 'separator' },
    {
      label: '历史记录',
      click: () => {
        const historyWin = new BrowserWindow({
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
        historyWin.loadFile(path.join(__dirname, '..', 'renderer', 'history', 'index.html'));
        historyWin.setMenuBarVisibility(false);
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('KKTap');
  tray.setContextMenu(menu);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray };
