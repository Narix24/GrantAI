const { GrantCrawlerAgent } = require('../../../backend/agents/GrantCrawlerAgent');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { logger } = require('../../../backend/utils/logger');

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn(),
      setContent: jest.fn(),
      content: jest.fn().mockResolvedValue(`
        <div class="award-search-result">
          <h3>NSF Test Grant</h3>
          <p class="description">Test grant description</p>
          <p class="deadline-date">2025-12-31</p>
          <p class="amount">$50,000</p>
          <a href="/grant/123">View Details</a>
        </div>
      `),
      close: jest.fn()
    }),
    close: jest.fn()
  })
}));

jest.mock('../../../backend/services/dbRouter', () => ({
  dbRouter: {
    getAdapter: jest.fn().mockReturnValue({
      model: jest.fn().mockImplementation(() => ({
        updateOne: jest.fn()
      })),
      adapters: {
        sqlite: {
          run: jest.fn()
        }
      }
    }),
    initialize: jest.fn(),
    shutdown: jest.fn()
  }
}));

describe('GrantCrawlerAgent Integration', () => {
  let crawler;
  
  beforeEach(() => {
    crawler = new GrantCrawlerAgent();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize browser successfully', async () => {
      await crawler.initialize();
      
      expect(crawler.browser).toBeDefined();
      expect(require('puppeteer').launch).toHaveBeenCalledWith({
        args: expect.arrayContaining([
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]),
        executablePath: expect.anything(),
        headless: true,
        timeout: 30000
      });
    });

    test('should use system puppeteer path when not specified', async () => {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      await crawler.initialize();
      
      expect(require('puppeteer').launch).toHaveBeenCalledWith(expect.objectContaining({
        executablePath: undefined
      }));
    });
  });

  describe('Grant Crawling', () => {
    test('should crawl grants from NSF source', async () => {
      await crawler.initialize();
      
      const results = await crawler.crawlSource({
        name: 'NSF',
        url: 'https://www.nsf.gov/funding/',
        selector: '.award-search-result'
      });
      
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({
        title: 'NSF Test Grant',
        description: 'Test grant description',
        deadline: expect.any(Date),
        amount: 50000,
        currency: 'USD',
        organization: 'NSF',
        url: 'https://www.nsf.gov/grant/123',
        categories: ['research', 'innovation'],
        language: 'en',
        source: 'NSF',
        lastCrawled: expect.any(Date)
      });
    });

    test('should handle consent dialogs during crawling', async () => {
      const mockPage = {
        waitForSelector: jest.fn(),
        click: jest.fn(),
        waitForTimeout: jest.fn()
      };
      
      await crawler.handleConsentDialogs(mockPage);
      
      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(4);
      expect(mockPage.click).not.toHaveBeenCalled();
    });

    test('should extract deadline correctly for different sources', () => {
      const $ = require('cheerio').load(`
        <div class="topic-card">
          <div class="topic-deadline">Deadline: 2025-06-15</div>
        </div>
      `);
      
      const deadline = crawler.extractDeadline($, 'Horizon Europe');
      expect(deadline).toEqual(new Date('2025-06-15'));
    });

    test('should extract amount with currency formatting', async () => {
      const $ = require('cheerio').load(`
        <div class="scheme-card">
          <p class="amount">$75,000 USD</p>
        </div>
      `);
      
      const amount = crawler.extractAmount($);
      expect(amount).toBe(75000);
    });
  });

  describe('Data Persistence', () => {
    test('should save grants to MongoDB', async () => {
      // Mock MongoDB adapter
      dbRouter.getAdapter.mockReturnValue({
        model: () => ({
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
        })
      });
      
      const grants = [{
        title: 'Test Grant',
        description: 'Test description',
        deadline: new Date('2025-12-31'),
        amount: 50000,
        currency: 'USD',
        organization: 'Test Org',
        url: 'https://test.org/grant',
        categories: ['test'],
        language: 'en',
        source: 'Test',
        lastCrawled: new Date()
      }];
      
      await crawler.saveGrants(grants);
      
      expect(dbRouter.getAdapter().model).toHaveBeenCalledWith('Grant');
      expect(dbRouter.getAdapter().model().updateOne).toHaveBeenCalledWith(
        { url: 'https://test.org/grant' },
        expect.objectContaining({
          title: 'Test Grant',
          amount: 50000
        }),
        {
          upsert: true,
          runValidators: true
        }
      );
    });

    test('should save grants to SQLite', async () => {
      // Mock SQLite adapter
      dbRouter.getAdapter.mockReturnValue({
        adapters: {
          sqlite: {
            run: jest.fn().mockResolvedValue({ changes: 1 })
          }
        }
      });
      
      const grants = [{
        title: 'SQLite Test Grant',
        description: 'SQLite test description',
        deadline: new Date('2025-12-31'),
        amount: 75000,
        currency: 'USD',
        organization: 'SQLite Org',
        url: 'https://sqlite.org/grant',
        categories: ['sqlite'],
        language: 'en',
        source: 'SQLite',
        lastCrawled: new Date()
      }];
      
      await crawler.saveGrants(grants);
      
      expect(dbRouter.getAdapter().adapters.sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO grants'),
        expect.any(Array)
      );
    });

    test('should handle save failures gracefully', async () => {
      console.error = jest.fn();
      
      // Mock failure
      dbRouter.getAdapter.mockReturnValue({
        model: () => ({
          updateOne: jest.fn().mockRejectedValue(new Error('Database error'))
        })
      });
      
      const grants = [{
        title: 'Failing Grant',
        url: 'https://fail.org/grant'
      }];
      
      await crawler.saveGrants(grants);
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save grant'),
        expect.any(Error)
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle browser initialization failure', async () => {
      require('puppeteer').launch.mockRejectedValue(new Error('Browser launch failed'));
      
      await expect(crawler.initialize()).rejects.toThrow('Browser launch failed');
    });

    test('should handle page navigation failure', async () => {
      const mockPage = {
        goto: jest.fn().mockRejectedValue(new Error('Navigation failed')),
        close: jest.fn()
      };
      
      jest.spyOn(crawler.browser, 'newPage').mockResolvedValue(mockPage);
      
      await expect(crawler.crawlSource({
        name: 'Failing Source',
        url: 'https://fail.com',
        selector: '.item'
      })).rejects.toThrow('Navigation failed');
      
      expect(mockPage.close).toHaveBeenCalled();
    });

    test('should trigger recovery on persistent failures', async () => {
      const mockRecovery = {
        triggerRecovery: jest.fn()
      };
      
      jest.mock('../../../backend/orchestration/recoveryOrchestrator', () => ({
        recoveryOrchestrator: mockRecovery
      }), { virtual: true });
      
      require('puppeteer').launch.mockRejectedValue(new Error('Persistent browser failure'));
      
      await crawler.execute();
      
      expect(mockRecovery.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          service: 'grant_crawler',
          source: 'NSF'
        })
      );
    });
  });

  describe('Shutdown', () => {
    test('should close browser on shutdown', async () => {
      await crawler.initialize();
      const closeSpy = jest.spyOn(crawler.browser, 'close');
      
      await crawler.shutdown();
      
      expect(closeSpy).toHaveBeenCalled();
      expect(crawler.browser).toBeNull();
    });
  });
});