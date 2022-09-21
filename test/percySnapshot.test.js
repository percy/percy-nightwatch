const expect = require('expect');
const helpers = require('@percy/sdk-utils/test/helpers');

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

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
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

  'handles snapshot failures': async browser => {
    await helpers.test('error', '/percy/snapshot');
    await browser
      .navigateTo(helpers.testSnapshotURL)
      .percySnapshot('Snapshot 1');

    expect(helpers.logger.stderr).toEqual(expect.arrayContaining([
      '[percy] Could not take DOM snapshot "Snapshot 1"'
    ]));

    await browser
      .assert.ok(true)
      .end();
  }
};
