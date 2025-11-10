# Nightwatch SDK Modernization TODOs

This checklist maps the parity gaps from `docs/nightwatch-parity.md` into engineering tasks. Each section should close out before publishing a new `@percy/nightwatch` release.

## 1. Core Command Refactor

- [x] Extract a reusable module (e.g., `lib/snapshot.js`) to host shared helpers (`captureDOM`, `captureResponsiveDOM`, env parsing) similar to `percy-selenium-js/index.js`.
- [x] Update `commands/percySnapshot.js` to delegate to the shared helpers while preserving Nightwatch’s command signature (`browser.percySnapshot(name?, options?)`).
- [x] Guard `percySnapshot` when `utils.percy.type === 'automate'` by throwing the same error message as Selenium.
- [x] Respect `process.env.PERCY_RAISE_ERROR === 'true'` by rethrowing snapshot failures and failed healthchecks.

## 2. Responsive Snapshot Capture

- [x] Implement `getWidthsForMultiDOM()` logic that merges user-provided widths with Percy config widths (desktop + mobile) while deduplicating.
- [x] Introduce `captureResponsiveDOM()` that:
  - [x] Calls `PercyDOM.waitForResize()` once per session.
  - [x] Resizes via CDP (`driver.sendDevToolsCommand`) when available, otherwise falls back to `window().setRect`.
  - [x] Honors `PERCY_RESPONSIVE_CAPTURE_MIN_HEIGHT`, `PERCY_RESPONSIVE_CAPTURE_RELOAD_PAGE`, `RESPONSIVE_CAPTURE_SLEEP_TIME`, and `PERCY_ENABLE_LAZY_LOADING_SCROLL`.
  - [x] Resets the window size after iterating through widths.
- [x] Ensure single-width snapshots still flow through a new `captureSerializedDOM()` helper for feature parity.

## 3. DOM Serialization Options

- [x] Mirror Selenium’s `ignoreCanvasSerializationErrors` and `ignoreStyleSheetSerializationErrors` option handling with fallback to Percy config defaults.
- [x] Attach cookies (`browser.getCookies()` equivalent in Nightwatch) to the serialized DOM payload to keep Percy builds deterministic.

## 4. Lazy Loading Support

- [x] Port `slowScrollToBottom()` (and env-driven timings) to a shared helper and call it when `PERCY_ENABLE_LAZY_LOADING_SCROLL` is set.

## 5. Region Utilities & Export Surface

- [x] Export `createRegion()` from the Nightwatch package root so consuming tests can build advanced `regions` entries.
- [x] Expand TypeScript definitions to include the helper plus new snapshot options.

## 6. Percy Automate Support

- [ ] Add `percyScreenshot()` command/function that works with Nightwatch’s `browser` object (or underlying Selenium driver) for BrowserStack Automate.
- [ ] Port `DriverMetadata`, `Cache`, and request-wrapping utilities required to talk to Percy’s Automate screenshot endpoint.
- [ ] Convert region selector options (`ignoreRegionSeleniumElements`, `considerRegionSeleniumElements`, etc.) into element IDs before sending to Percy, just like Selenium.

## 7. Testing & Tooling

- [ ] Backfill unit coverage mirroring the Selenium Jasmine suite (responsive widths, env toggles, helper utilities, lazy scroll, cache).
- [x] Keep the existing Nightwatch integration test to cover the command wiring, but add targeted Jest/Mocha tests for new modules to reduce dependency on a live Nightwatch run.
- [ ] Add type tests (via `tsd`) for the new type declarations.
- [x] Update `package.json` scripts if additional test commands or lint targets are introduced.

## 8. Documentation & Release Prep

- [x] Update `README.md` with instructions for the new options, Automate usage, and helper exports.
- [x] Document required environment variables and their behavior (responsive capture, lazy load, Automate).
- [ ] Draft release notes summarizing the parity work once implementation stabilizes.

> As features land, convert each `[ ]` into `[x]` and reference pull requests or commit hashes to keep the audit trail.
