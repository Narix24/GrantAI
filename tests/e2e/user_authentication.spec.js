const { test, expect } = require('@playwright/test');
const { loadFixture } = require('./support/fixtures');

test.describe('User Authentication Workflow', () => {
  let testData;
  
  test.beforeAll(async () => {
    testData = await loadFixture('user_credentials');
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill login form
    await page.fill('#email', testData.validUser.email);
    await page.fill('#password', testData.validUser.password);
    await page.click('button[type="submit"]');
    
    // Verify successful login
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    await expect(page.locator('text=Welcome, Test User')).toBeVisible();
    
    // Check user menu
    await page.click('button[aria-label="User menu"]');
    await expect(page.locator('text=Profile')).toBeVisible();
    await expect(page.locator('text=Logout')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Try invalid credentials
    await page.fill('#email', 'invalid@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Verify error message
    await page.waitForSelector('text=Invalid credentials', { timeout: 5000 });
    await expect(page).toHaveURL('/login');
  });

  test('should handle Google OAuth login', async ({ page }) => {
    await page.goto('/login');
    
    // Click Google login button
    await page.click('button:has-text("Sign in with Google")');
    
    // Handle Google login popup
    const popupPromise = page.waitForEvent('popup');
    const [popup] = await Promise.all([
      popupPromise,
      page.click('button:has-text("Sign in with Google")')
    ]);
    
    // Fill Google credentials in popup
    await popup.fill('input[type="email"]', testData.googleUser.email);
    await popup.click('button:has-text("Next")');
    await popup.fill('input[type="password"]', testData.googleUser.password);
    await popup.click('button:has-text("Next")');
    
    // Wait for popup to close
    await popup.waitForEvent('close');
    
    // Verify successful login
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
    await expect(page.locator('text=Welcome, Google User')).toBeVisible();
  });

  test('should handle password reset flow', async ({ page }) => {
    await page.goto('/login');
    
    // Start password reset
    await page.click('text=Forgot password?');
    
    // Fill reset form
    await page.fill('#reset-email', testData.validUser.email);
    await page.click('button:has-text("Send Reset Link")');
    
    // Verify reset email sent
    await page.waitForSelector('text=Reset link sent to your email', { timeout: 5000 });
    
    // Mock reset token
    const resetToken = 'mock_reset_token';
    await page.goto(`/reset-password?token=${resetToken}`);
    
    // Fill new password
    await page.fill('#new-password', 'NewSecurePassword123!');
    await page.fill('#confirm-password', 'NewSecurePassword123!');
    await page.click('button:has-text("Reset Password")');
    
    // Verify success
    await page.waitForSelector('text=Password reset successfully!', { timeout: 5000 });
    await expect(page).toHaveURL('/login');
  });

  test('should handle session timeout and refresh', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', testData.validUser.email);
    await page.fill('#password', testData.validUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Mock session expiration
    await page.context().addCookies([{
      name: 'token',
      value: 'expired_token',
      domain: 'localhost',
      path: '/',
      expires: -1 // Expired
    }]);
    
    // Try to navigate to a protected page
    await page.goto('/proposals');
    
    // Should be redirected to login
    await expect(page).toHaveURL('/login', { timeout: 5000 });
    
    // Verify session expired message
    await expect(page.locator('text=Your session has expired')).toBeVisible();
    
    // Login again
    await page.fill('#email', testData.validUser.email);
    await page.fill('#password', testData.validUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Verify automatic token refresh
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find(c => c.name === 'token');
    expect(tokenCookie).toBeTruthy();
    expect(tokenCookie.value).not.toBe('expired_token');
  });

  test('should handle concurrent sessions properly', async ({ browser }) => {
    // Create two browser contexts
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // Login to both contexts
    await Promise.all([
      page1.goto('/login'),
      page2.goto('/login')
    ]);
    
    await Promise.all([
      page1.fill('#email', testData.validUser.email),
      page2.fill('#email', testData.validUser.email)
    ]);
    
    await Promise.all([
      page1.fill('#password', testData.validUser.password),
      page2.fill('#password', testData.validUser.password)
    ]);
    
    await Promise.all([
      page1.click('button[type="submit"]'),
      page2.click('button[type="submit"]')
    ]);
    
    await Promise.all([
      expect(page1).toHaveURL('/dashboard'),
      expect(page2).toHaveURL('/dashboard')
    ]);
    
    // Perform action in first session
    await page1.goto('/proposals');
    await page1.click('button:has-text("New Proposal")');
    
    // Log out from second session
    await page2.goto('/settings');
    await page2.click('button:has-text("Logout")');
    await expect(page2).toHaveURL('/login');
    
    // First session should still be active
    await page1.fill('#mission', 'Test mission after logout');
    await expect(page1).toHaveURL('/proposals/new');
    
    // Clean up
    await context1.close();
    await context2.close();
  });
});