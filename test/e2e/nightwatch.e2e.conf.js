const percy = require('../../index.js');

const BROWSER = process.env.BROWSER || 'chrome';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

module.exports = {
  src_folders: ['test/e2e'],
  output_folder: 'test/e2e/reports',
  custom_commands_path: [percy.path],

  webdriver: {
    start_process: true,
    port: 4444
  },

  test_settings: {
    default: {
      launch_url: BASE_URL,
      screenshots: {
        enabled: true,
        path: 'test/e2e/screenshots',
        on_failure: true,
        on_error: true
      },
      desiredCapabilities: {
        browserName: BROWSER
      },
      // Longer timeouts for E2E tests with Percy
      globals: {
        waitForConditionTimeout: 10000,
        retryAssertionTimeout: 5000
      }
    },

    chrome: {
      desiredCapabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: [
            // Headless mode for CI
            process.env.CI ? '--headless=new' : '',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,720',
            // Enable CDP for Chrome DevTools Protocol resizing tests
            '--remote-debugging-port=9222'
          ].filter(Boolean)
        }
      }
    },

    firefox: {
      desiredCapabilities: {
        browserName: 'firefox',
        'moz:firefoxOptions': {
          args: [
            // Headless mode for CI
            process.env.MOZ_HEADLESS === '1' ? '-headless' : ''
          ].filter(Boolean),
          prefs: {
            // Enable file access for local testing
            'security.fileuri.strict_origin_policy': false
          }
        }
      }
    }
  }
};
