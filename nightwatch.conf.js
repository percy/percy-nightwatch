const percy = require('.');

module.exports = {
  src_folders: ['test'],
  output_folder: false,
  custom_commands_path: [percy.path],

  webdriver: {
    start_process: true
  },

  test_settings: {
    default: {
      desiredCapabilities: {
        browserName: 'firefox'
      }
    }
  }
};
