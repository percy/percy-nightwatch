const expectModule = require('expect');
const expect = typeof expectModule === 'function'
  ? expectModule
  : expectModule.default || expectModule.expect;
const {
  captureSerializedDOM,
  ignoreCanvasSerializationErrors,
  ignoreStyleSheetSerializationErrors,
  slowScrollToBottom
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
      // Options should be converted to snake_case for PercyDOM.serialize()
      expect(browser.lastArgs).toMatchObject({
        enable_javascript: false,
        ignore_canvas_serialization_errors: false,
        ignore_style_sheet_serialization_errors: false
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
});
