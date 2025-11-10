const CS_MAX_SCREENSHOT_LIMIT = 25000;
const SCROLL_DEFAULT_SLEEP_TIME = 0.45; // 450ms

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

function convertToPercyDOMOptions(options) {
  const converted = { ...options };
  const mappings = {
    enableJavaScript: 'enable_javascript',
    domTransformation: 'dom_transformation',
    stringifyResponse: 'stringify_response',
    disableShadowDOM: 'disable_shadow_dom',
    reshuffleInvalidTags: 'reshuffle_invalid_tags',
    ignoreCanvasSerializationErrors: 'ignore_canvas_serialization_errors',
    ignoreStyleSheetSerializationErrors: 'ignore_style_sheet_serialization_errors'
  };
  Object.keys(mappings).forEach(camelKey => {
    if (camelKey in converted) {
      converted[mappings[camelKey]] = converted[camelKey];
      delete converted[camelKey];
    }
  });
  return converted;
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

async function captureSerializedDOM(browser, options = {}, utils) {
  let serializeOptions = {
    ...options,
    ignoreCanvasSerializationErrors: ignoreCanvasSerializationErrors(options, utils),
    ignoreStyleSheetSerializationErrors: ignoreStyleSheetSerializationErrors(options, utils)
  };

  // Convert camelCase options to snake_case for PercyDOM.serialize()
  serializeOptions = convertToPercyDOMOptions(serializeOptions);

  let { domSnapshot, url } = await executeScript(browser, function(opts) {
    return {
      /* eslint-disable-next-line no-undef */
      domSnapshot: PercyDOM.serialize(opts),
      url: document.URL
    };
  }, [serializeOptions]);

  if (!domSnapshot) domSnapshot = {};
  domSnapshot.cookies = await getCookies(browser);

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
  if (domScript) await executeScript(browser, domScript);
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

async function captureResponsiveDOM(browser, options, utils, log, domScript) {
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

    let { domSnapshot, url } = await captureSerializedDOM(browser, options, utils);
    domSnapshot.width = width;
    domSnapshots.push(domSnapshot);
    lastURL = url;
  }

  await changeWindowDimensionAndWait(browser, originalWidth, originalHeight, resizeCount + 1, log);
  return { domSnapshot: domSnapshots, url: lastURL };
}

async function captureDOM(browser, options = {}, utils, log, domScript) {
  const responsiveEnabled = isResponsiveOptionEnabled(options, utils);
  if (responsiveEnabled) {
    return await captureResponsiveDOM(browser, options, utils, log, domScript);
  }

  return await captureSerializedDOM(browser, options, utils);
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
  slowScrollToBottom,
  ignoreCanvasSerializationErrors,
  ignoreStyleSheetSerializationErrors
};
