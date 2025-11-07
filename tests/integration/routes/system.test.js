const request = require('supertest');
const { app } = require('../../../backend/server');
const { aiService } = require('../../../backend/services/aiService');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { chaosMonkey } = require('../../../backend/orchestration/chaosMonkey');
const { recoveryOrchestrator } = require('../../../backend/orchestration/recoveryOrchestrator');

describe('System Routes Integration', () => {
  beforeAll(async () => {
    await dbRouter.initialize();
    process.env.CHAOS_ENABLED = 'true';
  });

  afterAll(async () => {
    await dbRouter.shutdown();
    process.env.CHAOS_ENABLED = 'false';
  });

  describe('Health Checks', () => {
    test('should return healthy status when all services are operational', async () => {
      // Mock all services as healthy
      aiService.healthStatus.gemini = 'healthy';
      aiService.healthStatus.openai = 'healthy';
      
      const { chromaStore } = require('../../../backend/services/vectorStore/chroma');
      chromaStore.isInitialized = true;
      
      const response = await request(app)
        .get('/api/system/health')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body.services).toHaveProperty('database', 'healthy');
      expect(response.body.services).toHaveProperty('ai', 'healthy');
      expect(response.body.services).toHaveProperty('vectorStore', 'healthy');
      expect(response.body).toHaveProperty('uptime');
    });

    test('should report degraded status when AI service is unavailable', async () => {
      // Mock AI service failure
      aiService.healthStatus.gemini = 'unavailable';
      aiService.healthStatus.openai = 'unavailable';
      
      const response = await request(app)
        .get('/api/system/health')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('status', 'degraded');
      expect(response.body.services).toHaveProperty('ai', 'unavailable');
    });

    test('should handle database connection failure', async () => {
      // Mock database failure
      dbRouter.currentAdapter = null;
      dbRouter.adapters.mongodb = null;
      dbRouter.adapters.sqlite = null;
      
      const response = await request(app)
        .get('/api/system/health')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('status', 'degraded');
      expect(response.body.services).toHaveProperty('database', 'unavailable');
    });
  });

  describe('Chaos Engineering', () => {
    test('should trigger chaos experiment successfully', async () => {
      // Mock chaos execution
      chaosMonkey.triggerExperiment = jest.fn().mockResolvedValue({
        id: 'chaos_123',
        type: 'latency',
        duration: 30
      });
      
      const response = await request(app)
        .post('/api/system/chaos-trigger')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
        .send({
          experimentType: 'latency',
          duration: 30
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('experimentId', 'chaos_123');
      expect(chaosMonkey.triggerExperiment).toHaveBeenCalledWith({
        type: 'latency',
        duration: 30,
        targetService: undefined
      });
    });

    test('should reject chaos triggers from non-admin users', async () => {
      const response = await request(app)
        .post('/api/system/chaos-trigger')
        .set('Authorization', `Bearer ${process.env.USER_TOKEN}`)
        .send({
          experimentType: 'latency',
          duration: 30
        });
      
      expect(response.statusCode).toBe(403);
      expect(response.body).toHaveProperty('error', 'Admin access required');
    });

    test('should handle chaos experiment failures gracefully', async () => {
      // Mock chaos failure
      chaosMonkey.triggerExperiment = jest.fn().mockRejectedValue(
        new Error('Invalid experiment type')
      );
      
      const response = await request(app)
        .post('/api/system/chaos-trigger')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
        .send({
          experimentType: 'invalid_type',
          duration: 30
        });
      
      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error', 'Chaos experiment failed');
    });
  });

  describe('Recovery Operations', () => {
    test('should trigger manual recovery successfully', async () => {
      // Mock recovery execution
      recoveryOrchestrator.triggerRecovery = jest.fn().mockResolvedValue(true);
      
      const response = await request(app)
        .post('/api/system/recovery-trigger')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
        .send({
          failureType: 'db_connection',
          context: { database: 'mongodb' }
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Recovery process initiated');
      expect(recoveryOrchestrator.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        { type: 'db_connection', database: 'mongodb' }
      );
    });

    test('should recover from database failure', async () => {
      // Simulate database failure
      const originalAdapter = dbRouter.currentAdapter;
      dbRouter.currentAdapter = null;
      
      // Trigger recovery
      const response = await request(app)
        .post('/api/system/recovery-trigger')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
        .send({
          failureType: 'db_connection',
          context: {}
        });
      
      expect(response.statusCode).toBe(200);
      
      // Verify recovery
      expect(dbRouter.currentAdapter).not.toBeNull();
      expect(dbRouter.currentAdapter).toBe(originalAdapter);
    });

    test('should handle recovery failures with proper error reporting', async () => {
      // Mock recovery failure
      recoveryOrchestrator.triggerRecovery = jest.fn().mockRejectedValue(
        new Error('No backup databases available')
      );
      
      const response = await request(app)
        .post('/api/system/recovery-trigger')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
        .send({
          failureType: 'catastrophic_failure',
          context: {}
        });
      
      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error', 'Recovery failed');
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should return system metrics for admin users', async () => {
      const { metrics } = require('../../../backend/utils/metrics');
      metrics.getSnapshot = jest.fn().mockResolvedValue({
        counters: { requests: 150, errors: 5 },
        gauges: { activeUsers: 12, queueLength: 3 },
        histograms: { requestDuration: [100, 200, 300] }
      });
      
      const response = await request(app)
        .get('/api/system/metrics')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics.counters).toHaveProperty('requests', 150);
      expect(response.body).toHaveProperty('queues');
      expect(response.body).toHaveProperty('resources');
    });

    test('should reject metrics access from non-admin users', async () => {
      const response = await request(app)
        .get('/api/system/metrics')
        .set('Authorization', `Bearer ${process.env.USER_TOKEN}`);
      
      expect(response.statusCode).toBe(403);
      expect(response.body).toHaveProperty('error', 'Admin access required');
    });

    test('should track queue metrics accurately', async () => {
      // Add test jobs to queue
      const { proposalQueue } = require('../../../backend/orchestration/queue');
      await proposalQueue.add('test_job', { type: 'test' });
      
      const response = await request(app)
        .get('/api/system/metrics')
        .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.queues.proposal).toHaveProperty('waiting');
      expect(response.body.queues.proposal.waiting).toBeGreaterThanOrEqual(1);
    });
  });
});