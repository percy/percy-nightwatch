const expect = require('expect');
const helpers = require('@percy/sdk-utils/test/helpers');

module.exports = {
  async before() {
    await helpers.mockSite();
  },

  async after() {
    await helpers.closeSite();
  },

  async beforeEach(browser) {
    await helpers.setup();
    browser.url('http://localhost:8000');
  },

  async afterEach(browser) {
    await helpers.teardown();
    browser.end();
  },

  'disables snapshots when the healthcheck fails': async browser => {
    await helpers.testFailure('/percy/healthcheck');

    await browser.percySnapshot();
    await browser.percySnapshot('Snapshot 2');

    await expect(helpers.getRequests()).resolves.toEqual([
      ['/percy/healthcheck']
    ]);

    expect(helpers.logger.stderr).toEqual([]);
    expect(helpers.logger.stdout).toEqual([
      '[percy] Percy is not running, disabling snapshots'
    ]);

    browser.assert.ok(true);
  },

  'posts snapshots to the local percy server': async browser => {
    await browser.percySnapshot();
    await browser.percySnapshot('Snapshot 2');

    await expect(helpers.getRequests()).resolves.toEqual([
      ['/percy/healthcheck'],
      ['/percy/dom.js'],
      ['/percy/snapshot', {
        name: 'posts snapshots to the local percy server',
        url: 'http://localhost:8000/',
        domSnapshot: '<html><head></head><body>Snapshot Me</body></html>',
        clientInfo: expect.stringMatching(/@percy\/nightwatch\/.+/),
        environmentInfo: expect.stringMatching(/nightwatch\/.+/)
      }],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 2'
      })]
    ]);

    expect(helpers.logger.stdout).toEqual([]);
    expect(helpers.logger.stderr).toEqual([]);
    browser.assert.ok(true);
  },

  'handles snapshot failures': async browser => {
    await helpers.testFailure('/percy/snapshot', 'failure');

    await browser.percySnapshot();

    expect(helpers.logger.stdout).toEqual([]);
    expect(helpers.logger.stderr).toEqual([
      '[percy] Could not take DOM snapshot "handles snapshot failures"',
      '[percy] Error: failure'
    ]);

    browser.assert.ok(true);
  }
};
