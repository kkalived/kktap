const { clipboard, desktopCapturer, screen, BrowserWindow } = require('electron');
const path = require('path');
const noteStore = require('./noteStore');

let overlayWindow = null;
let overlayReadyPromise = null;
let overlayLoaded = false;
let fullScreenshotImage = null;
let captureActive = false;
let wasHiddenBeforeCapture = false;

function prepareOverlay() {
  return ensureOverlayWindow(screen.getPrimaryDisplay());
}

async function startCapture(windowManager) {
  if (captureActive) return;

  captureActive = true;
  const targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = targetDisplay.bounds;
  const scaleFactor = targetDisplay.scaleFactor;

  try {
    await ensureOverlayWindow(targetDisplay);
    wasHiddenBeforeCapture = windowManager.areWindowsHidden();
    windowManager.hideAllWindows();
    await sleep(80);

    fullScreenshotImage = await captureDisplayImage(targetDisplay);
    const previewImage = fullScreenshotImage.resize({
      width: bounds.width,
      height: bounds.height,
      quality: 'better'
    });

    overlayWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    });
    overlayWindow.webContents.send('screenshot:image', {
      imageDataUrl: previewImage.toDataURL(),
      scaleFactor,
      displayWidth: bounds.width,
      displayHeight: bounds.height
    });
    overlayWindow.show();
    overlayWindow.focus();
    if (typeof overlayWindow.moveTop === 'function') {
      overlayWindow.moveTop();
    }
  } catch (err) {
    console.error('Screenshot start error:', err);
    restoreWindowsAfterCapture(windowManager);
    fullScreenshotImage = null;
    captureActive = false;
  }
}

async function onRegionSelected(bounds, windowManager) {
  if (!fullScreenshotImage) {
    cancelCapture(windowManager);
    return;
  }

  try {
    const { x, y, width, height, scaleFactor } = bounds;
    const imageSize = fullScreenshotImage.getSize();
    const cropX = clamp(Math.round(x * scaleFactor), 0, imageSize.width - 1);
    const cropY = clamp(Math.round(y * scaleFactor), 0, imageSize.height - 1);
    const cropW = Math.max(1, Math.min(Math.round(width * scaleFactor), imageSize.width - cropX));
    const cropH = Math.max(1, Math.min(Math.round(height * scaleFactor), imageSize.height - cropY));

    const cropped = fullScreenshotImage.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
    const pngBuffer = cropped.toPNG();
    const filename = `screenshot-${Date.now()}.png`;
    noteStore.saveImage(pngBuffer, filename);
    clipboard.writeImage(cropped);

    hideOverlay();
    const activeStackId = windowManager.getLastFocusedStackId();
    const activeStack = activeStackId
      ? noteStore.getAllStacks().find(item => item.id === activeStackId)
      : null;

    if (activeStack && activeStack.notes.length > 0) {
      const activeNote = activeStack.notes[activeStack.notes.length - 1];
      const nextImages = Array.isArray(activeNote.images)
        ? [...activeNote.images, filename]
        : [filename];

      noteStore.updateNoteContent(activeStack.id, activeNote.id, activeNote.content || '', nextImages);
      noteStore.updateNoteType(
        activeStack.id,
        activeNote.id,
        hasVisibleText(activeNote.content) ? 'mixed' : 'image'
      );

      restoreWindowsAfterCapture(windowManager);
      windowManager.refreshWindow(activeStack.id);
      windowManager.promoteStackWindow(activeStack.id);
      fullScreenshotImage = null;
      captureActive = false;
      return;
    }

    const noteWidth = Math.max(280, Math.min(600, width + 20));
    const noteHeight = Math.max(200, Math.min(600, height + 50));
    const newStack = noteStore.createStack({
      type: 'image',
      content: '',
      images: [filename]
    });

    noteStore.updateStackGeometry(newStack.id, null, { width: noteWidth, height: noteHeight });
    const createdStack = noteStore.getAllStacks().find(item => item.id === newStack.id) || newStack;
    createdStack.size.width = noteWidth;
    createdStack.size.height = noteHeight;

    restoreWindowsAfterCapture(windowManager);
    windowManager.createStackWindow(createdStack);
    windowManager.promoteStackWindow(createdStack.id);
    fullScreenshotImage = null;
    captureActive = false;
  } catch (err) {
    console.error('Screenshot crop error:', err);
    cancelCapture(windowManager);
  }
}

function cancelCapture(windowManager) {
  hideOverlay();
  restoreWindowsAfterCapture(windowManager);
  fullScreenshotImage = null;
  captureActive = false;
}

function restoreWindowsAfterCapture(windowManager) {
  if (wasHiddenBeforeCapture) {
    windowManager.hideAllWindows();
  } else {
    windowManager.showAllWindows();
  }
  wasHiddenBeforeCapture = false;
}

function ensureOverlayWindow(display) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height
    });
    return overlayLoaded ? Promise.resolve(overlayWindow) : overlayReadyPromise;
  }

  overlayLoaded = false;
  overlayWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayReadyPromise = null;
    overlayLoaded = false;
  });

  overlayReadyPromise = new Promise((resolve) => {
    overlayWindow.webContents.once('did-finish-load', () => {
      overlayLoaded = true;
      resolve(overlayWindow);
    });
  });

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'screenshot-overlay', 'index.html'));
  return overlayReadyPromise;
}

async function captureDisplayImage(display) {
  const captureWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor));
  const captureHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: captureWidth, height: captureHeight }
  });
  const displayId = String(display.id);
  const source = sources.find(item => String(item.display_id) === displayId) || sources[0];

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Unable to capture the selected display.');
  }

  return source.thumbnail;
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

function hasVisibleText(content) {
  if (typeof content !== 'string') return false;
  return content
    .replace(/<img[\s\S]*?>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim().length > 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { prepareOverlay, startCapture, onRegionSelected, cancelCapture };
