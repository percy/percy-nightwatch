const expect = require('expect');
const sdk = require('@percy/sdk-utils/test/helper');

module.exports = {
  async before() {
    await sdk.testsite.mock();
  },

  async after() {
    await sdk.testsite.close();
  },

  async beforeEach(browser) {
    await sdk.setup();
    browser.url('http://localhost:8000');
  },

  async afterEach(browser) {
    await sdk.teardown();
    browser.end();
  },

  'disables snapshots when the healthcheck fails': async browser => {
    sdk.test.failure('/percy/healthcheck');

    await sdk.stdio(async () => {
      await browser.percySnapshot();
      await browser.percySnapshot('Snapshot 2');
    });

    expect(sdk.server.requests).toEqual([
      ['/percy/healthcheck']
    ]);

    expect(sdk.stdio[2]).toEqual([]);
    expect(sdk.stdio[1]).toEqual([
      '[percy] Percy is not running, disabling snapshots\n'
    ]);

    browser.assert.ok(true);
  },

  'posts snapshots to the local percy server': async browser => {
    await sdk.stdio(async () => {
      await browser.percySnapshot();
      await browser.percySnapshot('Snapshot 2');
    });

    expect(sdk.server.requests).toEqual([
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

    expect(sdk.stdio[2]).toEqual([]);
    browser.assert.ok(true);
  },

  'handles snapshot failures': async browser => {
    sdk.test.failure('/percy/snapshot', 'failure');

    await sdk.stdio(async () => {
      await browser.percySnapshot();
    });

    expect(sdk.stdio[1]).toHaveLength(0);
    expect(sdk.stdio[2]).toEqual([
      '[percy] Could not take DOM snapshot "handles snapshot failures"\n',
      '[percy] Error: failure\n'
    ]);

    browser.assert.ok(true);
  }
};
