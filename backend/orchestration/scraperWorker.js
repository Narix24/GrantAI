import { Worker } from 'bullmq';
import { GrantCrawlerAgent } from '../agents/GrantCrawlerAgent.js';
import { logger } from '../utils/logger.js';
import { recoveryOrchestrator } from './recoveryOrchestrator.js';
import { queue } from './queue.js';

export function registerScraperWorker() {
  new Worker('scraper-queue', async (job) => {
    logger.info(`🕷️ Starting grant scraping job [${job.id}]`);
    
    const crawler = new GrantCrawlerAgent();
    try {
      const results = await crawler.execute();
      
      // 📊 Track metrics
      import('../utils/metrics.js').then(({ metrics }) => {
        metrics.increment('grants_crawled', results.length);
      });
      
      logger.info(`✅ Grant scraping completed. Found ${results.length} opportunities`);
      return { success: true, count: results.length };
    } catch (error) {
      logger.error(`❌ Scraper job failed [${job.id}]`, error);
      
      // 🔄 Trigger recovery
      await recoveryOrchestrator.triggerRecovery(error, { 
        service: 'grant_scraper',
        jobId: job.id
      });
      
      throw error;
    } finally {
      await crawler.shutdown();
    }
  }, {
    connection: queue.connection,
    concurrency: 2,
    lockDuration: 300000 // 5 minutes
  });
  
  logger.info('✅ Scraper worker registered');
}