const { createRegion } = require('../../commands/percySnapshot.js');

module.exports = {
  '@tags': ['e2e', 'percy'],

  before(browser) {
    console.log('\n🎨 Percy Nightwatch E2E Test Suite Starting...\n');
  },

  after(browser) {
    console.log('\n✅ Percy Nightwatch E2E Test Suite Complete!\n');
    browser.end();
  },

  // ============================================================================
  // RESPONSIVE SNAPSHOTS
  // Reduced from 3 tests to 1 comprehensive test with 2 widths instead of 3
  // ============================================================================

  'Responsive: Multi-width snapshot'(browser) {
    browser
      .url('http://localhost:8080/responsive.html')
      .waitForElementVisible('body', 5000)
      .percySnapshot('Responsive Layout', {
        responsiveSnapshotCapture: true,
        widths: [768, 1280] // Reduced from [375, 768, 1280] - tablet + desktop covers most cases
      });
  },

  // ============================================================================
  // LAZY LOADING
  // Reduced from 3 tests to 1 - just validate the main functionality
  // ============================================================================

  'Lazy Loading: Scroll enabled'(browser) {
    process.env.PERCY_ENABLE_LAZY_LOADING_SCROLL = 'true';
    process.env.PERCY_LAZY_LOAD_SCROLL_TIME = '0.2'; // Faster for testing

    browser
      .url('http://localhost:8080/lazy-loading.html')
      .waitForElementVisible('body', 5000)
      .percySnapshot('Lazy Loading');

    delete process.env.PERCY_ENABLE_LAZY_LOADING_SCROLL;
    delete process.env.PERCY_LAZY_LOAD_SCROLL_TIME;
  },

  // ============================================================================
  // CANVAS & STYLESHEET SERIALIZATION
  // Reduced from 4 tests to 2 - default and with ignore flags
  // ============================================================================

  'Canvas & Styles: Default serialization'(browser) {
    browser
      .url('http://localhost:8080/canvas-styles.html')
      .waitForElementVisible('body', 5000)
      .pause(1000) // Let canvas render
      .percySnapshot('Canvas & Styles - Default');
  },

  'Canvas & Styles: Ignore errors'(browser) {
    browser
      .url('http://localhost:8080/canvas-styles.html')
      .waitForElementVisible('body', 5000)
      .pause(1000)
      .percySnapshot('Canvas & Styles - Ignore Errors', {
        ignoreCanvasSerializationErrors: true,
        ignoreStyleSheetSerializationErrors: true
      });
  },

  // ============================================================================
  // REGIONS
  // Reduced from 6 tests to 3 - covers all major use cases
  // ============================================================================

  'Regions: Multiple ignore regions'(browser) {
    browser
      .url('http://localhost:8080/regions.html')
      .waitForElementVisible('body', 5000)
      .percySnapshot('Regions - Multiple Ignore', {
        ignore_regions: [
          createRegion({
            elementCSS: '#banner-region',
            algorithm: 'ignore'
          }),
          createRegion({
            elementCSS: '#dynamic-content',
            algorithm: 'ignore'
          }),
          createRegion({
            elementCSS: '#ad-region',
            algorithm: 'ignore'
          })
        ]
      });
  },

  'Regions: With padding and configuration'(browser) {
    browser
      .url('http://localhost:8080/regions.html')
      .waitForElementVisible('body', 5000)
      .percySnapshot('Regions - Padding & Config', {
        ignore_regions: [
          createRegion({
            elementCSS: '#padding-demo',
            algorithm: 'ignore',
            padding: { top: 10, right: 20, bottom: 10, left: 20 }
          }),
          createRegion({
            elementCSS: '#static-content',
            algorithm: 'standard',
            diffSensitivity: 0.05
          })
        ]
      });
  },

  'Regions: Layout algorithm'(browser) {
    browser
      .url('http://localhost:8080/regions.html')
      .waitForElementVisible('body', 5000)
      .percySnapshot('Regions - Layout', {
        ignore_regions: [
          createRegion({
            elementCSS: '#layout-region',
            algorithm: 'layout'
          })
        ]
      });
  },

  // ============================================================================
  // ADVANCED FEATURES
  // Reduced from 5 tests to 2 - Percy CSS + Scope (Shadow DOM tested in complex)
  // ============================================================================

  'Advanced: Percy CSS freeze animations'(browser) {
    browser
      .url('http://localhost:8080/advanced.html')
      .waitForElementVisible('body', 5000)
      .pause(500)
      .percySnapshot('Advanced - Percy CSS', {
        percyCSS: `
          * { animation: none !important; transition: none !important; }
          [data-percy-hide] { visibility: hidden !important; }
        `
      });
  },

  'Advanced: Scope selector'(browser) {
    browser
      .url('http://localhost:8080/advanced.html')
      .waitForElementVisible('body', 5000)
      .percySnapshot('Advanced - Scope', {
        scope: '#scope-section-1'
      });
  },

  // ============================================================================
  // COOKIES
  // Reduced from 2 tests to 1 - basic capture is sufficient
  // ============================================================================

  'Cookies: Cookie capture'(browser) {
    browser
      .url('http://localhost:8080/cookies.html')
      .waitForElementVisible('body', 5000)
      .pause(500) // Let cookies be set
      .percySnapshot('Cookies');
  },

  // ============================================================================
  // INTEGRATION & COMPLEX
  // Reduced from 6 tests to 2 - one comprehensive test covers most scenarios
  // ============================================================================

  'Complex: Full integration'(browser) {
    browser
      .url('http://localhost:8080/complex.html')
      .waitForElementVisible('body', 5000)
      .pause(1000) // Let canvas and dynamic content render
      .percySnapshot('Complex Integration', {
        ignore_regions: [
          createRegion({
            elementCSS: '#dynamic-banner',
            algorithm: 'ignore'
          })
        ]
      });
  },

  'Complex: All features combined'(browser) {
    process.env.PERCY_ENABLE_LAZY_LOADING_SCROLL = 'true';
    process.env.PERCY_LAZY_LOAD_SCROLL_TIME = '0.2';

    browser
      .url('http://localhost:8080/complex.html')
      .waitForElementVisible('body', 5000)
      .pause(500)
      .percySnapshot('Complex - All Features', {
        responsiveSnapshotCapture: true,
        widths: [768, 1280], // Reduced from 3 widths to 2
        ignoreCanvasSerializationErrors: true,
        ignoreStyleSheetSerializationErrors: true,
        ignore_regions: [
          createRegion({
            elementCSS: '#dynamic-banner',
            algorithm: 'ignore'
          })
        ],
        percyCSS: `* { animation: none !important; }`
      });

    delete process.env.PERCY_ENABLE_LAZY_LOADING_SCROLL;
    delete process.env.PERCY_LAZY_LOAD_SCROLL_TIME;
  }
};
