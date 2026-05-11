const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// ===== 存储路径 =====
let dataPath, imagesPath;

function initPaths() {
  const userData = app.getPath('userData');
  dataPath = path.join(userData, 'data.json');
  imagesPath = path.join(userData, 'images');
  if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
  }
}

// ===== 默认数据 =====
function defaultData() {
  return {
    version: 1,
    stacks: [],
    deletedNotes: [],
    reportHistory: [],
    settings: {
      screenshotHotkey: 'Ctrl+Alt+Z',
      screenshotHotkeyEnabled: true,
      toggleNotesHotkey: 'Ctrl+Alt+H',
      autoStart: false,
      deepseekApiKey: '',
      dailyReportModel: 'deepseek-v4-flash',
      dailyReportWorkContent: '',
      defaultNoteWidth: 280,
      defaultNoteHeight: 280,
      maxStackSize: 3,
      stackOverlapThreshold: 30
    }
  };
}

// ===== 内存状态 =====
let state = defaultData();

function normalizeNote(note) {
  return {
    ...note,
    content: typeof note.content === 'string' ? note.content : '',
    images: Array.isArray(note.images) ? note.images : []
  };
}

function normalizeStack(stack) {
  return {
    ...stack,
    collapsed: Boolean(stack.collapsed),
    notes: Array.isArray(stack.notes) ? stack.notes.map(normalizeNote) : []
  };
}

// ===== 原子写入 =====
function saveToDisk() {
  const tmpPath = dataPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, dataPath);
}

// ===== 加载 =====
function load() {
  initPaths();

  if (!fs.existsSync(dataPath)) {
    state = defaultData();
    saveToDisk();
    return;
  }

  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // 浅合并：确保新字段有默认值
    state = { ...defaultData(), ...parsed };
    state.settings = { ...defaultData().settings, ...(parsed.settings || {}) };
    if (!state.settings.dailyReportWorkContent && parsed.settings && parsed.settings.dailyReportWorkContext) {
      state.settings.dailyReportWorkContent = parsed.settings.dailyReportWorkContext;
    }

    // 验证 stacks 是数组
    if (!Array.isArray(state.stacks)) state.stacks = [];
    if (!Array.isArray(state.deletedNotes)) state.deletedNotes = [];
    if (!Array.isArray(state.reportHistory)) state.reportHistory = [];
    state.stacks = state.stacks.map(normalizeStack);
    state.deletedNotes = state.deletedNotes.map(item => ({
      ...item,
      note: normalizeNote(item.note || {})
    }));
    state.reportHistory = state.reportHistory.map(item => ({
      ...item,
      content: typeof item.content === 'string' ? item.content : '',
      rawText: typeof item.rawText === 'string' ? item.rawText : '',
      title: typeof item.title === 'string' ? item.title : '日报'
    }));

  } catch (err) {
    // JSON 损坏：备份后重建
    const bakPath = dataPath + '.bak';
    try { fs.copyFileSync(dataPath, bakPath); } catch (_) {}
    state = defaultData();
    saveToDisk();
  }
}

// ===== UUID 生成 =====
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ===== 堆操作 =====
function createStack(noteData, overridePosition) {
  const pos = overridePosition || {
    x: 200 + Math.random() * 200,
    y: 150 + Math.random() * 150
  };
  const stack = {
    id: uuid(),
    position: { x: pos.x, y: pos.y },
    collapsed: false,
    size: {
      width: state.settings.defaultNoteWidth,
      height: state.settings.defaultNoteHeight
    },
    rotation: (Math.random() * 3 - 1.5).toFixed(1),
    notes: [normalizeNote({
      ...noteData,
      id: uuid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })]
  };

  state.stacks.push(stack);
  saveToDisk();
  return stack;
}

function updateNoteContent(stackId, noteId, content, images, fontSize) {
  const stack = state.stacks.find(s => s.id === stackId);
  if (!stack) return false;

  const note = stack.notes.find(n => n.id === noteId);
  if (!note) return false;

  if (content !== undefined) note.content = content;
  if (images !== undefined) note.images = images;
  if (fontSize !== undefined) note.fontSize = fontSize;
  note.updatedAt = new Date().toISOString();
  saveToDisk();
  return true;
}

function updateNoteType(stackId, noteId, type) {
  const stack = state.stacks.find(s => s.id === stackId);
  if (!stack) return false;
  const note = stack.notes.find(n => n.id === noteId);
  if (!note) return false;
  note.type = type;
  note.updatedAt = new Date().toISOString();
  saveToDisk();
  return true;
}

function updateStackGeometry(stackId, position, size) {
  const stack = state.stacks.find(s => s.id === stackId);
  if (!stack) return false;

  if (position) stack.position = position;
  if (size) stack.size = size;
  saveToDisk();
  return true;
}

function updateStackOrder(stackId, newOrder) {
  const stack = state.stacks.find(s => s.id === stackId);
  if (!stack) return false;

  // newOrder 是 noteId 数组，按新顺序重排 notes
  const orderMap = new Map(newOrder.map((id, i) => [id, i]));
  stack.notes.sort((a, b) => {
    return (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99);
  });
  saveToDisk();
  return true;
}

