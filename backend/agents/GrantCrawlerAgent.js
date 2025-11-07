import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
import { logger } from '../utils/logger.js';
import { dbRouter } from '../services/dbRouter.js';

export class GrantCrawlerAgent {
  constructor() {
    this.sources = [
      { name: 'NSF', url: 'https://www.nsf.gov/funding/', selector: '.award-search-result' },
      { name: 'Horizon Europe', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-search', selector: '.topic-card' },
      { name: 'Wellcome Trust', url: 'https://wellcome.org/grant-funding/schemes', selector: '.scheme-card' }
    ];
    this.browser = null;
  }

  async initialize() {
    if (this.browser) return this.browser;
    
    this.browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      timeout: 30000
    });
    
    return this.browser;
  }

  async execute() {
    await this.initialize();
    const results = [];
    
    for (const source of this.sources) {
      try {
        logger.info(`🔍 Crawling ${source.name} grants`);
        const page = await this.browser.newPage();
        
        // Set realistic viewport and user agent
        await page.setViewport({ width: 1200, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36');
        
        // Navigate with timeout and error handling
        await Promise.race([
          page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 }),
          new Promise(resolve => setTimeout(resolve, 65000))
        ]);
        
        // Handle consent dialogs
        await this.handleConsentDialogs(page);
        
        // Extract grants
        const html = await page.content();
        const $ = cheerio.load(html);
        const grants = this.parseGrants($, source);
        
        results.push(...grants);
        logger.info(`✅ Found ${grants.length} grants from ${source.name}`);
        
        await page.close();
      } catch (error) {
        logger.error(`❌ Crawling failed for ${source.name}`, error);
        // Trigger recovery in case of persistent failures
        import('../orchestration/recoveryOrchestrator.js').then(({ recoveryOrchestrator }) => {
          recoveryOrchestrator.triggerRecovery(error, { service: 'grant_crawler', source: source.name });
        });
      }
    }
    
    // 🗃️ Save to database
    await this.saveGrants(results);
    return results;
  }

  async handleConsentDialogs(page) {
    // Common consent patterns
    const consentSelectors = [
      'button:contains("Accept")',
      'button:contains("I agree")',
      '#cookie-accept',
      '.consent-button'
    ];
    
    for (const selector of consentSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        await page.waitForTimeout(1000);
        logger.info('✅ Handled consent dialog');
        return;
      } catch (e) {
        // Continue to next selector
      }
    }
  }

  parseGrants($, source) {
    const grants = [];
    $(source.selector).each((index, element) => {
      try {
        const title = $(element).find('h3, .title, .heading').text().trim();
        const description = $(element).find('.description, .summary, p').text().trim();
        const deadline = this.extractDeadline($(element), source.name);
        const amount = this.extractAmount($(element));
        const url = $(element).find('a').attr('href');
        
        if (title && url) {
          grants.push({
            title,
            description,
            deadline: deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
            amount,
            currency: amount ? 'USD' : null,
            organization: source.name,
            url: url.startsWith('http') ? url : `${new URL(source.url).origin}${url}`,
            categories: this.extractCategories($(element), source.name),
            language: 'en',
            source: source.name,
            lastCrawled: new Date()
          });
        }
      } catch (error) {
        logger.warn(`⚠️ Failed to parse grant item`, error);
      }
    });
    
    return grants;
  }

  extractDeadline($element, source) {
    // Source-specific deadline extraction
    if (source === 'NSF') {
      const dateText = $element.find('.deadline-date').text();
      return dateText ? new Date(dateText) : null;
    }
    
    if (source === 'Horizon Europe') {
      const dateText = $element.find('.topic-deadline').text();
      return dateText ? new Date(dateText.replace('Deadline: ', '')) : null;
    }
    
    return null;
  }

  extractAmount($element) {
    const amountText = $element.find('.amount, .funding, .budget').text();
    const match = amountText.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }

  extractCategories($element, source) {
    if (source === 'NSF') {
      return $element.find('.program-area').text().split(',').map(c => c.trim());
    }
    return ['research', 'innovation'];
  }

  async saveGrants(grants) {
    if (grants.length === 0) return;
    
    const db = dbRouter.getAdapter();
    const now = new Date();
    
    for (const grant of grants) {
      try {
        // Upsert grant with conflict resolution
        if (db.model) {
          // MongoDB
          await db.model('Grant').updateOne(
            { url: grant.url },
            { ...grant, lastCrawled: now },
            { upsert: true, runValidators: true }
          );
        } else {
          // SQLite
          await db.adapters.sqlite.run(`
            INSERT INTO grants (url, title, description, deadline, amount, currency, organization, categories, language, source, lastCrawled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
              title = excluded.title,
              description = excluded.description,
              deadline = excluded.deadline,
              amount = excluded.amount,
              currency = excluded.currency,
              organization = excluded.organization,
              categories = excluded.categories,
              language = excluded.language,
              source = excluded.source,
              lastCrawled = excluded.lastCrawled
          `, [
            grant.url,
            grant.title,
            grant.description,
            grant.deadline.toISOString(),
            grant.amount,
            grant.currency,
            grant.organization,
            JSON.stringify(grant.categories),
            grant.language,
            grant.source,
            now.toISOString()
          ]);
        }
      } catch (error) {
        logger.error(`❌ Failed to save grant: ${grant.title}`, error);
      }
    }
    
    logger.info(`💾 Saved ${grants.length} grants to database`);
  }

  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('🧹 Puppeteer browser closed');
    }
  }
}