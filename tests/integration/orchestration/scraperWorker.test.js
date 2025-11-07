const { ScraperWorker } = require('../../../backend/orchestration/scraperWorker');
const { GrantCrawlerAgent } = require('../../../backend/agents/GrantCrawlerAgent');
const { logger } = require('../../../backend/utils/logger');
const { recoveryOrchestrator } = require('../../../backend/orchestration/recoveryOrchestrator');

jest.mock('../../../backend/agents/GrantCrawlerAgent');
jest.mock('../../../backend/utils/logger');
jest.mock('../../../backend/orchestration/recoveryOrchestrator');

describe('ScraperWorker Integration', () => {
  let worker;
  
  beforeEach(() => {
    worker = new ScraperWorker();
    jest.clearAllMocks();
  });

  describe('Job Processing', () => {
    test('should process scraping jobs successfully', async () => {
      const mockResults = [
        {
          title: 'Test Grant 1',
          url: 'https://test.org/grant1',
          deadline: new Date('2025-12-31')
        },
        {
          title: 'Test Grant 2',
          url: 'https://test.org/grant2',
          deadline: new Date('2026-01-15')
        }
      ];
      
      // Mock crawler execution
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockResults),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_123',
        data: { sources: ['NSF', 'Horizon Europe'] }
      };
      
      const result = await worker.processJob(job);
      
      expect(result).toEqual({
        success: true,
        count: 2
      });
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Grant scraping completed'),
        expect.objectContaining({ count: 2 })
      );
    });

    test('should handle crawler initialization failure', async () => {
      // Mock crawler initialization failure
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(new Error('Browser initialization failed')),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_fail',
        data: { sources: ['NSF'] }
      };
      
      await expect(worker.processJob(job))
        .rejects
        .toThrow('Browser initialization failed');
      
      // Should trigger recovery
      expect(recoveryOrchestrator.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          service: 'grant_scraper',
          jobId: 'scraper_job_fail'
        })
      );
    });

    test('should handle empty results gracefully', async () => {
      // Mock crawler returning empty results
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue([]),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_empty',
        data: { sources: ['NSF'] }
      };
      
      const result = await worker.processJob(job);
      
      expect(result).toEqual({
        success: true,
        count: 0
      });
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No grants found'),
        expect.anything()
      );
    });
  });

  describe('Resource Management', () => {
    test('should properly shutdown crawler after job completion', async () => {
      const mockShutdown = jest.fn();
      
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue([]),
        shutdown: mockShutdown
      }));
      
      const job = {
        id: 'scraper_job_shutdown',
        data: { sources: ['NSF'] }
      };
      
      await worker.processJob(job);
      
      expect(mockShutdown).toHaveBeenCalled();
    });

    test('should handle shutdown failures during error handling', async () => {
      const mockShutdown = jest.fn().mockRejectedValue(new Error('Shutdown failed'));
      
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(new Error('Crawling failed')),
        shutdown: mockShutdown
      }));
      
      const job = {
        id: 'scraper_job_shutdown_fail',
        data: { sources: ['NSF'] }
      };
      
      await expect(worker.processJob(job))
        .rejects
        .toThrow('Crawling failed');
      
      // Shutdown should still be called even on failure
      expect(mockShutdown).toHaveBeenCalled();
    });
  });

  describe('Metrics Tracking', () => {
    test('should track scraping metrics', async () => {
      const mockMetrics = {
        increment: jest.fn()
      };
      
      jest.mock('../../../backend/utils/metrics', () => ({
        metrics: mockMetrics
      }), { virtual: true });
      
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue([
          { title: 'Grant 1', url: 'https://test.org/1' },
          { title: 'Grant 2', url: 'https://test.org/2' }
        ]),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_metrics',
        data: { sources: ['NSF'] }
      };
      
      await worker.processJob(job);
      
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'grants_crawled',
        2
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors with proper recovery', async () => {
      const networkError = new Error('Network timeout');
      networkError.code = 'ETIMEDOUT';
      
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(networkError),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_network',
        data: { sources: ['NSF'] }
      };
      
      await expect(worker.processJob(job))
        .rejects
        .toThrow('Network timeout');
      
      expect(recoveryOrchestrator.triggerRecovery).toHaveBeenCalledWith(
        networkError,
        expect.objectContaining({
          service: 'grant_scraper',
          jobId: 'scraper_job_network',
          errorType: 'network'
        })
      );
    });

    test('should handle rate limiting with exponential backoff', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.statusCode = 429;
      
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(rateLimitError),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_rate_limit',
        data: { sources: ['NSF'] },
        attemptsMade: 2 // Second attempt
      };
      
      await expect(worker.processJob(job))
        .rejects
        .toThrow('Rate limit exceeded');
      
      // Should not trigger recovery immediately for rate limiting
      expect(recoveryOrchestrator.triggerRecovery).not.toHaveBeenCalled();
    });
  });

  describe('Source Configuration', () => {
    test('should handle multiple data sources', async () => {
      const mockResults = [
        { title: 'NSF Grant', source: 'NSF' },
        { title: 'Horizon Grant', source: 'Horizon Europe' }
      ];
      
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockResults),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_multiple',
        data: { sources: ['NSF', 'Horizon Europe'] }
      };
      
      const result = await worker.processJob(job);
      
      expect(result.count).toBe(2);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found 2 opportunities')
      );
    });

    test('should handle invalid source configuration', async () => {
      GrantCrawlerAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue([]),
        shutdown: jest.fn()
      }));
      
      const job = {
        id: 'scraper_job_invalid',
        data: { sources: ['INVALID_SOURCE'] }
      };
      
      const result = await worker.processJob(job);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No valid sources configured')
      );
    });
  });
});