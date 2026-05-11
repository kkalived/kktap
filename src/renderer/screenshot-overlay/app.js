// ===== 截图选区覆盖层 =====
(function () {
  'use strict';

  const selection = document.getElementById('selection');
  const info = document.getElementById('info');
  const hint = document.querySelector('.hint');

  let scaleFactor = 1;
  let isSelecting = false;
  let startX = 0, startY = 0;

  // 接收截图图像
  window.api.onScreenshotImage((data) => {
    scaleFactor = data.scaleFactor || 1;
    isSelecting = false;
    selection.classList.add('hidden');
    info.classList.add('hidden');
    hint.style.display = '';

    if (data.imageDataUrl) {
      document.body.style.backgroundImage = `url(${data.imageDataUrl})`;
      document.body.style.backgroundSize = '100% 100%';
    }
  });

  // mousedown → 开始选区
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;

    selection.classList.remove('hidden');
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';

    info.classList.remove('hidden');
    hint.style.display = 'none';
  });

  // mousemove → 更新选区
  document.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    selection.style.left = x + 'px';
    selection.style.top = y + 'px';
    selection.style.width = w + 'px';
    selection.style.height = h + 'px';

    // info 放在选区右下角外侧
    info.style.left = Math.min(x + w + 8, window.innerWidth - 80) + 'px';
    info.style.top = Math.min(y + h + 8, window.innerHeight - 30) + 'px';
    info.textContent = Math.round(w) + ' × ' + Math.round(h);
  });

  // mouseup → 完成选区
  document.addEventListener('mouseup', (e) => {
    if (!isSelecting) return;
    isSelecting = false;

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    if (w < 10 || h < 10) return;

    window.api.screenshot.regionSelected({
      x, y, width: w, height: h, scaleFactor
    });
  });

  // Esc 取消
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.api.screenshot.cancel();
    }
  });

})();
