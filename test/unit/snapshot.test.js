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
            return cb({ value: (frame.iframes || []).map((f, i) => ({
              src: f.src, srcdoc: f.srcdoc || null, percyElementId: f.percyElementId, index: i
            })) });
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
