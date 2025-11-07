const { test, expect } = require('@playwright/test');
const { loadFixture } = require('./support/fixtures');

test.describe('Proposal Generation Workflow', () => {
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

  test('should generate a proposal with AI', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Fill proposal form
    await page.fill('#title', testData.newProposal.title);
    await page.fill('#mission', testData.newProposal.mission);
    await page.selectOption('#language', 'en');
    await page.selectOption('#tone', 'formal');
    
    // Select opportunity
    await page.click('button:has-text("Select Opportunity")');
    await page.click(`text=${testData.newProposal.opportunity}`);
    await page.click('button:has-text("Confirm Selection")');
    
    // Generate proposal
    const generatePromise = page.waitForResponse('/api/proposals/generate');
    await page.click('button:has-text("Generate Proposal")');
    
    const response = await generatePromise;
    expect(response.status()).toBe(202);
    
    // Wait for generation to complete
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    // Verify content
    const content = await page.textContent('.proposal-content');
    expect(content).toContain(testData.newProposal.expectedKeywords[0]);
    expect(content).toContain(testData.newProposal.expectedKeywords[1]);
    
    // Save proposal
    await page.click('button:has-text("Save Draft")');
    await page.waitForSelector('text=Proposal saved successfully!');
  });

  test('should handle generation failure gracefully', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Simulate AI service failure
    await page.context().route('**/api/proposals/generate', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'AI service temporarily unavailable' })
      });
    });
    
    // Attempt generation
    await page.fill('#mission', 'This should fail');
    await page.click('button:has-text("Generate Proposal")');
    
    // Verify error handling
    await page.waitForSelector('text=AI service temporarily unavailable', { timeout: 10000 });
    await expect(page.locator('button:has-text("Retry")')).toBeVisible();
  });

  test('should work with multilingual content', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Set German language
    await page.selectOption('#language', 'de');
    
    // Generate German proposal
    await page.fill('#mission', testData.germanProposal.mission);
    await page.click('button:has-text("Generate Proposal")');
    
    await page.waitForSelector('text=Vorschlag erfolgreich generiert!', { timeout: 60000 });
    
    // Verify German content
    const content = await page.textContent('.proposal-content');
    expect(content).toContain('Forschungsprojekt');
    expect(content).toContain('Finanzierung');
  });

  test('should analyze tone correctly', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Generate proposal with formal tone
    await page.fill('#mission', testData.formalProposal.mission);
    await page.selectOption('#tone', 'formal');
    await page.click('button:has-text("Generate Proposal")');
    
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    // Switch to tone analysis tab
    await page.click('text=Tone Analysis');
    
    // Verify tone analysis results
    await page.waitForSelector('.tone-score', { timeout: 10000 });
    const primaryTone = await page.textContent('.primary-tone');
    expect(primaryTone).toContain('formal');
    
    const confidence = await page.textContent('.confidence-score');
    expect(parseFloat(confidence)).toBeGreaterThan(70);
  });

  test('should handle large content generation', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Enter large mission statement
    await page.fill('#mission', testData.largeProposal.mission);
    
    // Start generation
    const startTime = Date.now();
    await page.click('button:has-text("Generate Proposal")');
    
    // Wait for completion with extended timeout
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 120000 });
    
    // Verify performance
    const endTime = Date.now();
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(90000); // Should complete within 90 seconds
    
    // Verify content length
    const content = await page.textContent('.proposal-content');
    expect(content.length).toBeGreaterThan(2000);
  });
});