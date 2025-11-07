// backend/routes/monitoringRoutes.js
import express from 'express';
import { logger } from '../utils/logger.js';
import authMiddleware from '../routes/auth.js';
import { adminMiddleware } from '../middleware/adminMiddleware.js';
const router = express.Router();

// ❤️ Health check endpoint
router.get('/health', async (req, res) => {
  const healthReport = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {},
    uptime: process.uptime(),
    version: process.env.npm_package_version || 'unknown'
  };

  try {
    // 🔹 Database check
    try {
      const { dbRouter } = await import('../services/dbRouter.js');
      const db = dbRouter.getAdapter();
      if (db.model) {
        // MongoDB-like adapter
        await db.connection.db.admin().ping();
        healthReport.services.database = 'healthy';
      } else {
        // SQLite or similar
        await db.adapters.sqlite.get('SELECT 1');
        healthReport.services.database = 'healthy';
      }
    } catch (dbError) {
      logger.warn('Database health check failed', dbError);
      healthReport.services.database = 'degraded';
      healthReport.status = 'degraded';
    }

    // 🔹 AI Service check
    try {
      const { aiService } = await import('../services/aiService.js');
      const providers = aiService.providers || {};
      const anyHealthy = Object.values(aiService.healthStatus || {}).some(status => status === 'healthy');
      healthReport.services.ai = anyHealthy ? 'healthy' : 'degraded';
      if (!anyHealthy) healthReport.status = 'degraded';
    } catch (aiError) {
      logger.warn('AI service health check failed', aiError);
      healthReport.services.ai = 'unavailable';
      healthReport.status = 'degraded';
    }

    // 🔹 Vector Store (Chroma)
    try {
      const { chromaStore } = await import('../services/vectorStore/chroma.js');
      healthReport.services.vectorStore = chromaStore.isInitialized ? 'healthy' : 'initializing';
      if (healthReport.services.vectorStore !== 'healthy') healthReport.status = 'degraded';
    } catch (vectorError) {
      logger.warn('Vector store health check failed', vectorError);
      healthReport.services.vectorStore = 'unavailable';
      healthReport.status = 'degraded';
    }

    // 🔹 Queue system
    try {
      const { proposalQueue } = await import('../orchestration/queue.js');
      const waiting = await proposalQueue.getWaitingCount();
      healthReport.services.queue = waiting < 1000 ? 'healthy' : 'overloaded';
      if (healthReport.services.queue !== 'healthy') healthReport.status = 'degraded';
    } catch (queueError) {
      logger.warn('Queue health check failed', queueError);
      healthReport.services.queue = 'unavailable';
      healthReport.status = 'degraded';
    }

    const statusCode = healthReport.status === 'healthy' ? 200 : 500;
    res.status(statusCode).json(healthReport);
  } catch (error) {
    logger.error('Unexpected error during health check', error);
    res.status(500).json({
      status: 'unavailable',
      error: req.__?.('HEALTH_CHECK_FAILED') || 'Health check failed unexpectedly'
    });
  }
});

// 📊 System metrics
router.get('/metrics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { metrics } = await import('../utils/metrics.js');
    const snapshot = await metrics.getSnapshot();
    
    res.json({
      timestamp: new Date().toISOString(),
      metrics: snapshot,
      queues: await getQueueMetrics(),
      resources: await getResourceMetrics()
    });
  } catch (error) {
    logger.error('Metrics retrieval failed', error);
    res.status(500).json({ 
      error: req.__?.('SERVER_ERROR') || 'Failed to retrieve metrics' 
    });
  }
});

// 🔍 Queue metrics helper
async function getQueueMetrics() {
  try {
    const { proposalQueue, recoveryQueue } = await import('../orchestration/queue.js');
    return {
      proposal: {
        waiting: await proposalQueue.getWaitingCount(),
        active: await proposalQueue.getActiveCount(),
        completed: await proposalQueue.getCompletedCount(),
        failed: await proposalQueue.getFailedCount()
      },
      recovery: {
        waiting: await recoveryQueue.getWaitingCount(),
        active: await recoveryQueue.getActiveCount()
      }
    };
  } catch (error) {
    logger.warn('Queue metrics unavailable', error);
    return { error: 'Queue metrics unavailable' };
  }
}

// 🧠 Resource metrics helper
async function getResourceMetrics() {
  return {
    cpu: process.cpuUsage(),
    memory: process.memoryUsage(),
    heap: {
      total: process.memoryUsage().heapTotal,
      used: process.memoryUsage().heapUsed
    },
    eventLoop: {
      delay: await measureEventLoopDelay()
    }
  };
}

// ⏱️ Measure event loop lag
function measureEventLoopDelay() {
  return new Promise(resolve => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const end = process.hrtime.bigint();
      resolve(Number(end - start) / 1e6); // ms
    });
  });
}

// ⚡ Trigger chaos experiment (admin-only)
router.post('/chaos-trigger', authMiddleware, adminMiddleware, async (req, res) => {
  if (!process.env.CHAOS_ENABLED) {
    return res.status(400).json({ error: 'Chaos engineering is disabled' });
  }
  
  try {
    const { experimentType, duration, targetService } = req.body;
    const { chaosMonkey } = await import('../orchestration/chaosMonkey.js');
    
    const result = await chaosMonkey.triggerExperiment({
      type: experimentType,
      duration: parseInt(duration, 10) || 60,
      targetService
    });
    
    logger.warn(`🔥 Chaos experiment triggered by ${req.user?.email || 'unknown'}: ${experimentType}`);
    
    res.json({
      success: true,
      experimentId: result.id,
      message: `Chaos experiment (${experimentType}) started successfully`
    });
  } catch (error) {
    logger.error('Chaos experiment failed', error);
    res.status(500).json({ 
      error: req.__?.('CHAOS_EXPERIMENT_FAILED') || 'Chaos experiment failed' 
    });
  }
});

// 🔄 Manual recovery trigger (admin-only)
router.post('/recovery-trigger', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { failureType, context = {} } = req.body;
    const { recoveryOrchestrator } = await import('../orchestration/recoveryOrchestrator.js');
    
    await recoveryOrchestrator.triggerRecovery(
      new Error(`Manual recovery trigger: ${failureType}`),
      { ...context, triggeredBy: req.user?.email }
    );
    
    logger.info(`🔄 Manual recovery triggered by ${req.user?.email || 'unknown'} for ${failureType}`);
    
    res.json({ success: true, message: 'Recovery process initiated' });
  } catch (error) {
    logger.error('Manual recovery failed', error);
    res.status(500).json({ 
      error: req.__?.('RECOVERY_FAILED') || 'Recovery initiation failed' 
    });
  }
});

export default router;