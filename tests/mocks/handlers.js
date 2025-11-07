// tests/mocks/handlers.js
import { rest } from 'msw';

// Common mock handlers for API endpoints
export const handlers = [
  // Auth endpoints
  rest.post('/api/auth/login', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        token: 'mock_jwt_token',
        user: {
          id: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user'
        }
      })
    );
  }),
  
  // System health endpoint
  rest.get('/api/system/health', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        status: 'healthy',
        services: {
          database: 'healthy',
          ai: 'healthy',
          vectorStore: 'healthy',
          queue: 'healthy'
        },
        uptime: 3600,
        version: '1.0.0'
      })
    );
  }),
  
  // All other endpoints return mock success
  rest.get('*', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ mock: true })
    );
  }),
  
  rest.post('*', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ mock: true })
    );
  })
];