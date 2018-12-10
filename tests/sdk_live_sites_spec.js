module.exports = {
  after: function(browser) {
    browser.end()
  },

  'snapshots HTTPS website': function(browser) {
    browser
      .url('https://www.google.com/')
      .percySnapshot('snapshots HTTPS website', { widths: [768, 992, 1200] })
  },
}
