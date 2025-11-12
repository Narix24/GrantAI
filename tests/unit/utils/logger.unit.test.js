// `tests/unit/utils/logger.unit.test.js`
//javascript
import { logger, correlationMiddleware, errorMiddleware } from '../../../backend/utils/logger';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

jest.mock('winston');
jest.mock('uuid');
jest.mock('winston-daily-rotate-file');

describe('logger Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock winston methods
    winston.createLogger.mockReturnThis();
    winston.format.combine.mockReturnThis();
    winston.format.timestamp.mockReturnThis();
    winston.format.label.mockReturnThis();
    winston.format.printf.mockReturnThis();
    winston.format.colorize.mockReturnThis();
    winston.format.json.mockReturnThis();
  });

  describe('Logger Initialization', () => {
    test('should initialize logger with proper transports', () => {
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expect.any(String),
          defaultMeta: expect.objectContaining({ service: 'grant-ai' }),
          transports: expect.arrayContaining([
            expect.objectContaining({ format: expect.any(Function) }),
            expect.objectContaining({ format: expect.any(Function) })
          ])
        })
      );
    });

    test('should set up console transport with colorized output', () => {
      expect(winston.transports.Console).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.any(Function)
        })
      );
    });

    test('should set up file transport with rotation', () => {
      expect(require('winston-daily-rotate-file')).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'logs/grant-ai-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d'
        })
      );
    });
  });

  describe('Middleware Functions', () => {
    test('should add correlation ID to request', () => {
      const req = { headers: {} };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();
      
      uuidv4.mockReturnValue('mock-correlation-id');
      
      correlationMiddleware(req, res, next);
      
      expect(req.correlationId).toBe('mock-correlation-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'mock-correlation-id');
      expect(next).toHaveBeenCalled();
    });

    test('should use existing correlation ID from headers', () => {
      const req = { 
        headers: { 
          'x-correlation-id': 'existing-id-from-header' 
        } 
      };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();
      
      correlationMiddleware(req, res, next);
      
      expect(req.correlationId).toBe('existing-id-from-header');
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'existing-id-from-header');
    });

    test('should log errors with proper formatting', () => {
      const error = new Error('Test error');
      error.statusCode = 500;
      
      const req = {
        method: 'GET',
        url: '/test',
        correlationId: 'error-correlation-id',
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1'
      };
      
      const res = {
        statusCode: 500,
        end: jest.fn()
      };
      
      const next = jest.fn();
      
      errorMiddleware(error, req, res, next);
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('500 GET /test'),
        expect.objectContaining({
          error: 'Test error',
          stack: expect.any(String),
          correlationId: 'error-correlation-id',
          userAgent: 'test-agent',
          ip: '127.0.0.1'
        })
      );
      
      expect(res.statusCode).toBe(500);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Logging Methods', () => {
    test('should log info messages with metadata', () => {
      logger.info('Test info message', {
        userId: 'user_123',
        action: 'login'
      });
      
      // Verify winston was called with proper arguments
      expect(winston.Logger.prototype.info).toHaveBeenCalledWith(
        'Test info message',
        expect.objectContaining({
          userId: 'user_123',
          action: 'login'
        })
      );
    });

    test('should log error messages with stack traces', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test (/test.js:1:1)';
      
      logger.error('Test error message', {
        error,
        context: 'authentication'
      });
      
      expect(winston.Logger.prototype.error).toHaveBeenCalledWith(
        'Test error message',
        expect.objectContaining({
          error: 'Test error',
          stack: 'Error: Test error\n    at test (/test.js:1:1)',
          context: 'authentication'
        })
      );
    });

    test('should handle circular references in metadata', () => {
      const circularObj = { a: 1 };
      circularObj.b = circularObj;
      
      logger.info('Circular reference test', {
        circular: circularObj
      });
      
      // Should not throw error
      expect(winston.Logger.prototype.info).not.toThrow();
    });
  });

  describe('Stream Interface', () => {
    test('should implement stream interface for middleware', () => {
      const mockWrite = jest.fn();
      
      logger.stream.write = mockWrite;
      
      logger.stream.write('Stream message');
      
      expect(mockWrite).toHaveBeenCalledWith('Stream message');
    });
  });

  describe('Error Handling', () => {
    test('should handle uncaught exceptions', () => {
      process.emit('uncaughtException', new Error('Test uncaught exception'));
      
      expect(logger.error).toHaveBeenCalledWith(
        'UNCAUGHT EXCEPTION',
        expect.any(Error)
      );
    });

    test('should handle unhandled promise rejections', () => {
      const reason = new Error('Test unhandled rejection');
      const promise = Promise.reject(reason);
      
      process.emit('unhandledRejection', reason, promise);
      
      expect(logger.error).toHaveBeenCalledWith(
        'UNHANDLED REJECTION',
        expect.any(Error)
      );
    });
  });

  describe('Performance Logging', () => {
    test('should log performance metrics', () => {
      const req = {
        method: 'GET',
        url: '/api/test',
        correlationId: 'perf-correlation-id'
      };
      
      const res = {
        statusCode: 200,
        on: jest.fn()
      };
      
      const next = jest.fn();
      
      logger.performance(req, res, next);
      
      // Simulate response finish
      res.on.mock.calls[0][1]();
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/test'),
        expect.objectContaining({
          correlationId: 'perf-correlation-id',
          duration: expect.any(Number),
          statusCode: 200
        })
      );
    });
  });
});
