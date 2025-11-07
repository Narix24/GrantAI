// Global setup for E2E tests
const { chromium } = require('@playwright/test');
const fs = require('fs/promises');
const path = require('path');

async function globalSetup() {
  // Setup test environment
  process.env.TEST_MODE = 'true';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'mongodb://localhost:27017/grant_ai_test';
  
  // Create test data directory
  await fs.mkdir(path.join(__dirname, '../.auth'), { recursive: true });
  
  // Create browser for auth state
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Login and save auth state
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'SecurePassword123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
  
  // Save storage state
  await context.storageState({ path: path.join(__dirname, '../.auth/state.json') });
  
  // Create admin user
  await page.goto('/admin/users');
  await page.click('button:has-text("Create User")');
  await page.fill('#email', 'admin@chaoslab.io');
  await page.fill('#password', 'GrantAI#2024!');
  await page.selectOption('#role', 'admin');
  await page.click('button:has-text("Save User")');
  
  await browser.close();
  
  console.log('✅ E2E test environment setup complete');
}

async function globalTeardown() {
  // Clean up test database
  if (process.env.CLEANUP_DATABASE === 'true') {
    const { dbRouter } = require('../../../backend/services/dbRouter');
    await dbRouter.initialize();
    
    // Clear test collections
    const collections = ['proposals', 'grants', 'users', 'sessions'];
    for (const collection of collections) {
      try {
        await dbRouter.getAdapter().model(collection).deleteMany({});
      } catch (error) {
        console.warn(`⚠️ Failed to clear collection ${collection}:`, error.message);
      }
    }
    
    await dbRouter.shutdown();
    console.log('🧹 Test database cleaned up');
  }
  
  // Remove auth state
  try {
    await fs.unlink(path.join(__dirname, '../.auth/state.json'));
    console.log('🧹 Auth state removed');
  } catch (error) {
    // File might not exist
  }
}

module.exports = {
  globalSetup,
  globalTeardown
};