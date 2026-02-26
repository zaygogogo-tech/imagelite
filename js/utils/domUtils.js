/**
 * domUtils.js — 视图更新层
 *
 * 职责：所有与 DOM 相关的读写操作集中在此文件。
 *       core 层绝不调用本文件；main.js 单向调用本文件。
 *
 * 挂载到 window.ImageLite.dom
 */
(function () {
  'use strict';

  window.ImageLite = window.ImageLite || {};

  var $ = function (id) { return document.getElementById(id); };

  /** 安全设置 textContent，元素不存在时静默跳过 */
  function safeText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  var PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  window.ImageLite.dom = {

    formatSize: formatSize,

    // ---- 元素引用 ----
    el: {
      uploadArea:        function () { return $('upload-area'); },
      fileInput:         function () { return $('file-input'); },
      fileName:          function () { return $('file-name'); },
      workspace:         function () { return $('workspace'); },
      btnCompress:       function () { return $('btn-compress'); },
      btnDownload:       function () { return $('btn-download'); },
      btnReset:          function () { return $('btn-reset'); },
      originalPreview:   function () { return $('original-preview'); },
      compressedPreview: function () { return $('compressed-preview'); },
      originalSize:      function () { return $('original-size'); },
      compressedSize:    function () { return $('compressed-size'); },
      statsBar:          function () { return $('stats-bar'); },
      statOriginal:      function () { return $('stat-original'); },
      statCompressed:    function () { return $('stat-compressed'); },
      statReduction:     function () { return $('stat-reduction'); },
      dimensionsInfo:    function () { return $('dimensions-info'); },
    },

    // ---- 原图展示 ----
    showOriginalPreview: function (dataURL, file, imgWidth, imgHeight) {
      var preview = $('original-preview');
      if (preview) {
        preview.innerHTML = '';
        var img = document.createElement('img');
        img.src = dataURL;
        preview.appendChild(img);
      }

      safeText('original-size', formatSize(file.size));
      safeText('dimensions-info', '原始尺寸: ' + imgWidth + ' × ' + imgHeight + ' px');
    },

    // ---- 压缩结果展示 ----
    showCompressedPreview: function (blob, originalSize) {
      var url = URL.createObjectURL(blob);
      var preview = $('compressed-preview');
      if (preview) {
        preview.innerHTML = '';
        var img = document.createElement('img');
        img.src = url;
        preview.appendChild(img);
      }

      var compressedStr = formatSize(blob.size);
      safeText('compressed-size', compressedStr);
      safeText('stat-original', formatSize(originalSize));
      safeText('stat-compressed', compressedStr);

      var reduction = (1 - blob.size / originalSize) * 100;
      var reductionEl = $('stat-reduction');
      if (reductionEl) {
        reductionEl.textContent = (reduction > 0 ? '-' : '+') + Math.abs(reduction).toFixed(1) + '%';
        reductionEl.style.color = reduction > 0 ? '#34C759' : '#FF3B30';
      }

      var statsBar = $('stats-bar');
      if (statsBar) statsBar.classList.add('active');
      var btnDl = $('btn-download');
      if (btnDl) btnDl.classList.add('active');
    },

    // ---- 压缩占位 ----
    resetCompressedPreview: function () {
      var cp = $('compressed-preview');
      if (cp) {
        cp.innerHTML =
          '<div class="preview-placeholder">' + PLACEHOLDER_SVG +
          '<p>选择场景后点击"开始压缩"</p></div>';
      }
      safeText('compressed-size', '-');
      var sb = $('stats-bar');
      if (sb) sb.classList.remove('active');
      var bd = $('btn-download');
      if (bd) bd.classList.remove('active');
    },

    // ---- 工作区显隐 ----
    showWorkspace: function () {
      var ws = $('workspace');
      if (ws) {
        ws.classList.add('active');
        ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },

    hideWorkspace: function () {
      var ws = $('workspace');
      if (ws) ws.classList.remove('active');
      var sb = $('stats-bar');
      if (sb) sb.classList.remove('active');
      var bd = $('btn-download');
      if (bd) bd.classList.remove('active');
      safeText('original-size', '-');
      safeText('compressed-size', '-');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ---- 文件名 ----
    showFileName: function (name) {
      var fnEl = $('file-name');
      if (fnEl) {
        fnEl.textContent = '已选择: ' + name;
        fnEl.classList.add('active');
      }
    },

    hideFileName: function () {
      var fnEl = $('file-name');
      if (fnEl) fnEl.classList.remove('active');
    },

    // ---- 按钮状态 ----
    setCompressing: function (isLoading) {
      var btn = $('btn-compress');
      if (!btn) return;
      if (isLoading) {
        btn.classList.add('loading');
        btn.innerHTML = '<span class="spinner"></span>压缩中…';
      } else {
        btn.classList.remove('loading');
        btn.innerHTML = '<span class="spinner"></span>开始压缩';
      }
    },

    // ---- 意图卡片高亮 ----
    highlightIntent: function (intent) {
      var cards = document.querySelectorAll('.intent-card');
      cards.forEach(function (card) {
        card.classList.toggle('selected', card.dataset.intent === intent);
      });
    },

    // ---- Toast 提示 ----
    showToast: function (message, type) {
      type = type || 'info';
      var container = $('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }

      var toast = document.createElement('div');
      toast.className = 'toast toast-' + type;
      toast.textContent = message;
      container.appendChild(toast);

      requestAnimationFrame(function () { toast.classList.add('show'); });

      setTimeout(function () {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', function () { toast.remove(); });
      }, 3500);
    },
  };
})();
