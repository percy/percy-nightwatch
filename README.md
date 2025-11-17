# @percy/nightwatch

[![Version](https://img.shields.io/npm/v/@percy/nightwatch.svg)](https://www.npmjs.com/package/@percy/nightwatch)
![Test](https://github.com/percy/percy-nightwatch/workflows/Test/badge.svg)

[Percy](https://percy.io) visual testing for [Nightwatch.js](http://nightwatchjs.org).

## Installation

```sh-session
$ npm install --save-dev @percy/cli @percy/nightwatch
```

### Nightwatch configuration

Add the path exported by `@percy/nightwatch` to your Nightwatch configuration's
`custom_commands_path` property.

```javascript
const percy = require('@percy/nightwatch');

module.exports = {
  // ...
  custom_commands_path: [percy.path],
  // ...
};
```

## Usage

This is an example test using the `browser.percySnapshot()` command. For other examples of how to
write Nightwatch tests, check out [the official Nightwatch
guides](https://nightwatchjs.org/guide/using-nightwatch/writing-tests.html).

```javascript
module.exports = {
  "Snapshots pages": function (browser) {
    browser.url("http://example.com").assert.containsText("h1", "Example Domain").percySnapshot("Example snapshot");
    browser.url("http://google.com").assert.elementPresent('img[alt="Google"]').percySnapshot("Google homepage");
    browser.end();
  },
};
```

Running the test above directly will result in the following logs:

```sh-session
$ nightwatch

[Example] Test Suite
====================
...

Running:  Snapshots pages

✔ Testing if element <h1> contains text 'Example Domain'
[percy] Percy is not running, disabling snapshots
✔ Testing if element <img[alt="Google"]> is present

OK. 2 assertions passed.
```

When running with [`percy
exec`](https://github.com/percy/cli/tree/master/packages/cli-exec#percy-exec), and your project's
`PERCY_TOKEN`, a new Percy build will be created and snapshots will be uploaded to your project.

```sh-session
$ export PERCY_TOKEN=[your-project-token]
$ percy exec -- nightwatch
[percy] Percy has started!
[percy] Created build #1: https://percy.io/[your-project]
[percy] Running "nightwatch"

[Example] Test Suite
====================
...

Running:  Snapshots pages

✔ Testing if element <h1> contains text 'Example Domain'
[percy] Snapshot taken "Snapshots pages"
✔ Testing if element <img[alt="Google"]> is present
[percy] Snapshot taken "Google homepage"

OK. 2 assertions passed.
[percy] Stopping percy...
[percy] Finalized build #1: https://percy.io/[your-project]
[percy] Done!
```

## Configuration

`percySnapshot([name][, options])`

- `name` - The snapshot name; must be unique to each snapshot
- `options` - [See per-snapshot configuration options](https://www.browserstack.com/docs/percy/take-percy-snapshots/overview#per-snapshot-configuration)

### Responsive snapshots

Set `responsiveSnapshotCapture: true` (and optionally `widths`) to have the Nightwatch SDK resize the browser window and capture DOM snapshots at multiple breakpoints in a single Percy snapshot. The SDK implementation:

- Calling `PercyDOM.waitForResize()` once and waiting on `window.resizeCount` before each snapshot.
- Using Chrome DevTools Protocol resizing when available (disable with `PERCY_DISABLE_CDP_RESIZE=true`) and falling back to WebDriver window APIs.
- Honoring the environment toggles:
  - `PERCY_RESPONSIVE_CAPTURE_MIN_HEIGHT` â€“ ensure a minimum viewport height using `snapshot.minHeight`.
  - `PERCY_RESPONSIVE_CAPTURE_RELOAD_PAGE` â€“ reload the page (and re-inject Percy DOM) between widths.
  - `RESPONSIVE_CAPTURE_SLEEP_TIME` â€“ wait (in seconds) between width changes.
  - `PERCY_ENABLE_LAZY_LOADING_SCROLL` â€“ trigger the lazy-load scroll helper described below.
- Resetting the window back to its original dimensions after the final width.

### Lazy-loading scroll helper

When `PERCY_ENABLE_LAZY_LOADING_SCROLL` is set the SDK scrolls the page in increments (up to 25,000px) to trigger lazy-loaded content before each snapshot. Additional environment variables control the behavior:

- `PERCY_LAZY_LOAD_SCROLL_TIME` â€“ seconds to pause between scroll steps (default `0.45`).
- `BYPASS_SCROLL_TO_TOP=true` â€“ skip scrolling back to the top of the page.
- `PERCY_SLEEP_AFTER_LAZY_LOAD_COMPLETE` â€“ seconds to wait after finishing the scroll sequence.

### Running tests

All unit and Nightwatch integration tests can be executed with:

```sh
yarn test
```

Additional scripts are available when iterating locally:

- `yarn test:unit` &mdash; runs the mocha suite under `test/unit/**`.
- `yarn test:nightwatch` &mdash; runs the Nightwatch suite (wrapped by `percy exec`) in headless Firefox.

### E2E Visual Testing

The repository includes comprehensive end-to-end (E2E) visual regression tests that create actual Percy builds and validate all SDK features. These tests use real HTML fixtures and test scenarios to ensure the SDK works correctly.

**Running E2E tests locally:**

```sh
# Terminal 1 - Start test server
yarn e2e:server

# Terminal 2 - Run tests with Percy
PERCY_TOKEN=your_token yarn e2e:chrome    # Chrome (with CDP)
PERCY_TOKEN=your_token yarn e2e:firefox   # Firefox (WebDriver)

# Or run everything in one command
PERCY_TOKEN=your_token yarn e2e:local
```

**What's tested:**
- ✅ Responsive snapshots with multiple widths (CDP + WebDriver fallbacks)
- ✅ Lazy loading with scroll helper
- ✅ Canvas and stylesheet serialization
- ✅ Region algorithms (ignore, standard, layout, intelliignore)
- ✅ Percy CSS, scope selectors, and DOM transformation
- ✅ Cookie capture and attachment
- ✅ Shadow DOM serialization
- ✅ Complex real-world integration scenarios

**E2E test structure:**
- `test/e2e/fixtures/` - 7 comprehensive HTML test pages
- `test/e2e/e2e.test.js` - 13 optimized test scenarios covering all features
- `test/e2e/server.js` - Static file server for fixtures
- `test/e2e/nightwatch.e2e.conf.js` - E2E-specific configuration

**Snapshot count:**
- PRs: ~25-30 snapshots (Chrome only, optimized for quick review)
- Main branch: ~75-90 snapshots (Chrome + Firefox + environment tests)

See [`test/e2e/README.md`](test/e2e/README.md) for detailed documentation, environment variables, and troubleshooting.

**CI/CD:** E2E tests run automatically on pull requests (Chrome) and main branch pushes (Chrome + Firefox) via GitHub Actions (`.github/workflows/e2e-percy.yml`).

## Upgrading

### Automatically with `@percy/migrate`

We built a tool to help automate migrating to the new CLI toolchain! Migrating
can be done by running the following commands and following the prompts:

```shell
$ npx @percy/migrate
? Are you currently using @percy/nightwatch? Yes
? Install @percy/cli (required to run percy)? Yes
? Migrate Percy config file? Yes
? Upgrade SDK to @percy/nightwatch@2.0.0? Yes
```

This will automatically run the changes described below for you.

### Manually

#### Installing `@percy/cli`

If you're coming from a pre-2.0 version of this package, make sure to install `@percy/cli` after
upgrading to retain any existing scripts that reference the Percy CLI command.

```sh-session
$ npm install --save-dev @percy/cli
```

#### Migrating Config

If you have a previous Percy configuration file, migrate it to the newest version with the
[`config:migrate`](https://github.com/percy/cli/tree/master/packages/cli-config#percy-configmigrate-filepath-output) command:

```sh-session
$ percy config:migrate
```
