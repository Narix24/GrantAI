// Custom Playwright plugins

module.exports = {
  async attachAccessibilityPlugin(page) {
    // Inject axe-core for accessibility testing
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.0/axe.min.js'
    });
    
    // Add accessibility testing function
    await page.exposeFunction('runAccessibilityTest', async () => {
      return await page.evaluate(async () => {
        return new Promise((resolve) => {
          axe.run({ 
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
            }
          }, (err, results) => {
            if (err) resolve({ error: err.message });
            resolve(results);
          });
        });
      });
    });
  },
  
  async attachPerformancePlugin(page) {
    // Add performance monitoring
    await page.exposeFunction('getPerformanceMetrics', async () => {
      return await page.evaluate(() => {
        const timing = window.performance.timing;
        const navigation = window.performance.getEntriesByType('navigation')[0];
        
        return {
          dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
          tcpConnection: timing.connectEnd - timing.connectStart,
          requestTime: timing.responseEnd - timing.requestStart,
          domLoading: timing.domContentLoadedEventEnd - timing.navigationStart,
          totalLoadTime: timing.loadEventEnd - timing.navigationStart,
          domInteractive: timing.domInteractive - timing.navigationStart,
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          ttfb: navigation.responseStart - navigation.requestStart,
          fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
          lcp: performance.getEntriesByName('largest-contentful-paint')[0]?.startTime || 0
        };
      });
    });
  },
  
  async attachVisualRegressionPlugin(page, testInfo) {
    // Add visual regression testing
    page.on('load', async () => {
      if (process.env.VISUAL_REGRESSION === 'true') {
        const screenshotPath = `screenshots/${testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }
    });
  }
};