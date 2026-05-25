const expectModule = require('expect');
const expect = typeof expectModule === 'function'
  ? expectModule
  : expectModule.default || expectModule.expect;
const {
  captureSerializedDOM,
  ignoreCanvasSerializationErrors,
  ignoreStyleSheetSerializationErrors,
  slowScrollToBottom,
  waitForReady
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

  describe('waitForReady', () => {
    function makeBrowser({ asyncResult, throwError } = {}) {
      return {
        capturedScript: null,
        capturedArgs: null,
        executeAsync(fn, args, cb) {
          this.capturedScript = fn;
          this.capturedArgs = args;
          if (throwError) throw throwError;
          cb({ value: asyncResult });
        }
      };
    }

    // Minimal sdk-utils stub. The real helper lives in @percy/sdk-utils as
    // runReadinessGate; we reimplement the contract here (shallow-merge,
    // callback-mode script emission, try/catch) without pulling in the
    // package — keeps these unit tests fast.
    function makeUtils({ globalReadiness } = {}) {
      const mergedConfig = (options) =>
        ({ ...(globalReadiness || {}), ...(options?.readiness || {}) });
      return {
        percy: { config: { snapshot: globalReadiness ? { readiness: globalReadiness } : {} } },
        runReadinessGate: async (evalScript, options, { callback = false, log } = {}) => {
          const config = mergedConfig(options);
          if (config.preset === 'disabled') return null;
          const configJson = JSON.stringify(config);
          const script = callback
            ? `var done = arguments[arguments.length - 1];
                try {
                  if (typeof PercyDOM !== 'undefined' && typeof PercyDOM.waitForReady === 'function') {
                    PercyDOM.waitForReady(${configJson}).then(function(r) { done(r); }).catch(function() { done(); });
                  } else { done(); }
                } catch(e) { done(); }`
            : `PercyDOM.waitForReady(${configJson})`;
          try {
            return await evalScript(script);
          } catch (err) {
            log?.debug?.(`waitForReady failed, proceeding to serialize: ${err?.message || err}`);
            return null;
          }
        }
      };
    }

    it('returns diagnostics when the CLI exposes waitForReady', async () => {
      const diagnostics = { timed_out: false, duration_ms: 12 };
      const browser = makeBrowser({ asyncResult: diagnostics });

      const result = await waitForReady(browser, {}, makeUtils());

      expect(result).toEqual(diagnostics);
      expect(typeof browser.capturedScript).toBe('string');
      expect(browser.capturedScript).toContain('arguments[arguments.length - 1]');
      expect(browser.capturedScript).toContain('PercyDOM.waitForReady');
      // sdk-utils inlines the config in the script — no separate args needed.
      expect(browser.capturedArgs).toEqual([]);
    });

    it('inlines per-snapshot readiness config as JSON into the script', async () => {
      const browser = makeBrowser({ asyncResult: undefined });
      const config = { preset: 'strict', stabilityWindowMs: 500 };

      await waitForReady(browser, { readiness: config }, makeUtils());

      expect(browser.capturedScript).toContain('"preset":"strict"');
      expect(browser.capturedScript).toContain('"stabilityWindowMs":500');
    });

    it('falls back to .percy.yml readiness config when no per-snapshot value is given', async () => {
      const browser = makeBrowser({ asyncResult: undefined });

      await waitForReady(browser, {}, makeUtils({ globalReadiness: { preset: 'fast' } }));

      expect(browser.capturedScript).toContain('"preset":"fast"');
    });

    it('skips waitForReady entirely when preset is disabled', async () => {
      const browser = makeBrowser({ asyncResult: { should: 'not see this' } });

      const result = await waitForReady(
        browser,
        { readiness: { preset: 'disabled' } },
        makeUtils()
      );

      expect(result).toBe(undefined);
      expect(browser.capturedScript).toBe(null);
    });

    it('is a silent no-op when sdk-utils lacks runReadinessGate (older sdk-utils)', async () => {
      const browser = makeBrowser({ asyncResult: { should: 'not see this' } });

      const result = await waitForReady(browser, {}, { percy: { config: {} } });

      expect(result).toBe(undefined);
      expect(browser.capturedScript).toBe(null);
    });

    it('returns undefined and does not throw when executeAsync fails', async () => {
      const browser = makeBrowser({ throwError: new Error('selenium boom') });
      const log = { debugCalls: [], debug(...args) { this.debugCalls.push(args); } };

      const result = await waitForReady(browser, {}, makeUtils(), log);

      expect(result).toBe(undefined);
      expect(log.debugCalls.length).toBe(1);
    });

    it('logs the raw error when executeAsync throws a non-Error', async () => {
      // Covers the `error?.message || error` second branch in the catch:
      // the rejection value has no `.message`, so the log line falls through
      // to stringifying the error itself.
      const browser = makeBrowser({ throwError: 'plain-string-rejection' });
      const log = { debugCalls: [], debug(...args) { this.debugCalls.push(args); } };

      const result = await waitForReady(browser, {}, makeUtils(), log);

      expect(result).toBe(undefined);
      expect(log.debugCalls.length).toBe(1);
      expect(log.debugCalls[0][0]).toContain('plain-string-rejection');
    });

    it('resolves with undefined when neither executeAsync nor executeAsyncScript exists', async () => {
      const browser = {}; // no execute methods at all

      const result = await waitForReady(browser, {}, makeUtils());

      expect(result).toBe(undefined);
    });
  });
});
