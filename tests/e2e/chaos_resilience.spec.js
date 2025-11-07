const { test, expect } = require('@playwright/test');
const { v4: uuidv4 } = require('uuid');

test.describe('Chaos Resilience Testing', () => {
  test('should recover from database failure', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('#email', 'admin@chaoslab.io');
    await page.fill('#password', 'GrantAI#2024!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to chaos controls
    await page.click('text=System');
    await page.click('text=Chaos Controls');
    
    // Trigger database disconnection
    await page.selectOption('#experiment-type', 'db_disconnect');
    await page.selectOption('#duration', '30');
    await page.click('button:has-text("Start Chaos Experiment")');
    
    // Verify experiment started
    await page.waitForSelector('text=Experiment started successfully!', { timeout: 5000 });
    
    // Check system health during failure
    await page.click('text=Health Monitor');
    await page.waitForSelector('text=DEGRADED', { timeout: 10000 });
    
    // Verify automatic recovery
    await page.waitForSelector('text=HEALTHY', { timeout: 60000 });
    
    // Verify data integrity
    await page.click('text=Proposals');
    const proposalCount = await page.locator('.proposal-item').count();
    expect(proposalCount).toBeGreaterThan(0);
  });

  test('should handle AI provider failures with fallbacks', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@chaoslab.io');
    await page.fill('#password', 'GrantAI#2024!');
    await page.click('button[type="submit"]');
    
    // Navigate to chaos controls
    await page.click('text=System');
    await page.click('text=Chaos Controls');
    
    // Trigger AI provider failure
    await page.selectOption('#experiment-type', 'provider_failure');
    await page.selectOption('#duration', '45');
    await page.click('button:has-text("Start Chaos Experiment")');
    
    // Start proposal generation during failure
    await page.click('text=Proposals');
    await page.click('button:has-text("New Proposal")');
    
    await page.fill('#mission', 'Test mission during AI failure');
    await page.click('button:has-text("Generate Proposal")');
    
    // Verify system uses fallback provider
    await page.waitForSelector('text=Proposal generated successfully!', { timeout: 120000 });
    
    // Verify proposal content
    const content = await page.textContent('.proposal-content');
    expect(content).toContain('successfully');
  });

  test('should maintain queue integrity during system overload', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@chaoslab.io');
    await page.fill('#password', 'GrantAI#2024!');
    await page.click('button[type="submit"]');
    
    // Navigate to chaos controls
    await page.click('text=System');
    await page.click('text=Chaos Controls');
    
    // Trigger system overload
    await page.selectOption('#experiment-type', 'cpu_spike');
    await page.selectOption('#duration', '60');
    await page.click('button:has-text("Start Chaos Experiment")');
    
    // Submit multiple proposals
    const proposalIds = [];
    for (let i = 0; i < 5; i++) {
      await page.click('text=Proposals');
      await page.click('button:has-text("New Proposal")');
      
      await page.fill('#mission', `Test mission ${i + 1}`);
      const generatePromise = page.waitForResponse('/api/proposals/generate');
      await page.click('button:has-text("Generate Proposal")');
      
      const response = await generatePromise;
      const data = await response.json();
      proposalIds.push(data.proposalId);
      
      await page.waitForTimeout(1000);
    }
    
    // Verify all jobs are queued
    await page.click('text=System');
    await page.click('text=Health Monitor');
    await page.waitForSelector('text=QUEUE', { timeout: 5000 });
    
    const queueLength = await page.textContent('text=Queue Length');
    const queueNumber = parseInt(queueLength.match(/\d+/)[0]);
    expect(queueNumber).toBeGreaterThanOrEqual(5);
    
    // Wait for recovery and completion
    await page.waitForSelector('text=HEALTHY', { timeout: 120000 });
    
    // Verify all proposals were processed
    await page.click('text=Proposals');
    const completedCount = await page.locator('text=Status: Completed').count();
    expect(completedCount).toBeGreaterThanOrEqual(5);
  });

  test('should recover from memory leak scenarios', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@chaoslab.io');
    await page.fill('#password', 'GrantAI#2024!');
    await page.click('button[type="submit"]');
    
    // Start memory monitoring
    let memoryUsage = [];
    page.on('console', msg => {
      if (msg.text().includes('memory_usage')) {
        const usage = JSON.parse(msg.text().replace('memory_usage: ', ''));
        memoryUsage.push(usage);
      }
    });
    
    await page.evaluate(() => {
      setInterval(() => {
        // Simulate memory usage reporting
        const usage = process.memoryUsage();
        console.log(`memory_usage: ${JSON.stringify(usage)}`);
      }, 1000);
    });
    
    // Trigger memory leak
    await page.click('text=System');
    await page.click('text=Chaos Controls');
    await page.selectOption('#experiment-type', 'memory_leak');
    await page.selectOption('#duration', '20');
    await page.click('button:has-text("Start Chaos Experiment")');
    
    // Monitor memory usage
    await page.waitForTimeout(30000);
    
    // Verify recovery
    await page.click('text=Health Monitor');
    await page.waitForSelector('text=HEALTHY', { timeout: 60000 });
    
    // Verify memory stabilization
    const finalMemory = memoryUsage[memoryUsage.length - 1];
    const peakMemory = Math.max(...memoryUsage.map(m => m.heapUsed));
    
    console.log(`Peak memory: ${peakMemory / 1024 / 1024} MB`);
    console.log(`Final memory: ${finalMemory.heapUsed / 1024 / 1024} MB`);
    
    // Memory should stabilize after recovery
    expect(finalMemory.heapUsed).toBeLessThan(peakMemory * 0.8);
  });
});