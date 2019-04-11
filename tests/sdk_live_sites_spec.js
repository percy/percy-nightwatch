module.exports = {
  after: function(browser) {
    browser.end()
  },

  'snapshots a website with HTTP': function(browser) {
    browser
      .url('http://example.com/')
      .percySnapshot('http://example.com/')
  },

  'snapshots a website with HTTPS, strict CSP, CORS and HSTS setup': function(browser) {
    browser
      .url('https://sdk-test.percy.dev')
      .percySnapshot('https://sdk-test.percy.dev')
  },
}
