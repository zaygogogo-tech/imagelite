/**
 * compressor.js — 纯算力层
 *
 * 强制约束 1 (DOM Isolation)：尽量避免直接 DOM 操作，仅在 OffscreenCanvas
 *                             不可用时回退到 document.createElement('canvas')。
 * 强制约束 2 (Anti-Rollover)：压缩后体积 >= 原文件体积时，返回原文件 Blob。
 *
 * 挂载到 window.ImageLite.processImage
 */
(function () {
  'use strict';

  window.ImageLite = window.ImageLite || {};

  /**
   * 将 File 转为可绘制对象。
   * 优先使用 createImageBitmap（无 DOM），不支持时回退到 Image。
   */
  function loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file);
    }

    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败'));
      };
      img.src = url;
    });
  }

  /**
   * 在 Canvas 上绘制并导出 Blob。
   * 优先 OffscreenCanvas，否则回退到普通 canvas。
   */
  function renderToBlob(imageBitmap, width, height, mimeType, quality) {
    var canvas, ctx;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageBitmap, 0, 0, width, height);

    if (canvas.convertToBlob) {
      return canvas.convertToBlob({ type: mimeType, quality: quality });
    }

    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          blob ? resolve(blob) : reject(new Error('Canvas toBlob 返回 null'));
        },
        mimeType,
        quality
      );
    });
  }

  /**
   * @param {File} file
   * @param {{ targetWidth: number, targetHeight: number, format: string, quality: number }} strategy
   * @returns {Promise<{ blob: Blob, rolledBack: boolean }>}
   */
  window.ImageLite.processImage = async function (file, strategy) {
    var mimeType = 'image/' + strategy.format;

    var bitmap = await loadImage(file);
    var compressedBlob = await renderToBlob(
      bitmap,
      strategy.targetWidth,
      strategy.targetHeight,
      mimeType,
      strategy.quality
    );

    // Anti-Rollover：压缩后反而变大 → 放弃负优化，返回原始 Blob
    if (compressedBlob.size >= file.size) {
      return { blob: file, rolledBack: true };
    }

    return { blob: compressedBlob, rolledBack: false };
  };
})();
