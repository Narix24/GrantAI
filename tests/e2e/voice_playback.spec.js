const { test, expect } = require('@playwright/test');
const { loadFixture } = require('./support/fixtures');

test.describe('Voice Playback Workflow', () => {
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

  test('should generate and play voice narration', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Generate proposal
    await page.fill('#mission', testData.voiceProposal.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    // Switch to voice playback tab
    await page.click('text=Voice Playback');
    
    // Verify audio player
    await page.waitForSelector('audio', { timeout: 5000 });
    await expect(page.locator('button:has-text("Play")')).toBeVisible();
    
    // Play audio
    const audioElement = page.locator('audio');
    await audioElement.evaluate(node => node.play());
    
    // Verify playback started
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio');
      return audio && !audio.paused;
    }, { timeout: 10000 });
    
    // Check playback time
    const currentTime = await audioElement.evaluate(node => node.currentTime);
    expect(currentTime).toBeGreaterThan(0);
  });

  test('should handle voice generation failures', async ({ page }) => {
    // Mock voice generation API failure
    await page.route('**/api/proposals/*/voice', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Text-to-speech service unavailable' })
      });
    });
    
    await page.goto('/proposals/new');
    await page.fill('#mission', 'Test mission for voice failure');
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('text=Voice Playback');
    
    // Verify error handling
    await page.waitForSelector('text=Text-to-speech service unavailable', { timeout: 10000 });
    await expect(page.locator('button:has-text("Retry")')).toBeVisible();
    
    // Check fallback text display
    const content = await page.locator('.voice-content').textContent();
    expect(content).toContain('Test mission for voice failure');
  });

  test('should control playback speed and volume', async ({ page }) => {
    await page.goto('/proposals/new');
    await page.fill('#mission', testData.voiceControls.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('text=Voice Playback');
    await page.waitForSelector('audio', { timeout: 5000 });
    
    const audioElement = page.locator('audio');
    
    // Test volume control
    const volumeSlider = page.locator('input[type="range"][aria-label="Volume"]');
    await volumeSlider.fill('0.5');
    const volume = await audioElement.evaluate(node => node.volume);
    expect(volume).toBeCloseTo(0.5, 0.1);
    
    // Test playback speed
    const speedSlider = page.locator('input[type="range"][aria-label="Speed"]');
    await speedSlider.fill('1.5');
    const playbackRate = await audioElement.evaluate(node => node.playbackRate);
    expect(playbackRate).toBeCloseTo(1.5, 0.1);
    
    // Verify UI updates
    const speedDisplay = await page.locator('.speed-display').textContent();
    expect(speedDisplay).toContain('1.5x');
    
    const volumeDisplay = await page.locator('.volume-display').textContent();
    expect(volumeDisplay).toContain('50%');
  });

  test('should download audio file', async ({ page }) => {
    await page.goto('/proposals/new');
    await page.fill('#mission', testData.voiceDownload.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 60000 });
    
    await page.click('text=Voice Playback');
    await page.waitForSelector('audio', { timeout: 5000 });
    
    // Intercept download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download Audio")');
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/proposal_.*\.mp3/);
    
    // Verify file size
    const tempPath = await download.path();
    const fileSize = await page.evaluate(async (path) => {
      const fs = require('fs/promises');
      const stats = await fs.stat(path);
      return stats.size;
    }, tempPath);
    
    expect(fileSize).toBeGreaterThan(10000); // At least 10KB
  });

  test('should handle multilingual voice generation', async ({ page }) => {
    await page.goto('/proposals/new');
    
    // Set German language
    await page.selectOption('#language', 'de');
    
    // Generate German proposal
    await page.fill('#mission', testData.germanVoice.mission);
    await page.click('button:has-text("Generate Proposal")');
    await page.waitForSelector('text=Vorschlag erfolgreich generiert!', { timeout: 60000 });
    
    await page.click('text=Voice Playback');
    await page.waitForSelector('audio', { timeout: 5000 });
    
    // Verify German voice
    const audioElement = page.locator('audio');
    await audioElement.evaluate(node => node.play());
    
    // Check language attribute
    const lang = await audioElement.evaluate(node => node.parentElement.getAttribute('lang'));
    expect(lang).toBe('de');
    
    // Verify German content in transcript
    const transcript = await page.locator('.voice-transcript').textContent();
    expect(transcript.toLowerCase()).toContain('forschungsprojekt');
    expect(transcript.toLowerCase()).toContain('finanzierung');
  });
});