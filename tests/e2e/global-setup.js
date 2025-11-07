const { chromium } = require('@playwright/test');
const { createAdminUser, generateTestToken } = require('../../backend/utils/testHelpers');

module.exports = async () => {
  // Setup test database
  process.env.TEST_MODE = 'true';
  process.env.DATABASE_URL = 'mongodb://localhost:27017/grant_ai_test';
  
  // Create admin user for testing
  await createAdminUser({
    email: 'admin@chaostest.io',
    password: 'TestAdmin123!',
    name: 'Test Admin'
  });
  
  // Generate test tokens
  const adminToken = await generateTestToken('admin@chaostest.io', 'admin');
  const userToken = await generateTestToken('user@chaostest.io', 'user');
  
  // Save tokens to environment
  process.env.ADMIN_TOKEN = adminToken;
  process.env.USER_TOKEN = userToken;
  process.env.TEST_TOKEN = userToken;
  
  // Create auth state for Playwright
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('/login');
  await page.fill('#email', 'admin@chaostest.io');
  await page.fill('#password', 'TestAdmin123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
  
  // Save storage state
  await context.storageState({ path: 'tests/e2e/.auth/state.json' });
  
  await browser.close();
  
  console.log('✅ Global setup completed - test environment ready');
};