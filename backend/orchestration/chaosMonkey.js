// orchestration/chaosMonkey.js - Production Chaos Engineering
import { randomUUID } from 'crypto';
import { Worker } from 'bullmq';
import { aiService } from '../services/aiService.js';
import { dbRouter } from '../services/dbRouter.js';

export function setupChaosInfrastructure(server) {
  if (!process.env.CHAOS_ENABLED) return;

  const chaosLevels = {
    SAFE: 0.01,   // 1% failure rate
    MODERATE: 0.05,
    AGGRESSIVE: 0.15,
    APOCALYPSE: 0.40
  };

  const failureTypes = [
    'latency',
    'connection_reset',
    'provider_failure',
    'db_disconnect',
    'memory_leak'
  ];

  setInterval(() => {
    if (Math.random() < chaosLevels[process.env.CHAOS_LEVEL || 'SAFE']) {
      const failure = failureTypes[Math.floor(Math.random() * failureTypes.length)];
      console.log(`⚡ Injecting chaos: ${failure}`);
      
      switch(failure) {
        case 'latency':
          server.on('request', (req, res, next) => {
            setTimeout(next, 5000 + Math.random() * 10000);
          });
          break;
          
        case 'connection_reset':
          server.on('request', (req, res) => {
            if (Math.random() < 0.3) {
              res.destroy();
            }
          });
          break;
          
        case 'provider_failure':
          Object.keys(aiService.providers).forEach(provider => {
            if (Math.random() < 0.5) {
              aiService.healthStatus[provider] = 'unavailable';
            }
          });
          break;
          
        case 'db_disconnect':
          if (dbRouter.currentAdapter === dbRouter.adapters.mongodb) {
            mongoose.connection.close();
          }
          break;
          
        case 'memory_leak':
          const leak = [];
          setInterval(() => {
            leak.push(new Array(1000000).fill('*').join(''));
          }, 100);
          break;
      }
    }
  }, 5000);

  // 🐒 Monkey worker for job failures
  new Worker('chaos-monkey', async (job) => {
    if (Math.random() < 0.2) {
      throw new Error(`Chaos injection: ${job.name} failed intentionally [${randomUUID()}]`);
    }
    return { status: 'survived' };
  }, { connection: { host: process.env.REDIS_HOST } });
}