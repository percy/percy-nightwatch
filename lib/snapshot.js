const {
  DEFAULT_MAX_FRAME_DEPTH,
  isUnsupportedIframeSrc,
  clampFrameDepth,
  normalizeIgnoreSelectors
} = require('../_iframe_shim');

const CS_MAX_SCREENSHOT_LIMIT = 25000;
const SCROLL_DEFAULT_SLEEP_TIME = 0.45; // 450ms

// Kept for backward compatibility with callers that previously pinned a
// module-scope domScript + log. The new code threads both through ctx /
// function arguments so two concurrent percySnapshot calls cannot race on
// shared module state. This function is a no-op.
function setSnapshotContext(/* script, logger */) {
  // Intentionally empty — context now flows through ctx.
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function ignoreCanvasSerializationErrors(options = {}, utils) {
  return options?.ignoreCanvasSerializationErrors ??
    utils?.percy?.config?.snapshot?.ignoreCanvasSerializationErrors ??
    false;
}

function ignoreStyleSheetSerializationErrors(options = {}, utils) {
  return options?.ignoreStyleSheetSerializationErrors ??
    utils?.percy?.config?.snapshot?.ignoreStyleSheetSerializationErrors ??
    false;
}

function unwrapResult(result) {
  if (!result) return result;
  if (typeof result === 'object' && 'value' in result && result.value !== undefined) {
    return result.value;
  }
  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function executeScript(browser, fn, args = []) {
  return new Promise((resolve, reject) => {
    try {
      browser.execute(fn, args, result => {
        let value = unwrapResult(result);
        if (result && result.status && result.status !== 0 && result.error) {
          return reject(result.error);
        }
        resolve(value);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function executeAsyncScript(browser, fn, args = []) {
  return new Promise((resolve, reject) => {
    try {
      const cb = result => {
        let value = unwrapResult(result);
        if (result && result.status && result.status !== 0 && result.error) {
          return reject(result.error);
        }
        resolve(value);
      };

      if (typeof browser.executeAsync === 'function') {
        browser.executeAsync(fn, args, cb);
      } else if (typeof browser.executeAsyncScript === 'function') {
        browser.executeAsyncScript(fn, args, cb);
      } else {
        resolve(undefined);
      }
    } catch (error) {
      reject(error);
    }
  });
}

// Readiness gate. Runs *before* serialize when CLI exposes
// PercyDOM.waitForReady. Falls back silently on older CLI builds and never
// blocks snapshot capture. Uses sdk-utils.waitForReadyScript({ callback: true })
// as the shared in-browser invoker — uses `arguments[arguments.length - 1]`
// for the executeAsync done callback.
async function waitForReady(browser, options = {}, utils, log) {
  // All readiness orchestration (disabled check + shallow-merge config +
  // callback-mode script generation + try/catch) lives in @percy/sdk-utils
  // 1.31.15+ as runReadinessGate. Degrade to no-op when the helper is
  // absent — same behaviour as an old CLI without PercyDOM.waitForReady.
  if (typeof utils?.runReadinessGate !== 'function') return undefined;
  const result = await utils.runReadinessGate(
    (script) => executeAsyncScript(browser, script),
    options,
    { callback: true, log }
  );
  // sdk-utils returns null on no-op / failure; nightwatch's contract is
  // `undefined`, so normalise.
  return result == null ? undefined : result;
}

function getCookies(browser) {
  if (typeof browser.getCookies !== 'function') return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    try {
      browser.getCookies(result => {
        if (result && result.status && result.status !== 0 && result.error) {
          return reject(result.error);
        }
        resolve(Array.isArray(result?.value) ? result.value : (result?.value || []));
      });
    } catch (error) {
      reject(error);
    }
  }).catch(() => []);
}

function resolveMaxFrameDepth(options = {}, utils) {
  return clampFrameDepth(
    options.maxIframeDepth ??
    utils?.percy?.config?.snapshot?.maxIframeDepth ??
    DEFAULT_MAX_FRAME_DEPTH
  );
}

function resolveIgnoreSelectors(options = {}, utils) {
  return normalizeIgnoreSelectors(
    options.ignoreIframeSelectors ??
    utils?.percy?.config?.snapshot?.ignoreIframeSelectors ??
    []
  );
}

// In-browser script that walks document.querySelectorAll('iframe') and
// returns metadata for each. Defined as a function reference so the two
// call sites (top-level enumeration in captureCorsIframes and per-frame
// recursion in processFrameTree) share one body.
function enumerateIframesScript(selectors) {
  let iframes = document.querySelectorAll('iframe');
  let result = [];
  for (let i = 0; i < iframes.length; i++) {
    let frame = iframes[i];
    let matchesIgnore = false;
    if (selectors && selectors.length) {
      for (let j = 0; j < selectors.length; j++) {
        try { if (frame.matches(selectors[j])) { matchesIgnore = true; break; } } catch (e) { /* invalid selector — ignore */ }
      }
    }
    result.push({
      src: frame.src || '',
      srcdoc: frame.getAttribute('srcdoc'),
      percyElementId: frame.getAttribute('data-percy-element-id'),
      dataPercyIgnore: frame.hasAttribute('data-percy-ignore'),
      matchesIgnoreSelector: matchesIgnore,
      index: i
    });
  }
  return result;
}

function shouldSkipIframe(iframe, currentOrigin, log) {
  if (iframe.dataPercyIgnore) {
    log?.debug?.(`Skipping iframe marked with data-percy-ignore: ${iframe.src || '(no src)'}`);
    return true;
  }
  if (iframe.matchesIgnoreSelector) {
    log?.debug?.(`Skipping iframe matching ignoreIframeSelectors: ${iframe.src || '(no src)'}`);
    return true;
  }
  if (!iframe.src || isUnsupportedIframeSrc(iframe.src)) {
    if (iframe.src) log?.debug?.(`Skipping unsupported iframe src: ${iframe.src}`);
    return true;
  }
  if (iframe.srcdoc) {
    log?.debug?.(`Skipping srcdoc iframe at index ${iframe.index}`);
    return true;
  }
  let frameOrigin = getOrigin(iframe.src);
  if (!frameOrigin) {
    log?.debug?.(`Skipping iframe with invalid URL: ${iframe.src}`);
    return true;
  }
  if (frameOrigin === currentOrigin) {
    log?.debug?.(`Skipping same-origin iframe: ${iframe.src}`);
    return true;
  }
  if (!iframe.percyElementId) {
    log?.debug?.(`Skipping cross-origin iframe without data-percy-element-id: ${iframe.src}`);
    return true;
  }
  return false;
}

// Switch into the given iframe element from the current frame context, capture
// its DOM, then recurse into any cross-origin iframes nested inside it. Restores
// the parent context on exit. Bounded by maxFrameDepth to prevent runaway
// recursion when pages link to each other in cycles. `ancestorUrls` tracks the
// chain of frame URLs above this one — if the current frame's URL appears in
// the chain, we treat it as a cycle and stop descending (still capturing the
// current frame once).
async function processFrameTree(browser, iframe, depth, ancestorUrls, ctx) {
  const { maxFrameDepth, ignoreSelectors, serializeOptions, domScript, log } = ctx;
  if (depth > maxFrameDepth) {
    log?.debug?.(`Reached max iframe nesting depth (${maxFrameDepth}); stopping at ${iframe.src}`);
    return [];
  }
  if (ancestorUrls && ancestorUrls.has(iframe.src)) {
    log?.debug?.(`Skipping cyclic iframe (${iframe.src} appears in ancestor chain)`);
    return [];
  }

  const collected = [];
  let switchedIn = false;
  let capturedError = null;

  try {
    log?.debug?.(`Processing cross-origin iframe (depth ${depth}): ${iframe.src}`);

    // Switch to the iframe by its data-percy-element-id attribute instead of numeric
    // index, which avoids drift if the DOM changes between enumeration and switch.
    // CSS.escape() neutralises any quote/backslash characters that could otherwise
    // break out of the attribute selector — defence in depth, since the id is
    // SDK-generated.
    let iframeElement = await executeScript(browser, function(percyId) {
      var safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(percyId) : String(percyId).replace(/["\\]/g, '\\$&');
      return document.querySelector('iframe[data-percy-element-id="' + safeId + '"]');
    }, [iframe.percyElementId]);

    if (!iframeElement) {
      log?.warn?.(`Could not find iframe element with data-percy-element-id: ${iframe.percyElementId}`);
      return [];
    }

    await promisifyBrowserCommand(browser, 'frame', iframeElement);
    switchedIn = true;

    // Inject PercyDOM into the frame
    if (domScript) {
      await executeScript(browser, domScript);
      log?.debug?.(`Injected PercyDOM into frame: ${iframe.src}`);
    }

    // Serialize the frame's DOM; enableJavaScript is intentionally forced to true
    // to prevent the standard iframe serialization logic from running, since we
    // handle cross-origin iframe serialization manually here
    let frameResult = await executeScript(browser, function(opts) {
      return {
        /* eslint-disable-next-line no-undef */
        snapshot: PercyDOM.serialize(opts),
        frameUrl: document.URL
      };
    }, [{ ...serializeOptions, enableJavaScript: true }]);

    if (!frameResult || !frameResult.snapshot) {
      log?.warn?.(`Serialization returned empty result for frame: ${iframe.src}`);
      return [];
    }

    log?.debug?.(`Captured cross-origin iframe (depth ${depth}): ${frameResult.frameUrl}`);

    collected.push({
      frameUrl: frameResult.frameUrl,
      iframeData: { percyElementId: iframe.percyElementId },
      iframeSnapshot: frameResult.snapshot
    });

    // Look for cross-origin iframes nested inside this frame and recurse into them.
    // Same-origin descendants are already inlined as srcdoc by PercyDOM.serialize above.
    if (depth < maxFrameDepth) {
      let currentOrigin = getOrigin(frameResult.frameUrl);
      let childIframesRaw = await executeScript(browser, enumerateIframesScript, [ignoreSelectors]);
      let childIframes = Array.isArray(childIframesRaw) ? childIframesRaw : [];
      let nextAncestors = new Set(ancestorUrls || []);
      nextAncestors.add(frameResult.frameUrl);
      nextAncestors.add(iframe.src);
      for (let child of childIframes) {
        if (shouldSkipIframe(child, currentOrigin, log)) continue;
        let nested = await processFrameTree(browser, child, depth + 1, nextAncestors, ctx);
        if (nested.length) collected.push(...nested);
      }
    }

    return collected;
  } catch (error) {
    if (error && error.percyContextLost) {
      // Merge any partial capture from the inner level into ours before propagating
      if (Array.isArray(error.partialCapture) && error.partialCapture.length) {
        collected.push(...error.partialCapture);
        error.partialCapture = collected;
      } else {
        error.partialCapture = collected;
      }
      throw error;
    }
    log?.warn?.(`Failed to process cross-origin iframe ${iframe.src}: ${error.message}`);
    capturedError = error;
    return collected;
  } finally {
    if (switchedIn) {
      // Step up exactly one level so an outer recursion can continue from its
      // own context. If parentFrame fails we have no reliable way to land in
      // the correct parent — fall back to top and signal the caller to stop
      // iterating siblings (whose enumeration was performed in a now-lost
      // context). Without this signal, sibling lookups would silently match
      // against the top document and produce wrong percyElementId resolutions.
      try {
        await promisifyBrowserCommand(browser, 'frameParent');
      } catch (e) {
        log?.warn?.(`Failed to switch back to parent frame: ${e.message}`);
        try { await promisifyBrowserCommand(browser, 'frame', null); } catch (_) {}
        // Always raise percyContextLost regardless of depth: even at depth 1
        // the fallback `frame(null)` leaves us at the top document, so the
        // caller's pending sibling enumeration was performed in a now-stale
        // context and must be aborted. Carry partial capture so the outer
        // caller can keep what was already serialized successfully.
        const err = new Error(`Lost parent frame context: ${e.message}`);
        err.percyContextLost = true;
        err.partialCapture = collected;
        // Preserve the original error so it isn't swallowed by this throw
        if (capturedError) err.cause = capturedError;
        // eslint-disable-next-line no-unsafe-finally
        throw err;
      }
    }
  }
}

async function captureCorsIframes(browser, pageUrl, ctx) {
  const { ignoreSelectors, log } = ctx;
  try {
    let iframeInfoRaw = await executeScript(browser, enumerateIframesScript, [ignoreSelectors]);
    let iframeInfo = Array.isArray(iframeInfoRaw) ? iframeInfoRaw : [];
    if (!iframeInfo.length) return [];

    log?.debug?.(`Found ${iframeInfo.length} top-level iframe(s)`);

    let pageOrigin = getOrigin(pageUrl);
    let corsIframes = [];
    let skippedCount = 0;

    for (let iframe of iframeInfo) {
      if (shouldSkipIframe(iframe, pageOrigin, log)) {
        skippedCount++;
        continue;
      }
      let entries;
      try {
        entries = await processFrameTree(browser, iframe, 1, new Set([pageUrl]), ctx);
      } catch (error) {
        if (error && error.percyContextLost) {
          log?.warn?.('Aborting further nested CORS capture due to lost frame context');
          if (Array.isArray(error.partialCapture) && error.partialCapture.length) {
            corsIframes.push(...error.partialCapture);
          }
          break;
        }
        throw error;
      }
      if (entries && entries.length) corsIframes.push(...entries);
    }

    log?.debug?.(`Captured ${corsIframes.length} cross-origin iframe(s) (top-level skipped: ${skippedCount})`);

    return corsIframes;
  } catch (error) {
    log?.warn?.(`Error capturing CORS iframes: ${error.message}`);
    return [];
  }
}

async function captureSerializedDOM(browser, options = {}, utils, domScript = null, log = null) {
  const serializeOptions = {
    ...options,
    ignoreCanvasSerializationErrors: ignoreCanvasSerializationErrors(options, utils),
    ignoreStyleSheetSerializationErrors: ignoreStyleSheetSerializationErrors(options, utils)
  };

  let { domSnapshot, url } = await executeScript(browser, function(opts) {
    return {
      /* eslint-disable-next-line no-undef */
      domSnapshot: PercyDOM.serialize(opts),
      url: document.URL
    };
  }, [serializeOptions]);

  if (!domSnapshot) domSnapshot = {};
  domSnapshot.cookies = await getCookies(browser);

  // Capture cross-origin iframes. ctx carries the per-call domScript + log so
  // concurrent percySnapshot invocations don't race on shared module state.
  const ctx = {
    maxFrameDepth: resolveMaxFrameDepth(options, utils),
    ignoreSelectors: resolveIgnoreSelectors(options, utils),
    serializeOptions,
    domScript,
    log
  };
  let corsIframes = await captureCorsIframes(browser, url, ctx);
  if (corsIframes.length > 0) {
    domSnapshot.corsIframes = corsIframes;
  }

  return { domSnapshot, url };
}

function isResponsiveOptionEnabled(options = {}, utils) {
  if (utils?.percy?.config?.percy?.deferUploads) return false;

  if (Object.prototype.hasOwnProperty.call(options, 'responsiveSnapshotCapture')) {
    return Boolean(options.responsiveSnapshotCapture);
  }

  if (Object.prototype.hasOwnProperty.call(options, 'responsive_snapshot_capture')) {
    return Boolean(options.responsive_snapshot_capture);
  }

  return Boolean(utils?.percy?.config?.snapshot?.responsiveSnapshotCapture);
}

function getWidthsForMultiDOM(userPassedWidths = [], eligibleWidths = {}) {
  let widths = [];

  if (eligibleWidths?.mobile?.length) widths = widths.concat(eligibleWidths.mobile);

  if (userPassedWidths.length) {
    widths = widths.concat(userPassedWidths);
  } else if (eligibleWidths?.config?.length) {
    widths = widths.concat(eligibleWidths.config);
  } else if (Array.isArray(eligibleWidths)) {
    widths = widths.concat(eligibleWidths);
  }

  return [...new Set(widths)].filter(width => !!width);
}

function promisifyBrowserCommand(browser, command, ...args) {
  if (typeof browser[command] !== 'function') return Promise.resolve();

  return new Promise((resolve, reject) => {
    try {
      browser[command](...args, result => {
        if (result && result.status && result.status !== 0 && result.error) {
          return reject(result.error);
        }
        resolve(unwrapResult(result));
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function getWindowRect(browser) {
  let rect = await executeScript(browser, function() {
    return { width: window.innerWidth, height: window.innerHeight };
  }) || {};

  if (typeof rect.width !== 'number' || Number.isNaN(rect.width)) rect.width = 1280;
  if (typeof rect.height !== 'number' || Number.isNaN(rect.height)) rect.height = 720;
  return rect;
}

async function setWindowRect(browser, { width, height }) {
  const rect = { width, height };
  if (typeof browser.setWindowRect === 'function') {
    return await promisifyBrowserCommand(browser, 'setWindowRect', rect);
  }

  if (typeof browser.setWindowSize === 'function') {
    return await promisifyBrowserCommand(browser, 'setWindowSize', width, height);
  }

  if (typeof browser.resizeWindow === 'function') {
    return await promisifyBrowserCommand(browser, 'resizeWindow', width, height);
  }

  return await executeScript(browser, function(dimensions) {
    window.resizeTo(dimensions.width, dimensions.height);
  }, [rect]);
}

async function waitForCondition(condition, { timeout = 1000, interval = 100 } = {}) {
  const end = Date.now() + timeout;

  while (Date.now() < end) {
    if (await condition()) return true;
    await sleep(interval);
  }

  return await condition();
}

async function waitForResizeEvent(browser, resizeCount) {
  await waitForCondition(async () => {
    /* istanbul ignore next */
    const current = await executeScript(browser, function() {
      return window.resizeCount;
    });
    return current === resizeCount;
  }).catch(() => {});
}

async function sendCDPResize(browser, width, height) {
  const driver = browser?.driver || browser?.transport?.driver;
  if (!driver || typeof driver.sendDevToolsCommand !== 'function') return false;

  await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
    height,
    width,
    deviceScaleFactor: 1,
    mobile: false
  });
  return true;
}

async function changeWindowDimensionAndWait(browser, width, height, resizeCount, log) {
  if (typeof width !== 'number' || Number.isNaN(width)) return;
  if (typeof height !== 'number' || Number.isNaN(height)) {
    ({ height } = await getWindowRect(browser));
  }
  try {
    const caps = browser?.options?.capabilities || browser?.options?.desiredCapabilities;
    const browserName = caps?.browserName || caps?.browser || '';
    let usedCDP = false;

    if (
      typeof process !== 'undefined' &&
      process.env.PERCY_DISABLE_CDP_RESIZE !== 'true' &&
      browserName.toLowerCase() === 'chrome'
    ) {
      try {
        usedCDP = await sendCDPResize(browser, width, height);
      } catch (error) {
        log?.debug?.(`Resizing using CDP failed for width ${width}`, error);
      }
    }

    if (!usedCDP) {
      await setWindowRect(browser, { width, height });
    }
  } catch (error) {
    log?.debug?.(`Resizing window failed for width ${width}`, error);
  }

  try {
    await waitForResizeEvent(browser, resizeCount);
  } catch (error) {
    log?.debug?.(`Timed out waiting for window resize event for width ${width}`, error);
  }
}

async function maybeReloadPage(browser, domScript) {
  if (!process.env.PERCY_RESPONSIVE_CAPTURE_RELOAD_PAGE) return false;
  await promisifyBrowserCommand(browser, 'refresh');
  // Guard: if a consumer imported captureDOM directly (bypassing percySnapshot)
  // domScript may be null. Skipping the re-injection is safe — the page reload
  // will only matter when PercyDOM is also pinned.
  if (domScript) {
    await executeScript(browser, domScript);
  }
  return true;
}

async function maybeSleepForResponsiveCapture() {
  if (!process.env.RESPONSIVE_CAPTURE_SLEEP_TIME) return;
  const sleepTime = parseFloat(process.env.RESPONSIVE_CAPTURE_SLEEP_TIME);
  if (!Number.isFinite(sleepTime)) return;
  await sleep(sleepTime * 1000);
}

async function maybeScrollForLazyLoad(browser) {
  if (!process.env.PERCY_ENABLE_LAZY_LOADING_SCROLL) return;
  await slowScrollToBottom(browser);
}

async function getResponsiveHeight(browser, currentHeight, utils) {
  if (!process.env.PERCY_RESPONSIVE_CAPTURE_MIN_HEIGHT) return currentHeight;
  const minHeight = utils?.percy?.config?.snapshot?.minHeight || currentHeight;
  return await executeScript(browser, function(height) {
    return window.outerHeight - window.innerHeight + height;
  }, [minHeight]);
}

async function captureResponsiveDOM(browser, options, utils, domScript = null, log = null) {
  const widths = getWidthsForMultiDOM(options.widths || [], utils?.percy?.widths || {});
  const domSnapshots = [];
  const { width: originalWidth, height: originalHeight } = await getWindowRect(browser);
  let lastWindowWidth = originalWidth;
  let resizeCount = 0;

  log?.info?.('Responsive snapshot capture enabled');
  await executeScript(browser, function() {
    /* eslint-disable-next-line no-undef */
    PercyDOM.waitForResize();
  });

  const height = await getResponsiveHeight(browser, originalHeight, utils);
  const responsiveWidths = widths.length ? widths : [originalWidth];
  let lastURL;

  for (let width of responsiveWidths) {
    if (lastWindowWidth !== width) {
      resizeCount += 1;
      await changeWindowDimensionAndWait(browser, width, height, resizeCount, log);
      lastWindowWidth = width;
    }

    log?.info?.(`Capturing responsive snapshot at width ${width}px`);
    const reloaded = await maybeReloadPage(browser, domScript);
    if (reloaded) {
      await executeScript(browser, function() {
        /* eslint-disable-next-line no-undef */
        PercyDOM.waitForResize();
      });
    }
    await maybeSleepForResponsiveCapture();
    await maybeScrollForLazyLoad(browser);

    let { domSnapshot, url } = await captureSerializedDOM(browser, options, utils, domScript, log);
    domSnapshot.width = width;
    domSnapshots.push(domSnapshot);
    lastURL = url;
  }

  await changeWindowDimensionAndWait(browser, originalWidth, originalHeight, resizeCount + 1, log);
  return { domSnapshot: domSnapshots, url: lastURL };
}

async function captureDOM(browser, options = {}, utils, domScript = null, log = null) {
  const responsiveEnabled = isResponsiveOptionEnabled(options, utils);
  if (responsiveEnabled) {
    return await captureResponsiveDOM(browser, options, utils, domScript, log);
  }

  return await captureSerializedDOM(browser, options, utils, domScript, log);
}

async function slowScrollToBottom(browser, scrollSleep = SCROLL_DEFAULT_SLEEP_TIME) {
  if (process.env.PERCY_LAZY_LOAD_SCROLL_TIME) {
    scrollSleep = parseFloat(process.env.PERCY_LAZY_LOAD_SCROLL_TIME);
  }

  const scrollHeightCommand = function() {
    return Math.max(
      document.body.scrollHeight,
      document.body.clientHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.clientHeight,
      document.documentElement.offsetHeight
    );
  };

  let scrollHeight = Math.min(await executeScript(browser, scrollHeightCommand), CS_MAX_SCREENSHOT_LIMIT);
  const clientHeight = await executeScript(browser, function() {
    return document.documentElement.clientHeight;
  });
  let current = 0;
  let page = 1;

  while (scrollHeight > current && current < CS_MAX_SCREENSHOT_LIMIT) {
    current = clientHeight * page;
    page += 1;
    await executeScript(browser, function(position) {
      window.scrollTo(0, position);
    }, [current]);
    await sleep(scrollSleep * 1000);
    scrollHeight = await executeScript(browser, scrollHeightCommand);
  }

  if (process.env.BYPASS_SCROLL_TO_TOP !== 'true') {
    await executeScript(browser, function() {
      window.scrollTo(0, 0);
    });
  }

  let sleepAfterScroll = 1;
  if (process.env.PERCY_SLEEP_AFTER_LAZY_LOAD_COMPLETE) {
    sleepAfterScroll = parseFloat(process.env.PERCY_SLEEP_AFTER_LAZY_LOAD_COMPLETE);
  }

  await sleep(sleepAfterScroll * 1000);
}

module.exports = {
  captureSerializedDOM,
  captureDOM,
  setSnapshotContext,
  slowScrollToBottom,
  ignoreCanvasSerializationErrors,
  ignoreStyleSheetSerializationErrors,
  isUnsupportedIframeSrc,
  getOrigin,
  captureCorsIframes,
  waitForReady
};