function deleteNote(stackId, noteId) {
  const stack = state.stacks.find(s => s.id === stackId);
  if (!stack) return false;

  const noteIdx = stack.notes.findIndex(n => n.id === noteId);
  if (noteIdx === -1) return false;

  const [note] = stack.notes.splice(noteIdx, 1);

  // 加入回收站
  state.deletedNotes.push({
    originalStackId: stackId,
    note,
    deletedAt: new Date().toISOString()
  });

  // 如果堆空了，删除堆
  if (stack.notes.length === 0) {
    state.stacks = state.stacks.filter(s => s.id !== stackId);
  }

  saveToDisk();
  return true;
}

// ===== 历史记录 =====
function getDeletedNotes() {
  return state.deletedNotes.sort((a, b) =>
    new Date(b.deletedAt) - new Date(a.deletedAt)
  );
}

function getReportHistory() {
  return state.reportHistory.slice().sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function restoreNote(noteData) {
  // 从回收站移除
  state.deletedNotes = state.deletedNotes.filter(
    d => d.note.id !== noteData.id
  );

  // 创建新堆
  const stack = {
    id: uuid(),
    collapsed: false,
    position: {
      x: 200 + Math.random() * 200,
      y: 150 + Math.random() * 150
    },
    size: {
      width: state.settings.defaultNoteWidth,
      height: state.settings.defaultNoteHeight
    },
    rotation: (Math.random() * 3 - 1.5).toFixed(1),
    notes: [normalizeNote(noteData)]
  };

  state.stacks.push(stack);
  saveToDisk();
  return stack;
}

function permanentDelete(noteId) {
  const deleted = state.deletedNotes.find(d => d.note.id === noteId);
  state.deletedNotes = state.deletedNotes.filter(d => d.note.id !== noteId);

  // 删除关联图片文件
  if (deleted && deleted.note.images) {
    deleted.note.images.forEach(img => {
      const imgPath = path.join(imagesPath, img);
      try { fs.unlinkSync(imgPath); } catch (_) {}
    });
  }
  saveToDisk();
}

function saveReportHistoryItem(reportData) {
  const item = {
    id: uuid(),
    title: reportData.title || '日报',
    content: typeof reportData.content === 'string' ? reportData.content : '',
    rawText: typeof reportData.rawText === 'string' ? reportData.rawText : '',
    createdAt: reportData.createdAt || new Date().toISOString()
  };
  state.reportHistory.unshift(item);
  saveToDisk();
  return item;
}

function restoreReport(reportId) {
  const item = state.reportHistory.find((entry) => entry.id === reportId);
  if (!item) return null;

  const stack = createStack({
    type: 'text',
    content: item.content,
    images: []
  });
  const note = stack.notes[0];
  note.createdAt = item.createdAt;
  note.updatedAt = new Date().toISOString();
  saveToDisk();
  return stack;
}

function permanentDeleteReport(reportId) {
  state.reportHistory = state.reportHistory.filter((item) => item.id !== reportId);
  saveToDisk();
}

// ===== 设置 =====
function getSettings() {
  return state.settings;
}

function setSetting(key, value) {
  state.settings[key] = value;
  saveToDisk();
}

// ===== 图片保存 =====
function saveImage(buffer, filename) {
  const filepath = path.join(imagesPath, filename);
  fs.writeFileSync(filepath, buffer);
  return filename;
}

function getImagePath(filename) {
  return path.join(imagesPath, filename);
}

// ===== 获取全部数据 =====
function getAllStacks() {
  return state.stacks;
}

function getStack(stackId) {
  return state.stacks.find(stack => stack.id === stackId) || null;
}

// ===== 合并/拆分（为 Step 5 预留） =====
function mergeStacks(stackIdA, stackIdB) {
  const stackA = state.stacks.find(s => s.id === stackIdA);
  const stackB = state.stacks.find(s => s.id === stackIdB);
  if (!stackA || !stackB) return null;

  const combined = [...stackA.notes, ...stackB.notes];
  if (combined.length > state.settings.maxStackSize) return null;

  // 合并到 stackA，删除 stackB
  stackA.notes = combined;
  stackA.collapsed = false;
  state.stacks = state.stacks.filter(s => s.id !== stackIdB);
  saveToDisk();
  return stackA;
}

function splitStack(stackId, noteId) {
  const stack = state.stacks.find(s => s.id === stackId);
  if (!stack) return null;

  const noteIdx = stack.notes.findIndex(n => n.id === noteId);
  if (noteIdx === -1) return null;

  const [note] = stack.notes.splice(noteIdx, 1);

  // 为拆分的便利贴创建新堆
  const newStack = {
    id: uuid(),
    collapsed: false,
    position: {
      x: stack.position.x + 40,
      y: stack.position.y + 40
    },
    size: { ...stack.size },
    rotation: (Math.random() * 3 - 1.5).toFixed(1),
    notes: [note]
  };

  state.stacks.push(newStack);

  // 如果原堆空了，删除它
  if (stack.notes.length === 0) {
    state.stacks = state.stacks.filter(s => s.id !== stackId);
  }

  saveToDisk();
  return { remainingStack: stack.notes.length > 0 ? stack : null, newStack };
}

function collapseAllStacks(anchorStackId) {
  if (!state.stacks.length) return null;

  const anchorStack = getStack(anchorStackId) || state.stacks[state.stacks.length - 1];
  const otherStacks = state.stacks.filter(stack => stack.id !== anchorStack.id);
  const orderedStacks = [...otherStacks, anchorStack];
  const flattenedNotes = orderedStacks.flatMap(stack => stack.notes.map(normalizeNote));

  const collapsedStack = normalizeStack({
    id: uuid(),
    collapsed: true,
    position: { ...anchorStack.position },
    size: {
      width: anchorStack.size.width,
      height: anchorStack.size.height
    },
    rotation: anchorStack.rotation,
    notes: flattenedNotes
  });

  state.stacks = [collapsedStack];
  saveToDisk();
  return collapsedStack;
}

function expandStack(stackId, activeNoteId) {
  const stack = getStack(stackId);
  if (!stack || stack.notes.length <= 1) return null;

  const notes = stack.notes.slice();
  const activeIndex = notes.findIndex(note => note.id === activeNoteId);
  const orderedNotes = activeIndex >= 0
    ? [...notes.slice(0, activeIndex), ...notes.slice(activeIndex + 1), notes[activeIndex]]
    : notes;

  const createdStacks = orderedNotes.map((note, index) => normalizeStack({
    id: uuid(),
    collapsed: false,
    position: {
      x: stack.position.x + (index % 3) * 36,
      y: stack.position.y + Math.floor(index / 3) * 28
    },
    size: { ...stack.size },
    rotation: (Math.random() * 3 - 1.5).toFixed(1),
    notes: [normalizeNote(note)]
  }));

  state.stacks = state.stacks.filter(item => item.id !== stackId);
  state.stacks.push(...createdStacks);
  saveToDisk();
  return createdStacks;
}

// ===== 注册所有 IPC handlers =====
function registerIpcHandlers(onCreateStack) {
  const { ipcMain } = require('electron');

  ipcMain.handle('notes:get-all', () => getAllStacks());

  ipcMain.handle('notes:create', (event, data) => {
    // 新建便利贴覆盖在当前便利贴位置
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    let pos = null;
    if (callerWin && !callerWin.isDestroyed()) {
      const [x, y] = callerWin.getPosition();
      pos = { x, y };
    }
    const stack = createStack(data, pos);
    if (onCreateStack) onCreateStack(stack);
    return stack;
  });

  ipcMain.handle('notes:update-content', (_e, { stackId, noteId, content, images, fontSize }) => {
    return updateNoteContent(stackId, noteId, content, images, fontSize);
  });

  ipcMain.handle('notes:update-geometry', (_e, { stackId, position, size }) => {
    return updateStackGeometry(stackId, position, size);
  });

  ipcMain.handle('notes:update-order', (_e, { stackId, order }) => {
    return updateStackOrder(stackId, order);
  });

  ipcMain.handle('notes:delete', (_e, { stackId, noteId }) => {
    return deleteNote(stackId, noteId);
  });

  ipcMain.handle('notes:get-history', () => {
    return getDeletedNotes();
  });

  ipcMain.handle('notes:restore', (_e, { noteData }) => {
    const stack = restoreNote(noteData);
    if (onCreateStack) onCreateStack(stack);
    return stack;
  });

  ipcMain.handle('notes:permanent-delete', (_e, { noteId }) => {
    permanentDelete(noteId);
  });

  ipcMain.handle('reports:get-history', () => {
    return getReportHistory();
  });

  ipcMain.handle('reports:restore', (_e, { reportId }) => {
    const stack = restoreReport(reportId);
    if (stack && onCreateStack) onCreateStack(stack);
    return stack;
  });

  ipcMain.handle('reports:permanent-delete', (_e, { reportId }) => {
    permanentDeleteReport(reportId);
  });

  ipcMain.handle('stacks:merge-check', (_e, { stackIdA, stackIdB }) => {
    return mergeStacks(stackIdA, stackIdB);
  });

  ipcMain.handle('stacks:split', (_e, { stackId, noteId }) => {
    return splitStack(stackId, noteId);
  });

  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_e, data) => {
    const { key, value } = data;
    return setSetting(key, value);
  });

  ipcMain.handle('app:get-path', () => app.getPath('userData'));
}

module.exports = {
  load,
  save: saveToDisk,
  registerIpcHandlers,
  getImagePath,
  saveImage,
  createStack,
  getAllStacks,
  getStack,
  getSettings,
  updateStackGeometry,
  updateNoteContent,
  updateNoteType,
  getDeletedNotes,
  getReportHistory,
  saveReportHistoryItem,
  restoreReport,
  permanentDeleteReport,
  mergeStacks,
  splitStack,
  collapseAllStacks,
  expandStack
};
