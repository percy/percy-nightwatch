const expectModule = require('expect');
const expect = typeof expectModule === 'function'
  ? expectModule
  : expectModule.default || expectModule.expect;
const { createRegion } = require('../../lib/regions');

describe('createRegion', () => {
  it('creates a region descriptor with selectors and configuration', () => {
    const region = createRegion({
      elementCSS: '.banner',
      padding: { top: 10 },
      algorithm: 'intelliignore',
      diffSensitivity: 2,
      adsEnabled: true,
      diffIgnoreThreshold: 0.5
    });

    expect(region).toMatchObject({
      algorithm: 'intelliignore',
      elementSelector: {
        elementCSS: '.banner'
      },
      padding: { top: 10 },
      configuration: {
        diffSensitivity: 2,
        adsEnabled: true
      },
      assertion: {
        diffIgnoreThreshold: 0.5
      }
    });
  });

  it('throws when an invalid algorithm is provided', () => {
    expect(() => createRegion({ algorithm: 'unknown' })).toThrow('Invalid algorithm');
  });

  it('does not include elementSelector when no selectors are provided', () => {
    const region = createRegion({
      algorithm: 'standard'
    });

    expect(region).toMatchObject({
      algorithm: 'standard'
    });
    expect(region).not.toHaveProperty('elementSelector');
  });
});
