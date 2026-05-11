(function () {
  'use strict';

  const listEl = document.getElementById('history-list');
  const emptyHint = document.getElementById('empty-hint');
  const toolbar = document.getElementById('toolbar');
  const selectAll = document.getElementById('select-all');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  const selectedCount = document.getElementById('selected-count');
  const tabs = Array.from(document.querySelectorAll('.history-tab'));

  let deletedNotes = [];
  let reportHistory = [];
  let activeTab = 'reports';
  let selectedIds = new Set();

  loadHistory();

  function loadHistory() {
    Promise.all([
      window.api.notes.getHistory(),
      window.api.reports.getHistory()
    ]).then(([notes, reports]) => {
      deletedNotes = Array.isArray(notes) ? notes : [];
      reportHistory = Array.isArray(reports) ? reports : [];
      selectedIds.clear();
      selectAll.checked = false;
      renderList();
    });
  }

  function getActiveItems() {
    return activeTab === 'reports' ? reportHistory : deletedNotes;
  }

  function renderList() {
    const items = getActiveItems();
    if (!items.length) {
      emptyHint.style.display = 'block';
      emptyHint.textContent = activeTab === 'reports' ? '暂无日报记录' : '暂无便利贴记录';
      listEl.innerHTML = '';
      toolbar.classList.add('hidden');
      return;
    }

    emptyHint.style.display = 'none';
    toolbar.classList.remove('hidden');
    listEl.innerHTML = activeTab === 'reports' ? renderReports(items) : renderNotes(items);
    updateSelectedCount();
    bindCardEvents();
  }

  function renderReports(items) {
    return items.map((item, index) => {
      const preview = (item.rawText || item.title || '日报').split('\n').slice(0, 3).join(' ');
      const created = new Date(item.createdAt).toLocaleString('zh-CN');
      const checked = selectedIds.has(item.id) ? 'checked' : '';

      return `
        <div class="note-card report-card">
          <input type="checkbox" class="note-card-check" data-id="${item.id}" ${checked}>
          <div class="note-card-info">
            <div class="note-card-title">${escapeHtml(item.title)}</div>
            <div class="note-card-preview">${escapeHtml(preview)}</div>
            <div class="note-card-date">生成时间: ${created}</div>
          </div>
          <div class="note-card-actions">
            <button class="btn-restore" data-kind="report" data-idx="${index}">恢复成便利贴</button>
            <button class="btn-delete-forever" data-kind="report" data-idx="${index}">永久删除</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderNotes(items) {
    return items.map((entry, index) => {
      const note = entry.note;
      const preview = note.type === 'image'
        ? '[图片]'
        : (note.content || '').replace(/<[^>]*>/g, '').substring(0, 80) || '(空)';
      const created = new Date(note.createdAt).toLocaleString('zh-CN');
      const deletedAt = new Date(entry.deletedAt).toLocaleString('zh-CN');
      const checked = selectedIds.has(note.id) ? 'checked' : '';

      return `
        <div class="note-card">
          <input type="checkbox" class="note-card-check" data-id="${note.id}" ${checked}>
          <div class="note-card-info">
            <div class="note-card-title">便利贴</div>
            <div class="note-card-preview">${escapeHtml(preview)}</div>
            <div class="note-card-date">创建: ${created} | 删除: ${deletedAt}</div>
          </div>
          <div class="note-card-actions">
            <button class="btn-restore" data-kind="note" data-idx="${index}">恢复</button>
            <button class="btn-delete-forever" data-kind="note" data-idx="${index}">永久删除</button>
          </div>
        </div>`;
    }).join('');
  }

  function bindCardEvents() {
    listEl.querySelectorAll('.note-card-check').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const id = checkbox.dataset.id;
        if (checkbox.checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }
        updateSelectedCount();
        syncSelectAll();
      });
    });

    listEl.querySelectorAll('.btn-restore').forEach((button) => {
      button.addEventListener('click', async () => {
        const index = Number.parseInt(button.dataset.idx, 10);
        if (button.dataset.kind === 'report') {
          await window.api.reports.restore({ reportId: reportHistory[index].id });
        } else {
          await window.api.notes.restore({ noteData: deletedNotes[index].note });
        }
        loadHistory();
      });
    });

    listEl.querySelectorAll('.btn-delete-forever').forEach((button) => {
      button.addEventListener('click', async () => {
        const index = Number.parseInt(button.dataset.idx, 10);
        const isReport = button.dataset.kind === 'report';
        const message = isReport ? '确定要永久删除这条日报吗？此操作不可撤销。' : '确定要永久删除这条便利贴吗？此操作不可撤销。';
        if (!window.confirm(message)) return;

        if (isReport) {
          await window.api.reports.permanentDelete({ reportId: reportHistory[index].id });
        } else {
          await window.api.notes.permanentDelete({ noteId: deletedNotes[index].note.id });
        }
        loadHistory();
      });
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      selectedIds.clear();
      selectAll.checked = false;
      tabs.forEach((item) => item.classList.toggle('active', item === tab));
      renderList();
    });
  });

  selectAll.addEventListener('change', () => {
    const items = getActiveItems();
    if (selectAll.checked) {
      items.forEach((item) => {
        selectedIds.add(activeTab === 'reports' ? item.id : item.note.id);
      });
    } else {
      selectedIds.clear();
    }
    renderList();
  });

  btnDeleteSelected.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    const label = activeTab === 'reports' ? '日报' : '便利贴';
    if (!window.confirm(`确定要永久删除选中的 ${selectedIds.size} 条${label}记录吗？此操作不可撤销。`)) {
      return;
    }

    const tasks = [];
    selectedIds.forEach((id) => {
      if (activeTab === 'reports') {
        tasks.push(window.api.reports.permanentDelete({ reportId: id }));
      } else {
        tasks.push(window.api.notes.permanentDelete({ noteId: id }));
      }
    });

    await Promise.all(tasks);
    loadHistory();
  });

  function syncSelectAll() {
    const items = getActiveItems();
    selectAll.checked = items.length > 0 && selectedIds.size === items.length;
  }

  function updateSelectedCount() {
    selectedCount.textContent = selectedIds.size > 0 ? `已选 ${selectedIds.size} 条` : '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
