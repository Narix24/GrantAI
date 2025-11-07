const { test, expect } = require('@playwright/test');
const { loadFixture } = require('./support/fixtures');
const { mockAPIResponses } = require('./support/commands');

test.describe('Grant Discovery Workflow', () => {
  let testData;
  
  test.beforeAll(async () => {
    testData = await loadFixture('test_grants');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', testData.validUser.email);
    await page.fill('#password', testData.validUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should discover new grants from sources', async ({ page }) => {
    await page.goto('/grants');
    
    // Start discovery process
    await page.click('button:has-text("Discover Grants")');
    
    // Select sources
    await page.click('text=NSF');
    await page.click('text=Horizon Europe');
    await page.click('button:has-text("Start Discovery")');
    
    // Wait for discovery to complete
    await page.waitForSelector('text=Discovery completed!', { timeout: 120000 });
    
    // Verify grants were found
    const grantItems = await page.locator('.grant-item').count();
    expect(grantItems).toBeGreaterThan(5);
    
    // Verify grant details
    const firstGrantTitle = await page.locator('.grant-item:first-child .grant-title').textContent();
    expect(firstGrantTitle).toBeTruthy();
    
    const firstGrantDeadline = await page.locator('.grant-item:first-child .deadline').textContent();
    expect(firstGrantDeadline).toContain('/');
  });

  test('should filter grants by deadline and amount', async ({ page }) => {
    await page.goto('/grants');
    
    // Set filters
    await page.fill('input[name="deadlineFrom"]', '2025-01-01');
    await page.fill('input[name="deadlineTo"]', '2025-12-31');
    await page.fill('input[name="amountMin"]', '10000');
    await page.fill('input[name="amountMax"]', '100000');
    
    // Apply filters
    await page.click('button:has-text("Apply Filters")');
    
    // Verify filtered results
    const grantItems = await page.locator('.grant-item').all();
    
    for (const grant of grantItems) {
      const deadlineText = await grant.locator('.deadline').textContent();
      const deadline = new Date(deadlineText.split(': ')[1]);
      expect(deadline).toBeGreaterThanOrEqual(new Date('2025-01-01'));
      expect(deadline).toBeLessThanOrEqual(new Date('2025-12-31'));
      
      const amountText = await grant.locator('.amount').textContent();
      const amount = parseFloat(amountText.replace(/[^0-9.]/g, ''));
      expect(amount).toBeGreaterThanOrEqual(10000);
      expect(amount).toBeLessThanOrEqual(100000);
    }
  });

  test('should set calendar reminders for grants', async ({ page }) => {
    await page.goto('/grants');
    
    // Find a grant with a deadline
    const grantWithDeadline = await page.locator('.grant-item:has(.deadline)').first();
    const grantTitle = await grantWithDeadline.locator('.grant-title').textContent();
    
    // Click set reminder
    await grantWithDeadline.locator('button:has-text("Set Reminder")').click();
    
    // Set reminder time
    await page.fill('input[name="remindAt"]', '2025-06-01T09:00');
    await page.click('button:has-text("Confirm Reminder")');
    
    // Verify reminder was set
    await page.waitForSelector('text=Reminder set successfully!', { timeout: 5000 });
    
    // Check calendar integration
    await page.click('text=Calendar');
    await page.waitForSelector(`text=${grantTitle}`);
    const calendarEvent = await page.locator(`.calendar-event:has-text("${grantTitle}")`).count();
    expect(calendarEvent).toBe(1);
  });

  test('should handle discovery failures gracefully', async ({ page }) => {
    // Mock API failure for discovery
    await mockAPIResponses(page, {
      '**/api/grants/discover': {
        status: 503,
        body: { error: 'Failed to connect to grant sources' }
      }
    });
    
    await page.goto('/grants');
    await page.click('button:has-text("Discover Grants")');
    await page.click('button:has-text("Start Discovery")');
    
    // Verify error handling
    await page.waitForSelector('text=Failed to connect to grant sources', { timeout: 10000 });
    await expect(page.locator('button:has-text("Retry")')).toBeVisible();
  });

  test('should work in offline mode with SQLite fallback', async ({ page }) => {
    // Simulate offline mode
    await page.context().setOffline(true);
    
    await page.goto('/grants');
    
    // Verify offline mode message
    await page.waitForSelector('text=Offline mode active', { timeout: 5000 });
    
    // Check cached grants
    const cachedGrants = await page.locator('.grant-item').count();
    expect(cachedGrants).toBeGreaterThan(0);
    
    // Try to discover new grants (should fail gracefully)
    await page.click('button:has-text("Discover Grants")');
    await page.waitForSelector('text=No internet connection', { timeout: 5000 });
    
    // Restore online mode
    await page.context().setOffline(false);
    await page.reload();
    await page.waitForSelector('text=Grants', { timeout: 10000 });
  });
});