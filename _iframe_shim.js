// Local shim: extends @percy/sdk-utils with the helper names nightwatch's
// branch uses but which are not exported from the published sdk-utils
// 1.31.14-beta.3. The published package only exposes the _IFRAME_ variants.
const utils = require('@percy/sdk-utils');

const BROWSER_INTERNAL_PREFIXES = [
  'about:', 'chrome:', 'chrome-extension:', 'devtools:',
  'edge:', 'opera:', 'view-source:', 'data:', 'javascript:', 'blob:'
];

function isUnsupportedIframeSrc(src) {
  if (!src) return true;
  const s = String(src).toLowerCase();
  return BROWSER_INTERNAL_PREFIXES.some(p => s.startsWith(p));
}

function normalizeIgnoreSelectors(options = {}) {
  const sel = options.ignoreIframeSelectors ?? options.ignoreSelectors;
  if (!sel) return [];
  if (Array.isArray(sel)) return sel.filter(s => typeof s === 'string' && s.length);
  if (typeof sel === 'string') return sel ? [sel] : [];
  return [];
}

module.exports = Object.assign({}, utils, {
  // Bridge _FRAME_ names to the published _IFRAME_ names.
  DEFAULT_MAX_FRAME_DEPTH: utils.DEFAULT_MAX_FRAME_DEPTH ?? utils.DEFAULT_MAX_IFRAME_DEPTH ?? 10,
  HARD_MAX_FRAME_DEPTH: utils.HARD_MAX_FRAME_DEPTH ?? utils.HARD_MAX_IFRAME_DEPTH ?? 25,
  clampFrameDepth: utils.clampFrameDepth || utils.clampIframeDepth || ((d, def) => {
    const v = Number(d ?? def ?? 10);
    if (Number.isNaN(v)) return def ?? 10;
    return Math.max(0, Math.min(v, utils.HARD_MAX_IFRAME_DEPTH ?? 25));
  }),
  isUnsupportedIframeSrc: utils.isUnsupportedIframeSrc || isUnsupportedIframeSrc,
  normalizeIgnoreSelectors: utils.normalizeIgnoreSelectors || normalizeIgnoreSelectors
});
