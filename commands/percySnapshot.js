const utils = require('@percy/sdk-utils');

// Collect client and environment information
const sdkPkg = require('../package.json');
const nightwatchPkg = require('nightwatch/package.json');
const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${nightwatchPkg.name}/${nightwatchPkg.version}`;

// Take a DOM snapshot and post it to the snapshot endpoint
module.exports = class PercySnapshotCommand {
  async command(name, options) {
    if (!(await utils.isPercyEnabled())) return;
    name = name || this.api.currentTest.name;
    let log = utils.logger('nightwatch');

    try {
      // Inject the DOM serialization script
      await this.api.execute(await utils.fetchPercyDOM());

      // Serialize and capture the DOM
      /* istanbul ignore next: no instrumenting injected code */
      let { value: { domSnapshot, url } } = (
        await this.api.execute(function(options) {
          return {
            /* eslint-disable-next-line no-undef */
            domSnapshot: PercyDOM.serialize(options),
            url: document.URL
          };
        }, [options])
      );

      // Post the DOM to the snapshot endpoint with snapshot options and other info
      await utils.postSnapshot({
        ...options,
        environmentInfo: ENV_INFO,
        clientInfo: CLIENT_INFO,
        domSnapshot,
        name,
        url
      });
    } catch (error) {
      // Handle errors
      log.error(`Could not take DOM snapshot "${name}"`);
      log.error(error);
    }
  }
};

module.exports.path = __dirname;
