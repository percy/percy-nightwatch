const expect = require('expect');
const helpers = require('@percy/sdk-utils/test/helpers');

module.exports = {
  async beforeEach(browser) {
    await helpers.setupTest();
    await browser.url(helpers.testSnapshotURL);
  },

  after(browser) {
    browser.end();
  },

  'disables snapshots when the healthcheck fails': async browser => {
    await helpers.test('error', '/percy/healthcheck');

    await browser.percySnapshot();
    await browser.percySnapshot('Snapshot 2');

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Percy is not running, disabling snapshots'
    ]));

    browser.assert.ok(true);
  },

  'uses test name for snapshot name when percySnapshot is blank': async browser => {
    await browser.percySnapshot();

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Snapshot found: uses test name for snapshot name when percySnapshot is blank'
    ]));

    browser.assert.ok(true);
  },

  'posts snapshots to the local percy server': async function(browser) {
    await browser.percySnapshot('Snapshot 1');
    await browser.percySnapshot('Snapshot 2');

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Snapshot found: Snapshot 1',
      'Snapshot found: Snapshot 2',
      `- url: ${helpers.testSnapshotURL}`,
      expect.stringMatching(/clientInfo: @percy\/nightwatch\/.+/),
      expect.stringMatching(/environmentInfo: nightwatch\/.+/)
    ]));

    browser.assert.ok(true);
  },

  'handles snapshot failures': async browser => {
    await helpers.test('error', '/percy/snapshot');
    await browser.percySnapshot('Snapshot 1');

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Could not take DOM snapshot "Snapshot 1"'
    ]));

    browser.assert.ok(true);
  }
};
