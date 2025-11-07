import { logger } from '../utils/logger.js';

export const userService = {
  async getHealthStatus() {
    return { status: 'ok' };
  },

  async initialize() {
    logger.info('✅ userService initialized (stub)');
  },

  async shutdown() {
    logger.info('🧹 userService shutdown');
  }
};
