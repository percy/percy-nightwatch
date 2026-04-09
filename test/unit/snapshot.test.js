const expectModule = require('expect');
const expect = typeof expectModule === 'function'
  ? expectModule
  : expectModule.default || expectModule.expect;
const {
  captureSerializedDOM,
  ignoreCanvasSerializationErrors,
  ignoreStyleSheetSerializationErrors,
  slowScrollToBottom,
  isUnsupportedIframeSrc,
  getOrigin
} = require('../../lib/snapshot');

describe('snapshot helpers', () => {
  describe('ignoreCanvasSerializationErrors', () => {
    it('prefers option value', () => {
      const utils = { percy: { config: { snapshot: { ignoreCanvasSerializationErrors: false } } } };
      expect(ignoreCanvasSerializationErrors({ ignoreCanvasSerializationErrors: true }, utils)).toBe(true);
    });

    it('falls back to config value', () => {
      const utils = { percy: { config: { snapshot: { ignoreCanvasSerializationErrors: true } } } };
      expect(ignoreCanvasSerializationErrors({}, utils)).toBe(true);
    });
  });

  describe('ignoreStyleSheetSerializationErrors', () => {
    it('defaults to false', () => {
      const utils = { percy: { config: { snapshot: {} } } };
      expect(ignoreStyleSheetSerializationErrors({}, utils)).toBe(false);
    });
  });

  describe('captureSerializedDOM', () => {
    it('injects serialization flags and cookies', async () => {
      const browser = {
        lastArgs: null,
        execute(fn, args, cb) {
          this.lastArgs = args[0];
          cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://example.com' } });
        },
        getCookies(cb) {
          cb({ value: [{ name: 'session', value: '123' }] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, { enableJavaScript: false }, utils);

      expect(result.url).toBe('http://example.com');
      expect(result.domSnapshot).toMatchObject({
        html: '<html></html>',
        cookies: [{ name: 'session', value: '123' }]
      });
      // Options are passed directly to PercyDOM.serialize() which accepts camelCase
      expect(browser.lastArgs).toMatchObject({
        enableJavaScript: false,
        ignoreCanvasSerializationErrors: false,
        ignoreStyleSheetSerializationErrors: false
      });
    });
  });

  describe('slowScrollToBottom', () => {
    let browser;

    beforeEach(() => {
      delete process.env.PERCY_LAZY_LOAD_SCROLL_TIME;
      delete process.env.PERCY_SLEEP_AFTER_LAZY_LOAD_COMPLETE;
      browser = {
        scrollCalls: [],
        scrollHeights: [900, 900, 0],
        execute(fn, args, cb) {
          const source = fn.toString();

          if (source.includes('Math.max')) {
            const value = this.scrollHeights.shift();
            cb({ value });
            return;
          }

          if (source.includes('document.documentElement.clientHeight')) {
            cb({ value: 450 });
            return;
          }

          if (source.includes('window.scrollTo(0, position)')) {
            this.scrollCalls.push(args[0]);
            cb({ value: null });
            return;
          }

          if (source.includes('window.scrollTo(0, 0)')) {
            this.scrollCalls.push('top');
            cb({ value: null });
            return;
          }

          cb({ value: null });
        },
        getCookies(cb) {
          cb({ value: [] });
        }
      };
    });

    it('scrolls down and returns to the top', async () => {
      process.env.PERCY_LAZY_LOAD_SCROLL_TIME = '0';
      process.env.PERCY_SLEEP_AFTER_LAZY_LOAD_COMPLETE = '0';

      await slowScrollToBottom(browser);

      expect(browser.scrollCalls).toEqual([450, 900, 'top']);
    });
  });

  describe('isUnsupportedIframeSrc', () => {
    it('returns true for null/undefined/empty src', () => {
      expect(isUnsupportedIframeSrc(null)).toBe(true);
      expect(isUnsupportedIframeSrc(undefined)).toBe(true);
      expect(isUnsupportedIframeSrc('')).toBe(true);
    });

    it('returns true for unsupported protocols', () => {
      expect(isUnsupportedIframeSrc('about:blank')).toBe(true);
      expect(isUnsupportedIframeSrc('about:srcdoc')).toBe(true);
      expect(isUnsupportedIframeSrc('javascript:void(0)')).toBe(true);
      expect(isUnsupportedIframeSrc('data:text/html,<h1>hi</h1>')).toBe(true);
      expect(isUnsupportedIframeSrc('blob:http://example.com/abc')).toBe(true);
      expect(isUnsupportedIframeSrc('vbscript:msgbox')).toBe(true);
      expect(isUnsupportedIframeSrc('chrome://settings')).toBe(true);
      expect(isUnsupportedIframeSrc('chrome-extension://abc/page.html')).toBe(true);
    });

    it('returns false for valid http/https URLs', () => {
      expect(isUnsupportedIframeSrc('https://example.com')).toBe(false);
      expect(isUnsupportedIframeSrc('http://example.com/page')).toBe(false);
      expect(isUnsupportedIframeSrc('https://cdn.example.com/widget')).toBe(false);
    });
  });

  describe('getOrigin', () => {
    it('extracts origin from valid URLs', () => {
      expect(getOrigin('https://example.com/path')).toBe('https://example.com');
      expect(getOrigin('http://localhost:3000/page')).toBe('http://localhost:3000');
      expect(getOrigin('https://sub.example.com:8080/foo')).toBe('https://sub.example.com:8080');
    });

    it('returns null for invalid URLs', () => {
      expect(getOrigin('not-a-url')).toBe(null);
      expect(getOrigin('')).toBe(null);
      expect(getOrigin(null)).toBe(null);
    });
  });

  describe('captureSerializedDOM with CORS iframes', () => {
    it('captures cross-origin iframes and attaches corsIframes', async () => {
      let currentFrame = 'main';
      const browser = {
        execute(fn, args, cb) {
          const source = fn.toString();
          if (currentFrame === 'main') {
            if (source.includes('PercyDOM.serialize')) {
              cb({ value: { domSnapshot: { html: '<html><iframe src="https://cross.example.com"></iframe></html>' }, url: 'http://localhost:8000' } });
            } else if (source.includes('querySelectorAll')) {
              cb({
                value: [
                  { src: 'https://cross.example.com', srcdoc: null, percyElementId: 'percy-123', index: 0 }
                ]
              });
            } else {
              cb({ value: null });
            }
          } else if (currentFrame === 'iframe-0') {
            if (typeof fn === 'string') {
              // PercyDOM injection
              cb({ value: null });
            } else if (source.includes('PercyDOM.serialize')) {
              cb({ value: { html: '<html>iframe content</html>', resources: [] } });
            } else {
              cb({ value: null });
            }
          }
        },
        frame(indexOrNull, cb) {
          if (indexOrNull === null) {
            currentFrame = 'main';
          } else {
            currentFrame = `iframe-${indexOrNull}`;
          }
          cb({ value: null });
        },
        getCookies(cb) {
          cb({ value: [] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const domScript = 'window.PercyDOM = {};';
      const result = await captureSerializedDOM(browser, {}, utils, domScript);

      expect(result.domSnapshot.corsIframes).toBeDefined();
      expect(result.domSnapshot.corsIframes).toHaveLength(1);
      expect(result.domSnapshot.corsIframes[0]).toMatchObject({
        frameUrl: 'https://cross.example.com',
        iframeData: { percyElementId: 'percy-123' },
        iframeSnapshot: { html: '<html>iframe content</html>', resources: [] }
      });
    });

    it('does not add corsIframes when no cross-origin iframes exist', async () => {
      const browser = {
        execute(fn, args, cb) {
          const source = fn.toString();
          if (source.includes('PercyDOM.serialize')) {
            cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://localhost:8000' } });
          } else if (source.includes('querySelectorAll')) {
            cb({ value: [] });
          } else {
            cb({ value: null });
          }
        },
        frame(indexOrNull, cb) {
          cb({ value: null });
        },
        getCookies(cb) {
          cb({ value: [] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};');

      expect(result.domSnapshot.corsIframes).toBeUndefined();
    });

    it('skips same-origin iframes', async () => {
      const browser = {
        execute(fn, args, cb) {
          const source = fn.toString();
          if (source.includes('PercyDOM.serialize')) {
            cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://localhost:8000' } });
          } else if (source.includes('querySelectorAll')) {
            cb({
              value: [
                { src: 'http://localhost:8000/same-origin', srcdoc: null, percyElementId: 'percy-456', index: 0 }
              ]
            });
          } else {
            cb({ value: null });
          }
        },
        frame(indexOrNull, cb) {
          cb({ value: null });
        },
        getCookies(cb) {
          cb({ value: [] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};');

      expect(result.domSnapshot.corsIframes).toBeUndefined();
    });

    it('skips iframes without data-percy-element-id', async () => {
      const debugMessages = [];
      const log = { debug: (msg) => debugMessages.push(msg) };
      const browser = {
        execute(fn, args, cb) {
          const source = fn.toString();
          if (source.includes('PercyDOM.serialize')) {
            cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://localhost:8000' } });
          } else if (source.includes('querySelectorAll')) {
            cb({
              value: [
                { src: 'https://cross.example.com', srcdoc: null, percyElementId: null, index: 0 }
              ]
            });
          } else {
            cb({ value: null });
          }
        },
        frame(indexOrNull, cb) {
          cb({ value: null });
        },
        getCookies(cb) {
          cb({ value: [] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};', log);

      expect(result.domSnapshot.corsIframes).toBeUndefined();
      expect(debugMessages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Skipping cross-origin iframe without data-percy-element-id')
        ])
      );
    });

    it('handles frame processing errors gracefully', async () => {
      const debugMessages = [];
      const log = { debug: (msg) => debugMessages.push(msg) };
      let currentFrame = 'main';
      const browser = {
        execute(fn, args, cb) {
          const source = fn.toString();
          if (currentFrame === 'main') {
            if (source.includes('PercyDOM.serialize')) {
              cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://localhost:8000' } });
            } else if (source.includes('querySelectorAll')) {
              cb({
                value: [
                  { src: 'https://cross.example.com', srcdoc: null, percyElementId: 'percy-789', index: 0 }
                ]
              });
            } else {
              cb({ value: null });
            }
          } else {
            // Simulate error inside iframe
            throw new Error('Frame is detached');
          }
        },
        frame(indexOrNull, cb) {
          if (indexOrNull === null) {
            currentFrame = 'main';
          } else {
            currentFrame = `iframe-${indexOrNull}`;
          }
          cb({ value: null });
        },
        getCookies(cb) {
          cb({ value: [] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};', log);

      // Should not crash, should not have corsIframes
      expect(result.domSnapshot.corsIframes).toBeUndefined();
      expect(debugMessages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Failed to process cross-origin iframe')
        ])
      );
    });

    it('does not capture CORS iframes when domScript is not provided', async () => {
      const browser = {
        execute(fn, args, cb) {
          cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://localhost:8000' } });
        },
        getCookies(cb) {
          cb({ value: [] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils);

      expect(result.domSnapshot.corsIframes).toBeUndefined();
    });
  });
});
