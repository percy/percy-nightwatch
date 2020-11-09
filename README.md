# @percy/nightwatch

[![Version](https://img.shields.io/npm/v/@percy/nightwatch.svg)](https://www.npmjs.com/package/@percy/nightwatch)
![Test](https://github.com/percy/percy-nightwatch/workflows/Test/badge.svg)

[Percy](https://percy.io) visual testing for [Nightwatch.js](http://nightwatchjs.org).

## Installation

Using yarn:

```sh-session
$ yarn add --dev @percy/cli @percy/nightwatch@next
```

Using npm:

```sh-session
$ npm install --save-dev @percy/cli @percy/nightwatch@next
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
  'Snapshots pages': function(browser) {
    browser
      .url('http://example.com')
      .assert.containsText('h1', 'Example Domain')
      .percySnapshot();
    browser
      .url('http://google.com')
      .assert.elementPresent('img[alt="Google"]')
      .percySnapshot('Google homepage');
    browser.end();
  }
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
- `options` - Additional snapshot options (overrides any project options)
  - `options.widths` - An array of widths to take screenshots at
  - `options.minHeight` - The minimum viewport height to take screenshots at
  - `options.percyCSS` - Percy specific CSS only applied in Percy's rendering environment
  - `options.requestHeaders` - Headers that should be used during asset discovery
  - `options.enableJavaScript` - Enable JavaScript in Percy's rendering environment

## Upgrading

If you're coming from a pre-2.0 version of this package, make sure to install `@percy/cli` after
upgrading to retain any existing scripts that reference the Percy CLI command.

Using yarn:

```sh-session
$ yarn add --dev @percy/cli
```

Using npm:

```sh-session
$ npm install --save-dev @percy/cli
```

### Migrating Config

If you have a previous Percy configuration file, migrate it to the newest version with the
[`config:migrate`](https://github.com/percy/cli/tree/master/packages/cli-config#percy-configmigrate-filepath-output) command:

```sh-session
$ percy config:migrate
```
