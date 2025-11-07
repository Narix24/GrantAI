import { aiService } from '../services/aiService.js';
import { logger } from '../utils/logger.js';

export class ToneAnalyzerAgent {
  constructor() {
    this.toneCategories = {
      formal: {
        description: 'Professional, respectful, and objective language suitable for academic or institutional contexts',
        keywords: ['respectfully', 'therefore', 'consequently', 'academic', 'institutional', 'formal']
      },
      persuasive: {
        description: 'Emotionally engaging language that motivates action and creates urgency',
        keywords: ['urgent', 'critical', 'transformative', 'compelling', 'imperative', 'persuasive']
      },
      technical: {
        description: 'Precise, jargon-heavy language focused on methodology and specifications',
        keywords: ['methodology', 'algorithm', 'specification', 'implementation', 'technical', 'precise']
      },
      empathetic: {
        description: 'Compassionate language that acknowledges human impact and emotional dimensions',
        keywords: ['community', 'impact', 'compassion', 'understanding', 'human', 'empathetic']
      }
    };
  }

  async execute(payload) {
    const { content, language = 'en', funderStyle = {} } = payload;
    
    logger.info(`🎭 Analyzing tone for ${language} content (length: ${content.length})`);
    
    // 🧠 AI-powered tone analysis
    const analysis = await this.analyzeWithAI(content, language, funderStyle);
    
    // 📊 Confidence scoring
    const confidence = this.calculateConfidence(analysis, content);
    
    // 🌐 Localization of results
    const localizedResults = await this.localizeResults(analysis, language);
    
    logger.info(`✅ Tone analysis complete: ${analysis.primaryTone} (${confidence.toFixed(1)}%)`);
    
    return {
      primaryTone: analysis.primaryTone,
      secondaryTones: analysis.secondaryTones,
      confidence,
      keywords: this.extractKeywords(content, analysis.primaryTone),
      alignmentScore: funderStyle.tone ? this.calculateAlignment(analysis.primaryTone, funderStyle.tone) : null,
      details: localizedResults
    };
  }

  async analyzeWithAI(content, language, funderStyle) {
    // Truncate content for analysis (focus on key sections)
    const analyzedContent = this.extractKeySections(content);
    
    const prompt = `
    Analyze the tone of the following text and classify it into one of these categories:
    ${Object.keys(this.toneCategories).map(tone => `- ${tone}: ${this.toneCategories[tone].description}`).join('\n')}
    
    Text to analyze (in ${language}):
    """
    ${analyzedContent}
    """
    
    ${funderStyle.tone ? `The target funder's preferred tone is: ${funderStyle.tone}. Assess alignment with this style.` : ''}
    
    Respond with JSON in this format:
    {
      "primaryTone": "one of the categories above",
      "secondaryTones": ["other relevant categories"],
      "explanation": "brief explanation in ${language}",
      "improvementSuggestions": ["specific suggestions to improve tone alignment"]
    }
    `;
    
    const response = await aiService.generate({
      prompt,
      language,
      provider: 'auto',
      model: 'gemini-1.5-flash-latest' // Faster for analysis tasks
    });
    
    try {
      return JSON.parse(response);
    } catch (error) {
      logger.error('❌ Failed to parse tone analysis response', { response, error });
      return this.fallbackAnalysis(content);
    }
  }

  extractKeySections(content) {
    // Focus on executive summary and conclusion for tone analysis
    const sections = content.split(/#+\s*(Executive Summary|Conclusion|Summary)/i);
    if (sections.length > 2) {
      return `${sections[1]}\n\n${sections[sections.length - 1]}`;
    }
    return content.substring(0, 1500); // First 1500 characters
  }

  fallbackAnalysis(content) {
    // Simple keyword-based fallback
    const keywordCounts = {};
    
    for (const [tone, config] of Object.entries(this.toneCategories)) {
      keywordCounts[tone] = config.keywords.reduce((count, keyword) => 
        count + (content.toLowerCase().match(new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'g')) || []).length
      , 0);
    }
    
    const sortedTones = Object.entries(keywordCounts).sort((a, b) => b[1] - a[1]);
    return {
      primaryTone: sortedTones[0][0],
      secondaryTones: sortedTones.slice(1, 3).map(([tone]) => tone),
      explanation: 'Fallback analysis due to AI service unavailability',
      improvementSuggestions: []
    };
  }

  calculateConfidence(analysis, content) {
    // Calculate confidence based on keyword density and section focus
    const primaryKeywords = this.toneCategories[analysis.primaryTone].keywords;
    const keywordDensity = primaryKeywords.reduce((count, keyword) => 
      count + (content.toLowerCase().match(new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'g')) || []).length
    , 0) / (content.length / 1000);
    
    // Higher confidence for longer texts with consistent tone
    const textConfidence = Math.min(95, 70 + (content.length / 5000) * 30);
    const keywordConfidence = Math.min(90, 50 + keywordDensity * 20);
    
    return (textConfidence * 0.6) + (keywordConfidence * 0.4);
  }

  extractKeywords(content, tone) {
    const keywords = this.toneCategories[tone].keywords;
    const found = [];
    
    for (const keyword of keywords) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        found.push(keyword);
      }
    }
    
    return found.slice(0, 5); // Return top 5 keywords
  }

  calculateAlignment(proposalTone, funderTone) {
    // Simple alignment scoring
    const alignmentMap = {
      formal: { formal: 100, technical: 80, persuasive: 60, empathetic: 40 },
      persuasive: { persuasive: 100, empathetic: 80, formal: 60, technical: 40 },
      technical: { technical: 100, formal: 80, persuasive: 40, empathetic: 30 },
      empathetic: { empathetic: 100, persuasive: 80, formal: 50, technical: 30 }
    };
    
    return alignmentMap[proposalTone]?.[funderTone] || 50;
  }

  async localizeResults(analysis, language) {
    if (language === 'en') return analysis;
    
    try {
      // Translate explanation and suggestions
      const { i18nService } = await import('../services/i18nService.js');
      
      analysis.explanation = await i18nService.translate(analysis.explanation, language);
      analysis.improvementSuggestions = await Promise.all(
        analysis.improvementSuggestions.map(suggestion => 
          i18nService.translate(suggestion, language)
        )
      );
      
      return analysis;
    } catch (error) {
      logger.warn('⚠️ Localization failed for tone analysis', error);
      return analysis;
    }
  }
}