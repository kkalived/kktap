(function () {
  'use strict';

  const hotkeyEnabled = document.getElementById('hotkey-enabled');
  const hotkeyInput = document.getElementById('hotkey-input');
  const btnRecord = document.getElementById('btn-record');
  const autostartCheckbox = document.getElementById('autostart-checkbox');
  const deepseekApiKey = document.getElementById('deepseek-api-key');
  const dailyReportModel = document.getElementById('daily-report-model');
  const dailyReportWorkContent = document.getElementById('daily-report-work-content');
  const btnSave = document.getElementById('btn-save');

  let isRecording = false;
  let keysPressed = new Set();

  window.api.settings.get().then((settings) => {
    hotkeyInput.value = settings.screenshotHotkey || 'Ctrl+Alt+Z';
    hotkeyEnabled.checked = settings.screenshotHotkeyEnabled !== false;
    autostartCheckbox.checked = settings.autoStart || false;
    deepseekApiKey.value = settings.deepseekApiKey || '';
    dailyReportModel.value = settings.dailyReportModel || 'deepseek-v4-flash';
    dailyReportWorkContent.value = settings.dailyReportWorkContent || '';
    syncHotkeyInputs();
  });

  hotkeyEnabled.addEventListener('change', syncHotkeyInputs);

  btnRecord.addEventListener('click', () => {
    if (!hotkeyEnabled.checked) return;
    if (isRecording) {
      stopRecording();
      return;
    }

    isRecording = true;
    keysPressed.clear();
    btnRecord.textContent = '按下组合键...';
    btnRecord.classList.add('recording');
    hotkeyInput.value = '';
    hotkeyInput.classList.add('recording');
  });

  document.addEventListener('keydown', (event) => {
    if (!isRecording) return;
    event.preventDefault();

    const key = event.key;
    if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') {
      keysPressed.add(key);
      return;
    }

    if (['Escape', 'Tab', 'CapsLock', 'Enter'].includes(key)) {
      if (key === 'Escape') stopRecording();
      return;
    }

    const mods = [];
    if (keysPressed.has('Control') || event.ctrlKey) mods.push('Ctrl');
    if (keysPressed.has('Alt') || event.altKey) mods.push('Alt');
    if (keysPressed.has('Shift') || event.shiftKey) mods.push('Shift');

    const mainKey = key.length === 1 ? key.toUpperCase() : key;
    mods.push(mainKey);
    hotkeyInput.value = mods.join('+');
    stopRecording();
  });

  document.addEventListener('keyup', (event) => {
    if (!isRecording) return;
    keysPressed.delete(event.key);
  });

  btnSave.addEventListener('click', async () => {
    const settingsToSave = [
      ['screenshotHotkey', hotkeyInput.value.trim() || 'Ctrl+Alt+Z'],
      ['screenshotHotkeyEnabled', hotkeyEnabled.checked],
      ['autoStart', autostartCheckbox.checked],
      ['deepseekApiKey', deepseekApiKey.value.trim()],
      ['dailyReportModel', dailyReportModel.value.trim() || 'deepseek-v4-flash'],
      ['dailyReportWorkContent', dailyReportWorkContent.value.trim()]
    ];

    for (const [key, value] of settingsToSave) {
      await window.api.settings.set(key, value);
    }

    const hotkeyState = await window.api.settings.refreshHotkeys();

    btnSave.textContent = hotkeyEnabled.checked && !hotkeyState.screenshotRegistered
      ? '截图快捷键注册失败'
      : '已保存';
    setTimeout(() => {
      btnSave.textContent = '保存设置';
    }, 1500);
  });

  function syncHotkeyInputs() {
    const enabled = hotkeyEnabled.checked;
    hotkeyInput.disabled = !enabled;
    btnRecord.disabled = !enabled;
    hotkeyInput.style.opacity = enabled ? '' : '0.4';
    btnRecord.style.opacity = enabled ? '' : '0.4';
  }

  function stopRecording() {
    isRecording = false;
    keysPressed.clear();
    btnRecord.textContent = '录制快捷键';
    btnRecord.classList.remove('recording');
    hotkeyInput.classList.remove('recording');

    if (!hotkeyInput.value) {
      hotkeyInput.value = 'Ctrl+Alt+Z';
    }
  }
})();
