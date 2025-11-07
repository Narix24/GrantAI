const { RecoveryOrchestrator } = require('../../../backend/orchestration/recoveryOrchestrator');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { aiService } = require('../../../backend/services/aiService');
const { recoveryQueue } = require('../../../backend/orchestration/queue');

jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/services/aiService');
jest.mock('../../../backend/orchestration/queue');

describe('RecoveryOrchestrator Integration', () => {
  let orchestrator;
  
  beforeEach(() => {
    orchestrator = new RecoveryOrchestrator();
    jest.clearAllMocks();
  });

  describe('Failure Classification', () => {
    test('should classify database connection failures', () => {
      const err = new Error('MongoDB connection timeout');
      err.message = 'MongoDB connection timeout';
      
      const type = orchestrator.classifyFailure(err, {});
      expect(type).toBe('db_connection');
    });

    test('should classify AI provider failures', () => {
      const err = new Error('Gemini API quota exceeded');
      err.message = 'Gemini API quota exceeded';
      
      const type = orchestrator.classifyFailure(err, {});
      expect(type).toBe('ai_provider');
    });

    test('should classify unknown failures', () => {
      const err = new Error('Unknown system error');
      err.message = 'Unknown system error';
      
      const type = orchestrator.classifyFailure(err, { service: 'unknown_service' });
      expect(type).toBe('unknown_service');
    });
  });

  describe('Database Recovery', () => {
    test('should recover MongoDB connection successfully', async () => {
      // Mock successful reinitialization
      dbRouter.initialize.mockResolvedValue();
      
      // Mock connection ping
      const mockConnection = {
        db: {
          admin: jest.fn().mockReturnValue({
            ping: jest.fn().mockResolvedValue({ ok: 1 })
          })
        }
      };
      
      dbRouter.adapters = {
        mongodb: { connection: mockConnection },
        sqlite: {}
      };
      
      dbRouter.currentAdapter = dbRouter.adapters.mongodb;
      
      const result = await orchestrator.handleDBFailure({});
      
      expect(result).toEqual({ status: 'recovered', type: 'db_connection' });
      expect(dbRouter.initialize).toHaveBeenCalled();
      expect(mockConnection.db.admin().ping).toHaveBeenCalled();
    });

    test('should fallback to SQLite when MongoDB recovery fails', async () => {
      // Mock MongoDB recovery failure
      dbRouter.initialize.mockRejectedValue(new Error('MongoDB initialization failed'));
      
      // Mock SQLite adapter
      const sqliteAdapter = {
        get: jest.fn().mockResolvedValue({ success: true })
      };
      
      dbRouter.adapters = {
        mongodb: {},
        sqlite: sqliteAdapter
      };
      
      dbRouter.currentAdapter = dbRouter.adapters.mongodb;
      
      const result = await orchestrator.handleDBFailure({});
      
      expect(result).toEqual({ status: 'fallback_active', type: 'sqlite' });
      expect(dbRouter.currentAdapter).toBe(sqliteAdapter);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Switched to SQLite fallback'));
    });

    test('should escalate persistent database failures', async () => {
      // Mock persistent failures
      dbRouter.initialize.mockRejectedValue(new Error('Persistent DB failure'));
      
      dbRouter.adapters = {
        mongodb: {},
        sqlite: null // No SQLite fallback
      };
      
      const mockHistory = [
        { timestamp: new Date(Date.now() - 10000).toISOString() },
        { timestamp: new Date(Date.now() - 20000).toISOString() },
        { timestamp: new Date(Date.now() - 30000).toISOString() },
        { timestamp: new Date(Date.now() - 40000).toISOString() },
        { timestamp: new Date(Date.now() - 50000).toISOString() }
      ];
      
      orchestrator.failureHistory.set('db_connection', mockHistory);
      
      // Mock Slack webhook
      fetch.mockResolvedValue({});
      
      await expect(orchestrator.handleDBFailure({}))
        .rejects
        .toThrow('No healthy database providers available');
      
      // Should trigger escalation
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('CRITICAL FAILURE')
        })
      );
    });
  });

  describe('AI Provider Recovery', () => {
    test('should rotate to next healthy AI provider', async () => {
      aiService.healthStatus = {
        gemini: 'unavailable',
        openai: 'healthy',
        ollama: 'degraded'
      };
      
      aiService.currentProvider = 'gemini';
      
      const result = await orchestrator.handleAIFailure({});
      
      expect(result).toEqual({ status: 'provider_switched', newPrimary: 'openai' });
      expect(aiService.currentProvider).toBe('openai');
    });

    test('should handle no healthy providers scenario', async () => {
      aiService.healthStatus = {
        gemini: 'unavailable',
        openai: 'unavailable',
        ollama: 'unavailable'
      };
      
      await expect(orchestrator.handleAIFailure({}))
        .rejects
        .toThrow('No healthy AI providers available');
    });
  });

  describe('Queue Recovery', () => {
    test('should recover failed jobs in proposal queue', async () => {
      // Mock failed jobs
      const mockFailedJobs = [
        { id: 'job1', retry: jest.fn().mockResolvedValue({ id: 'job1_retry' }) },
        { id: 'job2', retry: jest.fn().mockRejectedValue(new Error('Retry failed')) }
      ];
      
      recoveryQueue.add.mockResolvedValue({ id: 'recovery_job_1' });
      
      await orchestrator.triggerRecoveryForQueue('proposal-queue');
      
      // Should attempt to recover both jobs
      expect(mockFailedJobs[0].retry).toHaveBeenCalled();
      expect(mockFailedJobs[1].retry).toHaveBeenCalled();
      
      // Should enqueue second job for specialized recovery
      expect(recoveryQueue.add).toHaveBeenCalled();
    });

    test('should pause queue on persistent failures', async () => {
      // Mock queue with many failed jobs
      const mockFailedJobs = Array(10).fill().map((_, i) => ({
        id: `job${i}`,
        failedReason: 'Persistent failure',
        retry: jest.fn().mockRejectedValue(new Error('Persistent failure'))
      }));
      
      const mockQueue = {
        getFailed: jest.fn().mockResolvedValue(mockFailedJobs),
        pause: jest.fn()
      };
      
      jest.mock('../../../backend/orchestration/queue', () => ({
        proposalQueue: mockQueue
      }), { virtual: true });
      
      await orchestrator.triggerRecoveryForQueue('proposal-queue');
      
      expect(mockQueue.pause).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Paused proposal queue'));
      
      // Should schedule resume
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 300000);
    });
  });

  describe('Escalation System', () => {
    test('should send Slack notification on critical failures', async () => {
      // Mock Slack webhook
      fetch.mockResolvedValue({});
      
      const failureHistory = [
        { timestamp: new Date().toISOString() },
        { timestamp: new Date().toISOString() },
        { timestamp: new Date().toISOString() },
        { timestamp: new Date().toISOString() },
        { timestamp: new Date().toISOString() }
      ];
      
      await orchestrator.escalateFailure('critical_service', failureHistory);
      
      expect(fetch).toHaveBeenCalledWith(
        process.env.SLACK_WEBHOOK,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('CRITICAL FAILURE')
        })
      );
    });

    test('should handle Slack notification failures gracefully', async () => {
      // Mock failed Slack webhook
      fetch.mockRejectedValue(new Error('Slack webhook failed'));
      
      const failureHistory = [{ timestamp: new Date().toISOString() }];
      
      await orchestrator.escalateFailure('test_service', failureHistory);
      
      // Should not throw error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Slack notification failed'),
        expect.any(Error)
      );
    });
  });

  describe('Recovery Job Processing', () => {
    test('should replay failed jobs successfully', async () => {
      const mockOriginalJob = {
        id: 'original_job_123',
        retry: jest.fn().mockResolvedValue({ id: 'replayed_job_123' })
      };
      
      const result = await orchestrator.processRecoveryJob({
        data: {
          originalJob: mockOriginalJob,
          queueName: 'proposal-queue'
        }
      });
      
      expect(result).toEqual({
        status: 'replayed',
        jobId: 'replayed_job_123'
      });
      expect(mockOriginalJob.retry).toHaveBeenCalled();
    });

    test('should handle replay failures with queue pausing', async () => {
      const mockOriginalJob = {
        id: 'failing_job_123',
        retry: jest.fn().mockRejectedValue(new Error('Replay failed'))
      };
      
      const mockQueue = {
        pause: jest.fn()
      };
      
      jest.mock('../../../backend/orchestration/queue', () => ({
        proposalQueue: mockQueue
      }), { virtual: true });
      
      await orchestrator.processRecoveryJob({
        data: {
          originalJob: mockOriginalJob,
          queueName: 'proposal-queue'
        }
      });
      
      expect(mockQueue.pause).toHaveBeenCalled();
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 300000);
    });
  });
});