// services/aiService.js - Unified AI Gateway
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { Ollama } from 'ollama';

class AIService {
  constructor() {
    this.providers = {};
    this.healthStatus = {
      gemini: 'initializing',
      openai: 'initializing',
      ollama: 'initializing'
    };
    this.lastFailure = {}; // track last failure timestamps for circuit breaker
    this.cooldownMs = 30000; // 30-second cooldown
    this.initializeProviders();
  }

  initializeProviders() {
    // 🌐 Gemini Configuration
    if (process.env.GEMINI_API_KEY) {
      this.providers.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.testProvider('gemini');
    }

    // ⚡ OpenAI Configuration
    if (process.env.OPENAI_API_KEY) {
      this.providers.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.testProvider('openai');
    }

    // 🐙 Ollama Configuration
    if (process.env.OLLAMA_URL) {
      this.providers.ollama = new Ollama({ host: process.env.OLLAMA_URL });
      this.testProvider('ollama');
    }
  }

  async testProvider(provider) {
    try {
      const testPrompt = 'Respond with "OK" for health check';
      const result = await this.generate({
        prompt: testPrompt,
        provider,
        model: provider === 'ollama' ? 'llama3' : undefined
      });
      this.healthStatus[provider] = result.includes('OK') ? 'healthy' : 'degraded';
    } catch (error) {
      console.error(`🔥 ${provider.toUpperCase()} health check failed:`, error.message);
      this.healthStatus[provider] = 'unavailable';
    }
  }

  async generate({ prompt, context = [], language = 'en', provider = 'auto', model }) {
    // 🌍 Safe dynamic locale import (Windows-friendly)
    let enhancePrompt = (p) => p;
    try {
      const locale = await import(`../locales/${language}.js`);
      if (locale.enhancePrompt) enhancePrompt = locale.enhancePrompt;
    } catch {
      // fallback if locale file missing
    }
    const localizedPrompt = await enhancePrompt(prompt, context);

    // 🧠 Determine active providers
    const activeProviders = Object.entries(this.healthStatus)
      .filter(([_, status]) => status === 'healthy')
      .map(([p]) => p);

    if (provider === 'auto' || !activeProviders.includes(provider)) {
      provider = this.selectOptimalProvider(activeProviders);
    }

    // ⚡ Circuit breaker & fallback
    try {
      return await this.executeWithCooldown(localizedPrompt, provider, model);
    } catch (error) {
      console.error(`🔥 ${provider.toUpperCase()} failed:`, error.message);
      this.healthStatus[provider] = 'degraded';

      const fallbackProviders = activeProviders.filter(p => p !== provider);
      const fallbackProvider = this.selectOptimalProvider(fallbackProviders);
      if (!fallbackProvider) throw new Error('No valid AI providers available');

      return await this.executeWithCooldown(localizedPrompt, fallbackProvider, model);
    }
  }

  selectOptimalProvider(providers) {
    if (providers.includes('gemini')) return 'gemini';
    if (providers.includes('openai')) return 'openai';
    return providers[0] || 'ollama';
  }

  async executeWithCooldown(prompt, provider, model) {
    const lastFail = this.lastFailure[provider] || 0;
    if (Date.now() - lastFail < this.cooldownMs) {
      throw new Error('No valid AI providers available');
    }

    try {
      return await this.executeWithFallback(prompt, provider, model);
    } catch (error) {
      this.lastFailure[provider] = Date.now();
      throw error;
    }
  }

  async executeWithFallback(prompt, provider, model) {
    switch(provider) {
      case 'gemini':
        return await this.geminiGenerate(prompt, model || 'gemini-1.5-pro-latest');
      case 'openai':
        return await this.openaiGenerate(prompt, model || 'gpt-4-turbo');
      case 'ollama':
        return await this.ollamaGenerate(prompt, model || 'llama3:70b');
      default:
        throw new Error('No valid AI providers available');
    }
  }

  // Provider-specific implementations
  async geminiGenerate(prompt, model) {
    const modelInstance = this.providers.gemini.getGenerativeModel({ model });
    const result = await modelInstance.generateContent(prompt);
    return result.response.text();
  }

  async openaiGenerate(prompt, model) {
    const completion = await this.providers.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });
    return completion.choices[0].message.content;
  }

  async ollamaGenerate(prompt, model) {
    const response = await this.providers.ollama.generate({
      model,
      prompt,
      options: { temperature: 0.7 }
    });
    return response.response;
  }
}

export const aiService = new AIService();