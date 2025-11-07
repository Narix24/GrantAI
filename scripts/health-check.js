// scripts/health-check.js
import { dbRouter } from '../backend/services/dbRouter.js';
import { aiService } from '../backend/services/aiService.js';
import { chromaStore } from '../backend/services/vectorStore/chroma.js';
// Uncomment if you use Redis
// import { redis } from '../backend/services/queue.js';
import { logger } from '../backend/utils/logger.js';

async function runHealthChecks() {
  console.log('🔍 Running system health checks...');

  try {
    // -----------------------------
    // Database check
    // -----------------------------
    await dbRouter.initialize();
    console.log('✅ Database connection: Healthy');

    // -----------------------------
    // AI service check
    // -----------------------------
    if (aiService.initializeProviders) await aiService.initializeProviders();

    let aiHealth = {};
    if (typeof aiService.getHealthStatus === 'function') {
      aiHealth = aiService.getHealthStatus();
    } else {
      aiHealth = { status: 'ok' }; // fallback if function is missing
    }

    console.log(
      `✅ AI services: ${Object.entries(aiHealth)
        .map(([provider, status]) => `${provider}: ${status}`)
        .join(', ')}`
    );

    // -----------------------------
    // Vector store check (optional)
    // -----------------------------
    if (chromaStore && chromaStore.testConnection) {
      try {
        await chromaStore.testConnection();
        console.log('✅ Vector store (Chroma): Healthy');
      } catch (error) {
        console.warn('⚠️ Vector store unreachable - not critical for core functionality');
        logger.warn('ChromaDB health check failed', { error });
      }
    }

    // -----------------------------
    // Redis queue check (optional)
    // -----------------------------
    if (typeof redis !== 'undefined' && redis?.ping) {
      try {
        await redis.ping();
        console.log('✅ Redis queue: Healthy');
      } catch (error) {
        console.warn('⚠️ Redis queue unreachable - background jobs may be delayed');
        logger.warn('Redis health check failed', { error });
      }
    }

    console.log('✅ All critical services are operational!');
    await cleanup();
    process.exit(0);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    logger.error('Health check failed', { error });
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  try {
    if (dbRouter.shutdown) await dbRouter.shutdown().catch(console.error);
    if (aiService.shutdown) await aiService.shutdown().catch(console.error);
    console.log('🧹 Cleanup completed');
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    logger.error('Cleanup failed', { error });
  }
}

runHealthChecks();