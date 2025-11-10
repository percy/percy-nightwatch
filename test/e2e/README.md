# Percy Nightwatch E2E Visual Testing

This directory contains comprehensive end-to-end (E2E) visual regression tests for the Percy Nightwatch SDK. These tests create actual Percy builds and validate all SDK features visually.

## 📁 Structure

```
test/e2e/
├── fixtures/                    # HTML test pages
│   ├── responsive.html         # Responsive capture + CDP testing
│   ├── lazy-loading.html       # Lazy scroll functionality
│   ├── canvas-styles.html      # Canvas/stylesheet serialization
│   ├── regions.html            # Region algorithms & selectors
│   ├── advanced.html           # Percy CSS, scope, DOM transformation
│   ├── cookies.html            # Cookie capture
│   └── complex.html            # Real-world integration
├── e2e.test.js                  # All test scenarios
├── server.js                    # Static file server for fixtures
├── nightwatch.e2e.conf.js      # E2E-specific Nightwatch config
└── README.md                    # This file
```

## 🚀 Running Tests Locally

### Prerequisites

1. **Percy Token**: Get your project token from [Percy dashboard](https://percy.io)
2. **Node.js**: Version 14 or higher
3. **Dependencies**: Install with `yarn install`

### Quick Start

**Terminal 1 - Start the test server:**
```bash
yarn e2e:server
```

**Terminal 2 - Run Percy E2E tests:**
```bash
# Chrome (with CDP resizing)
PERCY_TOKEN=your_token_here yarn e2e:chrome

# Firefox (WebDriver fallback)
PERCY_TOKEN=your_token_here yarn e2e:firefox

# Or run both in one command (stops server automatically)
PERCY_TOKEN=your_token_here yarn e2e:local
```

### Available Scripts

```bash
# Start static server only
yarn e2e:server

# Run E2E tests (requires server running)
yarn e2e:test

# Run with Percy (requires server running)
yarn e2e:percy

# Run with Chrome
yarn e2e:chrome

# Run with Firefox
yarn e2e:firefox

# Run everything (server + tests + cleanup)
yarn e2e:local
```

## 🎨 HTML Fixtures

### responsive.html
**Purpose:** Test responsive snapshot capture with multiple widths

**Features tested:**
- Responsive layout with breakpoints (375px, 768px, 1280px)
- Chrome DevTools Protocol (CDP) resizing
- WebDriver API fallbacks (setWindowRect, setWindowSize, resizeWindow)
- PercyDOM.waitForResize() synchronization
- Window dimension restoration
- Media query driven layout changes

**Test scenarios:**
- Multiple widths: [375, 768, 1280]
- Single width: [768]
- No widths (uses current window)

---

### lazy-loading.html
**Purpose:** Test lazy scroll functionality for loading content

**Features tested:**
- Long page (5000px+) with lazy-loaded images
- Slow scroll to bottom (slowScrollToBottom function)
- Page-by-page scrolling
- Maximum scroll height limit (25,000px)
- Scroll-to-top behavior
- Post-scroll wait time

**Environment variables:**
- `PERCY_ENABLE_LAZY_LOADING_SCROLL` - Enable lazy scroll
- `PERCY_LAZY_LOAD_SCROLL_TIME` - Scroll timing (default 0.45s)
- `BYPASS_SCROLL_TO_TOP` - Skip scrolling back to top
- `PERCY_SLEEP_AFTER_LAZY_LOAD_COMPLETE` - Wait after scroll

---

### canvas-styles.html
**Purpose:** Test canvas and stylesheet serialization

**Features tested:**
- Canvas 2D context (shapes, gradients, patterns, text)
- WebGL context (shaders, 3D rendering)
- Animated canvas elements
- CSS custom properties (variables)
- Shadow DOM with scoped styles
- External stylesheets (potential CORS issues)

**Test scenarios:**
- Default serialization
- With `ignoreCanvasSerializationErrors: true`
- With `ignoreStyleSheetSerializationErrors: true`
- Both flags enabled

---

### regions.html
**Purpose:** Test all region algorithms and selectors

**Features tested:**
- **Algorithms:** ignore, standard, layout, intelliignore
- **Selectors:** CSS, XPath, boundingBox coordinates
- **Configurations:** diffSensitivity, imageIgnoreThreshold, carouselsEnabled, bannersEnabled, adsEnabled
- **Padding:** top, right, bottom, left

**Test scenarios:**
- Single ignore region (various selectors)
- Multiple regions with different algorithms
- Region with padding configuration
- Standard algorithm with sensitivity config
- Layout algorithm for flexible positioning

---

### advanced.html
**Purpose:** Test advanced SDK features

**Features tested:**
- Percy CSS injection (freeze animations, hide dynamic content)
- Scope selector (capture specific page sections)
- DOM transformation (JavaScript to modify DOM before capture)
- Shadow DOM serialization (enable/disable)
- Invalid HTML tag handling (reshuffleInvalidTags)
- Nested iframes

**Test scenarios:**
- Percy CSS to freeze animations
- Scope to specific sections (#scope-section-1, #scope-section-2)
- Shadow DOM enabled (default)
- Shadow DOM disabled (disableShadowDOM: true)

---

### cookies.html
**Purpose:** Test cookie capture and attachment

**Features tested:**
- Automatic cookie extraction via browser.getCookies()
- Session cookies (no expiration)
- Persistent cookies (with expiration)
- Cookie attributes (domain, path, expires, secure, httpOnly, sameSite)
- Cookie manipulation UI

**Test scenarios:**
- Basic cookie capture
- Multiple cookies with different attributes
- Verify cookies in Percy payload

---

### complex.html
**Purpose:** Real-world integration test combining multiple features

**Features tested:**
- Responsive header with mobile navigation
- Hero section with lazy-loaded images
- Dynamic banner (ignore region)
- Responsive feature grid
- Canvas-based charts
- Embedded iframes
- Footer with dynamic content
- Scroll-to-top functionality

**Test scenarios:**
- Full page snapshot
- With ignore region on dynamic banner
- Responsive + lazy loading combined

## 🧪 Test Scenarios

The `e2e.test.js` file contains **13 optimized test scenarios** organized by feature, carefully designed to provide comprehensive coverage while keeping the snapshot count manageable:

### 1. Responsive Snapshots (1 test)
- Multi-width snapshot with 2 widths [768, 1280] - tablet + desktop coverage

### 2. Lazy Loading (1 test)
- With scroll enabled and configurable timing

### 3. Canvas & Stylesheet Serialization (2 tests)
- Default serialization (validates canvas 2D, WebGL, CSS variables)
- With ignore flags (both canvas and stylesheet errors)

### 4. Regions (3 tests)
- Multiple ignore regions (tests CSS selectors and multiple regions)
- With padding and configuration (combines padding + standard algorithm)
- Layout algorithm (tests flexible positioning)

### 5. Advanced Features (2 tests)
- Percy CSS to freeze animations and hide dynamic content
- Scope selector (partial page capture)

### 6. Cookies (1 test)
- Cookie capture and attachment to snapshots

### 7. Integration (2 tests)
- Full complex page with ignore regions
- All features combined (responsive + lazy loading + regions + Percy CSS)

**Total:** 13 test scenarios creating ~25-30 snapshots (with responsive widths)

## 🌍 Environment Variables

### Percy Configuration
- `PERCY_TOKEN` - Your Percy project token (required)
- `PERCY_BRANCH` - Branch name for this build
- `PERCY_TARGET_BRANCH` - Target branch to compare against
- `PERCY_PARALLEL_TOTAL` - Number of parallel jobs (-1 for auto)

### Feature Toggles
- `PERCY_ENABLE_LAZY_LOADING_SCROLL` - Enable lazy scroll helper
- `PERCY_LAZY_LOAD_SCROLL_TIME` - Scroll timing in seconds (default 0.45)
- `BYPASS_SCROLL_TO_TOP` - Skip scrolling back to top after lazy load
- `PERCY_SLEEP_AFTER_LAZY_LOAD_COMPLETE` - Wait time after scroll (default 1s)
- `PERCY_RESPONSIVE_CAPTURE_MIN_HEIGHT` - Minimum viewport height
- `PERCY_RESPONSIVE_CAPTURE_RELOAD_PAGE` - Reload page between widths
- `RESPONSIVE_CAPTURE_SLEEP_TIME` - Wait time between width changes
- `PERCY_DISABLE_CDP_RESIZE` - Disable CDP resizing, use WebDriver APIs

### Test Configuration
- `BROWSER` - Browser to use (chrome, firefox)
- `BASE_URL` - Base URL for test server (default: http://localhost:8080)
- `CI` - Set to "true" in CI environments

## 🤖 CI/CD - GitHub Actions

The E2E tests run automatically via `.github/workflows/e2e-percy.yml`:

### Triggers
- **Pull Requests:** All branches (Chrome only to reduce snapshots)
- **Push:** main/master branch (Chrome + Firefox for full validation)
- **Manual:** workflow_dispatch

### Jobs

**1. e2e-visual-test**
- **On PRs:** Chrome only (~25-30 snapshots)
- **On main:** Chrome + Firefox (~50-60 snapshots total)
- Starts test server
- Runs all 13 E2E test scenarios
- Creates Percy builds
- Uploads artifacts on failure

**2. e2e-environment-toggles** (main branch only)
- Runs only on main/master pushes (not PRs)
- Tests CDP disabled scenario
- Validates WebDriver fallback behavior
- Additional ~25-30 snapshots

### Setup Requirements

1. **Add Percy Token to GitHub Secrets:**
   - Navigate to: Settings → Secrets and variables → Actions
   - Create secret: `PERCY_TOKEN`
   - Value: Your Percy project token

2. **Branch Protection (Optional):**
   - Require "E2E Percy Visual Testing" to pass before merging

## 📊 Percy Dashboard

After tests run, visit your Percy dashboard to:

- **View Snapshots:** See all captured screenshots
- **Compare Diffs:** Visual differences highlighted
- **Approve/Reject:** Mark builds as approved or request changes
- **Browse History:** View all past builds
- **Multi-Browser:** Compare Chrome vs Firefox rendering (main branch only)

### Understanding Results

- **Green Check:** No visual changes detected
- **Yellow Warning:** Visual changes detected, needs review
- **Red X:** Test failed or critical error
- **Gray:** Build in progress or queued

### Snapshot Count Summary

**Pull Requests (PRs):**
- ~25-30 snapshots from Chrome
- Lightweight for quick PR reviews
- Focus on critical path validation

**Main Branch:**
- ~50-60 snapshots (Chrome + Firefox)
- ~25-30 additional from environment toggle tests
- Total: ~75-90 snapshots for comprehensive validation

**Optimization Strategy:**
- Reduced widths from 3 to 2 per responsive test (768px + 1280px)
- Consolidated similar tests (e.g., multiple canvas tests → 2 tests)
- Combined features where possible (e.g., padding + configuration in one test)
- Firefox only runs on main branch, not PRs
- Environment toggle tests only run on main branch

## 🔧 Troubleshooting

### Server Won't Start
```bash
# Check if port 8080 is in use
lsof -i :8080

# Kill existing process
kill -9 $(lsof -t -i:8080)

# Try different port
PORT=8081 yarn e2e:server
```

### Percy Token Issues
```bash
# Verify token is set
echo $PERCY_TOKEN

# Test Percy CLI
yarn percy --version
```

### Browser Driver Issues
```bash
# Chrome
# Make sure Chrome/Chromium is installed
google-chrome --version

# Firefox
# Make sure Firefox is installed
firefox --version
```

### Tests Timing Out
- Increase Nightwatch timeouts in `nightwatch.e2e.conf.js`
- Check network connectivity
- Verify test server is accessible

### Percy Build Not Creating
- Confirm `PERCY_TOKEN` is valid
- Check Percy service status
- Verify `percy exec` is wrapping the test command
- Look for Percy logs in console output

## 📝 Adding New Tests

1. **Create HTML fixture** (if needed):
   ```bash
   # Add new file to test/e2e/fixtures/
   touch test/e2e/fixtures/my-feature.html
   ```

2. **Add test scenario** to `e2e.test.js`:
   ```javascript
   'My Feature: Test description'(browser) {
     browser
       .url('http://localhost:8080/my-feature.html')
       .waitForElementVisible('body', 5000)
       .percySnapshot('My Feature Snapshot', {
         // options here
       });
   }
   ```

3. **Test locally:**
   ```bash
   PERCY_TOKEN=xxx yarn e2e:local
   ```

4. **Verify in Percy dashboard** that snapshot appears correctly

## 🎯 Best Practices

1. **Descriptive Names:** Use clear, unique snapshot names
2. **Wait for Content:** Always wait for dynamic content to load
3. **Stable State:** Ensure page is in stable state before snapshot
4. **Ignore Dynamic:** Use regions to ignore timestamps, ads, etc.
4. **Test Variations:** Test both with and without feature flags
5. **Small Fixtures:** Keep HTML fixtures focused on specific features
6. **Document Changes:** Update this README when adding new tests

## 📚 Resources

- [Percy Documentation](https://www.browserstack.com/docs/percy)
- [Nightwatch Documentation](https://nightwatchjs.org/)
- [Percy Nightwatch SDK](https://github.com/percy/percy-nightwatch)
- [Percy Best Practices](https://www.browserstack.com/docs/percy/best-practices)

---

**Questions or Issues?** Open an issue in the repository or contact the maintainers.
