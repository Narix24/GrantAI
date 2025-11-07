// Custom Playwright commands
const { chromium } = require('playwright');

async function createAuthenticatedContext(browser, userData) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('/login');
  await page.fill('#email', userData.email);
  await page.fill('#password', userData.password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
  
  return context;
}

async function mockAPIResponses(page, mocks = {}) {
  for (const [urlPattern, mockResponse] of Object.entries(mocks)) {
    await page.route(urlPattern, route => {
      route.fulfill({
        status: mockResponse.status || 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse.body || {})
      });
    });
  }
}

async function simulateNetworkConditions(page, conditions) {
  await page.context().setOffline(conditions.offline || false);
  
  if (conditions.latency || conditions.downloadThroughput || conditions.uploadThroughput) {
    await page.context().setGeolocation({
      latitude: 41.890221,
      longitude: 12.492341,
    });
    
    await page.context().grantPermissions(['geolocation']);
    
    // Simulate network throttling
    await page.emulateNetworkConditions({
      offline: conditions.offline || false,
      latency: conditions.latency || 0,
      downloadThroughput: conditions.downloadThroughput || -1,
      uploadThroughput: conditions.uploadThroughput || -1
    });
  }
}

async function capturePerformanceMetrics(page) {
  const metrics = await page.evaluate(() => {
    const timing = window.performance.timing;
    return {
      dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
      tcpConnection: timing.connectEnd - timing.connectStart,
      requestTime: timing.responseEnd - timing.requestStart,
      domLoading: timing.domContentLoadedEventEnd - timing.navigationStart,
      totalLoadTime: timing.loadEventEnd - timing.navigationStart,
      domInteractive: timing.domInteractive - timing.navigationStart,
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart
    };
  });
  
  return metrics;
}

async function simulateChaosScenario(page, scenario) {
  switch(scenario) {
    case 'slow_network':
      await simulateNetworkConditions(page, {
        latency: 3000,
        downloadThroughput: 500 * 1024, // 500 Kbps
        uploadThroughput: 200 * 1024 // 200 Kbps
      });
      break;
      
    case 'intermittent_connection':
      // Simulate connection drops
      for (let i = 0; i < 3; i++) {
        await page.context().setOffline(true);
        await page.waitForTimeout(2000);
        await page.context().setOffline(false);
        await page.waitForTimeout(1000);
      }
      break;
      
    case 'high_cpu':
      await page.evaluate(() => {
        // Simulate CPU intensive task
        const start = Date.now();
        while (Date.now() - start < 5000) {
          // Burn CPU
        }
      });
      break;
  }
}

module.exports = {
  createAuthenticatedContext,
  mockAPIResponses,
  simulateNetworkConditions,
  capturePerformanceMetrics,
  simulateChaosScenario
};