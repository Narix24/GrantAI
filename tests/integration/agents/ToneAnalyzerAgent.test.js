const { ToneAnalyzerAgent } = require('../../../backend/agents/ToneAnalyzerAgent');
const { aiService } = require('../../../backend/services/aiService');
const { i18nService } = require('../../../backend/services/i18nService');

jest.mock('../../../backend/services/aiService');
jest.mock('../../../backend/services/i18nService');

describe('ToneAnalyzerAgent Integration', () => {
  let agent;
  
  beforeEach(() => {
    agent = new ToneAnalyzerAgent();
    jest.clearAllMocks();
  });

  describe('Tone Analysis', () => {
    test('should analyze tone for formal content', async () => {
      // Mock AI response
      aiService.generate.mockResolvedValue(JSON.stringify({
        primaryTone: 'formal',
        secondaryTones: ['technical'],
        explanation: 'The content uses professional language and academic terminology',
        improvementSuggestions: ['Increase use of formal transitions', 'Add more academic citations']
      }));
      
      const content = `
        # Research Proposal
        
        This proposal outlines a comprehensive research methodology for studying climate change impacts.
        The research team will employ rigorous scientific methods including data collection, statistical analysis,
        and peer-reviewed validation procedures. All findings will be published in academic journals.
      `;
      
      const result = await agent.execute({ content, language: 'en' });
      
      expect(result.primaryTone).toBe('formal');
      expect(result.secondaryTones).toContain('technical');
      expect(result.confidence).toBeGreaterThan(80);
      expect(result.keywords).toContain('rigorous');
      expect(result.keywords).toContain('academic');
    });

    test('should analyze tone for persuasive content', async () => {
      aiService.generate.mockResolvedValue(JSON.stringify({
        primaryTone: 'persuasive',
        secondaryTones: ['empathetic'],
        explanation: 'The content uses emotional language and creates urgency',
        improvementSuggestions: ['Add more compelling statistics', 'Include personal stories']
      }));
      
      const content = `
        # Community Health Initiative
        
        Every day, families in our community suffer from lack of access to basic healthcare services.
        This urgent crisis demands immediate action. Your support can transform lives and create lasting change.
        Together, we can build a healthier future for everyone.
      `;
      
      const result = await agent.execute({ content, language: 'en' });
      
      expect(result.primaryTone).toBe('persuasive');
      expect(result.confidence).toBeGreaterThan(85);
      expect(result.keywords).toContain('urgent');
      expect(result.keywords).toContain('transform');
    });

    test('should handle AI parsing failures with fallback analysis', async () => {
      // Mock invalid AI response
      aiService.generate.mockResolvedValue('This is not valid JSON');
      
      const content = 'This is a test content with formal keywords like therefore and consequently';
      
      const result = await agent.execute({ content, language: 'en' });
      
      expect(result.primaryTone).toBe('formal');
      expect(result.confidence).toBeGreaterThan(60);
      expect(result.keywords).toContain('therefore');
    });
  });

  describe('Multilingual Support', () => {
    test('should analyze German content correctly', async () => {
      aiService.generate.mockResolvedValue(JSON.stringify({
        primaryTone: 'formal',
        explanation: 'Der Inhalt verwendet professionelle Sprache',
        improvementSuggestions: []
      }));
      
      // Mock localization
      i18nService.translate.mockImplementation((text, language) => {
        if (language === 'de') {
          return text.replace('professional language', 'professionelle Sprache');
        }
        return text;
      });
      
      const content = `
        # Forschungsantrag
        
        Dieser Antrag beschreibt eine umfassende Forschungsmethodik zur Untersuchung von Klimawandel-Auswirkungen.
        Das Forschungsteam wird rigorose wissenschaftliche Methoden anwenden.
      `;
      
      const result = await agent.execute({ content, language: 'de' });
      
      expect(result.primaryTone).toBe('formal');
      expect(i18nService.translate).toHaveBeenCalled();
    });

    test('should handle non-English content without translation service', async () => {
      aiService.generate.mockResolvedValue(JSON.stringify({
        primaryTone: 'formal',
        explanation: 'Content analysis',
        improvementSuggestions: []
      }));
      
      // Mock translation failure
      i18nService.translate.mockRejectedValue(new Error('Translation service unavailable'));
      
      const content = 'Contenu en français avec des mots formels';
      
      const result = await agent.execute({ content, language: 'fr' });
      
      expect(result.primaryTone).toBe('formal');
      expect(result.explanation).toBe('Content analysis'); // Fallback to English
    });
  });

  describe('Funder Alignment', () => {
    test('should calculate alignment score with funder preferences', async () => {
      aiService.generate.mockResolvedValue(JSON.stringify({
        primaryTone: 'formal',
        explanation: 'Formal academic tone',
        improvementSuggestions: []
      }));
      
      const content = 'This is a formal research proposal';
      const funderStyle = { tone: 'formal' };
      
      const result = await agent.execute({ content, language: 'en', funderStyle });
      
      expect(result.alignmentScore).toBe(100); // Perfect match
    });

    test('should handle partial alignment', async () => {
      aiService.generate.mockResolvedValue(JSON.stringify({
        primaryTone: 'persuasive',
        explanation: 'Persuasive tone',
        improvementSuggestions: []
      }));
      
      const content = 'This is a persuasive proposal';
      const funderStyle = { tone: 'formal' };
      
      const result = await agent.execute({ content, language: 'en', funderStyle });
      
      // Expect partial alignment based on mapping
      expect(result.alignmentScore).toBe(60); // Configurable mapping
    });
  });

  describe('Content Extraction', () => {
    test('should extract key sections for analysis', () => {
      const content = `
        # Executive Summary
        This is the executive summary section with important overview information.
        
        # Introduction
        Background and context for the proposal.
        
        # Methodology
        Detailed research methods and procedures.
        
        # Conclusion
        Final thoughts and impact assessment.
      `;
      
      const keySections = agent.extractKeySections(content);
      
      expect(keySections).toContain('executive summary');
      expect(keySections).toContain('conclusion');
      expect(keySections).not.toContain('methodology'); // Not in key sections
      expect(keySections.length).toBeLessThan(content.length);
    });
  });
});