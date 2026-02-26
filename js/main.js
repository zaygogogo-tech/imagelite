/**
 * main.js — 主控制器
 *
 * 职责：
 *  1. 顶层模式路由（图片压缩 ↔ 文字卡片）
 *  2. 图片压缩流程（上传 → 意图选择 → 压缩 → 下载）
 *  3. 文字卡片流程（输入 → 预设选择 → 实时预览 → 生成下载）
 *  4. 异常降级（Graceful Degradation）
 *
 * 依赖：window.ImageLite.{
 *   getCompressionStrategy, processImage,
 *   renderTextCard, renderTextCardPreview,
 *   dom
 * }
 */
(function () {
  'use strict';

  var IL  = window.ImageLite;
  var dom = IL.dom;
  var el  = dom.el;

  // ====================================================================
  //  PART 0: 顶层模式路由
  // ====================================================================

  var HERO_COPY = {
    compress: { title: '智能压缩，一键搞定', subtitle: '选择你的使用场景，剩下的交给我们' },
    textcard: { title: '灵感变成图片', subtitle: '输入文字，生成精美卡片图片并分享' },
  };

  function initModeRouter() {
    var segBtns = document.querySelectorAll('.seg-btn');
    var thumb   = document.getElementById('seg-thumb');
    var compressSection  = document.getElementById('compress-section');
    var textCardSection  = document.getElementById('text-card-section');
    var heroTitle    = document.getElementById('hero-title');
    var heroSubtitle = document.getElementById('hero-subtitle');

    function switchMode(mode) {
      segBtns.forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });

      if (mode === 'textcard') {
        thumb.classList.add('right');
        compressSection.className = 'mode-section mode-hidden';
        textCardSection.className = 'mode-section mode-visible';
      } else {
        thumb.classList.remove('right');
        compressSection.className = 'mode-section mode-visible';
        textCardSection.className = 'mode-section mode-hidden';
      }

      var copy = HERO_COPY[mode] || HERO_COPY.compress;
      if (heroTitle) heroTitle.textContent = copy.title;
      if (heroSubtitle) heroSubtitle.textContent = copy.subtitle;
    }

    segBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchMode(btn.dataset.mode);
      });
    });
  }

  // ====================================================================
  //  PART 1: 图片压缩（逻辑不变）
  // ====================================================================

  var originalFile    = null;
  var originalDataURL = null;
  var originalImage   = null;
  var compressedBlob  = null;
  var currentIntent   = 'social';

  var STRATEGY_DISPLAY = {
    social:  { format: '格式 WebP/JPEG', quality: '质量 82%', resize: '宽度 ≤ 2048px' },
    limit:   { format: '格式 WebP',      quality: '质量 60%', resize: '宽度 ≤ 1280px' },
    archive: { format: '保持原格式',      quality: '质量 95%', resize: '保持原尺寸' },
  };

  function updateStrategySummary(intent) {
    var info = STRATEGY_DISPLAY[intent];
    if (!info) return;
    var f = document.getElementById('tag-format');
    var q = document.getElementById('tag-quality');
    var r = document.getElementById('tag-resize');
    if (f) f.textContent = info.format;
    if (q) q.textContent = info.quality;
    if (r) r.textContent = info.resize;
  }

  function initUpload() {
    var uploadArea = el.uploadArea();
    var fileInput  = el.fileInput();
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', function () { fileInput.click(); });

    uploadArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', function () {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', function (e) {
      if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
  }

  function handleFile(file) {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      dom.showToast('请选择 JPG、PNG 或 WebP 格式的图片', 'warning');
      return;
    }

    originalFile   = file;
    compressedBlob = null;
    dom.showFileName(file.name);

    var reader = new FileReader();
    reader.onload = function (e) {
      originalDataURL = e.target.result;
      var img = new Image();
      img.onload = function () {
        originalImage = img;
        dom.showOriginalPreview(originalDataURL, file, img.width, img.height);
        dom.resetCompressedPreview();
        dom.showWorkspace();
      };
      img.src = originalDataURL;
    };
    reader.readAsDataURL(file);
  }

  function initIntentCards() {
    var grid = document.getElementById('intent-grid');
    if (!grid) return;

    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.intent-card');
      if (!card) return;
      currentIntent = card.dataset.intent;
      dom.highlightIntent(currentIntent);
      updateStrategySummary(currentIntent);
    });

    dom.highlightIntent(currentIntent);
    updateStrategySummary(currentIntent);
  }

  async function handleCompress() {
    if (!originalFile || !originalImage) {
      dom.showToast('请先上传一张图片', 'warning');
      return;
    }

    dom.setCompressing(true);

    try {
      var fileMeta = {
        width:  originalImage.width,
        height: originalImage.height,
        mime:   originalFile.type,
      };

      var strategy = IL.getCompressionStrategy(currentIntent, fileMeta);
      var result   = await IL.processImage(originalFile, strategy);

      compressedBlob = result.blob;
      dom.showCompressedPreview(result.blob, originalFile.size);

      if (result.rolledBack) {
        dom.showToast('当前设置下压缩无法进一步减小体积，已保留原文件', 'info');
      } else {
        var pct = ((1 - result.blob.size / originalFile.size) * 100).toFixed(1);
        dom.showToast('压缩完成，体积减少 ' + pct + '%', 'success');
      }
    } catch (err) {
      console.error('[ImageLite] 压缩失败:', err);
      if (err.message && err.message.includes('memory')) {
        dom.showToast('图片过大导致内存不足，请尝试较小的图片', 'error');
      } else {
        dom.showToast('压缩失败: ' + (err.message || '未知错误'), 'error');
      }
    } finally {
      dom.setCompressing(false);
    }
  }

  function handleDownload() {
    if (!compressedBlob || !originalFile) return;

    var strategy = IL.getCompressionStrategy(currentIntent, {
      width: originalImage.width,
      height: originalImage.height,
      mime: originalFile.type,
    });

    var ext = strategy.format === 'jpeg' ? 'jpg' : strategy.format;
    var baseName = originalFile.name.replace(/\.[^.]+$/, '');
    var fileName = baseName + '_compressed.' + ext;

    downloadBlob(compressedBlob, fileName);
  }

  function handleReset() {
    originalFile    = null;
    originalDataURL = null;
    originalImage   = null;
    compressedBlob  = null;

    var fi = el.fileInput();
    if (fi) fi.value = '';
    dom.hideFileName();
    dom.hideWorkspace();
  }

  // ====================================================================
  //  PART 2: 文字卡片
  // ====================================================================

  var tcMaterial   = 'snow';
  var tcTypography = 'system';
  var DEFAULT_QUOTE = 'The limits of my language mean the limits of my world.';
  var previewTimer = null;

  function initTextCard() {
    var materialsWrap = document.getElementById('tc-materials');
    var typographyWrap = document.getElementById('tc-typography');
    var textInput = document.getElementById('card-text-input');
    var btnGenerate = document.getElementById('btn-generate');

    if (!materialsWrap || !typographyWrap || !textInput || !btnGenerate) return;

    // 材质选择
    materialsWrap.addEventListener('click', function (e) {
      var swatch = e.target.closest('.tc-swatch');
      if (!swatch) return;
      tcMaterial = swatch.dataset.material;
      materialsWrap.querySelectorAll('.tc-swatch').forEach(function (s) {
        s.classList.toggle('selected', s.dataset.material === tcMaterial);
      });
      schedulePreview();
    });

    // 排版选择
    typographyWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.tc-typo-btn');
      if (!btn) return;
      tcTypography = btn.dataset.typo;
      typographyWrap.querySelectorAll('.tc-typo-btn').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.typo === tcTypography);
      });
      schedulePreview();
    });

    // 文本输入 → 防抖预览
    textInput.addEventListener('input', function () {
      schedulePreview();
    });

    // 生成并下载
    btnGenerate.addEventListener('click', handleGenerate);

    // 初始化时渲染默认金句预览
    schedulePreview();
  }

  /**
   * 防抖更新预览（200ms）
   */
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updateTextCardPreview, 200);
  }

  function updateTextCardPreview() {
    var textInput = document.getElementById('card-text-input');
    var previewEl = document.getElementById('tc-preview');
    if (!textInput || !previewEl) return;

    var text = textInput.value.trim() || DEFAULT_QUOTE;

    try {
      var result = IL.renderTextCardPreview(text, {
        material: tcMaterial,
        font: tcTypography,
      });

      if (result && result.dataURL) {
        previewEl.innerHTML = '';
        var img = document.createElement('img');
        img.src = result.dataURL;
        img.alt = '卡片预览';
        previewEl.appendChild(img);
        previewEl.style.aspectRatio = result.width + ' / ' + result.height;
      }
    } catch (err) {
      console.error('[ImageLite] 预览生成失败:', err);
    }
  }

  async function handleGenerate() {
    var textInput = document.getElementById('card-text-input');
    var btnGenerate = document.getElementById('btn-generate');
    if (!textInput) return;

    var text = textInput.value.trim() || DEFAULT_QUOTE;

    if (btnGenerate) {
      btnGenerate.classList.add('loading');
      btnGenerate.innerHTML = '<span class="spinner"></span>生成中…';
    }

    try {
      var blob = await IL.renderTextCard(text, {
        material: tcMaterial,
        font: tcTypography,
      });

      var fileName = 'imagelite-card-' + Date.now() + '.png';
      downloadBlob(blob, fileName);

      dom.showToast('卡片已生成并开始下载', 'success');
    } catch (err) {
      console.error('[ImageLite] 卡片生成失败:', err);
      dom.showToast('生成失败: ' + (err.message || '未知错误'), 'error');
    } finally {
      if (btnGenerate) {
        btnGenerate.classList.remove('loading');
        btnGenerate.innerHTML = '<span class="spinner"></span>✨ 生成并下载卡片';
      }
    }
  }

  // ====================================================================
  //  通用工具：下载 Blob
  // ====================================================================

  function downloadBlob(blob, fileName) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ====================================================================
  //  Bootstrap
  // ====================================================================

  initModeRouter();
  initUpload();
  initIntentCards();
  initTextCard();

  var btnCompress = el.btnCompress();
  var btnDownload = el.btnDownload();
  var btnReset    = el.btnReset();

  if (btnCompress) btnCompress.addEventListener('click', handleCompress);
  if (btnDownload) btnDownload.addEventListener('click', handleDownload);
  if (btnReset)    btnReset.addEventListener('click', handleReset);

})();
