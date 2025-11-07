export const CHAOS_CONFIG = {
  enabled: process.env.CHAOS_ENABLED === 'true',
  level: process.env.CHAOS_LEVEL || 'SAFE',
  levels: {
    SAFE: {
      failureRate: 0.01, // 1% of operations
      maxLatency: 2000, // ms
      recoveryTime: 1000 // ms
    },
    MODERATE: {
      failureRate: 0.05,
      maxLatency: 5000,
      recoveryTime: 3000
    },
    AGGRESSIVE: {
      failureRate: 0.15,
      maxLatency: 10000,
      recoveryTime: 5000
    },
    APOCALYPSE: {
      failureRate: 0.40,
      maxLatency: 30000,
      recoveryTime: 10000
    }
  },
  protectedEndpoints: [
    '/api/auth/login',
    '/api/auth/refresh',
    '/health'
  ],
  failureTypes: [
    'latency',
    'connection_reset',
    'provider_failure',
    'db_disconnect',
    'memory_leak',
    'cpu_spike',
    'disk_full'
  ],
  killSwitch: {
    enabled: true,
    activationThreshold: 5, // 5 consecutive failures
    cooldownPeriod: 300000 // 5 minutes
  },
  audit: {
    enabled: true,
    retentionDays: 30
  }
};