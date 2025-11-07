// tests/fixtures/testData.js
exports.mockUser = {
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  token: 'mock_jwt_token'
};

exports.mockProposal = {
  id: 'prop_123',
  title: 'AI Research Proposal',
  content: '# AI Research Proposal\n\nThis is a test proposal content.',
  language: 'en',
  tone: 'formal',
  status: 'DRAFT',
  deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

exports.mockGrant = {
  id: 'grant_123',
  title: 'NSF AI Research Grant',
  description: 'Funding for AI research projects',
  deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
  amount: 100000,
  currency: 'USD',
  organization: 'National Science Foundation',
  categories: ['research', 'ai', 'technology'],
  language: 'en'
};

exports.mockSystemHealth = {
  status: 'healthy',
  services: {
    database: 'healthy',
    ai: 'healthy',
    vectorStore: 'healthy',
    queue: 'healthy',
    email: 'healthy',
    crawler: 'healthy'
  },
  metrics: {
    cpu: 35.2,
    memory: 1572864000, // 1.5GB
    latency: 45.8,
    throughput: 42,
    errorRate: 0.5
  }
};