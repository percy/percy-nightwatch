// Constants and helpers used across cross-origin iframe handling.
// Kept in a dedicated module so the same definitions don't drift between
// SDKs (puppeteer, playwright, nightwatch, cypress, webdriverio, protractor).

const UNSUPPORTED_IFRAME_SRCS = [
  'about:blank',
  'about:srcdoc',
  'javascript:',
  'data:',
  'blob:',
  'vbscript:',
  'chrome:',
  'chrome-extension:'
];

const DEFAULT_MAX_FRAME_DEPTH = 10;
const HARD_MAX_FRAME_DEPTH = 25;

function isUnsupportedIframeSrc(src) {
  if (!src) return true;
  const lower = String(src).toLowerCase();
  return UNSUPPORTED_IFRAME_SRCS.some(prefix => lower === prefix || lower.startsWith(prefix));
}

function clampFrameDepth(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_FRAME_DEPTH;
  return Math.min(n, HARD_MAX_FRAME_DEPTH);
}

function normalizeIgnoreSelectors(list) {
  return Array.isArray(list) ? list.filter(s => typeof s === 'string' && s.trim()) : [];
}

module.exports = {
  UNSUPPORTED_IFRAME_SRCS,
  DEFAULT_MAX_FRAME_DEPTH,
  HARD_MAX_FRAME_DEPTH,
  isUnsupportedIframeSrc,
  clampFrameDepth,
  normalizeIgnoreSelectors
};
