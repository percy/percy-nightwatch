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
  getOrigin,
  waitForReady
} = require('../../lib/snapshot');

// Shared no-op log for tests that don't care about log output. Tests
// asserting log behavior build their own collecting log object and pass it
// as the 5th argument to captureSerializedDOM.
const noopLog = { debug: () => {}, info: () => {}, warn: () => {} };

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
        // Capture only the FIRST execute() call's args — that's the
        // PercyDOM.serialize invocation. Subsequent calls (cors-iframe
        // enumeration) would overwrite this with the selectors array.
        lastArgs: null,
        execute(fn, args, cb) {
          if (this.lastArgs === null) this.lastArgs = args[0];
          cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://example.com' } });
        },
        getCookies(cb) {
          cb({ value: [{ name: 'session', value: '123' }] });
        }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, { enableJavaScript: false }, utils, 'window.PercyDOM = {};', noopLog);

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
      expect(isUnsupportedIframeSrc('file:///etc/passwd')).toBe(true);
      expect(isUnsupportedIframeSrc('FILE:///C:/Users')).toBe(true);
      expect(isUnsupportedIframeSrc('ws://example.com/socket')).toBe(true);
      expect(isUnsupportedIframeSrc('wss://example.com/socket')).toBe(true);
      expect(isUnsupportedIframeSrc('ftp://example.com/file')).toBe(true);
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
    // Builds a stub browser that simulates a frame tree. `frames` is a map of
    // frame-name -> { url, iframes: [{ src, percyElementId }], snapshot }.
    // The active frame is tracked across frame()/frameParent() calls so that
    // the recursion can be tested without a real browser.
    function buildFrameTreeBrowser(frames) {
      const stack = ['main'];
      // Closure-bound reader so callers (including Object.assign-copied
      // overrides) always observe the live frame stack rather than a snapshot
      // that happens to be `'main'` at construction time.
      const getCurrentFrame = () => stack[stack.length - 1];
      const findById = (frameName, percyId) =>
        (frames[frameName].iframes || []).find(f => f.percyElementId === percyId);
      const childKey = (frameName, percyId) => {
        const child = findById(frameName, percyId);
        return child ? child.frame : null;
      };
      const browser = {
        execute(fn, args, cb) {
          const source = typeof fn === 'string' ? fn : fn.toString();
          const current = getCurrentFrame();
          const frame = frames[current] || {};
          // PercyDOM script injection: string source
          if (typeof fn === 'string') return cb({ value: null });
          // Top-level page serialization (returns { domSnapshot, url })
          if (current === 'main' && source.includes('domSnapshot:')) {
            return cb({ value: { domSnapshot: frame.domSnapshot || { html: frame.html || '' }, url: frame.url } });
          }
          // Frame serialization (returns { snapshot, frameUrl })
          if (source.includes('PercyDOM.serialize')) {
            return cb({ value: { snapshot: frame.snapshot || { html: frame.html || '', resources: [] }, frameUrl: frame.url } });
          }
          // Iframe enumeration in current frame
          if (source.includes('querySelectorAll')) {
            return cb({
              value: (frame.iframes || []).map((f, i) => ({
                src: f.src,
                srcdoc: f.srcdoc || null,
                percyElementId: f.percyElementId,
                dataPercyIgnore: !!f.dataPercyIgnore,
                matchesIgnoreSelector: !!f.matchesIgnoreSelector,
                index: i
              }))
            });
          }
          // Single iframe lookup by percy-element-id — return a sentinel keyed
          // by the child frame name so frame() can navigate to it.
          if (source.includes('querySelector')) {
            const percyId = args[0];
            const target = childKey(current, percyId);
            return cb({ value: target ? { __frame: target } : null });
          }
          cb({ value: null });
        },
        frame(target, cb) {
          if (target === null) {
            stack.length = 0;
            stack.push('main');
          } else if (target && target.__frame) {
            stack.push(target.__frame);
          } else if (typeof target === 'number') {
            stack.push(`iframe-${target}`);
          }
          cb({ value: null });
        },
        frameParent(cb) {
          if (stack.length > 1) stack.pop();
          cb({ value: null });
        },
        getCookies(cb) { cb({ value: [] }); }
      };
      Object.defineProperty(browser, 'currentFrame', {
        get: getCurrentFrame,
        enumerable: false,
        configurable: true
      });
      return browser;
    }

    it('captures cross-origin iframes and attaches corsIframes', async () => {
      const browser = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:8000',
          domSnapshot: { html: '<html><iframe src="https://cross.example.com"></iframe></html>' },
          iframes: [
            { src: 'https://cross.example.com', percyElementId: 'percy-123', frame: 'cross1' }
          ]
        },
        cross1: {
          url: 'https://cross.example.com',
          snapshot: { html: '<html>iframe content</html>', resources: [] }
        }
      });

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

    it('honors options.maxIframeDepth to limit recursion', async () => {
      const browser = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:3001',
          domSnapshot: { html: '<html></html>' },
          iframes: [{ src: 'http://localhost:3002/a', percyElementId: 'p-a', frame: 'a' }]
        },
        a: {
          url: 'http://localhost:3002/a',
          snapshot: { html: '<html>a</html>', resources: [] },
          iframes: [{ src: 'http://localhost:3003/b', percyElementId: 'p-b', frame: 'b' }]
        },
        b: {
          url: 'http://localhost:3003/b',
          snapshot: { html: '<html>b</html>', resources: [] },
          iframes: [{ src: 'http://localhost:3004/c', percyElementId: 'p-c', frame: 'c' }]
        },
        c: {
          url: 'http://localhost:3004/c',
          snapshot: { html: '<html>c</html>', resources: [] }
        }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, { maxIframeDepth: 2 }, utils, 'window.PercyDOM = {};');

      // Cap at 2 -> capture a (depth 1) and b (depth 2). c (depth 3) is skipped.
      expect(result.domSnapshot.corsIframes).toHaveLength(2);
      expect(result.domSnapshot.corsIframes.map(f => f.frameUrl)).toEqual([
        'http://localhost:3002/a',
        'http://localhost:3003/b'
      ]);
    });

    it('skips iframes with data-percy-ignore attribute', async () => {
      const browser = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:3001',
          domSnapshot: { html: '<html></html>' },
          iframes: [
            { src: 'http://localhost:3002/keep', percyElementId: 'p-keep', frame: 'keep' },
            { src: 'http://localhost:3003/drop', percyElementId: 'p-drop', frame: 'drop', dataPercyIgnore: true }
          ]
        },
        keep: { url: 'http://localhost:3002/keep', snapshot: { html: '<html>keep</html>', resources: [] } },
        drop: { url: 'http://localhost:3003/drop', snapshot: { html: '<html>drop</html>', resources: [] } }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};');

      expect(result.domSnapshot.corsIframes).toHaveLength(1);
      expect(result.domSnapshot.corsIframes[0].frameUrl).toBe('http://localhost:3002/keep');
    });

    it('honors options.ignoreIframeSelectors via the matchesIgnoreSelector signal', async () => {
      const browser = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:3001',
          domSnapshot: { html: '<html></html>' },
          iframes: [
            { src: 'http://localhost:3002/keep', percyElementId: 'p-keep', frame: 'keep' },
            { src: 'http://localhost:3004/ad', percyElementId: 'p-ad', frame: 'ad', matchesIgnoreSelector: true }
          ]
        },
        keep: { url: 'http://localhost:3002/keep', snapshot: { html: '<html>keep</html>', resources: [] } },
        ad: { url: 'http://localhost:3004/ad', snapshot: { html: '<html>ad</html>', resources: [] } }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, { ignoreIframeSelectors: ['.ad'] }, utils, 'window.PercyDOM = {};');

      expect(result.domSnapshot.corsIframes).toHaveLength(1);
      expect(result.domSnapshot.corsIframes[0].frameUrl).toBe('http://localhost:3002/keep');
    });

    it('captures nested cross-origin iframes up to the depth cap', async () => {
      const browser = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:3001',
          domSnapshot: { html: '<html></html>' },
          iframes: [{ src: 'http://localhost:3002/outer', percyElementId: 'p-outer', frame: 'outer' }]
        },
        outer: {
          url: 'http://localhost:3002/outer',
          snapshot: { html: '<html>outer</html>', resources: [] },
          iframes: [{ src: 'http://localhost:3003/inner', percyElementId: 'p-inner', frame: 'inner' }]
        },
        inner: {
          url: 'http://localhost:3003/inner',
          snapshot: { html: '<html>inner</html>', resources: [] },
          iframes: [{ src: 'http://localhost:3004/deepest', percyElementId: 'p-deepest', frame: 'deepest' }]
        },
        deepest: {
          url: 'http://localhost:3004/deepest',
          snapshot: { html: '<html>deepest</html>', resources: [] },
          iframes: []
        }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};');

      expect(result.domSnapshot.corsIframes).toHaveLength(3);
      expect(result.domSnapshot.corsIframes.map(f => f.frameUrl)).toEqual([
        'http://localhost:3002/outer',
        'http://localhost:3003/inner',
        'http://localhost:3004/deepest'
      ]);
    });

    it('breaks out of a cyclic iframe graph instead of recursing to MAX_FRAME_DEPTH', async () => {
      // host -> a -> b -> a (cycle). Without cycle detection we would recurse
      // 10 times and emit 10 entries; with detection we capture each unique
      // frame once and stop at the cyclic edge.
      const browser = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:3001',
          domSnapshot: { html: '<html></html>' },
          iframes: [{ src: 'http://localhost:3002/a', percyElementId: 'p-a', frame: 'a' }]
        },
        a: {
          url: 'http://localhost:3002/a',
          snapshot: { html: '<html>a</html>', resources: [] },
          iframes: [{ src: 'http://localhost:3003/b', percyElementId: 'p-b', frame: 'b' }]
        },
        b: {
          url: 'http://localhost:3003/b',
          snapshot: { html: '<html>b</html>', resources: [] },
          iframes: [{ src: 'http://localhost:3002/a', percyElementId: 'p-a-cycle', frame: 'a' }]
        }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};');

      expect(result.domSnapshot.corsIframes).toHaveLength(2);
      expect(result.domSnapshot.corsIframes.map(f => f.frameUrl)).toEqual([
        'http://localhost:3002/a',
        'http://localhost:3003/b'
      ]);
    });

    it('aborts further sibling capture when parentFrame restoration fails mid-recursion', async () => {
      const debugMessages = [];
      const warnings = [];
      const log = { debug: (m) => debugMessages.push(m), warn: (m) => warnings.push(m) };
      const base = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:3001',
          domSnapshot: { html: '<html></html>' },
          iframes: [
            { src: 'http://localhost:3002/x', percyElementId: 'p-x', frame: 'x' },
            { src: 'http://localhost:3004/sibling', percyElementId: 'p-sib', frame: 'sib' }
          ]
        },
        x: {
          url: 'http://localhost:3002/x',
          snapshot: { html: '<html>x</html>', resources: [] },
          iframes: [{ src: 'http://localhost:3003/inner', percyElementId: 'p-inner', frame: 'inner' }]
        },
        inner: {
          url: 'http://localhost:3003/inner',
          snapshot: { html: '<html>inner</html>', resources: [] },
          iframes: []
        },
        sib: {
          url: 'http://localhost:3004/sibling',
          snapshot: { html: '<html>sib</html>', resources: [] }
        }
      });
      // Make frameParent throw when called from inside the inner frame
      // (depth 2 unwind). This should propagate percyContextLost up and
      // cause captureCorsIframes to skip the sibling 'sib'.
      const browser = Object.assign({}, base, {
        frameParent(cb) {
          if (base.currentFrame === 'inner') {
            return cb({ status: 1, error: new Error('frameParent unsupported') });
          }
          if (base.currentFrame === 'main') {
            return cb({ value: null });
          }
          base.frameParent(cb);
        }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};', log);

      // We should have captured x and inner, then aborted before sib.
      expect(result.domSnapshot.corsIframes.map(f => f.frameUrl)).toEqual([
        'http://localhost:3002/x',
        'http://localhost:3003/inner'
      ]);
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Aborting further nested CORS capture due to lost frame context')
        ])
      );
    });

    it('skips same-origin descendants of a cross-origin frame (already inlined by PercyDOM)', async () => {
      const browser = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:8000',
          domSnapshot: { html: '<html></html>' },
          iframes: [{ src: 'https://outer.example.com/page', percyElementId: 'p-outer', frame: 'outer' }]
        },
        outer: {
          url: 'https://outer.example.com/page',
          snapshot: { html: '<html>outer</html>', resources: [] },
          iframes: [{ src: 'https://outer.example.com/inner', percyElementId: 'p-same', frame: 'same' }]
        }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};');

      expect(result.domSnapshot.corsIframes).toHaveLength(1);
      expect(result.domSnapshot.corsIframes[0].frameUrl).toBe('https://outer.example.com/page');
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
      const warnings = [];
      const log = { debug: () => {}, warn: (msg) => warnings.push(msg) };
      const base = buildFrameTreeBrowser({
        main: {
          url: 'http://localhost:8000',
          domSnapshot: { html: '<html></html>' },
          iframes: [{ src: 'https://cross.example.com', percyElementId: 'percy-789', frame: 'cross1' }]
        },
        cross1: {
          url: 'https://cross.example.com',
          snapshot: { html: '<html></html>', resources: [] }
        }
      });
      // Simulate a detached frame: any execute() call after switching into the
      // child frame throws synchronously, mirroring a WebDriver protocol error.
      const browser = Object.assign({}, base, {
        execute(fn, args, cb) {
          if (base.currentFrame === 'cross1') {
            throw new Error('Frame is detached');
          }
          base.execute(fn, args, cb);
        }
      });

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};', log);

      expect(result.domSnapshot.corsIframes).toBeUndefined();
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Failed to process cross-origin iframe')
        ])
      );
    });
  });

  describe('context threading (CE MAJORs)', () => {
    // CE MAJOR 1+2: A consumer that imports captureDOM directly (bypassing
    // percySnapshot, e.g. a custom runner) should not need to call any
    // module-level setter to avoid crashes. Omitting domScript must not
    // throw — it should simply skip PercyDOM re-injection where the script
    // is unavailable, and still complete the capture.
    it('captureDOM without domScript/log completes without throwing', async () => {
      const { captureDOM } = require('../../lib/snapshot');
      const browser = {
        execute(fn, args, cb) {
          const source = typeof fn === 'string' ? fn : fn.toString();
          if (typeof fn === 'string') return cb({ value: null });
          if (source.includes('domSnapshot:')) {
            return cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://example.com' } });
          }
          if (source.includes('querySelectorAll')) return cb({ value: [] });
          cb({ value: null });
        },
        getCookies(cb) { cb({ value: [] }); }
      };
      const utils = { percy: { config: { snapshot: {} } } };

      // Call without domScript or log — both default to null.
      const result = await captureDOM(browser, {}, utils);
      expect(result.domSnapshot.html).toBe('<html></html>');
      expect(result.url).toBe('http://example.com');
    });

    // CE MAJOR 1: maybeReloadPage previously called executeScript(browser, null)
    // when setSnapshotContext was never set, which throws inside the browser
    // stub. With responsive capture enabled and reload toggled on, the call
    // path must guard against a missing domScript.
    it('maybeReloadPage path is safe when domScript is null', async () => {
      const { captureDOM } = require('../../lib/snapshot');
      const browser = {
        refreshCalled: 0,
        execute(fn, args, cb) {
          const source = typeof fn === 'string' ? fn : fn.toString();
          if (typeof fn === 'string') {
            // PercyDOM injection should NEVER be invoked with null script.
            // Failing this branch keeps the test honest if a regression
            // re-introduces executeScript(browser, null).
            if (fn === null) throw new Error('executeScript called with null script');
            return cb({ value: null });
          }
          if (source.includes('window.innerWidth')) {
            return cb({ value: { width: 1280, height: 720 } });
          }
          if (source.includes('window.resizeCount')) {
            // Echo a monotonically incrementing counter so waitForResizeEvent
            // resolves quickly instead of polling until the 1s timeout.
            this._resizeCount = (this._resizeCount || 0) + 1;
            return cb({ value: this._resizeCount });
          }
          if (source.includes('waitForResize')) return cb({ value: null });
          if (source.includes('domSnapshot:')) {
            return cb({ value: { domSnapshot: { html: '<html></html>' }, url: 'http://example.com' } });
          }
          if (source.includes('querySelectorAll')) return cb({ value: [] });
          cb({ value: null });
        },
        refresh(cb) { this.refreshCalled += 1; cb({ value: null }); },
        setWindowRect(rect, cb) { cb({ value: null }); },
        getCookies(cb) { cb({ value: [] }); }
      };
      // Use the same width as the stub's originalWidth so changeWindowDimensionAndWait
      // is never triggered — its waitForResizeEvent polls for window.resizeCount and
      // would otherwise time out against this minimal stub.
      const utils = {
        percy: { config: { snapshot: { responsiveSnapshotCapture: true } }, widths: { config: [1280] } }
      };

      process.env.PERCY_RESPONSIVE_CAPTURE_RELOAD_PAGE = '1';
      try {
        const result = await captureDOM(browser, {}, utils, null, noopLog);
        // We at least got one snapshot back, proving the responsive path
        // completed without throwing on the null-domScript reload branch.
        expect(Array.isArray(result.domSnapshot)).toBe(true);
        expect(browser.refreshCalled).toBeGreaterThan(0);
      } finally {
        delete process.env.PERCY_RESPONSIVE_CAPTURE_RELOAD_PAGE;
      }
    });

    // CE MAJOR 2: Two captureDOM calls invoked concurrently in the same Node
    // process must not cross-contaminate each other's log streams. We build
    // two distinct browser stubs with two distinct logs and run them through
    // Promise.all. Log entries for run A must never appear in run B's log.
    it('concurrent captures do not cross-contaminate per-call context', async () => {
      const { captureDOM } = require('../../lib/snapshot');
      function makeBrowser(tag) {
        return {
          execute(fn, args, cb) {
            const source = typeof fn === 'string' ? fn : fn.toString();
            if (typeof fn === 'string') return cb({ value: null });
            if (source.includes('domSnapshot:')) {
              return setTimeout(() =>
                cb({ value: { domSnapshot: { html: `<html>${tag}</html>` }, url: `http://${tag}.example` } }), 5);
            }
            if (source.includes('querySelectorAll')) {
              // One same-origin iframe each so shouldSkipIframe emits a debug.
              return cb({
                value: [{
                  src: `http://${tag}.example/inner`,
                  srcdoc: null,
                  percyElementId: null,
                  dataPercyIgnore: false,
                  matchesIgnoreSelector: false,
                  index: 0
                }]
              });
            }
            cb({ value: null });
          },
          getCookies(cb) { cb({ value: [] }); }
        };
      }
      const utils = { percy: { config: { snapshot: {} } } };
      const logA = { entries: [], debug(m) { this.entries.push(m); }, info() {}, warn() {} };
      const logB = { entries: [], debug(m) { this.entries.push(m); }, info() {}, warn() {} };

      // Run both captures concurrently. Each gets its own (domScript, log).
      const [resA, resB] = await Promise.all([
        captureDOM(makeBrowser('a'), {}, utils, 'script-A', logA),
        captureDOM(makeBrowser('b'), {}, utils, 'script-B', logB)
      ]);

      expect(resA.domSnapshot.html).toBe('<html>a</html>');
      expect(resB.domSnapshot.html).toBe('<html>b</html>');

      // logA must only mention `a.example`, logB only `b.example`. With the
      // old module-scope `log`, the second call's setSnapshotContext would
      // have overwritten the first's logger and the entries would mix.
      const joinedA = logA.entries.join('\n');
      const joinedB = logB.entries.join('\n');
      expect(joinedA).not.toContain('b.example');
      expect(joinedB).not.toContain('a.example');
    });

    // CE MAJOR 3: parentFrame failure at depth=1 must also raise
    // PercyContextLost (not silently continue). captureCorsIframes then
    // breaks out of the outer sibling loop, preserving any partial capture
    // already collected at depth 1.
    it('parentFrame failure at depth=1 raises PercyContextLost and preserves partial capture', async () => {
      const warnings = [];
      const log = { debug: () => {}, info: () => {}, warn: (m) => warnings.push(m) };
      // Reuse the in-test buildFrameTreeBrowser by replicating its shape
      // inline so we don't depend on closures from another describe block.
      const stack = ['main'];
      const frames = {
        main: {
          url: 'http://localhost:3001',
          domSnapshot: { html: '<html></html>' },
          iframes: [
            { src: 'http://localhost:3002/x', percyElementId: 'p-x', frame: 'x' },
            { src: 'http://localhost:3004/sibling', percyElementId: 'p-sib', frame: 'sib' }
          ]
        },
        x: { url: 'http://localhost:3002/x', snapshot: { html: '<html>x</html>', resources: [] }, iframes: [] },
        sib: { url: 'http://localhost:3004/sibling', snapshot: { html: '<html>sib</html>', resources: [] } }
      };
      const browser = {
        execute(fn, args, cb) {
          const source = typeof fn === 'string' ? fn : fn.toString();
          const current = stack[stack.length - 1];
          const frame = frames[current] || {};
          if (typeof fn === 'string') return cb({ value: null });
          if (current === 'main' && source.includes('domSnapshot:')) {
            return cb({ value: { domSnapshot: frame.domSnapshot, url: frame.url } });
          }
          if (source.includes('PercyDOM.serialize')) {
            return cb({ value: { snapshot: frame.snapshot, frameUrl: frame.url } });
          }
          if (source.includes('querySelectorAll')) {
            return cb({
              value: (frame.iframes || []).map((f, i) => ({
                src: f.src,
                srcdoc: null,
                percyElementId: f.percyElementId,
                dataPercyIgnore: false,
                matchesIgnoreSelector: false,
                index: i
              }))
            });
          }
          if (source.includes('querySelector')) {
            const target = (frame.iframes || []).find(f => f.percyElementId === args[0]);
            return cb({ value: target ? { __frame: target.frame } : null });
          }
          cb({ value: null });
        },
        frame(target, cb) {
          if (target === null) {
            stack.length = 0;
            stack.push('main');
          } else if (target && target.__frame) {
            stack.push(target.__frame);
          }
          cb({ value: null });
        },
        frameParent(cb) {
          // Always fail — covers the depth=1 case where, with the old
          // depth-guarded branch, the error would have been silently
          // swallowed and sibling iteration would have continued against a
          // stale top-document context.
          cb({ status: 1, error: new Error('frameParent unsupported') });
        },
        getCookies(cb) { cb({ value: [] }); }
      };

      const utils = { percy: { config: { snapshot: {} } } };
      const result = await captureSerializedDOM(browser, {}, utils, 'window.PercyDOM = {};', log);

      // Partial capture (x at depth 1) is preserved; sib is NOT captured
      // because the outer loop bails on PercyContextLost.
      expect(result.domSnapshot.corsIframes).toBeDefined();
      expect(result.domSnapshot.corsIframes.map(f => f.frameUrl)).toEqual([
        'http://localhost:3002/x'
      ]);
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Aborting further nested CORS capture due to lost frame context')
        ])
      );
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
