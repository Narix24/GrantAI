// backend/utils/redis.js
import { createClient } from 'redis';

let redisClient = null;

export async function getRedisClient() {
  // Skip Redis if disabled in environment
  if (process.env.USE_REDIS === 'false') {
    console.log('⚠️ Redis disabled in development mode');
    return null;
  }
  
  try {
    // Use Redis URL if provided, otherwise use default options
    const redisOptions = process.env.REDIS_URL 
      ? { url: process.env.REDIS_URL }
      : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        };
    
    redisClient = createClient(redisOptions);
    
    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });
    
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error.message);
    console.warn('💡 Tips to fix Redis connection:');
    console.warn('1. Install Redis: https://redis.io/docs/getting-started/');
    console.warn('2. Or set USE_REDIS=false in .env to disable Redis');
    console.warn('3. For Windows: Use WSL or Docker with "docker run -p 6379:6379 redis"');
    
    // Return a mock client if Redis is disabled
    if (process.env.USE_REDIS === 'false') {
      return {
        get: async () => null,
        set: async () => {},
        del: async () => {},
        keys: async () => [],
        quit: async () => {}
      };
    }
    
    throw error;
  }
}