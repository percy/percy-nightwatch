const expectModule = require('expect');
const expect = typeof expectModule === 'function'
  ? expectModule
  : expectModule.default || expectModule.expect;
const helpers = require('@percy/sdk-utils/test/helpers');
const utils = require('@percy/sdk-utils');
const PercySnapshotCommand = require('../../commands/percySnapshot');

// A DOM script that runs without error but never defines PercyDOM.
const BROKEN_DOM_SCRIPT = 'void 0;';
const INJECTION_ERROR = 'PercyDOM is not available after injecting the DOM serialization script';

async function waitFor(condition, { timeout = 2000, interval = 100 } = {}) {
  const end = Date.now() + timeout;
  let result;

  while (Date.now() < end) {
    result = await condition();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return await condition();
}

async function waitForLogs(predicate, options) {
  return await waitFor(async () => {
    const logs = await helpers.get('logs');
    return predicate(logs) ? logs : null;
  }, options);
}

module.exports = {
  async beforeEach(browser) {
    await helpers.setupTest();
  },

  'disables snapshots when the healthcheck fails': async browser => {
    await helpers.test('error', '/percy/healthcheck');

    await browser
      .navigateTo(helpers.testSnapshotURL)
      .percySnapshot()
      .percySnapshot('Snapshot 2');

    expect(helpers.logger.stdout).toEqual(expect.arrayContaining([
      '[percy] Percy is not running, disabling snapshots'
    ]));

    await browser
      .assert.ok(true)
      .end();
  },

  'posts snapshots to the local percy server': async browser => {
    await browser
      .navigateTo(helpers.testSnapshotURL)
      .percySnapshot()
      .percySnapshot('Snapshot 2');

    const logs = await waitForLogs(entries => entries.includes('Snapshot found: Snapshot 2'));

    expect(logs).toEqual(expect.arrayContaining([
      'Snapshot found: posts snapshots to the local percy server',
      'Snapshot found: Snapshot 2',
      `- url: ${helpers.testSnapshotURL}`,
      expect.stringMatching(/clientInfo: @percy\/nightwatch\/.+/),
      expect.stringMatching(/environmentInfo: nightwatch\/.+/)
    ]));

    await browser
      .assert.ok(true)
      .end();
  },

  'captures responsive snapshots when responsiveSnapshotCapture is true': async browser => {
    await browser
      .navigateTo(helpers.testSnapshotURL)
      .percySnapshot('Responsive Snapshot', {
        responsiveSnapshotCapture: true,
        widths: [480, 960]
      });

    expect(helpers.logger.stderr).toEqual(expect.not.arrayContaining([
      expect.stringContaining('Could not take DOM snapshot')
    ]));

    await browser
      .assert.ok(true)
      .end();
  },

  'skips the snapshot when the DOM script does not define PercyDOM': async browser => {
    utils.percy.domScript = BROKEN_DOM_SCRIPT;
    await browser
      .navigateTo(helpers.testSnapshotURL)
      .percySnapshot('Snapshot 1');

    await waitFor(() => helpers.logger.stderr.some(msg => (
      msg.includes('Could not take DOM snapshot "Snapshot 1"')
    )));

    expect(helpers.logger.stderr).toEqual(expect.arrayContaining([
      '[percy] Could not take DOM snapshot "Snapshot 1"',
      expect.stringContaining(INJECTION_ERROR)
    ]));
    expect(await helpers.get('logs')).toEqual(expect.not.arrayContaining([
      'Snapshot found: Snapshot 1'
    ]));

    await browser
      .assert.ok(true)
      .end();
  },

  'rethrows a failed DOM injection when PERCY_RAISE_ERROR is true': async browser => {
    await browser.navigateTo(helpers.testSnapshotURL);

    const command = new PercySnapshotCommand();
    command.api = browser;
    utils.percy.domScript = BROKEN_DOM_SCRIPT;
    process.env.PERCY_RAISE_ERROR = 'true';
    let error;

    try {
      await command.command('Snapshot 1');
    } catch (e) {
      error = e;
    } finally {
      delete process.env.PERCY_RAISE_ERROR;
    }

    expect(error?.message).toEqual(INJECTION_ERROR);
    expect(await helpers.get('logs')).toEqual(expect.not.arrayContaining([
      'Snapshot found: Snapshot 1'
    ]));

    await browser
      .assert.ok(true)
      .end();
  },

  'handles snapshot failures': async browser => {
    await helpers.test('error', '/percy/snapshot');
    await browser
      .navigateTo(helpers.testSnapshotURL)
      .percySnapshot('Snapshot 1');

    await waitFor(() => helpers.logger.stderr.some(msg => (
      msg.includes('Could not take DOM snapshot "Snapshot 1"')
    )));

    expect(helpers.logger.stderr).toEqual(expect.arrayContaining([
      '[percy] Could not take DOM snapshot "Snapshot 1"'
    ]));

    await browser
      .assert.ok(true)
      .end();
  }
};
