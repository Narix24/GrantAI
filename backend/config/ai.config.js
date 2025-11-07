export const AI_CONFIG = {
  providers: {
    gemini: {
      enabled: !!process.env.GEMINI_API_KEY,
      models: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'],
      rateLimit: { requests: 60, period: 60 }, // requests per minute
      costPerToken: { input: 0.0000025, output: 0.0000075 }
    },
    openai: {
      enabled: !!process.env.OPENAI_API_KEY,
      models: ['gpt-4-turbo', 'gpt-3.5-turbo'],
      rateLimit: { requests: 10000, period: 60 },
      costPerToken: { input: 0.00001, output: 0.00003 }
    },
    ollama: {
      enabled: !!process.env.OLLAMA_URL,
      models: ['llama3:70b', 'mixtral'],
      localOnly: true
    }
  },
  routingStrategy: 'cost_optimized', // 'performance', 'cost_optimized', 'hybrid'
  fallbackChain: ['gemini', 'openai', 'ollama'],
  promptTemplates: {
    proposal: 'You are an expert grant writer specializing in {domain}. Write a compelling proposal for {opportunity}...',
    toneAnalysis: 'Analyze the tone of this text and classify it into one of these categories: formal, persuasive, technical, empathetic...'
  }
};