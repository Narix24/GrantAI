const { logger, correlationMiddleware, logPerformance } = require('../../../backend/utils/logger');
const { v4: uuidv4 } = require('uuid');

jest.mock('uuid');
jest.mock('winston-daily-rotate-file'); // Mock rotation transport

describe('Logger Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValue('mock-correlation-id');
  });

  describe('Correlation Middleware', () => {
    test('should add correlation ID to requests', () => {
      const req = { headers: {} };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();
      
      correlationMiddleware(req, res, next);
      
      expect(req.correlationId).toBe('mock-correlation-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'mock-correlation-id');
      expect(next).toHaveBeenCalled();
    });

    test('should use existing correlation ID from headers', () => {
      const req = { headers: { 'x-correlation-id': 'existing-id' } };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();
      
      correlationMiddleware(req, res, next);
      
      expect(req.correlationId).toBe('existing-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'existing-id');
    });
  });

  describe('Performance Logging', () => {
    test('should log request performance with metrics', async () => {
      const req = {
        method: 'GET',
        url: '/api/test',
        correlationId: 'perf-correlation-id',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
        route: { path: '/api/test' }
      };
      
      const res = {
        statusCode: 200,
        on: jest.fn(),
        emit: jest.fn()
      };
      
      const next = jest.fn();
      
      // Mock metrics service
      const mockTiming = jest.fn();
      jest.mock('../../../backend/utils/metrics', () => ({
        metrics: {
          timing: mockTiming
        }
      }), { virtual: true });
      
      logPerformance(req, res, next);
      
      // Simulate response finish
      res.on.mock.calls[0][1]();
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          correlationId: 'perf-correlation-id',
          duration: expect.stringMatching(/\d+\.\d+ms/),
          statusCode: 200,
          userAgent: 'test-agent',
          ip: '127.0.0.1'
        })
      );
      
      expect(mockTiming).toHaveBeenCalledWith(
        'request_duration',
        expect.any(Number),
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          status: 200
        })
      );
    });

    test('should handle errors during performance logging', async () => {
      const req = { method: 'GET', url: '/error' };
      const res = {
        statusCode: 500,
        on: jest.fn().mockImplementation((event, callback) => {
          callback();
        })
      };
      
      console.error = jest.fn();
      
      logPerformance(req, res, jest.fn());
      
      expect(console.error).not.toHaveBeenCalled(); // Should not crash on error
    });
  });

  describe('Structured Logging', () => {
    test('should format logs with proper metadata', () => {
      logger.info('Test message', {
        userId: 'user_123',
        action: 'login'
      });
      
      // Verify console transport received formatted log
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Grant-AI]'),
        expect.stringContaining('info:'),
        expect.stringContaining('Test message'),
        expect.stringContaining('CorrelationID:'),
        expect.stringContaining('userId: user_123')
      );
    });

    test('should handle circular references in metadata', () => {
      const circularObj = { a: 1 };
      circularObj.b = circularObj;
      
      logger.error('Circular reference test', {
        circular: circularObj
      });
      
      // Should not throw error
      expect(logger.error).not.toThrow();
    });
  });

  describe('Exception Handling', () => {
    test('should catch uncaught exceptions', () => {
      const mockRecovery = { triggerRecovery: jest.fn() };
      jest.mock('../../../backend/orchestration/recoveryOrchestrator', () => ({
        recoveryOrchestrator: mockRecovery
      }), { virtual: true });
      
      process.emit('uncaughtException', new Error('Test uncaught exception'));
      
      expect(mockRecovery.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ type: 'uncaught_exception' })
      );
    });

    test('should catch unhandled promise rejections', () => {
      const mockRecovery = { triggerRecovery: jest.fn() };
      jest.mock('../../../backend/orchestration/recoveryOrchestrator', () => ({
        recoveryOrchestrator: mockRecovery
      }), { virtual: true });
      
      process.emit('unhandledRejection', new Error('Test rejection'), {});
      
      expect(mockRecovery.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ type: 'unhandled_rejection' })
      );
    });
  });

  describe('File Rotation', () => {
    test('should create daily rotated log files', () => {
      // Verify rotation transport configuration
      const transports = logger.transports;
      const rotationTransport = transports.find(t => t.constructor.name === 'DailyRotateFile');
      
      expect(rotationTransport).toBeDefined();
      expect(rotationTransport.filename).toBe('logs/grant-ai-%DATE%.log');
      expect(rotationTransport.datePattern).toBe('YYYY-MM-DD');
      expect(rotationTransport.zippedArchive).toBe(true);
      expect(rotationTransport.maxSize).toBe('20m');
      expect(rotationTransport.maxFiles).toBe('14d');
    });
  });
});