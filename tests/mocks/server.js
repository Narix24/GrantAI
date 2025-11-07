// tests/mocks/server.js - Proper MSW mock server setup
import { setupServer } from 'msw/node';
import { rest } from 'msw';

// Mock API handlers
const handlers = [
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
          vectorStore: 'degraded', // Mock ChromaDB being unavailable
          queue: 'healthy'
        },
        uptime: 3600,
        version: '1.0.0'
      })
    );
  }),
  
  // Fallback handlers
  rest.get('*', (req, res, ctx) => {
    console.warn(`Unhandled GET request: ${req.url.toString()}`);
    return res(ctx.status(200), ctx.json({ mock: true }));
  }),
  
  rest.post('*', (req, res, ctx) => {
    console.warn(`Unhandled POST request: ${req.url.toString()}`);
    return res(ctx.status(200), ctx.json({ mock: true }));
  })
];

// Create and export the server instance
export const server = setupServer(...handlers);