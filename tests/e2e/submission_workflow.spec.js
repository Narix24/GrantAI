const { test, expect } = require('@playwright/test');
const { loadFixture } = require('./support/fixtures');

test.describe('Proposal Submission Workflow', () => {
  let testData;
  
  test.beforeAll(async () => {
    testData = await loadFixture('test_proposals');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', testData.validUser.email);
    await page.fill('#password', testData.validUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should submit proposal via email', async ({ page }) => {
    // Generate a new proposal first
    await page.goto('/proposals/new');
    await page.fill('#mission', testData.submissionProposal.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    // Navigate to submission
    await page.click('button:has-text("Submit Proposal")');
    
    // Fill recipient details
    await page.fill('#recipient', testData.submissionProposal.recipient);
    await page.selectOption('#language', 'en');
    
    // Submit proposal
    const submitPromise = page.waitForResponse('/api/proposals/submit');
    await page.click('button:has-text("Send Proposal")');
    
    const response = await submitPromise;
    expect(response.status()).toBe(200);
    
    // Verify submission success
    await page.waitForSelector('text=Proposal submitted successfully!', { timeout: 10000 });
    
    // Check submission history
    await page.click('text=Dashboard');
    await page.click('text=Recent Submissions');
    const submissions = await page.locator('.submission-item').count();
    expect(submissions).toBeGreaterThan(0);
    
    const latestSubmission = await page.locator('.submission-item:first-child .recipient').textContent();
    expect(latestSubmission).toContain(testData.submissionProposal.recipient);
  });

  test('should handle email submission failures with retries', async ({ page }) => {
    // Mock SMTP failure
    await page.route('**/api/proposals/submit', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'SMTP connection failed' })
      });
    });
    
    await page.goto('/proposals/new');
    await page.fill('#mission', 'Test mission for submission failure');
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('button:has-text("Submit Proposal")');
    await page.fill('#recipient', 'test@example.com');
    await page.click('button:has-text("Send Proposal")');
    
    // Verify error handling
    await page.waitForSelector('text=SMTP connection failed', { timeout: 10000 });
    
    // Check retry options
    await expect(page.locator('button:has-text("Retry")')).toBeVisible();
    await expect(page.locator('button:has-text("Save as Draft")')).toBeVisible();
    
    // Retry submission
    await page.click('button:has-text("Retry")');
    await page.waitForSelector('text=Submission failed after 3 attempts', { timeout: 15000 });
    
    // Ensure proposal is saved as draft after failures
    await page.click('text=Proposals');
    const drafts = await page.locator('text=Status: Draft').count();
    expect(drafts).toBeGreaterThan(0);
  });

  test('should generate PDF attachment for submission', async ({ page }) => {
    await page.goto('/proposals/new');
    await page.fill('#mission', testData.pdfProposal.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('button:has-text("Submit Proposal")');
    await page.fill('#recipient', 'test@example.com');
    
    // Check PDF generation option
    await expect(page.locator('text=Include PDF attachment')).toBeVisible();
    await page.check('input[name="includePdf"]');
    
    // Intercept download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Send Proposal")');
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');
    
    // Verify PDF content
    const tempPath = await download.path();
    const pdfContent = await page.evaluate(async (path) => {
      const fs = require('fs/promises');
      return await fs.readFile(path, 'utf8');
    }, tempPath);
    
    expect(pdfContent).toContain('Proposal');
    expect(pdfContent).toContain(testData.pdfProposal.keywords[0]);
  });

  test('should track submission analytics', async ({ page }) => {
    await page.goto('/proposals/new');
    await page.fill('#mission', testData.analyticsProposal.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('button:has-text("Submit Proposal")');
    await page.fill('#recipient', testData.analyticsProposal.recipient);
    await page.click('button:has-text("Send Proposal")');
    await page.waitForSelector('text=Proposal submitted successfully!', { timeout: 10000 });
    
    // Navigate to analytics dashboard
    await page.click('text=Analytics');
    await page.click('text=Submission Analytics');
    
    // Verify analytics data
    await page.waitForSelector('text=Submission Success Rate', { timeout: 5000 });
    
    const successRate = await page.locator('.success-rate').textContent();
    expect(parseFloat(successRate)).toBeGreaterThanOrEqual(95);
    
    const avgResponseTime = await page.locator('.response-time').textContent();
    expect(parseFloat(avgResponseTime)).toBeLessThan(24); // hours
    
    // Check submission history chart
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('should handle large attachments and content', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Enter large content
    const largeContent = 'This is a test '.repeat(1000); // ~15KB content
    await page.fill('#mission', largeContent);
    
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 120000 });
    
    await page.click('button:has-text("Submit Proposal")');
    await page.fill('#recipient', 'large@attachment.com');
    
    // Add large attachment
    await page.setInputFiles('input[type="file"]', './tests/e2e/fixtures/large_file.pdf');
    
    // Submit with timeout
    await Promise.all([
      page.waitForResponse('/api/proposals/submit', { timeout: 120000 }),
      page.click('button:has-text("Send Proposal")')
    ]);
    
    await page.waitForSelector('text=Proposal submitted successfully!', { timeout: 10000 });
    
    // Verify attachment was included
    const attachmentName = await page.locator('.attachment-name').textContent();
    expect(attachmentName).toContain('large_file.pdf');
  });
});