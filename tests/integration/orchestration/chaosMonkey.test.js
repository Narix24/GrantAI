const { ChaosMonkey } = require('../../../backend/orchestration/chaosMonkey');
const { aiService } = require('../../../backend/services/aiService');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { logger } = require('../../../backend/utils/logger');

jest.mock('../../../backend/services/aiService');
jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/utils/logger');

describe('ChaosMonkey Integration', () => {
  let chaosMonkey;
  
  beforeEach(() => {
    chaosMonkey = new ChaosMonkey();
    jest.clearAllMocks();
    process.env.CHAOS_ENABLED = 'true';
    process.env.CHAOS_LEVEL = 'MODERATE';
  });

  afterEach(() => {
    process.env.CHAOS_ENABLED = 'false';
    process.env.CHAOS_LEVEL = 'SAFE';
  });

  describe('Failure Injection', () => {
    test('should inject latency failures', async () => {
      const req = { url: '/api/proposals/generate' };
      const res = { end: jest.fn() };
      const next = jest.fn();
      
      chaosMonkey.injectLatency(req, res, next);
      
      // Should not call next immediately due to timeout
      expect(next).not.toHaveBeenCalled();
      
      // Should end response after delay
      expect(res.end).not.toHaveBeenCalled();
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 5001));
      
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Chaos Monkey'));
    });

    test('should handle connection reset failures', async () => {
      const req = { url: '/api/proposals/generate' };
      const res = { destroy: jest.fn() };
      const next = jest.fn();
      
      chaosMonkey.injectConnectionReset(req, res, next);
      
      expect(res.destroy).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should trigger provider failures', async () => {
      aiService.healthStatus = {
        gemini: 'healthy',
        openai: 'healthy',
        ollama: 'healthy'
      };
      
      await chaosMonkey.injectProviderFailure();
      
      // Should degrade one provider
      const degradedProviders = Object.values(aiService.healthStatus).filter(status => status === 'degraded');
      expect(degradedProviders.length).toBe(1);
    });

    test('should handle database disconnection', async () => {
      dbRouter.currentAdapter = dbRouter.adapters.mongodb;
      
      await chaosMonkey.injectDBDisconnect();
      
      // Should switch to SQLite
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.sqlite);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Switched to SQLite fallback'));
    });
  });

  describe('Chaos Configuration', () => {
    test('should respect chaos levels', () => {
      process.env.CHAOS_LEVEL = 'SAFE';
      
      const safeFailureRate = chaosMonkey.getFailureRate();
      expect(safeFailureRate).toBe(0.01);
      
      process.env.CHAOS_LEVEL = 'AGGRESSIVE';
      
      const aggressiveFailureRate = chaosMonkey.getFailureRate();
      expect(aggressiveFailureRate).toBe(0.15);
    });

    test('should protect critical endpoints', () => {
      const protectedEndpoints = ['/api/auth/login', '/health', '/api/system/metrics'];
      
      for (const endpoint of protectedEndpoints) {
        const req = { url: endpoint };
        const res = {};
        const next = jest.fn();
        
        chaosMonkey.chaosMiddleware(req, res, next);
        
        // Should not inject chaos for protected endpoints
        expect(next).toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Injecting chaos'));
      }
    });

    test('should respect chaos enabled flag', () => {
      process.env.CHAOS_ENABLED = 'false';
      
      const req = { url: '/api/proposals/generate' };
      const res = {};
      const next = jest.fn();
      
      chaosMonkey.chaosMiddleware(req, res, next);
      
      // Should bypass chaos injection
      expect(next).toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Injecting chaos'));
    });
  });

  describe('Kill Switch', () => {
    test('should activate kill switch after consecutive failures', async () => {
      // Simulate consecutive failures
      for (let i = 0; i < 5; i++) {
        await chaosMonkey.triggerExperiment({ type: 'latency', duration: 10 });
      }
      
      // Should activate kill switch
      expect(chaosMonkey.killSwitchActive).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Kill switch activated'));
      
      // Subsequent chaos attempts should be blocked
      const req = { url: '/api/test' };
      const res = {};
      const next = jest.fn();
      
      chaosMonkey.chaosMiddleware(req, res, next);
      
      expect(next).toHaveBeenCalled(); // Bypass chaos
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Kill switch active, bypassing chaos'));
    });

    test('should reset kill switch after cooldown period', async () => {
      // Activate kill switch
      for (let i = 0; i < 5; i++) {
        await chaosMonkey.triggerExperiment({ type: 'latency', duration: 10 });
      }
      
      expect(chaosMonkey.killSwitchActive).toBe(true);
      
      // Advance time past cooldown
      jest.advanceTimersByTime(300000); // 5 minutes
      
      expect(chaosMonkey.killSwitchActive).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Kill switch reset after cooldown'));
    });
  });

  describe('Auditing', () => {
    test('should log chaos experiments for auditing', async () => {
      await chaosMonkey.triggerExperiment({ type: 'provider_failure', duration: 30 });
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Triggered chaos experiment'),
        expect.objectContaining({
          type: 'provider_failure',
          duration: 30
        })
      );
      
      // Should create audit record
      expect(dbRouter.getAdapter().model).toHaveBeenCalledWith('ChaosTestResult');
    });

    test('should track recovery metrics', async () => {
      // Mock recovery time
      const startTime = Date.now();
      
      await chaosMonkey.injectLatency({}, {}, jest.fn());
      
      const recoveryTime = Date.now() - startTime;
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Chaos recovery completed'),
        expect.objectContaining({
          recoveryTime: expect.any(Number)
        })
      );
    });
  });

  describe('Experiment Types', () => {
    test('should handle memory leak experiments', async () => {
      const originalHeapUsed = process.memoryUsage().heapUsed;
      
      await chaosMonkey.injectMemoryLeak();
      
      // Should create memory leak
      const newHeapUsed = process.memoryUsage().heapUsed;
      expect(newHeapUsed).toBeGreaterThan(originalHeapUsed);
      
      // Cleanup should be triggered
      expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });

    test('should handle CPU spike experiments', async () => {
      const startTime = Date.now();
      
      await chaosMonkey.injectCPUSpike(1000); // 1 second
      
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(900); // Should take approximately 1 second
    });
  });
});