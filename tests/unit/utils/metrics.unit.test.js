// tests/unit/utils/metrics.unit.test.js`
// javascript
import { metrics } from '../../../backend/utils/metrics';
import promClient from 'prom-client';

jest.mock('prom-client');

describe('metrics Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock prom-client
    promClient.Registry = jest.fn().mockImplementation(() => ({
      setDefaultLabels: jest.fn(),
      registerMetric: jest.fn(),
      metrics: jest.fn().mockResolvedValue('mock_metrics')
    }));
    
    promClient.Counter = jest.fn().mockImplementation(() => ({
      inc: jest.fn(),
      hashMap: {}
    }));
    
    promClient.Gauge = jest.fn().mockImplementation(() => ({
      set: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn(),
      hashMap: {}
    }));
    
    promClient.Histogram = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      hashMap: {}
    }));
  });

  describe('Metrics Initialization', () => {
    test('should register default labels', () => {
      expect(promClient.Registry).toHaveBeenCalledWith();
      expect(promClient.Registry.prototype.setDefaultLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'grant-ai',
          environment: expect.any(String)
        })
      );
    });

    test('should register core counters', () => {
      expect(promClient.Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'http_requests_total',
          help: 'Total HTTP requests',
          labelNames: ['method', 'route', 'status']
        })
      );
      
      expect(promClient.Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'proposals_generated_total',
          help: 'Total proposals generated',
          labelNames: ['language', 'provider']
        })
      );
    });

    test('should register gauges for system metrics', () => {
      expect(promClient.Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'active_users',
          help: 'Number of active users'
        })
      );
      
      expect(promClient.Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'queue_length',
          help: 'Length of job queues',
          labelNames: ['queue']
        })
      );
    });

    test('should register histograms for performance metrics', () => {
      expect(promClient.Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'http_request_duration_seconds',
          help: 'HTTP request duration',
          labelNames: ['method', 'route', 'status'],
          buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10]
        })
      );
      
      expect(promClient.Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ai_response_time_seconds',
          help: 'AI service response time',
          labelNames: ['provider', 'model'],
          buckets: [0.5, 1, 2, 5, 10, 30]
        })
      );
    });
  });

  describe('Metrics Methods', () => {
    test('should increment counter metrics', () => {
      metrics.increment('requests', 1, { method: 'GET', route: '/api/test' });
      
      expect(promClient.Counter.prototype.inc).toHaveBeenCalledWith(
        { method: 'GET', route: '/api/test', value: 1 },
        1
      );
    });

    test('should observe histogram metrics', () => {
      metrics.timing('requestDuration', 150, { method: 'POST', route: '/api/submit' });
      
      expect(promClient.Histogram.prototype.observe).toHaveBeenCalledWith(
        { method: 'POST', route: '/api/submit', status: undefined },
        0.15 // Convert ms to seconds
      );
    });

    test('should set gauge metrics', () => {
      metrics.gauge('activeUsers', 42);
      
      expect(promClient.Gauge.prototype.set).toHaveBeenCalledWith(
        { type: undefined },
        42
      );
    });

    test('should handle unknown metric names gracefully', () => {
      metrics.increment('unknown_metric', 1);
      metrics.timing('unknown_histogram', 100);
      metrics.gauge('unknown_gauge', 5);
      
      // Should not throw errors
      expect(promClient.Counter.prototype.inc).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'unknown_metric' })
      );
    });
  });

  describe('System Metrics Updates', () => {
    test('should update memory usage metrics', async () => {
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 1000000,
        heapTotal: 800000,
        heapUsed: 600000
      });
      
      await metrics.updateSystemMetrics();
      
      expect(promClient.Gauge.prototype.set).toHaveBeenCalledWith(
        { type: 'rss' },
        1000000
      );
      
      expect(promClient.Gauge.prototype.set).toHaveBeenCalledWith(
        { type: 'heap_total' },
        800000
      );
      
      expect(promClient.Gauge.prototype.set).toHaveBeenCalledWith(
        { type: 'heap_used' },
        600000
      );
    });

    test('should update CPU usage metrics', async () => {
      jest.spyOn(process, 'cpuUsage').mockReturnValue({
        user: 1000000,
        system: 500000
      });
      
      await metrics.updateSystemMetrics();
      
      expect(promClient.Gauge.prototype.set).toHaveBeenCalledWith(
        {},
        1.5 // Convert microseconds to seconds
      );
    });
  });

  describe('Metrics Endpoint', () => {
    test('should get metrics registry for endpoint', () => {
      const registry = metrics.getMetricsRegistry();
      
      expect(registry).toBeInstanceOf(promClient.Registry);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors during metric updates gracefully', async () => {
      // Mock error in memory usage
      jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
        throw new Error('Memory read failed');
      });
      
      console.error = jest.fn();
      
      await metrics.updateSystemMetrics();
      
      expect(console.error).toHaveBeenCalledWith(
        'Error updating system metrics:',
        expect.any(Error)
      );
    });
  });
});
