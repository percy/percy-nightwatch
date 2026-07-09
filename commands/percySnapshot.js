// Collect client and environment information
const sdkPkg = require('../package.json');
const nightwatchPkg = require('nightwatch/package.json');
const { captureDOM, waitForReady } = require('../lib/snapshot');
const { createRegion } = require('../lib/regions');
const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${nightwatchPkg.name}/${nightwatchPkg.version}`;
const NOT_RUNNING_ERROR = 'Percy is not running, disabling snapshots.';
const AUTOMATE_ERROR = 'Invalid function call - percySnapshot(). Please use percyScreenshot() function while using Percy with Automate. For more information on usage of percyScreenshot, refer https://www.browserstack.com/docs/percy/integrate/functional-and-visual';

// Take a DOM snapshot and post it to the snapshot endpoint
function injectPercyDOM(browser, domScript) {
  return new Promise((resolve, reject) => {
    browser.execute(domScript, [], (result) => {
      if (result && result.status && result.status !== 0 && result.error) {
        return reject(result.error);
      }
      resolve();
    });
  });
}

module.exports = class PercySnapshotCommand {
  async command(name, options = {}) {
    let utils = await import('@percy/sdk-utils');
    name = name || this.api.currentTest.name;
    let log = utils.logger('nightwatch');

    if (!(await utils.isPercyEnabled())) {
      if (process.env.PERCY_RAISE_ERROR === 'true') {
        throw new Error(NOT_RUNNING_ERROR);
      }
      return;
    }

    if (utils.percy?.type === 'automate') {
      throw new Error(AUTOMATE_ERROR);
    }

    try {
      let domScript = await utils.fetchPercyDOM();

      // Inject the DOM serialization script
      await injectPercyDOM(this.api, domScript);

      // Readiness gate — runs before serialize when CLI supports it.
      const readinessDiagnostics = await waitForReady(this.api, options, utils, log);

      // Serialize and capture the DOM. Merge .percy.yml config with per-snapshot
      // options (per-call wins) before handing them to serialize.
      // domScript + log are threaded through so concurrent percySnapshot calls
      // (parallel workers in the same Node process) don't race on shared
      // module-level state.
      const mergedOptions = utils.mergeSnapshotOptions(options);
      let { domSnapshot, url } = await captureDOM(this.api, mergedOptions, utils, domScript, log);

      // Attach readiness diagnostics so the CLI can log timing and pass/fail
      if (readinessDiagnostics && domSnapshot && typeof domSnapshot === 'object' && !Array.isArray(domSnapshot)) {
        domSnapshot.readiness_diagnostics = readinessDiagnostics;
      }

      // Filter out DOM-only serialization options that shouldn't be posted to Percy
      const {
        ignoreCanvasSerializationErrors,
        ignoreStyleSheetSerializationErrors,
        ...snapshotOptions
      } = options;

      // Sanitize caller-supplied options before spreading them into the outbound
      // POST body (CWE-284/CWE-1321 — PER-8722): drop prototype-pollution keys
      // and code-bearing fields the SDK must never forward. clientInfo /
      // environmentInfo are hard-coded AFTER the spread so callers can't override.
      const BLOCKED_OPTION_KEYS = new Set([
        '__proto__', 'constructor', 'prototype', 'execute', 'domTransformation'
      ]);
      const safeOptions = {};
      for (const key of Object.keys(snapshotOptions)) {
        if (BLOCKED_OPTION_KEYS.has(key)) {
          log.debug?.(`Ignoring disallowed percySnapshot option: ${key}`);
          continue;
        }
        safeOptions[key] = snapshotOptions[key];
      }

      const postData = {
        ...safeOptions,
        domSnapshot,
        environmentInfo: ENV_INFO,
        clientInfo: CLIENT_INFO,
        name,
        url
      };

      // Post the DOM to the snapshot endpoint with snapshot options and other info
      await utils.postSnapshot(postData);
    } catch (error) {
      // Handle errors
      log.error(`Could not take DOM snapshot "${name}"`);
      log.error(error);

      if (process.env.PERCY_RAISE_ERROR === 'true') {
        throw error;
      }
    }
  }
};

module.exports.createRegion = createRegion;
module.exports.path = __dirname;
