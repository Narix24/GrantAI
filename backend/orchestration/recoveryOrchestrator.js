// backend/orchestration/recoveryOrchestrator.js
import { dbRouter } from '../services/dbRouter.js';
import { logger } from '../utils/logger.js';
import { aiService } from '../services/aiService.js';

class RecoveryOrchestrator {
  constructor() {
    // bind methods
    this.handleDBFailure = this.handleDBFailure.bind(this);
    this.handleAIFailure = this.handleAIFailure.bind(this);
    this.handleEmailFailure = this.handleEmailFailure.bind(this);
    this.handleVectorStoreFailure = this.handleVectorStoreFailure.bind(this);
    this.defaultRecovery = this.defaultRecovery.bind(this);
    this.processRecoveryJob = this.processRecoveryJob.bind(this);
    this.triggerRecoveryForQueue = this.triggerRecoveryForQueue.bind(this);

    // recovery strategies
    this.recoveryStrategies = {
      db_connection: this.handleDBFailure,
      ai_provider: this.handleAIFailure,
      email_service: this.handleEmailFailure,
      vector_store: this.handleVectorStoreFailure,
    };

    this.failureHistory = new Map();
    this.someSet = new Set();
  }

  /* ---------- failure classification ---------- */
  classifyFailure(err, context = {}) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('mongo')) return 'db_connection';
    if (msg.includes('gemini') || msg.includes('openai')) return 'ai_provider';
    if (msg.includes('smtp')) return 'email_service';
    if (msg.includes('chroma')) return 'vector_store';
    return context.service || 'unknown';
  }

  async triggerRecovery(err, context = {}) {
    try {
      const failureType = this.classifyFailure(err, context);
      const recoveryData = {
        failureType,
        timestamp: new Date().toISOString(),
        context,
        error: { message: err?.message, stack: err?.stack, code: err?.code },
      };

      const history = this.failureHistory.get(failureType) || [];
      history.push(recoveryData);
      // keep last 10
      this.failureHistory.set(failureType, history.slice(-10));

      logger.warn(`🔄 Triggering recovery for ${failureType}`, recoveryData);

      if (history.length >= 5 && this.isRecentFailure(history)) {
        await this.escalateFailure(failureType, history);
      }

      const strategy = this.recoveryStrategies[failureType];
      if (typeof strategy === 'function') return strategy.call(this, recoveryData);
      return this.defaultRecovery(recoveryData);
    } catch (triggerErr) {
      logger.error('TriggerRecovery failed', triggerErr);
      // fallback enqueue
      try {
        return this.defaultRecovery({ failureType: 'trigger_failure', error: { message: triggerErr.message } });
      } catch (e) {
        logger.error('Fallback defaultRecovery failed', e);
        throw triggerErr;
      }
    }
  }

  isRecentFailure(history) {
    const now = Date.now();
    return history.filter((f) => now - new Date(f.timestamp).getTime() < 300000).length >= 3; // 5 minutes
  }

  async escalateFailure(failureType, history) {
    try {
      logger.error(`CRITICAL: Persistent ${failureType} failures detected`, {
        failureCount: history.length,
        lastFailure: history[history.length - 1],
      });

      if (process.env.SLACK_WEBHOOK) {
        try {
          // Node 18+ has global fetch
          await fetch(process.env.SLACK_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `:fire: CRITICAL FAILURE: ${failureType} has failed ${history.length} times in 5 minutes`,
            }),
          });
        } catch (err) {
          logger.error('❌ Slack alert failed', err);
        }
      }
    } catch (err) {
      logger.error('escalateFailure internal error', err);
    }
  }

  /* ---------- concrete recovery handlers ---------- */
  async handleDBFailure() {
    logger.info('🔄 Recovering database connection...');
    try {
      await dbRouter.initialize();
      // attempt a lightweight health check
      if (dbRouter.currentAdapter?.name === 'mongodb' && dbRouter.adapters?.mongodb?.connection) {
        try {
          // mongoose admin ping
          await dbRouter.adapters.mongodb.connection.db.admin().ping();
        } catch (e) {
          logger.warn('MongoDB ping failed after initialize', e);
        }
      } else if (dbRouter.adapters?.sqlite) {
        try {
          await dbRouter.adapters.sqlite.healthCheck();
        } catch (e) {
          logger.warn('SQLite ping failed after initialize', e);
        }
      }

      logger.info('✅ Database connection recovered');
      return { status: 'recovered', type: 'db_connection' };
    } catch (err) {
      logger.error('❌ Database recovery failed', err);
      if (dbRouter.adapters?.sqlite) {
        dbRouter.currentAdapter = dbRouter.adapters.sqlite;
        logger.warn('⚠️ Switched to SQLite fallback mode');
        return { status: 'fallback_active', type: 'sqlite' };
      }
      throw err;
    }
  }

  async handleAIFailure() {
    logger.info('🔄 Recovering AI service...');
    try {
      const health = aiService?.healthStatus || {};
      const activeProviders = Object.entries(health)
        .filter(([, status]) => status === 'healthy')
        .map(([provider]) => provider);

      if (!activeProviders || activeProviders.length === 0) {
        throw new Error('No healthy AI providers available');
      }

      aiService.currentProvider = activeProviders[0];
      logger.info(`✅ Switched to ${activeProviders[0]} as primary AI provider`);
      return { status: 'provider_switched', newPrimary: activeProviders[0] };
    } catch (err) {
      logger.error('AI recovery failed', err);
      throw err;
    }
  }

  async handleEmailFailure() {
    logger.warn('📭 Email service recovery not implemented yet.');
    return { status: 'noop', type: 'email_service' };
  }

  async handleVectorStoreFailure() {
    logger.warn('📦 Vector store recovery not implemented yet.');
    return { status: 'noop', type: 'vector_store' };
  }

  /* ---------- default / queue-based recovery ---------- */
  async defaultRecovery(data) {
    try {
      logger.info('🔄 Executing default recovery procedure');
      const { recoveryQueue } = await import('./queue.js');
      if (!recoveryQueue?.add) throw new Error('recoveryQueue.add missing');
      const job = await recoveryQueue.add('recovery_job', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
      return { status: 'enqueued_for_recovery', jobId: job?.id || null };
    } catch (err) {
      logger.error('defaultRecovery failed', err);
      throw err;
    }
  }

  async triggerRecoveryForQueue(queueName) {
    try {
      const queueModule = await import('./queue.js');
      // safe lookup: e.g. 'proposal' -> 'proposalQueue'
      const candidateKey = `${queueName}Queue`;
      const queue = queueModule[candidateKey] || queueModule[`${queueName}-queue`] || queueModule[queueName];
      if (!queue) {
        logger.error(`Queue ${queueName} not found for recovery`);
        return;
      }

      // getFailed may be bull / bullmq method. wrap defensively.
      let failedJobs = [];
      if (typeof queue.getFailed === 'function') {
        failedJobs = await queue.getFailed();
      } else if (typeof queue.getJobs === 'function') {
        // attempt alternative
        failedJobs = await queue.getJobs(['failed']);
      } else {
        logger.warn(`Queue ${queueName} does not expose failed job retrieval methods`);
      }

      logger.info(`🔄 Recovering ${Array.isArray(failedJobs) ? failedJobs.length : 0} failed jobs in ${queueName}`);
      for (const job of failedJobs || []) {
        await this.processRecoveryJob({ data: { originalJob: job, queueName, failureReason: job.failedReason } });
      }
    } catch (err) {
      logger.error('triggerRecoveryForQueue failed', err);
    }
  }

  async processRecoveryJob(job) {
    const { originalJob, queueName } = job.data || {};
    logger.info(`🔄 Processing recovery for failed job ${originalJob?.id || 'unknown'}`);
    try {
      if (!originalJob) throw new Error('originalJob missing in recovery job payload');

      // Many queue libraries provide a retry or retryAfter API. try multiple fallbacks.
      let replayJob = null;
      if (typeof originalJob.retry === 'function') {
        replayJob = await originalJob.retry();
      } else if (typeof originalJob.retryJob === 'function') {
        replayJob = await originalJob.retryJob();
      } else if (typeof originalJob.moveToCompleted === 'function') {
        // last resort - try to move to completed to force re-processing by other systems (not ideal)
        await originalJob.moveToCompleted('replay', true);
        replayJob = originalJob;
      } else {
        throw new Error('No supported replay method on job');
      }

      logger.info(`✅ Job ${originalJob.id} replayed successfully`);
      return { status: 'replayed', jobId: replayJob?.id || null };
    } catch (err) {
      logger.error(`❌ Recovery failed for job ${originalJob?.id || 'unknown'}`, err);

      // Example protective action for proposal queue
      try {
        if (queueName === 'proposal' || queueName === 'proposal-queue' || queueName === 'proposalQueue') {
          const { proposalQueue } = await import('./queue.js');
          if (proposalQueue?.pause && proposalQueue?.resume) {
            await proposalQueue.pause();
            logger.warn('⏸️ Paused proposal queue due to persistent failures');
            setTimeout(async () => {
              try {
                await proposalQueue.resume();
                logger.info('▶️ Resumed proposal queue after cooldown');
              } catch (resumeErr) {
                logger.error('Failed to resume proposal queue', resumeErr);
              }
            }, 300000); // 5 minutes cooldown
          }
        }
      } catch (e) {
        logger.error('Error while attempting queue protective actions', e);
      }

      throw err;
    }
  }
}

export const recoveryOrchestrator = new RecoveryOrchestrator();
