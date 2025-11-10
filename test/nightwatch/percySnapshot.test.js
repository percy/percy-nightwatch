const expectModule = require('expect');
const expect = typeof expectModule === 'function'
  ? expectModule
  : expectModule.default || expectModule.expect;
const helpers = require('@percy/sdk-utils/test/helpers');

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
