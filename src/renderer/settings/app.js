(function () {
  'use strict';

  const hotkeyEnabled = document.getElementById('hotkey-enabled');
  const hotkeyInput = document.getElementById('hotkey-input');
  const btnRecord = document.getElementById('btn-record');
  const toggleHotkeyInput = document.getElementById('toggle-hotkey-input');
  const btnRecordToggle = document.getElementById('btn-record-toggle');
  const autostartCheckbox = document.getElementById('autostart-checkbox');
  const deepseekApiKey = document.getElementById('deepseek-api-key');
  const dailyReportModel = document.getElementById('daily-report-model');
  const dailyReportWorkContent = document.getElementById('daily-report-work-content');
  const btnSave = document.getElementById('btn-save');

  let recordingTarget = null;
  let keysPressed = new Set();

  window.api.settings.get().then((settings) => {
    hotkeyInput.value = settings.screenshotHotkey || 'Ctrl+Alt+Z';
    hotkeyEnabled.checked = settings.screenshotHotkeyEnabled !== false;
    toggleHotkeyInput.value = settings.toggleNotesHotkey || 'Ctrl+Alt+H';
    autostartCheckbox.checked = settings.autoStart || false;
    deepseekApiKey.value = settings.deepseekApiKey || '';
    dailyReportModel.value = settings.dailyReportModel || 'deepseek-v4-flash';
    dailyReportWorkContent.value = settings.dailyReportWorkContent || '';
    syncHotkeyInputs();
  });

  hotkeyEnabled.addEventListener('change', syncHotkeyInputs);

  btnRecord.addEventListener('click', () => {
    if (!hotkeyEnabled.checked) return;
    toggleRecording('screenshot');
  });

  btnRecordToggle.addEventListener('click', () => {
    toggleRecording('toggle');
  });

  document.addEventListener('keydown', (event) => {
    if (!recordingTarget) return;
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
    getTargetInput().value = mods.join('+');
    stopRecording();
  });

  document.addEventListener('keyup', (event) => {
    if (!recordingTarget) return;
    keysPressed.delete(event.key);
  });

  btnSave.addEventListener('click', async () => {
    const settingsToSave = [
      ['screenshotHotkey', hotkeyInput.value.trim() || 'Ctrl+Alt+Z'],
      ['screenshotHotkeyEnabled', hotkeyEnabled.checked],
      ['toggleNotesHotkey', toggleHotkeyInput.value.trim() || 'Ctrl+Alt+H'],
      ['autoStart', autostartCheckbox.checked],
      ['deepseekApiKey', deepseekApiKey.value.trim()],
      ['dailyReportModel', dailyReportModel.value.trim() || 'deepseek-v4-flash'],
      ['dailyReportWorkContent', dailyReportWorkContent.value.trim()]
    ];

    for (const [key, value] of settingsToSave) {
      await window.api.settings.set(key, value);
    }

    const hotkeyState = await window.api.settings.refreshHotkeys();
    const hasScreenshotError = hotkeyEnabled.checked && !hotkeyState.screenshotRegistered;
    const hasToggleError = !hotkeyState.toggleNotesRegistered;

    btnSave.textContent = hasScreenshotError || hasToggleError
      ? '快捷键注册失败'
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

  function toggleRecording(target) {
    if (recordingTarget === target) {
      stopRecording();
      return;
    }

    stopRecording();
    recordingTarget = target;
    keysPressed.clear();

    const targetInput = getTargetInput();
    const targetButton = getTargetButton();
    targetInput.value = '';
    targetInput.classList.add('recording');
    targetButton.textContent = '按下组合键...';
    targetButton.classList.add('recording');
  }

  function stopRecording() {
    if (!recordingTarget) return;

    const targetInput = getTargetInput();
    const targetButton = getTargetButton();
    const fallbackValue = recordingTarget === 'toggle' ? 'Ctrl+Alt+H' : 'Ctrl+Alt+Z';
    const fallbackLabel = '录制快捷键';

    recordingTarget = null;
    keysPressed.clear();
    targetInput.classList.remove('recording');
    targetButton.classList.remove('recording');
    targetButton.textContent = fallbackLabel;

    if (!targetInput.value) {
      targetInput.value = fallbackValue;
    }
  }

  function getTargetInput() {
    return recordingTarget === 'toggle' ? toggleHotkeyInput : hotkeyInput;
  }

  function getTargetButton() {
    return recordingTarget === 'toggle' ? btnRecordToggle : btnRecord;
  }
})();
