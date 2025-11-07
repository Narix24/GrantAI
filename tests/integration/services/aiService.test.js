// tests/integration/services/aiService.test.js
const request = require('supertest');
const { app } = require('../../../backend/server');
const { aiService } = require('../../../backend/services/aiService');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { recoveryOrchestrator } = require('../../../backend/orchestration/recoveryOrchestrator');

describe('AI Service Integration', () => {
  beforeAll(async () => {
    await dbRouter.initialize();
  });

  afterAll(async () => {
    await dbRouter.shutdown();
  });

  describe('Provider Routing', () => {
    test('should route to Gemini when available', async () => {
      aiService.healthStatus.gemini = 'healthy';
      aiService.healthStatus.openai = 'degraded';
      aiService.healthStatus.ollama = 'unavailable';
      
      const prompt = 'Test prompt for routing';
      const result = await aiService.generate({ prompt, provider: 'auto' });
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(aiService.currentProvider).toBe('gemini');
    });

    test('should fallback to OpenAI when Gemini fails', async () => {
      aiService.providers.gemini = {
        generateContent: jest.fn().mockRejectedValue(new Error('Gemini service unavailable'))
      };
      aiService.healthStatus.gemini = 'unavailable';
      aiService.healthStatus.openai = 'healthy';
      
      const prompt = 'Test prompt for fallback';
      
      try {
        await aiService.generate({ prompt, provider: 'gemini' });
      } catch (error) {
        expect(recoveryOrchestrator.triggerRecovery).toHaveBeenCalled();
      }
      
      const result = await aiService.generate({ prompt, provider: 'auto' });
      expect(result).toBeTruthy();
      expect(aiService.currentProvider).toBe('openai');
    });

    test('should use Ollama as last resort', async () => {
      aiService.healthStatus.gemini = 'unavailable';
      aiService.healthStatus.openai = 'unavailable';
      aiService.healthStatus.ollama = 'healthy';
      
      const prompt = 'Test prompt for Ollama fallback';
      const result = await aiService.generate({ prompt, provider: 'auto' });
      
      expect(result).toBeTruthy();
      expect(aiService.currentProvider).toBe('ollama');
    });
  });

  describe('Chaos Resilience', () => {
    test('should recover from provider failure during generation', async () => {
      aiService.providers.gemini = {
        generateContent: jest.fn().mockRejectedValue(new Error('Connection timeout'))
      };
      aiService.healthStatus.gemini = 'healthy';
      
      const prompt = 'Test prompt for recovery';
      
      await expect(aiService.generate({ prompt, provider: 'gemini' }))
        .rejects
        .toThrow('Connection timeout');
      
      expect(aiService.healthStatus.gemini).toBe('degraded');
      
      aiService.healthStatus.openai = 'healthy';
      const result = await aiService.generate({ prompt, provider: 'auto' });
      expect(result).toBeTruthy();
      expect(aiService.currentProvider).toBe('openai');
    });

    test('should handle rate limiting with exponential backoff', async () => {
      let callCount = 0;
      aiService.providers.gemini = {
        generateContent: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 2) {
            const error = new Error('Rate limit exceeded');
            error.statusCode = 429;
            throw error;
          }
          return { response: { text: () => 'Success after retries' } };
        })
      };
      
      const prompt = 'Test prompt for rate limiting';
      const result = await aiService.generate({ prompt, provider: 'gemini' });
      
      expect(result).toBe('Success after retries');
      expect(aiService.providers.gemini.generateContent).toHaveBeenCalledTimes(3);
    });
  });

  describe('Multilingual Support', () => {
    test('should generate content in German', async () => {
      aiService.healthStatus.gemini = 'healthy';
      
      const prompt = 'Write a formal business proposal introduction in German';
      const result = await aiService.generate({ 
        prompt, 
        language: 'de',
        provider: 'auto'
      });
      
      expect(result).toBeTruthy();
      expect(result.toLowerCase()).toContain('unternehmen');
      expect(result.toLowerCase()).toContain('geschäft');
    });

    test('should handle language detection and translation', async () => {
      aiService.healthStatus.gemini = 'healthy';
      
      const germanText = 'Dies ist ein Testtext in Deutsch';
      const translated = await aiService.translate(germanText, 'en');
      
      expect(translated.toLowerCase()).toContain('this is a test text');
    });
  });

  describe('Proposal Generation Integration', () => {
    test('should generate complete proposal with context', async () => {
      const { chromaStore } = require('../../../backend/services/vectorStore/chroma');
      chromaStore.querySimilar = jest.fn().mockResolvedValue([
        {
          text: 'NSF research grant example focusing on climate change impacts',
          meta: { categories: ['research', 'climate'] }
        },
      ]);
      
      aiService.generate = jest.fn().mockResolvedValue(`
        # Research Proposal: Climate Change Impact Assessment
        
        ## Executive Summary
        This proposal outlines a comprehensive research program to assess climate change impacts on coastal ecosystems...
        
        ## Methodology
        We will employ mixed-methods approaches including field surveys, remote sensing, and stakeholder interviews...
      `);
      
      const proposalData = {
        opportunity: {
          title: 'Climate Research Grant',
          description: 'Funding for climate change research',
          categories: ['research', 'climate']
        },
        missionStatement: 'Advancing climate science for sustainable development',
        organization: { name: 'Climate Research Institute' },
        language: 'en',
        tone: 'formal'
      };
      
      const response = await request(app)
        .post('/api/proposals/generate')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`)
        .send(proposalData);
      
      expect(response.statusCode).toBe(202);
      expect(response.body).toHaveProperty('proposalId');
      expect(response.body).toHaveProperty('status', 'queued');
      
      const { proposalQueue: queue } = require('../../../backend/orchestration/queue');
      const waitingJobs = await queue.getJobs(['waiting']);
      expect(waitingJobs.length).toBeGreaterThan(0);
    });
  });
});
