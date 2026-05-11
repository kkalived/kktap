const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

function createTray(windowManager, noteStore) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon-tray.png');
  let icon;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // 备用：动态生成 16x16 淡黄色图标
    icon = createFallbackIcon();
  }

  tray = new Tray(icon);
  updateTrayMenu(windowManager, noteStore);

  tray.on('click', () => {
    const newStack = noteStore.createStack({
      type: 'text', content: '', images: []
    });
    windowManager.createStackWindow(newStack);
  });
}

// 用原生方法生成 16x16 淡黄色图标
function createFallbackIcon() {
  // 16x16 RGBA 像素数据
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = 0xFF;       // R
    buf[i * 4 + 1] = 0xF9;   // G
    buf[i * 4 + 2] = 0xC4;   // B
    buf[i * 4 + 3] = 0xFF;   // A
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function updateTrayMenu(windowManager, noteStore) {
  const menu = Menu.buildFromTemplate([
    {
      label: '新建 KK便利贴',
      click: () => {
        const newStack = noteStore.createStack({
          type: 'text', content: '', images: []
        });
        windowManager.createStackWindow(newStack);
      }
    },
    {
      label: '显示全部 KK便利贴',
      click: () => {
        windowManager.showAllWindows();
      }
    },
    { type: 'separator' },
    {
      label: '历史记录',
      click: () => {
        const { BrowserWindow } = require('electron');
        const historyWin = new BrowserWindow({
          width: 500, height: 400, resizable: true, title: '历史记录',
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, contextIsolation: true, webSecurity: false
          }
        });
        historyWin.loadFile(path.join(__dirname, '..', 'renderer', 'history', 'index.html'));
        historyWin.setMenuBarVisibility(false);
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => { app.quit(); }
    }
  ]);

  tray.setToolTip('KK便利贴');
  tray.setContextMenu(menu);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray };
