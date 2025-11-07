export const BULLMQ_CONFIG = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      return Math.min(times * 50, 2000);
    }
  },
  queues: {
    proposal: {
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: { age: 3600 }, // 1 hour
        removeOnFail: { age: 86400 } // 24 hours
      },
      limiter: {
        max: 100,
        duration: 1000
      }
    },
    recovery: {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    },
    chaos: {
      defaultJobOptions: {
        attempts: 1
      }
    }
  },
  workers: {
    proposal: {
      concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 10,
      lockDuration: 30000
    },
    recovery: {
      concurrency: 5,
      lockDuration: 60000
    },
    chaos: {
      concurrency: 2,
      lockDuration: 5000
    }
  }
};