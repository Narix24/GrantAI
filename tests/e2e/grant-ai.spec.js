// tests/e2e/grant-ai.spec.js
import { test, expect } from 'playwright/test'

test('Complete grant writing flow', async ({ page }) => {
  // Start the dev server in the background
  // This would typically be in a separate process
  
  await page.goto('http://localhost:3000')
  
  // Test login flow
  await page.click('text=Login')
  await page.fill('input[name="email"]', 'test@example.com')
  await page.fill('input[name="password"]', 'password123')
  await page.click('button:has-text("Sign in")')
  
  // Test proposal creation
  await page.click('text=New Proposal')
  await page.fill('input[name="title"]', 'AI Research Grant')
  await page.fill('textarea[name="mission"]', 'Advancing AI for social good')
  
  // Generate proposal
  await page.click('button:has-text("Generate")')
  await page.waitForResponse('/api/proposals/generate')
  
  // Verify result
  const content = await page.textContent('.proposal-content')
  expect(content).toContain('AI Research Grant')
  
  // Test tone analysis
  await page.click('text=Tone Analysis')
  const tone = await page.textContent('.tone-score')
  expect(tone).toBeGreaterThan(75)
  
  // Test voice playback
  await page.click('button:has-text("Play")')
  expect(page.locator('audio')).toBeVisible()
  
  // Submit proposal
  await page.fill('input[name="recipient"]', 'committee@example.com')
  await page.click('button:has-text("Submit")')
  await expect(page.locator('.success-message')).toBeVisible()
})