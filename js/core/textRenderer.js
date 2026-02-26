/**
 * textRenderer.js — 双层悬浮卡片渲染引擎
 *
 * 核心算法：
 *   外层 Outer 背景 → 内层 Inner 悬浮圆角卡片（带投影）→
 *   巨型引言装饰 → 正文排版 → 分割线 + 日期/品牌页脚
 *
 * 挂载到 window.ImageLite.renderTextCard / renderTextCardPreview
 */
(function () {
  'use strict';

  window.ImageLite = window.ImageLite || {};

  // ==================== 情绪调色盘字典 ====================

  var THEMES = {
    snow:    { outer: '#EAF2F8', inner: '#FFFFFF', text: '#1A365D', quote: 'rgba(26,54,93,0.08)',   footer: 'rgba(26,54,93,0.4)' },
    oat:     { outer: '#F5F0E6', inner: '#FCFAF8', text: '#4A3F35', quote: 'rgba(74,63,53,0.08)',   footer: 'rgba(74,63,53,0.4)' },
    matcha:  { outer: '#E8F0EA', inner: '#F4F9F5', text: '#2D4A3E', quote: 'rgba(45,74,62,0.08)',   footer: 'rgba(45,74,62,0.4)' },
    morning: { outer: '#F2F2F7', inner: '#FFFFFF', text: '#1D1D1F', quote: 'rgba(29,29,31,0.08)',   footer: 'rgba(29,29,31,0.4)' },
    meteor:  { outer: '#8E8E93', inner: '#E5E5EA', text: '#1C1C1E', quote: 'rgba(28,28,30,0.08)',   footer: 'rgba(28,28,30,0.4)' },
    dark:    { outer: '#000000', inner: '#1C1C1E', text: '#F5F5F7', quote: 'rgba(245,245,247,0.08)', footer: 'rgba(245,245,247,0.4)' }
  };

  // ==================== 布局常量 ====================

  var CARD_WIDTH       = 1080;
  var OUTER_PADDING    = 80;   // 外层上下左右
  var INNER_PADDING    = 80;   // 内层上下左右
  var INNER_RADIUS     = 32;
  var FOOTER_RESERVE   = 120;  // 底部元数据预留区
  var LINE_HEIGHT_RATIO = 1.6;

  var SHORT_THRESHOLD  = 30;
  var FONT_SIZE_SHORT  = 64;
  var FONT_SIZE_LONG   = 48;

  var MAX_TEXT_WIDTH   = CARD_WIDTH - OUTER_PADDING * 2 - INNER_PADDING * 2; // 760px

  // ==================== 字体映射 ====================

  var FONTS = {
    system: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
    serif:  'Georgia, "Noto Serif SC", "Songti SC", "SimSun", serif',
    mono:   '"SF Mono", "Fira Code", "Source Code Pro", "Consolas", monospace'
  };

  // ==================== 文本自动换行 ====================

  function wrapText(ctx, text, maxWidth) {
    var paragraphs = text.split('\n');
    var lines = [];

    for (var p = 0; p < paragraphs.length; p++) {
      var para = paragraphs[p];
      if (para.trim() === '') { lines.push(''); continue; }

      var currentLine = '';
      for (var i = 0; i < para.length; i++) {
        var testLine = currentLine + para[i];
        if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = para[i];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines;
  }

  // ==================== 圆角矩形辅助 ====================

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ==================== 获取今天日期字符串 ====================

  function todayString() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '.' + m + '.' + day;
  }

  // ==================== 核心：全尺寸渲染 ====================

  /**
   * @param {string} text
   * @param {{ material: string, font: string }} styleOptions
   *        material — 'snow' | 'oat' | 'matcha' | 'morning' | 'meteor' | 'dark'
   *        font     — 'system' | 'serif' | 'mono'  (也兼容旧字段 typography)
   * @returns {Promise<Blob>}
   */
  window.ImageLite.renderTextCard = function (text, styleOptions) {
    return new Promise(function (resolve, reject) {
      try {
        var theme = THEMES[styleOptions.material] || THEMES.snow;
        var fontKey = styleOptions.font || styleOptions.typography || 'system';
        var fontFamily = FONTS[fontKey] || FONTS.system;

        var trimmed = text.trim();
        if (!trimmed) { reject(new Error('文本内容为空')); return; }

        var charCount = trimmed.replace(/\s/g, '').length;
        var isShort   = charCount < SHORT_THRESHOLD;
        var fontSize  = isShort ? FONT_SIZE_SHORT : FONT_SIZE_LONG;
        var lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO);
        var fontWeight = isShort ? '600' : '400';
        var textAlign  = isShort ? 'center' : 'left';

        // 1. 临时 canvas 测量行数
        var tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = CARD_WIDTH; tmpCanvas.height = 100;
        var tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.font = fontWeight + ' ' + fontSize + 'px ' + fontFamily;
        var lines = wrapText(tmpCtx, trimmed, MAX_TEXT_WIDTH);

        // 2. 高度公式
        var textBlockH = lines.length * lineHeight;
        var innerH = INNER_PADDING + textBlockH + FOOTER_RESERVE + INNER_PADDING;
        var canvasH = OUTER_PADDING + innerH + OUTER_PADDING;

        // 3. 正式画布
        var canvas = document.createElement('canvas');
        canvas.width  = CARD_WIDTH;
        canvas.height = canvasH;
        var ctx = canvas.getContext('2d');

        // ---- 图层 1: 外层背景 ----
        ctx.fillStyle = theme.outer;
        ctx.fillRect(0, 0, CARD_WIDTH, canvasH);

        // ---- 图层 2: 内层悬浮卡片 ----
        var innerX = OUTER_PADDING;
        var innerY = OUTER_PADDING;
        var innerW = CARD_WIDTH - OUTER_PADDING * 2;  // 920

        ctx.save();
        ctx.shadowColor   = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur    = 40;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 12;

        roundRect(ctx, innerX, innerY, innerW, innerH, INNER_RADIUS);
        ctx.fillStyle = theme.inner;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.restore();

        // ---- 图层 3: 巨型引言装饰 " ----
        ctx.save();
        ctx.font = '700 160px Georgia, "Times New Roman", serif';
        ctx.fillStyle = theme.quote;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText('\u201C', innerX + INNER_PADDING - 12, innerY + INNER_PADDING - 30);
        ctx.restore();

        // ---- 图层 4: 正文 ----
        ctx.fillStyle = theme.text;
        ctx.font = fontWeight + ' ' + fontSize + 'px ' + fontFamily;
        ctx.textBaseline = 'top';
        ctx.textAlign = textAlign;

        var textStartX = (textAlign === 'center')
          ? innerX + innerW / 2
          : innerX + INNER_PADDING;
        var textStartY = innerY + INNER_PADDING;

        for (var i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], textStartX, textStartY + i * lineHeight);
        }

        // ---- 图层 5: 页脚区 ----
        var footerTopY = textStartY + textBlockH + 24;
        var footerLeftX  = innerX + INNER_PADDING;
        var footerRightX = innerX + innerW - INNER_PADDING;

        // 分割线
        ctx.fillStyle = theme.quote;
        ctx.fillRect(footerLeftX, footerTopY, innerW - INNER_PADDING * 2, 1);

        // 日期（左下）
        ctx.save();
        ctx.font = '400 24px ' + fontFamily;
        ctx.fillStyle = theme.footer;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(todayString(), footerLeftX, footerTopY + 16);
        ctx.restore();

        // 品牌（右下）
        ctx.save();
        ctx.font = '600 24px ' + fontFamily;
        ctx.fillStyle = theme.footer;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('Created by ImageLite', footerRightX, footerTopY + 16);
        ctx.restore();

        // ---- 导出 ----
        canvas.toBlob(function (blob) {
          blob ? resolve(blob) : reject(new Error('Canvas toBlob 返回 null'));
        }, 'image/png');

      } catch (err) {
        reject(err);
      }
    });
  };

  // ==================== 低分辨率实时预览 ====================

  window.ImageLite.renderTextCardPreview = function (text, styleOptions) {
    var S = 0.4; // 缩放比

    var theme = THEMES[styleOptions.material] || THEMES.snow;
    var fontKey = styleOptions.font || styleOptions.typography || 'system';
    var fontFamily = FONTS[fontKey] || FONTS.system;

    var trimmed = text.trim();
    if (!trimmed) return null;

    var charCount = trimmed.replace(/\s/g, '').length;
    var isShort   = charCount < SHORT_THRESHOLD;
    var fontSize  = isShort ? FONT_SIZE_SHORT : FONT_SIZE_LONG;
    var lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO);
    var fontWeight = isShort ? '600' : '400';
    var textAlign  = isShort ? 'center' : 'left';

    // 缩放后的常量
    var sCardW   = Math.round(CARD_WIDTH * S);
    var sOuterP  = Math.round(OUTER_PADDING * S);
    var sInnerP  = Math.round(INNER_PADDING * S);
    var sRadius  = Math.round(INNER_RADIUS * S);
    var sMaxW    = Math.round(MAX_TEXT_WIDTH * S);
    var sFontSz  = Math.round(fontSize * S);
    var sLineH   = Math.round(lineHeight * S);
    var sFooterR = Math.round(FOOTER_RESERVE * S);

    // 测量
    var canvas = document.createElement('canvas');
    canvas.width = sCardW; canvas.height = 100;
    var ctx = canvas.getContext('2d');
    ctx.font = fontWeight + ' ' + sFontSz + 'px ' + fontFamily;
    var lines = wrapText(ctx, trimmed, sMaxW);

    var textBlockH = lines.length * sLineH;
    var sInnerH = sInnerP + textBlockH + sFooterR + sInnerP;
    var sCanvasH = sOuterP + sInnerH + sOuterP;

    canvas.width  = sCardW;
    canvas.height = sCanvasH;
    ctx = canvas.getContext('2d');

    // 图层 1: 外背景
    ctx.fillStyle = theme.outer;
    ctx.fillRect(0, 0, sCardW, sCanvasH);

    // 图层 2: 内卡片
    var ix = sOuterP, iy = sOuterP, iw = sCardW - sOuterP * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = Math.round(40 * S);
    ctx.shadowOffsetY = Math.round(12 * S);
    roundRect(ctx, ix, iy, iw, sInnerH, sRadius);
    ctx.fillStyle = theme.inner;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.restore();

    // 图层 3: 引言 "
    ctx.save();
    ctx.font = '700 ' + Math.round(160 * S) + 'px Georgia, "Times New Roman", serif';
    ctx.fillStyle = theme.quote;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('\u201C', ix + sInnerP - Math.round(12 * S), iy + sInnerP - Math.round(30 * S));
    ctx.restore();

    // 图层 4: 正文
    ctx.fillStyle = theme.text;
    ctx.font = fontWeight + ' ' + sFontSz + 'px ' + fontFamily;
    ctx.textBaseline = 'top';
    ctx.textAlign = textAlign;

    var tx = (textAlign === 'center') ? ix + iw / 2 : ix + sInnerP;
    var ty = iy + sInnerP;

    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], tx, ty + i * sLineH);
    }

    // 图层 5: 页脚
    var fTopY = ty + textBlockH + Math.round(24 * S);
    var fLeftX = ix + sInnerP;
    var fRightX = ix + iw - sInnerP;

    ctx.fillStyle = theme.quote;
    ctx.fillRect(fLeftX, fTopY, iw - sInnerP * 2, 1);

    var footerFontSz = Math.round(24 * S);

    ctx.save();
    ctx.font = '400 ' + footerFontSz + 'px ' + fontFamily;
    ctx.fillStyle = theme.footer;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(todayString(), fLeftX, fTopY + Math.round(16 * S));
    ctx.restore();

    ctx.save();
    ctx.font = '600 ' + footerFontSz + 'px ' + fontFamily;
    ctx.fillStyle = theme.footer;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('Created by ImageLite', fRightX, fTopY + Math.round(16 * S));
    ctx.restore();

    return {
      dataURL: canvas.toDataURL('image/png'),
      width: sCardW,
      height: sCanvasH
    };
  };

})();
