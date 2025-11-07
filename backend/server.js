// backend/server.js
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'url';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import i18n from 'i18n';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

import { monitoring } from './utils/monitoring.js';
import { setupChaosInfrastructure } from './orchestration/chaosMonkey.js';
import { chromaStore } from './services/vectorStore/chroma.js';
import { dbRouter } from './services/dbRouter.js';
import { aiService } from './services/aiService.js';
import {
  initializeQueues,
  registerWorkers,
  startHealthMonitoring,
  shutdown as queueShutdown
} from './orchestration/queue.js';

EventEmitter.defaultMaxListeners = 20;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);

/* ---------- i18n ---------- */
i18n.configure({
  locales: ['en'],
  defaultLocale: 'en',
  directory: path.join(__dirname, 'locales'),
  objectNotation: true,
  autoReload: true,
  updateFiles: false,
});
app.use(i18n.init);

/* ---------- middleware ---------- */
app.use(cookieParser());

// ✅ Helmet CSP allows WebSocket + Google Fonts safely
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws://localhost:3001"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    skip: (req) => req.path.startsWith('/health'),
    handler: (req, res) => res.status(429).json({ error: 'Rate limit exceeded' }),
  })
);

/* ---------- static / views ---------- */
const frontendDistPath = path.join(process.cwd(), 'frontend/dist');
if (!fs.existsSync(frontendDistPath)) {
  console.warn('⚠️  Frontend dist folder missing, SPA fallback will fail');
}
app.use(express.static(frontendDistPath));
app.set('views', frontendDistPath);
app.set('view engine', 'ejs');

/* ---------- start-up ---------- */
async function startServer() {
  try {
    console.log('🔍  Initialising core services...');
    await dbRouter.initialize();
    console.log('✅ Database initialised');

    await aiService.initializeProviders();
    console.log('✅ AI services initialised');

    if (process.env.USE_REDIS !== 'false') {
      await initializeQueues();
      registerWorkers();
      startHealthMonitoring();
      console.log('✅ Queue system initialised');
    } else {
      console.warn('⚠️  Redis disabled — queue system skipped');
    }

    await chromaStore.initialize();
    setupChaosInfrastructure(server);

    console.log('✅ Infrastructure ready');
    await configureExpressApp();
  } catch (error) {
    console.error('❌ Critical initialisation error:', error);
    process.exit(1);
  }
}

async function configureExpressApp() {
  app.use(async (req, res, next) => {
    try {
      req.db = dbRouter.getAdapter();
    } catch {
      req.db = null;
    }
    res.locals.theme = req.cookies?.theme || 'system';
    res.locals.lang = req.getLocale();
    if (!req.user) req.user = { id: null, role: 'guest' };
    next();
  });

  /* ---------- routes ---------- */
  const authRoutes = (await import('./routes/auth.js')).default;
  const proposalRoutes = (await import('./routes/proposals.js')).default;
  const grantRoutes = (await import('./routes/grants.js')).default;
  const systemRoutes = (await import('./routes/system.js')).default;

  app.use('/api/auth', authRoutes);
  app.use('/api/proposals', proposalRoutes);
  app.use('/api/grants', grantRoutes);
  app.use('/api/system', systemRoutes);

  /* ---------- SPA fallback ---------- */
  app.get('*', (req, res) => {
    const indexFile = path.join(frontendDistPath, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      res.status(404).send('Frontend not built');
    }
  });

  /* ---------- global error handler ---------- */
  app.use(async (err, req, res, next) => {
    console.error('[CRITICAL]', err.stack);
    monitoring.captureException(err, { url: req.url, method: req.method, user: req.user?.id });
    res.status(500).json({ error: 'Internal Server Error', timestamp: new Date().toISOString() });

    try {
      const { recoveryOrchestrator } = await import('./orchestration/recoveryOrchestrator.js');
      if (recoveryOrchestrator?.triggerRecovery) {
        recoveryOrchestrator.triggerRecovery(err, req);
      }
    } catch (recoveryErr) {
      console.error('Recovery orchestrator import failed:', recoveryErr);
    }
  });

  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`🌟  Grant-AI running on port ${PORT}`);
  });
}

/* ---------- graceful shutdown ---------- */
process.on('SIGTERM', async () => {
  console.log('🔻  SIGTERM received: initiating graceful shutdown...');
  try {
    await queueShutdown();
    await dbRouter.shutdown();
    await aiService.shutdown();
    server.close(() => {
      console.log('✅  Clean shutdown complete');
      process.exit(0);
    });
  } catch (err) {
    console.error('❌  Error during shutdown:', err);
    process.exit(1);
  }
});

await startServer();
