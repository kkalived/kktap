(function () {
  'use strict';

  const stackEl = document.getElementById('stack');
  const contextMenu = document.getElementById('context-menu');
  const menuCollapse = document.getElementById('menu-collapse');
  const menuSpread = document.getElementById('menu-spread');
  const menuSplit = document.getElementById('menu-split');
  const imageDataUrlCache = new Map();
  const imageSizeCache = new Map();
  const toolbarActions = new Set(['font-plus', 'font-minus', 'bold', 'italic', 'todo', 'daily-report']);

  let stackData = null;
  let activeIdx = 0;
  let activeNoteId = null;
  let flipping = false;
  let saveTimer = null;
  let renderSequence = 0;
  let savedSelection = null;

  window.api.onStackData((data) => {
    const normalizedData = normalizeStackData(data);
    const previousActiveNoteId = activeNoteId;
    stackData = normalizedData;
    savedSelection = null;

    if (!stackData.notes.length) {
      stackEl.innerHTML = '';
      activeIdx = 0;
      activeNoteId = null;
      updateMenuVisibility().catch(console.error);
      return;
    }

    const fallbackIdx = stackData.notes.length - 1;
    const nextIdx = previousActiveNoteId
      ? stackData.notes.findIndex((note) => note.id === previousActiveNoteId)
      : fallbackIdx;

    activeIdx = nextIdx >= 0 ? nextIdx : fallbackIdx;
    activeNoteId = stackData.notes[activeIdx].id;
    updateMenuVisibility().catch(console.error);
    renderStack().catch(console.error);
  });

  document.addEventListener('mousedown', () => {
    if (stackData) {
      window.api.activateWindow(stackData.id);
    }
  });

  function normalizeStackData(data) {
    return {
      ...data,
      collapsed: Boolean(data.collapsed),
      notes: Array.isArray(data.notes)
        ? data.notes.map((note) => ({
            ...note,
            content: typeof note.content === 'string' ? note.content : '',
            images: Array.isArray(note.images) ? note.images : [],
            fontSize: Number.isFinite(Number(note.fontSize)) ? Number(note.fontSize) : undefined
          }))
        : []
    };
  }

  async function renderStack() {
    if (!stackData || !stackData.notes.length) return;

    activeIdx = Math.max(0, Math.min(activeIdx, stackData.notes.length - 1));
    const activeNote = stackData.notes[activeIdx];
    activeNoteId = activeNote.id;

    const renderId = ++renderSequence;
    const renderData = await buildNoteRenderData(activeNote);
    if (renderId !== renderSequence) return;

    stackEl.innerHTML = '';

    if (stackData.collapsed) {
      stackEl.insertAdjacentHTML('beforeend', buildCollapsedUnderlays(stackData.notes.length - 1));
    } else {
      renderPeekPages();
    }

    stackEl.insertAdjacentHTML(
      'beforeend',
      buildNotePage(activeNote, activeIdx, 'note-page active', renderData, activeIdx > 0)
    );

    bindHeaderEvents();
    bindPeekEvents();
    bindCurlEvents();
    bindContentEvents();
    bindToolbarEvents();
    syncTodoStates();
    applyFontSize(activeNote.fontSize || 14);
  }

  function renderPeekPages() {
    const peekIndices = [];
    for (let idx = Math.max(0, activeIdx - 2); idx < activeIdx; idx += 1) {
      peekIndices.push(idx);
    }

    peekIndices.forEach((noteIndex, listIndex) => {
      const layerIndex = peekIndices.length - listIndex - 1;
      stackEl.insertAdjacentHTML(
        'beforeend',
        buildPeekPage(stackData.notes[noteIndex], noteIndex, layerIndex)
      );
    });
  }

  function buildCollapsedUnderlays(hiddenCount) {
    const visibleCount = Math.min(2, Math.max(0, hiddenCount));
    let markup = '';

    for (let layer = visibleCount; layer >= 1; layer -= 1) {
      markup += `<div class="stack-underlay stack-underlay-${layer}"></div>`;
    }

    return markup;
  }

  async function buildNoteRenderData(note) {
    const contentHtml = await getRenderableContent(note);
    const imagesHtml = await buildNoteImagesMarkup(note);

    return {
      contentHtml,
      imagesHtml
    };
  }

  function buildNotePage(note, index, className, renderData, showCurl) {
    const title = `KK便利贴${stackData.notes.length > 1 ? ` ${index + 1}` : ''}`;
    const bodyHtml = `${renderData.contentHtml}${renderData.imagesHtml}`;

    return `
      <div class="${className}" data-index="${index}" data-note-id="${note.id}">
        <div class="note-header">
          <span class="note-title">${title}</span>
          <div class="note-header-actions">
            <span class="note-count">${index + 1}/${stackData.notes.length}</span>
            <button class="btn-close" title="删除">×</button>
          </div>
        </div>
        <div class="note-body">
          <div class="note-content" contenteditable="true" placeholder="在这里输入内容...">${bodyHtml}</div>
        </div>
        <div class="note-toolbar" contenteditable="false">
          <button class="toolbar-btn" type="button" data-action="font-plus" title="字体变大">A+</button>
          <button class="toolbar-btn" type="button" data-action="font-minus" title="字体变小">A-</button>
          <button class="toolbar-btn toolbar-btn-bold" type="button" data-action="bold" title="加粗">B</button>
          <button class="toolbar-btn toolbar-btn-italic" type="button" data-action="italic" title="倾斜">I</button>
          <button class="toolbar-btn toolbar-btn-todo" type="button" data-action="todo" title="插入待办">⚪</button>
        </div>
        <button class="page-curl${showCurl ? '' : ' hidden'}" type="button" title="翻到下一张">
          <span class="curl-arrow">◥</span>
        </button>
      </div>`;
  }

  function buildPeekPage(note, index, layerIndex) {
    const date = new Date(note.createdAt);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    return `
      <div class="note-page peek peek-layer-${layerIndex}" data-index="${index}" data-note-id="${note.id}" title="点击翻到此页">
        <div class="peek-label">${label}</div>
        <div class="peek-indicator">●</div>
      </div>`;
  }

  async function buildNoteImagesMarkup(note) {
    if (!note.images.length) return '';

    const tags = await Promise.all(note.images.map(async (filename) => {
      const dataUrl = await readImageDataUrl(filename);
      if (!dataUrl) return '';

      const size = await getImageSize(dataUrl);
      const bounds = fitImageBounds(size);
      return buildImageWrapMarkup(filename, dataUrl, bounds);
    }));

    return tags.filter(Boolean).join('');
  }

  function buildImageWrapMarkup(filename, dataUrl, bounds) {
    return `
      <div
        class="note-image-wrap"
        contenteditable="false"
        style="width:${bounds.width}px;height:${bounds.height}px;"
      >
        <img
          class="note-image"
          src="${escapeAttribute(dataUrl)}"
          data-filename="${escapeAttribute(filename)}"
          alt=""
          draggable="false"
        >
      </div>
    `;
  }

  async function getRenderableContent(note) {
    const container = document.createElement('div');
    container.innerHTML = note.content || '';

    if (note.images.length) {
      const imageSet = new Set(note.images);

      container.querySelectorAll('.note-image-wrap').forEach((wrap) => {
        const image = wrap.querySelector('.note-image');
        const filename = image ? image.getAttribute('data-filename') : null;
        if (filename && imageSet.has(filename)) {
          wrap.remove();
        }
      });

      container.querySelectorAll('img').forEach((imgEl) => {
        const filename = imgEl.getAttribute('data-filename')
          || extractFilename(imgEl.getAttribute('src'));
        if (filename && imageSet.has(filename)) {
          imgEl.remove();
        }
      });
    }

    await replaceLegacyInlineImages(container);
    return container.innerHTML;
  }

  async function replaceLegacyInlineImages(container) {
    const inlineImages = Array.from(container.querySelectorAll('img'));
    for (const imgEl of inlineImages) {
      const filename = imgEl.getAttribute('data-filename')
        || extractFilename(imgEl.getAttribute('src'));
      if (!filename) continue;

      const dataUrl = await readImageDataUrl(filename);
      if (!dataUrl) continue;

      const bounds = fitImageBounds(await getImageSize(dataUrl));
      imgEl.outerHTML = buildImageWrapMarkup(filename, dataUrl, bounds);
    }
  }

  function fitImageBounds(size) {
    const maxWidth = Math.max(140, Math.min((stackData?.size?.width || 280) - 48, 520));
    const maxHeight = 420;
    const widthRatio = maxWidth / size.width;
    const heightRatio = maxHeight / size.height;
    const ratio = Math.min(1, widthRatio, heightRatio);

    return {
      width: Math.max(88, Math.round(size.width * ratio)),
      height: Math.max(56, Math.round(size.height * ratio))
    };
  }

  async function getImageSize(dataUrl) {
    if (imageSizeCache.has(dataUrl)) {
      return imageSizeCache.get(dataUrl);
    }

    const sizePromise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({
        width: image.naturalWidth || 240,
        height: image.naturalHeight || 180
      });
      image.onerror = () => resolve({ width: 240, height: 180 });
      image.src = dataUrl;
    });

    imageSizeCache.set(dataUrl, sizePromise);
    return sizePromise;
  }

  function bindHeaderEvents() {
    const btn = document.querySelector('.btn-close');
    if (btn) {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeActive();
      });
    }
  }

  function bindPeekEvents() {
    document.querySelectorAll('.note-page.peek').forEach((element) => {
      element.addEventListener('click', () => {
        if (!flipping) {
          bringToFront(Number.parseInt(element.dataset.index, 10)).catch(console.error);
        }
      });
    });
  }

  function bindCurlEvents() {
    const curl = document.querySelector('.page-curl:not(.hidden)');
    if (!curl) return;

    curl.addEventListener('click', (event) => {
      event.stopPropagation();
      if (flipping || activeIdx <= 0) return;

      bringToFront(activeIdx - 1).catch(console.error);
    });
  }

  function bindContentEvents() {
    const contentEl = document.querySelector('.note-content');
    if (!contentEl) return;

    contentEl.addEventListener('click', (event) => {
      const toggle = event.target.closest('.todo-toggle');
      if (!toggle) return;

      event.preventDefault();
      event.stopPropagation();
      toggleTodoLine(toggle.closest('.todo-line'));
    });

    contentEl.addEventListener('keydown', (event) => {
      const todoLine = getCurrentTodoLine();
      if (!todoLine) return;

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        insertTodoLineAfter(todoLine);
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && isCaretAtTodoTextStart(todoLine)) {
        event.preventDefault();
        convertTodoLineToPlainText(todoLine);
      }
    });

    contentEl.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveContent, 800);
    });

    contentEl.addEventListener('blur', () => {
      clearTimeout(saveTimer);
      saveContent();
    });

    contentEl.addEventListener('mouseup', cacheSelection);
    contentEl.addEventListener('keyup', cacheSelection);
  }

  function bindToolbarEvents() {
    const toolbar = document.querySelector('.note-toolbar');
    if (toolbar && !toolbar.querySelector('[data-action="daily-report"]')) {
      const reportButton = document.createElement('button');
      reportButton.type = 'button';
      reportButton.className = 'toolbar-btn toolbar-btn-report';
      reportButton.dataset.action = 'daily-report';
      reportButton.title = '生成日报';
      reportButton.textContent = '日报';
      toolbar.appendChild(reportButton);
    }

    document.querySelectorAll('.toolbar-btn').forEach((button) => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });

      button.addEventListener('click', (event) => {
        event.preventDefault();
        handleToolbarAction(button.dataset.action).catch(console.error);
      });
    });
  }

  (function initEdgeResize() {
    let isResizing = false;
    let edge = null;
    let startBounds = {};

    const edges = {
      top: { getDelta: (dx, dy, w, h) => ({ w, h: h - dy }) },
      bottom: { getDelta: (dx, dy, w, h) => ({ w, h: h + dy }) },
      left: { getDelta: (dx, dy, w, h) => ({ w: w - dx, h }) },
      right: { getDelta: (dx, dy, w, h) => ({ w: w + dx, h }) },
      tl: { getDelta: (dx, dy, w, h) => ({ w: w - dx, h: h - dy }) },
      tr: { getDelta: (dx, dy, w, h) => ({ w: w + dx, h: h - dy }) },
      bl: { getDelta: (dx, dy, w, h) => ({ w: w - dx, h: h + dy }) },
      br: { getDelta: (dx, dy, w, h) => ({ w: w + dx, h: h + dy }) }
    };

    document.querySelectorAll('.resize-edge, .resize-corner').forEach((element) => {
      element.addEventListener('mousedown', (event) => {
        isResizing = true;
        edge = element.classList.contains('resize-top') ? 'top'
          : element.classList.contains('resize-bottom') ? 'bottom'
          : element.classList.contains('resize-left') ? 'left'
          : element.classList.contains('resize-right') ? 'right'
          : element.classList.contains('resize-corner-tl') ? 'tl'
          : element.classList.contains('resize-corner-tr') ? 'tr'
          : element.classList.contains('resize-corner-bl') ? 'bl'
          : 'br';

        startBounds = {
          x: event.screenX,
          y: event.screenY,
          w: window.outerWidth,
          h: window.outerHeight
        };
        event.preventDefault();
        event.stopPropagation();
      });
    });

    document.addEventListener('mousemove', (event) => {
      if (!isResizing || !edge) return;

      const dx = event.screenX - startBounds.x;
      const dy = event.screenY - startBounds.y;
      const delta = edges[edge].getDelta(dx, dy, startBounds.w, startBounds.h);
      const newWidth = clamp(Math.round(delta.w), 180, 600);
      const newHeight = clamp(Math.round(delta.h), 180, 600);
      window.api.windowResize({ width: newWidth, height: newHeight });
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;

      isResizing = false;
      edge = null;
      window.api.windowResize({
        width: window.outerWidth,
        height: window.outerHeight,
        save: true,
        stackId: stackData ? stackData.id : null
      });
    });
  })();

  async function bringToFront(targetIdx) {
    if (!stackData || targetIdx === activeIdx || flipping || targetIdx < 0) return;

    flipping = true;
    const activePage = document.querySelector('.note-page.active');
    if (!activePage) {
      flipping = false;
      return;
    }

    const targetNote = stackData.notes[targetIdx];
    const renderData = await buildNoteRenderData(targetNote);

    if (!stackData || stackData.notes[targetIdx]?.id !== targetNote.id) {
      flipping = false;
      return;
    }

    activePage.classList.remove('active');
    activePage.classList.add('flipping-out');
    stackEl.insertAdjacentHTML(
      'beforeend',
      buildNotePage(targetNote, targetIdx, 'note-page flipping-in', renderData, targetIdx > 0)
    );

    window.setTimeout(() => {
      const reorderedNotes = stackData.notes.slice();
      const [selectedNote] = reorderedNotes.splice(targetIdx, 1);
      reorderedNotes.push(selectedNote);

      stackData.notes = reorderedNotes;
      activeIdx = stackData.notes.length - 1;
      activeNoteId = selectedNote.id;
      flipping = false;
      savedSelection = null;
      renderStack().catch(console.error);

      window.api.notes.updateOrder({
        stackId: stackData.id,
        order: reorderedNotes.map((note) => note.id)
      });
    }, 520);
  }

  function closeActive() {
    if (!stackData) return;

    const activePage = document.querySelector('.note-page.active');
    const noteId = activePage ? activePage.dataset.noteId : null;
    if (!noteId) return;

    window.api.notes.delete({ stackId: stackData.id, noteId });

    const remainingNotes = stackData.notes.filter((note) => note.id !== noteId);
    if (!remainingNotes.length) {
      window.close();
      return;
    }

    stackData.notes = remainingNotes;
    activeIdx = remainingNotes.length - 1;
    activeNoteId = remainingNotes[activeIdx].id;
    savedSelection = null;
    updateMenuVisibility().catch(console.error);
    renderStack().catch(console.error);
  }

  function applyFontSize(size) {
    const contentEl = document.querySelector('.note-content');
    if (contentEl) {
      contentEl.style.fontSize = `${size}px`;
    }
  }

  function cacheSelection() {
    const contentEl = document.querySelector('.note-content');
    if (!contentEl) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!isRangeInsideContent(range, contentEl)) return;
    savedSelection = range.cloneRange();
  }

  function isRangeInsideContent(range, contentEl) {
    return Boolean(range && contentEl)
      && isNodeInsideContent(range.startContainer, contentEl)
      && isNodeInsideContent(range.endContainer, contentEl);
  }

  function isNodeInsideContent(node, contentEl) {
    if (!node || !contentEl) return false;
    const element = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    return element === contentEl || contentEl.contains(element);
  }

  function restoreSelection(contentEl) {
    if (!contentEl) return null;
    contentEl.focus();

    const selection = window.getSelection();
    if (!selection) return null;
    selection.removeAllRanges();

    if (savedSelection && isRangeInsideContent(savedSelection, contentEl)) {
      selection.addRange(savedSelection);
      return savedSelection;
    }

    const range = document.createRange();
    range.selectNodeContents(contentEl);
    range.collapse(false);
    selection.addRange(range);
    savedSelection = range.cloneRange();
    return savedSelection;
  }

  async function handleToolbarAction(action) {
    if (!toolbarActions.has(action)) return;

    if (action === 'daily-report') {
      await generateDailyReport();
      return;
    }

    const contentEl = document.querySelector('.note-content');
    if (!contentEl) return;

    const range = restoreSelection(contentEl);
    if (!range) return;

    switch (action) {
      case 'font-plus':
        adjustFontSizeAction(2, contentEl, range);
        break;
      case 'font-minus':
        adjustFontSizeAction(-2, contentEl, range);
        break;
      case 'bold':
        runExecCommand('bold');
        break;
      case 'italic':
        runExecCommand('italic');
        break;
      case 'todo':
        insertTodoLine(range, contentEl);
        break;
      default:
        return;
    }

    syncTodoStates();
    cacheSelection();
    saveContent();
  }

  async function generateDailyReport() {
    try {
      await window.api.reports.generateDaily();
    } catch (error) {
      window.alert(error && error.message ? error.message : '日报生成失败，请检查 DeepSeek 配置');
    }
  }

  function adjustFontSizeAction(step, contentEl, range) {
    const activeNote = getActiveNote();
    const currentFontSize = activeNote?.fontSize
      || parseInt(window.getComputedStyle(contentEl).fontSize, 10)
      || 14;

    if (!range.collapsed && !rangeContainsBlockedElements(range)) {
      const baseSize = getRangeFontSize(range, contentEl, currentFontSize);
      const nextSize = clamp(baseSize + step, 10, 32);
      wrapRangeWithStyle(range, { fontSize: `${nextSize}px` });
      return;
    }

    const nextSize = clamp(currentFontSize + step, 10, 32);
    if (activeNote) {
      activeNote.fontSize = nextSize;
    }
    applyFontSize(nextSize);
  }

  function rangeContainsBlockedElements(range) {
    const fragment = range.cloneContents();
    return Boolean(fragment.querySelector('div, p, ul, ol, li, table, blockquote, .todo-line, .note-image-wrap'));
  }

  function getRangeFontSize(range, contentEl, fallbackSize) {
    const baseNode = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentNode
      : range.startContainer;
    const computed = window.getComputedStyle(baseNode === contentEl ? contentEl : baseNode);
    const parsed = parseInt(computed.fontSize, 10);
    return Number.isFinite(parsed) ? parsed : fallbackSize;
  }

  function wrapRangeWithStyle(range, styleMap) {
    const fragment = range.extractContents();
    if (!fragment.textContent && !fragment.querySelector('*')) return;

    const span = document.createElement('span');
    Object.entries(styleMap).forEach(([key, value]) => {
      span.style[key] = value;
    });
    span.appendChild(fragment);
    range.insertNode(span);

    const selection = window.getSelection();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    newRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(newRange);
    savedSelection = newRange.cloneRange();
  }

  function runExecCommand(command) {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, null);
  }

  function insertTodoLine(range, contentEl) {
    const lineContainer = getEditableLineContainer(range.startContainer, contentEl);
    if (lineContainer && !lineContainer.classList.contains('todo-line')) {
      convertLineContainerToTodo(lineContainer, range);
      return;
    }

    const line = createTodoLineElement();
    range.deleteContents();
    range.insertNode(line);
    focusTodoLineText(line);
  }

  function syncTodoStates() {
    document.querySelectorAll('.todo-line').forEach((line) => {
      const checked = line.dataset.checked === 'true';
      line.classList.toggle('is-checked', checked);
      syncTodoLineSize(line);

      const toggle = line.querySelector('.todo-toggle');
      if (toggle) {
        toggle.setAttribute('aria-checked', checked ? 'true' : 'false');
      }
    });
  }

  function toggleTodoLine(line) {
    if (!line) return;

    line.dataset.checked = line.dataset.checked === 'true' ? 'false' : 'true';
    syncTodoStates();
    saveContent();
  }

  function isCaretAtTodoTextStart(todoLine) {
    const selection = window.getSelection();
    const textEl = todoLine ? todoLine.querySelector('.todo-text') : null;
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !textEl) {
      return false;
    }

    const range = selection.getRangeAt(0);
    if (!isRangeInsideContent(range, textEl)) {
      return false;
    }

    const prefixRange = range.cloneRange();
    prefixRange.selectNodeContents(textEl);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const prefixText = prefixRange.toString().replace(/\u200B/g, '');
    return prefixText.length === 0;
  }

  function getCurrentTodoLine() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const node = selection.anchorNode;
    if (!node) return null;

    const element = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    return element && element.closest ? element.closest('.todo-line') : null;
  }

  function createTodoLineElement() {
    const line = document.createElement('div');
    line.className = 'todo-line';
    line.dataset.checked = 'false';

    const toggle = document.createElement('span');
    toggle.className = 'todo-toggle';
    toggle.setAttribute('contenteditable', 'false');
    toggle.setAttribute('role', 'checkbox');
    toggle.setAttribute('aria-checked', 'false');

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.appendChild(document.createTextNode('\u200B'));

    line.appendChild(toggle);
    line.appendChild(text);
    return line;
  }

  function getEditableLineContainer(node, contentEl) {
    let current = node && node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (current && current !== contentEl) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const tag = current.tagName;
        if (current.classList.contains('todo-line')) return current;
        if (['DIV', 'P', 'LI', 'BLOCKQUOTE'].includes(tag) && current.parentNode === contentEl) {
          return current;
        }
      }
      current = current.parentNode;
    }
    return null;
  }

  function convertLineContainerToTodo(lineContainer, range) {
    const parent = lineContainer.parentNode;
    if (!parent) return;

    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(lineContainer);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const beforeFragment = beforeRange.cloneContents();

    const afterRange = document.createRange();
    afterRange.selectNodeContents(lineContainer);
    afterRange.setStart(range.startContainer, range.startOffset);
    const afterFragment = afterRange.cloneContents();

    const todoLine = createTodoLineElement();
    const todoText = todoLine.querySelector('.todo-text');
    if (fragmentHasVisibleContent(afterFragment)) {
      todoText.textContent = '';
      todoText.appendChild(afterFragment);
    }

    const beforeLine = buildLineElementFromFragment(lineContainer, beforeFragment);
    if (beforeLine) {
      parent.insertBefore(beforeLine, lineContainer);
    }

    parent.insertBefore(todoLine, lineContainer);
    lineContainer.remove();
    focusTodoLineText(todoLine);
  }

  function buildLineElementFromFragment(sourceLine, fragment) {
    if (!fragmentHasVisibleContent(fragment)) {
      return null;
    }

    const line = document.createElement(sourceLine.tagName || 'DIV');
    line.appendChild(fragment);
    return line;
  }

  function fragmentHasVisibleContent(fragment) {
    if (!fragment) return false;
    const clone = fragment.cloneNode(true);
    const text = (clone.textContent || '').replace(/\u200B/g, '').trim();
    return Boolean(text || (clone.querySelector && clone.querySelector('img, .note-image-wrap, br')));
  }

  function insertTodoLineAfter(currentLine) {
    if (!currentLine || !currentLine.parentNode) return;

    const nextLine = createTodoLineElement();
    currentLine.insertAdjacentElement('afterend', nextLine);
    syncTodoStates();
    focusTodoLineText(nextLine);
    saveContent();
  }

  function focusTodoLineText(line) {
    const text = line ? line.querySelector('.todo-text') : null;
    const textNode = text && text.firstChild ? text.firstChild : null;
    if (!text || !textNode) return;

    const selection = window.getSelection();
    const newRange = document.createRange();
    newRange.setStart(textNode, 1);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    savedSelection = newRange.cloneRange();
  }

  function convertTodoLineToPlainText(todoLine) {
    if (!todoLine || !todoLine.parentNode) return;

    const plainLine = document.createElement('div');
    plainLine.innerHTML = getTodoLinePlainHtml(todoLine);
    if (!plainLine.innerHTML.trim()) {
      plainLine.innerHTML = '<br>';
    }

    todoLine.replaceWith(plainLine);
    focusPlainLineStart(plainLine);
    saveContent();
  }

  function getTodoLinePlainHtml(todoLine) {
    const textEl = todoLine.querySelector('.todo-text');
    if (!textEl) return '';
    return textEl.innerHTML.replace(/\u200B/g, '');
  }

  function focusPlainLineStart(line) {
    if (!line) return;

    const selection = window.getSelection();
    const range = document.createRange();
    const targetNode = line.firstChild || line;
    const offset = targetNode.nodeType === Node.TEXT_NODE ? 0 : 0;
    range.setStart(targetNode, offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedSelection = range.cloneRange();
  }

  function syncTodoLineSize(line) {
    if (!line) return;

    const fontSize = getTodoLineFontSize(line);
    line.style.setProperty('--todo-size', `${fontSize}px`);
  }

  function getTodoLineFontSize(line) {
    const textEl = line.querySelector('.todo-text');
    if (!textEl) {
      return 14;
    }

    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode.textContent.replace(/\u200B/g, '').trim()) {
        const parent = textNode.parentNode && textNode.parentNode.nodeType === Node.ELEMENT_NODE
          ? textNode.parentNode
          : textEl;
        const parsed = parseFloat(window.getComputedStyle(parent).fontSize);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      textNode = walker.nextNode();
    }

    const fallback = parseFloat(window.getComputedStyle(textEl).fontSize);
    return Number.isFinite(fallback) ? fallback : 14;
  }

  function syncActiveNoteContentFromDom() {
    const activeNote = getActiveNote();
    const contentEl = document.querySelector('.note-content');
    if (!activeNote || !contentEl) return activeNote;

    activeNote.content = contentEl.innerHTML;

    const presentFiles = new Set();
    contentEl.querySelectorAll('img[data-filename]').forEach((img) => {
      presentFiles.add(img.getAttribute('data-filename'));
    });

    activeNote.images = Array.from(presentFiles);
    return activeNote;
  }

  function saveContent() {
    if (!stackData) return;

    const activeNote = syncActiveNoteContentFromDom();
    if (!activeNote) return;

    window.api.notes.updateContent({
      stackId: stackData.id,
      noteId: activeNote.id,
      content: activeNote.content,
      images: activeNote.images,
      fontSize: activeNote.fontSize
    });
  }

  function getActiveNote() {
    if (!stackData) return null;
    return stackData.notes.find((note) => note.id === activeNoteId) || null;
  }

  async function updateMenuVisibility() {
    const stacks = await window.api.notes.getAll();
    const stackCount = Array.isArray(stacks) ? stacks.length : 0;
    const noteCount = stackData ? stackData.notes.length : 0;
    const canCollapse = Boolean(stackData) && !stackData.collapsed && (stackCount > 1 || noteCount > 1);
    const canSpread = Boolean(stackData) && noteCount > 1;
    const canSplit = Boolean(stackData) && !stackData.collapsed && noteCount > 1;

    menuCollapse.classList.toggle('hidden', !canCollapse);
    menuSpread.classList.toggle('hidden', !canSpread);
    menuSplit.classList.toggle('hidden', !canSplit);
  }

  async function fitWindowToContent() {
    if (!stackData) return false;

    await nextFrame();
    await nextFrame();

    const noteBody = document.querySelector('.note-body');
    if (!noteBody) return false;

    const imageWidths = Array.from(noteBody.querySelectorAll('.note-image-wrap')).map((element) => {
      const rect = element.getBoundingClientRect();
      return Math.ceil(rect.width);
    });

    const widestImage = imageWidths.length ? Math.max(...imageWidths) : 0;
    const desiredWidth = clamp(
      Math.max(window.outerWidth, widestImage ? widestImage + 56 : window.outerWidth),
      180,
      600
    );
    const desiredHeight = clamp(
      Math.max(window.outerHeight, Math.ceil(noteBody.scrollHeight) + 96),
      180,
      600
    );

    if (desiredWidth === window.outerWidth && desiredHeight === window.outerHeight) {
      return false;
    }

    stackData.size.width = desiredWidth;
    stackData.size.height = desiredHeight;
    await window.api.windowResize({
      width: desiredWidth,
      height: desiredHeight,
      save: true,
      stackId: stackData.id
    });
    return true;
  }

  async function readImageDataUrl(filename) {
    if (!filename) return null;
    if (imageDataUrlCache.has(filename)) {
      return imageDataUrlCache.get(filename);
    }

    const dataUrl = await window.api.files.readImage(filename);
    if (dataUrl) {
      imageDataUrlCache.set(filename, dataUrl);
    }
    return dataUrl;
  }

  function extractFilename(src) {
    if (!src || /^data:/i.test(src)) return null;

    const isFileLike = /^file:/i.test(src) || !/^[a-zA-Z][a-zA-Z\d+.-]*:/i.test(src);
    if (!isFileLike) return null;

    const normalized = src.split('#')[0].split('?')[0].replace(/\\/g, '/');
    const candidate = normalized.slice(normalized.lastIndexOf('/') + 1);
    if (!candidate) return null;

    try {
      return decodeURIComponent(candidate);
    } catch (_) {
      return candidate;
    }
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function nextFrame() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  document.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    await updateMenuVisibility();

    let left = event.clientX;
    let top = event.clientY;

    contextMenu.style.visibility = 'hidden';
    contextMenu.classList.add('show');
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    contextMenu.classList.remove('show');
    contextMenu.style.visibility = '';

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 4;
    }
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 4;
    }
    if (left < 0) left = 4;
    if (top < 0) top = 4;

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
    contextMenu.classList.add('show');
  });

  document.addEventListener('click', () => {
    contextMenu.classList.remove('show');
  });

  contextMenu.addEventListener('click', async (event) => {
    const item = event.target.closest('.context-item');
    if (!item) return;

    contextMenu.classList.remove('show');
    saveContent();

    switch (item.dataset.action) {
      case 'new':
        window.api.notes.create({ type: 'text', content: '', images: [] });
        break;

      case 'image': {
        const activeNote = syncActiveNoteContentFromDom();
        const result = await window.api.files.openImage();
        if (!result || !result.filename || !activeNote) return;

        activeNote.images = [...activeNote.images, result.filename];
        await renderStack();
        const resized = await fitWindowToContent();
        if (resized) {
          await renderStack();
        }
        window.api.notes.updateContent({
          stackId: stackData.id,
          noteId: activeNote.id,
          content: activeNote.content,
          images: activeNote.images,
          fontSize: activeNote.fontSize
        });
        break;
      }

      case 'collapse':
        if (stackData) {
          await window.api.stacks.collapseAll({ anchorStackId: stackData.id });
        }
        break;

      case 'spread':
        if (stackData) {
          await window.api.stacks.spread({ stackId: stackData.id, activeNoteId });
        }
        break;

      case 'split': {
        const activePage = document.querySelector('.note-page.active');
        if (stackData && activePage && activePage.dataset.noteId) {
          await window.api.stacks.split({ stackId: stackData.id, noteId: activePage.dataset.noteId });
          window.close();
        }
        break;
      }

      case 'history':
        window.api.openHistory();
        break;

      case 'settings':
        window.api.openSettings();
        break;

      case 'delete':
        closeActive();
        break;
    }
  });

  document.addEventListener('selectionchange', cacheSelection);
})();
