const { BrowserWindow, screen } = require('electron');
const path = require('path');
const noteStore = require('./noteStore');

const windows = new Map();
const mergeTimers = new Map();
let lastFocusedStackId = null;
let noteWindowsHidden = false;

function getWorkArea() {
  const display = screen.getPrimaryDisplay();
  return display.workArea;
}

function clampToScreen(x, y, w, h) {
  const area = getWorkArea();
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - 100)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - 100))
  };
}

function createStackWindow(stackData) {
  const pos = clampToScreen(
    stackData.position.x, stackData.position.y,
    stackData.size.width, stackData.size.height
  );

  const win = new BrowserWindow({
    width: stackData.size.width,
    height: stackData.size.height,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 180,
    minHeight: 180,
    maxWidth: 600,
    maxHeight: 600,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'note-stack', 'index.html'));

  win.once('ready-to-show', () => {
    if (noteWindowsHidden) {
      win.hide();
      return;
    }
    win.show();
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('stack:data', stackData);
  });

  win.on('focus', () => {
    promoteStackWindow(stackData.id);
  });

  win.on('moved', () => {
    const [x, y] = win.getPosition();
    const [w, h] = win.getSize();
    noteStore.updateStackGeometry(stackData.id, { x, y }, { width: w, height: h });

    if (mergeTimers.has(stackData.id)) {
      clearTimeout(mergeTimers.get(stackData.id));
    }
    mergeTimers.set(stackData.id, setTimeout(() => {
      checkMerge(stackData.id, x, y);
      mergeTimers.delete(stackData.id);
    }, 300));
  });

  win.on('resize', () => {
    const [x, y] = win.getPosition();
    const [w, h] = win.getSize();
    noteStore.updateStackGeometry(stackData.id, { x, y }, { width: w, height: h });
  });

  win.on('closed', () => {
    if (mergeTimers.has(stackData.id)) {
      clearTimeout(mergeTimers.get(stackData.id));
      mergeTimers.delete(stackData.id);
    }
    windows.delete(stackData.id);
    if (lastFocusedStackId === stackData.id) {
      lastFocusedStackId = null;
    }
  });

  windows.set(stackData.id, win);
  promoteStackWindow(stackData.id);
  return win;
}

function checkMerge(movedStackId, x, y) {
  const threshold = noteStore.getSettings().stackOverlapThreshold || 30;
  const movedStack = noteStore.getAllStacks().find(s => s.id === movedStackId);
  if (!movedStack) return;

  for (const other of noteStore.getAllStacks()) {
    if (other.id === movedStackId) continue;
    const dx = Math.abs(x - other.position.x);
    const dy = Math.abs(y - other.position.y);
    if (dx < threshold && dy < threshold) {
      if (movedStack.notes.length + other.notes.length <= 3) {
        mergeWindows(movedStackId, other.id);
        return;
      }
    }
  }
}

function closeStackWindow(stackId) {
  const win = windows.get(stackId);
  if (win) {
    win.close();
    windows.delete(stackId);
  }
}

function getWindow(stackId) {
  return windows.get(stackId);
}

function getAllWindows() {
  return Array.from(windows.values());
}

function getLastFocusedStackId() {
  return lastFocusedStackId;
}

function areWindowsHidden() {
  return noteWindowsHidden;
}

function promoteStackWindow(stackId) {
  const win = windows.get(stackId);
  if (!win || win.isDestroyed()) return false;

  lastFocusedStackId = stackId;
  if (typeof win.moveTop === 'function') {
    win.moveTop();
  }
  return true;
}

// 刷新指定窗口内容
function refreshWindow(stackId) {
  const win = windows.get(stackId);
  if (win && !win.isDestroyed()) {
    const stacks = noteStore.getAllStacks();
    const stack = stacks.find(s => s.id === stackId);
    if (stack) {
      win.webContents.send('stack:data', stack);
    }
  }
}

function hideAllWindows() {
  noteWindowsHidden = true;
  windows.forEach(win => {
    if (!win.isDestroyed()) win.hide();
  });
}

function showAllWindows() {
  noteWindowsHidden = false;
  windows.forEach(win => {
    if (!win.isDestroyed()) win.show();
  });
  if (lastFocusedStackId) {
    promoteStackWindow(lastFocusedStackId);
  }
}

function toggleAllWindowsVisibility() {
  if (noteWindowsHidden) {
    showAllWindows();
    return true;
  }

  hideAllWindows();
  return false;
}

function closeAllWindows() {
  windows.forEach(win => {
    if (!win.isDestroyed()) win.close();
  });
  windows.clear();
}

function mergeWindows(stackIdA, stackIdB) {
  closeStackWindow(stackIdA);
  closeStackWindow(stackIdB);
  const merged = noteStore.mergeStacks(stackIdA, stackIdB);
  if (merged) createStackWindow(merged);
}

function splitWindow(stackId, noteId) {
  const result = noteStore.splitStack(stackId, noteId);
  if (result) {
    closeStackWindow(stackId);
    createStackWindow(result.newStack);
    if (result.remainingStack) createStackWindow(result.remainingStack);
  }
}

function collapseAllWindows(anchorStackId) {
  const collapsedStack = noteStore.collapseAllStacks(anchorStackId || lastFocusedStackId);
  if (!collapsedStack) return null;

  closeAllWindows();
  createStackWindow(collapsedStack);
  promoteStackWindow(collapsedStack.id);
  return collapsedStack;
}

function spreadStackWindow(stackId, activeNoteId) {
  const createdStacks = noteStore.expandStack(stackId, activeNoteId);
  if (!createdStacks || !createdStacks.length) return [];

  closeStackWindow(stackId);
  createdStacks.forEach((stack) => {
    createStackWindow(stack);
  });
  promoteStackWindow(createdStacks[createdStacks.length - 1].id);
  return createdStacks;
}

function restoreAllWindows() {
  noteStore.getAllStacks().forEach(stack => createStackWindow(stack));
}

module.exports = {
  createStackWindow, closeStackWindow, getWindow, getAllWindows,
  hideAllWindows, showAllWindows, closeAllWindows, restoreAllWindows,
  mergeWindows, splitWindow, getLastFocusedStackId, areWindowsHidden, refreshWindow,
  promoteStackWindow, collapseAllWindows, spreadStackWindow,
  toggleAllWindowsVisibility
};
