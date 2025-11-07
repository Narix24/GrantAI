const { test, expect } = require('@playwright/test');
const { loadFixture } = require('./support/fixtures');

test.describe('Tone Analysis Workflow', () => {
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

  test('should analyze tone of generated proposal', async ({ page }) => {
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
    
    const primaryTone = await page.locator('.primary-tone').textContent();
    expect(primaryTone.toLowerCase()).toContain('formal');
    
    const confidenceScore = await page.locator('.confidence-score').textContent();
    const confidence = parseFloat(confidenceScore);
    expect(confidence).toBeGreaterThan(70);
    
    // Check detected keywords
    const keywords = await page.locator('.keyword-chip').allTextContents();
    expect(keywords.length).toBeGreaterThan(3);
    expect(keywords.join(' ').toLowerCase()).toContain('therefore');
    expect(keywords.join(' ').toLowerCase()).toContain('respectfully');
  });

  test('should align proposal tone with funder preferences', async ({ page }) => {
    await page.goto('/grants');
    
    // Select a grant with known tone preferences
    await page.click('text=NSF Research Grant');
    await page.click('button:has-text("View Details")');
    
    // Check funder tone preference
    const funderTone = await page.locator('.funder-tone').textContent();
    expect(funderTone.toLowerCase()).toContain('technical');
    
    // Create proposal from this grant
    await page.click('button:has-text("Create Proposal")');
    
    // Verify tone is set to match funder
    const selectedTone = await page.locator('#tone').inputValue();
    expect(selectedTone).toBe('technical');
    
    // Generate proposal
    await page.fill('#mission', testData.technicalProposal.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    // Check alignment score
    await page.click('text=Tone Analysis');
    await page.waitForSelector('.alignment-score', { timeout: 10000 });
    
    const alignmentScore = await page.locator('.alignment-score').textContent();
    const alignment = parseFloat(alignmentScore);
    expect(alignment).toBeGreaterThan(80);
  });

  test('should suggest tone improvements', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Generate proposal with mismatched tone
    await page.fill('#mission', testData.mismatchedProposal.mission);
    await page.selectOption('#tone', 'emotional');
    await page.click('button:has-text("Generate Proposal")');
    
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('text=Tone Analysis');
    await page.waitForSelector('.improvement-suggestions', { timeout: 10000 });
    
    // Check improvement suggestions
    const suggestions = await page.locator('.suggestion-item').allTextContents();
    expect(suggestions.length).toBeGreaterThan(2);
    expect(suggestions.join(' ').toLowerCase()).toContain('increase');
    expect(suggestions.join(' ').toLowerCase()).toContain('formal');
    
    // Apply improvements
    await page.click('button:has-text("Improve Tone")');
    await page.waitForSelector('text=Tone improved successfully!', { timeout: 5000 });
    
    // Verify improved content
    const improvedContent = await page.locator('.improved-content').textContent();
    expect(improvedContent.toLowerCase()).toContain('therefore');
    expect(improvedContent.toLowerCase()).toContain('consequently');
  });

  test('should work with multilingual content', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Set German language
    await page.selectOption('#language', 'de');
    
    // Generate German proposal
    await page.fill('#mission', testData.germanProposal.mission);
    await page.click('button:has-text("Generate Proposal")');
    
    await page.waitForSelector('text=Vorschlag erfolgreich generiert!', { timeout: 60000 });
    
    // Switch to tone analysis
    await page.click('text=Tone Analysis');
    
    // Verify German tone analysis
    await page.waitForSelector('.tone-score', { timeout: 10000 });
    
    const primaryTone = await page.locator('.primary-tone').textContent();
    expect(primaryTone.toLowerCase()).toContain('formell');
    
    // Check German keywords
    const keywords = await page.locator('.keyword-chip').allTextContents();
    expect(keywords.join(' ').toLowerCase()).toContain('folglich');
    expect(keywords.join(' ').toLowerCase()).toContain('daher');
  });

  test('should handle tone analysis failures gracefully', async ({ page }) => {
    // Mock tone analysis API failure
    await page.route('**/api/proposals/analyze-tone', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Tone analysis service unavailable' })
      });
    });
    
    await page.goto('/proposals/new');
    await page.fill('#mission', 'Test mission for tone analysis failure');
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('text=Tone Analysis');
    
    // Verify error handling
    await page.waitForSelector('text=Tone analysis service unavailable', { timeout: 10000 });
    await expect(page.locator('button:has-text("Retry")')).toBeVisible();
    
    // Retry should work when service is restored
    await page.unroute('**/api/proposals/analyze-tone');
    await page.click('button:has-text("Retry")');
    
    await page.waitForSelector('.tone-score', { timeout: 10000 });
    const primaryTone = await page.locator('.primary-tone').textContent();
    expect(primaryTone).toBeTruthy();
  });
});