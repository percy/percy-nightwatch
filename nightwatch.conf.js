const chromedriver = require('chromedriver')
const seleniumServer = require('selenium-server')
const os = require('os')
const percy = require('./dist/percySnapshot.js')

module.exports = {
  src_folders: ['tests'],
  exclude: ['testapp'],
  output_folder: false,
  custom_commands_path: [percy.path],

  selenium: {
    start_process: true,
    server_path: seleniumServer.path,
    log_path: false,
    cli_args: {
      'webdriver.chrome.driver': chromedriver.path,
    },
  },

  test_settings: {
    default: {
      desiredCapabilities: {
        browserName: 'chrome',
        javascriptEnabled: true,
        acceptSslCerts: true,
        chromeOptions: {
          // `w3c: false` is needed for Chrome versions 75 and higher:
          // https://github.com/nightwatchjs/nightwatch/releases/tag/v1.1.12
          w3c: false,
          args: [
            'disable-web-security',
            'allow-running-insecure-content',
            'headless',
            'ignore-certificate-errors',
          ],
        },
      },
    },
  },
}
