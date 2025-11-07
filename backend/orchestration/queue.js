// backend/orchestration/queue.js
import pkg from 'bullmq';
const { Queue, Worker } = pkg; // ✅ Removed QueueScheduler
import IORedis from 'ioredis';
import logger from '../utils/logger.js';
import { recoveryOrchestrator } from './recoveryOrchestrator.js';

let connection = null;
let proposalQueue = null;
let recoveryQueue = null;
let healthCheckInterval = null;

// 🌐 Redis connection options
const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  reconnectOnError: (err) => err.message.includes('READONLY')
};

/**
 * 🧩 Initialize all queues and Redis connection
 */
export async function initializeQueues() {
  try {
    if (process.env.USE_REDIS === 'false') {
      logger.warn('⚠️ Redis disabled — background queues will not be initialized');
      return;
    }

    connection = new IORedis(redisOptions);

    connection.on('error', (error) => {
      logger.error('❌ Redis connection error:', error);
    });

    connection.on('connect', () => {
      logger.info('✅ Redis connection established successfully');
    });

    // ✅ REMOVED QueueScheduler lines:
    // new QueueScheduler('proposal-queue', { connection });
    // new QueueScheduler('recovery-queue', { connection });

    // 📄 Proposal queue
    proposalQueue = new Queue('proposal-queue', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 24 * 3600 }
      },
      limiter: { max: 100, duration: 1000 }
    });

    // 🔁 Recovery queue
    recoveryQueue = new Queue('recovery-queue', { connection });

    logger.info('✅ Queues initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize queues:', error);

    // 🧩 Fallback mode: Direct execution (no Redis)
    logger.warn('⚠️ Running in direct execution mode — jobs will run immediately');
    proposalQueue = {
      add: async (jobType, jobData) => {
        logger.info(`🚀 Directly executing job: ${jobType}`);
        try {
          if (jobType === 'generate_proposal') {
            const { ProposalWriterAgent } = await import('../agents/ProposalWriterAgent.js');
            return new ProposalWriterAgent().execute(jobData.payload);
          }
          if (jobType === 'analyze_tone') {
            const { ToneAnalyzerAgent } = await import('../agents/ToneAnalyzerAgent.js');
            return new ToneAnalyzerAgent().execute(jobData.payload);
          }
          throw new Error(`Unknown job type: ${jobType}`);
        } catch (err) {
          logger.error(`❌ Direct job execution failed:`, err);
          throw err;
        }
      }
    };
  }
}

/**
 * 👷 Register queue workers
 */
export function registerWorkers() {
  if (!proposalQueue?.connection) {
    logger.warn('⚠️ Cannot register workers — queues not initialized or running in fallback mode');
    return;
  }

  try {
    new Worker(
      'proposal-queue',
      async (job) => {
        logger.info(`🔧 Processing job ${job.id} (${job.data.type})`);

        try {
          if (job.data.type === 'generate_proposal') {
            const { ProposalWriterAgent } = await import('../agents/ProposalWriterAgent.js');
            return new ProposalWriterAgent().execute(job.data.payload);
          }

          if (job.data.type === 'analyze_tone') {
            const { ToneAnalyzerAgent } = await import('../agents/ToneAnalyzerAgent.js');
            return new ToneAnalyzerAgent().execute(job.data.payload);
          }

          throw new Error(`Unknown job type: ${job.data.type}`);
        } catch (error) {
          logger.error(`❌ Job ${job.id} failed:`, error);
          throw error;
        }
      },
      {
        connection: proposalQueue.connection,
        concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10'),
        autorun: true
      }
    );

    logger.info('✅ Workers registered successfully');
  } catch (error) {
    logger.error('❌ Failed to register workers:', error);
  }
}

/**
 * 🧠 Health monitoring — logs queue status and triggers recovery if needed
 */
let lastHealthCheck = { waiting: 0, active: 0, completed: 0, failed: 0 };

export function startHealthMonitoring() {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(async () => {
    if (!proposalQueue?.getJobCounts) return;

    try {
      const { waiting, active, completed, failed } = await proposalQueue.getJobCounts();
      const hasChanges =
        waiting !== lastHealthCheck.waiting ||
        active !== lastHealthCheck.active ||
        completed !== lastHealthCheck.completed ||
        failed !== lastHealthCheck.failed;

      const hasActivity = waiting + active + failed > 0;

      if (hasChanges || hasActivity) {
        logger.info(
          `📊 Queue Health — Waiting: ${waiting}, Active: ${active}, Completed: ${completed}, Failed: ${failed}`
        );

        if (failed > lastHealthCheck.failed) {
          logger.warn(`🚨 ${failed} failed jobs detected — triggering recovery`);
          // 🔧 Safe recovery call (Fix 4 from your context)
          if (typeof recoveryOrchestrator.triggerRecoveryForQueue === 'function') {
            recoveryOrchestrator.triggerRecoveryForQueue('proposal-queue');
          } else {
            logger.warn('⚠️ Recovery orchestrator method not available — skipping recovery');
          }
        }

        lastHealthCheck = { waiting, active, completed, failed };
      }
    } catch (error) {
      logger.error('❌ Queue health check failed:', error);
    }
  }, 30000);

  logger.info('✅ Queue health monitoring started');
}

/**
 * 🧹 Graceful shutdown
 */
export async function shutdown() {
  try {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      logger.info('🧹 Queue health monitoring stopped');
    }

    if (proposalQueue) {
      await proposalQueue.close();
      logger.info('🧹 Proposal queue closed');
    }

    if (recoveryQueue) {
      await recoveryQueue.close();
      logger.info('🧹 Recovery queue closed');
    }

    if (connection) {
      await connection.quit();
      logger.info('🧹 Redis connection closed');
    }
  } catch (error) {
    logger.error('❌ Error during queue shutdown:', error);
  }
}

// ✅ Export queue instances
export { proposalQueue, recoveryQueue };