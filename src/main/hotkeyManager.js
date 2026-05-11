const { globalShortcut } = require('electron');

const shortcuts = new Map();

function registerShortcut(name, accelerator, callback) {
  if (!name || !accelerator || typeof callback !== 'function') {
    return false;
  }

  unregisterShortcut(name);

  try {
    const registered = globalShortcut.register(accelerator, callback);
    if (!registered) return false;

    shortcuts.set(name, { accelerator, callback });
    return true;
  } catch (_err) {
    return false;
  }
}

function updateShortcut(name, accelerator) {
  const existing = shortcuts.get(name);
  if (!existing) return false;
  return registerShortcut(name, accelerator, existing.callback);
}

function unregisterShortcut(name) {
  const existing = shortcuts.get(name);
  if (!existing) return;

  globalShortcut.unregister(existing.accelerator);
  shortcuts.delete(name);
}

function unregister() {
  globalShortcut.unregisterAll();
  shortcuts.clear();
}

function getCurrentHotkey(name = 'default') {
  return shortcuts.get(name)?.accelerator || null;
}

function register(callback) {
  return registerShortcut('default', 'Ctrl+Alt+Z', callback);
}

function changeHotkey(newHotkey) {
  return updateShortcut('default', newHotkey);
}

module.exports = {
  register,
  changeHotkey,
  unregister,
  getCurrentHotkey,
  registerShortcut,
  updateShortcut,
  unregisterShortcut
};
