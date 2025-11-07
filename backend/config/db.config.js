export const DB_CONFIG = {
  primary: {
    provider: process.env.PRIMARY_DB_PROVIDER || 'mongodb',
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/grant_ai',
    options: {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  fallback: {
    provider: process.env.FALLBACK_DB_PROVIDER || 'sqlite',
    path: process.env.SQLITE_PATH || './grant_ai.db',
    options: {
      mode: process.env.NODE_ENV === 'production' ? 
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX : 
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    }
  },
  healthChecks: {
    interval: 30000, // 30 seconds
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000
  },
  failover: {
    enabled: true,
    threshold: 3, // consecutive failures
    cooldown: 60000 // 1 minute
  },
  migrations: {
    enabled: true,
    directory: './prisma/migrations'
  }
};