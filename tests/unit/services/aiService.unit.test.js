// GRANT-AI/tests/unit/services/aiService.unit.test.js
const { aiService } = require('../../../backend/services/aiService');

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn()
    })
  }))
}));

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    generate: jest.fn()
  }))
}));

describe('AI Service Unit Tests', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset service state
    aiService.providers = {};
    aiService.healthStatus = {
      gemini: 'initializing',
      openai: 'initializing',
      ollama: 'initializing'
    };
    aiService.currentProvider = null;
  });

  describe('Provider Initialization', () => {
    test('should initialize Gemini provider when API key is present', () => {
      process.env.GEMINI_API_KEY = 'test_gemini_key';
      aiService.initializeProviders();
      
      expect(aiService.providers.gemini).toBeDefined();
      expect(typeof aiService.providers.gemini.getGenerativeModel).toBe('function');
    });

    test('should not initialize Gemini provider when API key is missing', () => {
      delete process.env.GEMINI_API_KEY;
      aiService.initializeProviders();
      
      expect(aiService.providers.gemini).toBeUndefined();
    });

    test('should initialize all available providers', () => {
      process.env.GEMINI_API_KEY = 'test_gemini_key';
      process.env.OPENAI_API_KEY = 'test_openai_key';
      process.env.OLLAMA_URL = 'http://localhost:11434';
      
      aiService.initializeProviders();
      
      expect(Object.keys(aiService.providers).length).toBe(3);
      expect(aiService.providers.gemini).toBeDefined();
      expect(aiService.providers.openai).toBeDefined();
      expect(aiService.providers.ollama).toBeDefined();
    });
  });

  describe('Health Checking', () => {
    test('should mark provider as healthy when health check passes', async () => {
      process.env.GEMINI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock successful health check
      aiService.providers.gemini.getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: { text: () => 'OK' }
        })
      });
      
      await aiService.testProvider('gemini');
      
      expect(aiService.healthStatus.gemini).toBe('healthy');
    });

    test('should mark provider as degraded when health check fails', async () => {
      process.env.GEMINI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock failed health check
      aiService.providers.gemini.getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('API error'))
      });
      
      await aiService.testProvider('gemini');
      
      expect(aiService.healthStatus.gemini).toBe('unavailable');
    });

    test('should handle partial health check failures', async () => {
      process.env.GEMINI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock health check that returns non-OK response
      aiService.providers.gemini.getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: { text: () => 'NOT OK' }
        })
      });
      
      await aiService.testProvider('gemini');
      
      expect(aiService.healthStatus.gemini).toBe('degraded');
    });
  });

  describe('Provider Selection', () => {
    test('should select optimal provider based on health status', () => {
      aiService.healthStatus = {
        gemini: 'healthy',
        openai: 'healthy',
        ollama: 'unavailable'
      };
      
      const provider = aiService.selectOptimalProvider(Object.keys(aiService.healthStatus));
      expect(provider).toBe('gemini'); // Gemini should be preferred over OpenAI
    });

    test('should fallback to OpenAI when Gemini is unavailable', () => {
      aiService.healthStatus = {
        gemini: 'unavailable',
        openai: 'healthy',
        ollama: 'unavailable'
      };
      
      const provider = aiService.selectOptimalProvider(Object.keys(aiService.healthStatus));
      expect(provider).toBe('openai');
    });

    test('should use Ollama as last resort', () => {
      aiService.healthStatus = {
        gemini: 'unavailable',
        openai: 'unavailable',
        ollama: 'healthy'
      };
      
      const provider = aiService.selectOptimalProvider(Object.keys(aiService.healthStatus));
      expect(provider).toBe('ollama');
    });

    test('should handle no available providers', () => {
      aiService.healthStatus = {
        gemini: 'unavailable',
        openai: 'unavailable',
        ollama: 'unavailable'
      };
      
      const provider = aiService.selectOptimalProvider(Object.keys(aiService.healthStatus));
      expect(provider).toBe('ollama'); // Default fallback
    });
  });

  describe('Generation Execution', () => {
    test('should generate content with Gemini provider', async () => {
      process.env.GEMINI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock Gemini generation
      aiService.providers.gemini.getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: { text: () => 'Generated content from Gemini' }
        })
      });
      
      aiService.healthStatus.gemini = 'healthy';
      
      const result = await aiService.generate({
        prompt: 'Test prompt',
        provider: 'gemini'
      });
      
      expect(result).toBe('Generated content from Gemini');
      expect(aiService.providers.gemini.getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-pro-latest' });
    });

    test('should generate content with OpenAI provider', async () => {
      process.env.OPENAI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock OpenAI generation
      aiService.providers.openai.chat.completions.create = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Generated content from OpenAI' } }]
      });
      
      aiService.healthStatus.openai = 'healthy';
      
      const result = await aiService.generate({
        prompt: 'Test prompt',
        provider: 'openai'
      });
      
      expect(result).toBe('Generated content from OpenAI');
      expect(aiService.providers.openai.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: 'Test prompt' }],
        temperature: 0.7
      });
    });

    test('should handle generation failures with proper error handling', async () => {
      process.env.GEMINI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock failed generation
      aiService.providers.gemini.getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('API timeout'))
      });
      
      aiService.healthStatus.gemini = 'healthy';
      
      await expect(aiService.generate({
        prompt: 'Test prompt',
        provider: 'gemini'
      })).rejects.toThrow('API timeout');
      
      // Should mark provider as degraded after failure
      expect(aiService.healthStatus.gemini).toBe('degraded');
    });
  });

  describe('Circuit Breaker Pattern', () => {
    test('should implement circuit breaker for failing providers', async () => {
      process.env.GEMINI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock failing provider
      aiService.providers.gemini.getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('Repeated failure'))
      });
      
      aiService.healthStatus.gemini = 'healthy';
      
      // First failure
      await expect(aiService.generate({
        prompt: 'Test prompt',
        provider: 'gemini'
      })).rejects.toThrow('Repeated failure');
      
      expect(aiService.healthStatus.gemini).toBe('degraded');
      
      // Second attempt should not call the failing provider
      const spy = jest.spyOn(aiService.providers.gemini, 'getGenerativeModel');
      
      await expect(aiService.generate({
        prompt: 'Test prompt',
        provider: 'gemini'
      })).rejects.toThrow('No valid AI providers available');
      
      expect(spy).not.toHaveBeenCalled(); // Should not call the degraded provider
    });

    test('should allow recovery after cooldown period', async () => {
      process.env.GEMINI_API_KEY = 'test_key';
      aiService.initializeProviders();
      
      // Mock initially failing provider
      let callCount = 0;
      aiService.providers.gemini.getGenerativeModel = jest.fn().mockReturnValue({
        generateContent: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Initial failure');
          }
          return { response: { text: () => 'Recovered content' } };
        })
      });
      
      aiService.healthStatus.gemini = 'healthy';
      
      // First call fails
      await expect(aiService.generate({
        prompt: 'Test prompt',
        provider: 'gemini'
      })).rejects.toThrow('Initial failure');
      
      expect(aiService.healthStatus.gemini).toBe('degraded');
      
      // After cooldown, should attempt recovery
      jest.advanceTimersByTime(30000); // 30 second cooldown
      
      const result = await aiService.generate({
        prompt: 'Test prompt',
        provider: 'gemini'
      });
      
      expect(result).toBe('Recovered content');
      expect(aiService.healthStatus.gemini).toBe('healthy'); // Should be healthy after successful recovery
    });
  });
});