/**
 * intentEngine.js — 策略引擎
 *
 * 职责：将用户选择的"场景意图"翻译为可直接喂给 compressor 的压缩参数。
 * 强制约束：此文件零 DOM 依赖，纯数据映射。
 *
 * 挂载到 window.ImageLite.getCompressionStrategy
 */
(function () {
  'use strict';

  window.ImageLite = window.ImageLite || {};

  var STRATEGY_MAP = {
    social: {
      maxWidth: 2048,
      quality: 0.82,
      preferredFormats: ['webp', 'jpeg'],
    },
    limit: {
      maxWidth: 1280,
      quality: 0.60,
      preferredFormats: ['webp'],
    },
    archive: {
      maxWidth: Infinity,
      quality: 0.95,
      preferredFormats: null,
    },
  };

  /**
   * preferredFormats 为 null 时保持原格式。
   */
  function resolveFormat(preferredFormats, originalMime) {
    if (!preferredFormats) {
      var map = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
      return map[originalMime] || 'jpeg';
    }
    return preferredFormats[0];
  }

  /**
   * 等比计算目标尺寸，不会放大图片。
   */
  function clampDimensions(width, height, maxWidth) {
    if (maxWidth === Infinity || width <= maxWidth) {
      return { targetWidth: width, targetHeight: height };
    }
    var ratio = maxWidth / width;
    return {
      targetWidth: maxWidth,
      targetHeight: Math.round(height * ratio),
    };
  }

  /**
   * @param {string} intent     — 'social' | 'limit' | 'archive'
   * @param {{ width: number, height: number, mime: string }} fileMeta
   * @returns {{ targetWidth: number, targetHeight: number, format: string, quality: number }}
   */
  window.ImageLite.getCompressionStrategy = function (intent, fileMeta) {
    var strategy = STRATEGY_MAP[intent];
    if (!strategy) {
      throw new Error('Unknown intent: "' + intent + '"');
    }

    var dims = clampDimensions(fileMeta.width, fileMeta.height, strategy.maxWidth);
    var format = resolveFormat(strategy.preferredFormats, fileMeta.mime);

    return {
      targetWidth: dims.targetWidth,
      targetHeight: dims.targetHeight,
      format: format,
      quality: strategy.quality,
    };
  };
})();
