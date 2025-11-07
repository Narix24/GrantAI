const { ProposalWriterAgent } = require('../../../backend/agents/ProposalWriterAgent');
const { aiService } = require('../../../backend/services/aiService');
const { chromaStore } = require('../../../backend/services/vectorStore/chroma');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { logger } = require('../../../backend/utils/logger');

jest.mock('../../../backend/services/aiService');
jest.mock('../../../backend/services/vectorStore/chroma');
jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/utils/logger');

describe('ProposalWriterAgent Integration', () => {
  let agent;

  beforeEach(() => {
    agent = new ProposalWriterAgent();
    jest.clearAllMocks();
  });

  describe('Context Retrieval', () => {
    test('should retrieve relevant context from vector store', async () => {
      // Mock vector store responses
      chromaStore.querySimilar.mockImplementation((query, nResults, filter) => {
        if (filter.type === 'grant_opportunity') {
          return Promise.resolve([
            {
              text: 'NSF research grant focusing on climate change impacts with $500K budget',
              meta: { categories: ['research', 'climate'] } // <-- fixed
            }
          ]);
        }
        if (filter.type === 'organization_profile') {
          return Promise.resolve([
            {
              text: 'Climate Research Institute with 10 years experience in environmental studies',
              meta: { pastGrants: ['NSF Grant #12345'] } // <-- fixed
            }
          ]);
        }
        return Promise.resolve([]);
      });

      const opportunity = {
        title: 'Climate Research Grant',
        description: 'Funding for climate change research',
        categories: ['research', 'climate'],
        deadline: new Date('2025-12-31')
      };

      const organization = {
        name: 'Climate Research Institute',
        mission: 'Advancing climate science',
        pastGrants: ['NSF Grant #12345']
      };

      const context = await agent.getContext(opportunity, organization);

      expect(context.documents.length).toBe(3); // 1 grant + 1 org + current date
      expect(context.documents[0]).toContain('NSF research grant');
      expect(context.documents[1]).toContain('Climate Research Institute');
      expect(context.sources.length).toBe(2);
    });

    test('should handle empty context gracefully', async () => {
      chromaStore.querySimilar.mockResolvedValue([]);

      const context = await agent.getContext({}, {});

      expect(context.documents.length).toBe(1); // Just the current date
      expect(context.documents[0]).toContain('Current date:');
    });
  });

  describe('Prompt Building', () => {
    test('should build comprehensive prompt with all required sections', async () => {
      const opportunity = {
        title: 'AI Research Grant',
        organization: 'National Science Foundation',
        deadline: new Date('2025-06-15'),
        amount: 100000,
        currency: 'USD',
        description: 'Funding for artificial intelligence research',
        specialRequirements: 'Must include ethical considerations'
      };

      const organization = {
        name: 'Tech Research Lab',
        mission: 'Advancing AI for social good',
        pastGrants: ['NSF AI Grant 2023']
      };

      const context = {
        documents: [
          'Previous successful AI grant proposal example',
          'NSF funding guidelines for AI research'
        ],
        sources: []
      };

      const prompt = await agent.buildPrompt({
        opportunity,
        missionStatement: 'Ethical AI development for societal benefit',
        organization,
        context,
        tone: 'formal',
        language: 'en'
      });

      expect(prompt).toContain('Executive Summary');
      expect(prompt).toContain('Methodology');
      expect(prompt).toContain('Budget justification');
      expect(prompt).toContain('impact assessment');
      expect(prompt).toContain('ethical considerations');
      expect(prompt).toContain('Persuasive but professional tone');
    });

    test('should localize prompt for different languages', async () => {
      const prompt = await agent.buildPrompt({
        opportunity: { title: 'Research Grant' },
        missionStatement: 'Research mission',
        organization: { name: 'Research Institute' },
        context: { documents: [] },
        tone: 'formal',
        language: 'de'
      });

      expect(prompt).toContain('auf Deutsch');
      expect(prompt).toContain('formeller Ton');
    });
  });

  describe('Tone Analysis Integration', () => {
    test('should analyze tone using ToneAnalyzerAgent', async () => {
      const ToneAnalyzerAgent = require('../../../backend/agents/ToneAnalyzerAgent').ToneAnalyzerAgent;

      aiService.generate.mockResolvedValue(`
        # Research Proposal

        This is a formal research proposal that uses professional language and academic terminology.
        The methodology section outlines a rigorous approach to data collection and analysis.
      `);

      const mockToneAnalysis = {
        primaryTone: 'formal',
        confidence: 92.5,
        keywords: ['professional', 'academic', 'rigorous']
      };

      const mockToneAgentInstance = {
        execute: jest.fn().mockResolvedValue(mockToneAnalysis)
      };

      jest.spyOn(require('../../../backend/agents/ToneAnalyzerAgent'), 'ToneAnalyzerAgent')
          .mockImplementation(() => mockToneAgentInstance);

      const result = await agent.execute({
        opportunity: { title: 'Test Grant' },
        missionStatement: 'Test mission',
        organization: { name: 'Test Org' },
        language: 'en'
      });

      expect(result.meta.toneAnalysis).toEqual(mockToneAnalysis);
      expect(ToneAnalyzerAgent).toHaveBeenCalled();
    });
  });

  describe('Voice Generation Integration', () => {
    test('should trigger voice narration generation', async () => {
      aiService.generate.mockResolvedValue('This is a test proposal content for voice generation.');

      const VoicePlaybackAgent = require('../../../backend/agents/VoicePlaybackAgent').VoicePlaybackAgent;
      const mockVoiceAgent = { execute: jest.fn() };
      jest.spyOn(require('../../../backend/agents/VoicePlaybackAgent'), 'VoicePlaybackAgent')
          .mockImplementation(() => mockVoiceAgent);

      await agent.execute({
        opportunity: { title: 'Test Grant' },
        missionStatement: 'Test mission',
        organization: { name: 'Test Org' },
        language: 'en',
        proposalId: 'voice_test_123'
      });

      expect(mockVoiceAgent.execute).toHaveBeenCalledWith(expect.objectContaining({
        content: 'This is a test proposal content for voice generation.',
        language: 'en',
        proposalId: 'voice_test_123'
      }));
    });

    test('should handle voice generation failures gracefully', async () => {
      aiService.generate.mockResolvedValue('Test content');

      const VoicePlaybackAgent = require('../../../backend/agents/VoicePlaybackAgent').VoicePlaybackAgent;
      const mockVoiceAgent = { execute: jest.fn().mockRejectedValue(new Error('Voice service unavailable')) };
      jest.spyOn(require('../../../backend/agents/VoicePlaybackAgent'), 'VoicePlaybackAgent')
          .mockImplementation(() => mockVoiceAgent);

      console.warn = jest.fn();

      await agent.execute({
        opportunity: { title: 'Test Grant' },
        missionStatement: 'Test mission',
        organization: { name: 'Test Org' },
        language: 'en',
        proposalId: 'voice_fail_123'
      });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Voice narration generation failed'),
        expect.any(Error)
      );
    });
  });

  describe('Error Handling', () => {
    test('should throw error when AI generation fails', async () => {
      aiService.generate.mockRejectedValue(new Error('AI service unavailable'));

      await expect(agent.execute({
        opportunity: { title: 'Failed Grant' },
        missionStatement: 'Test mission',
        organization: { name: 'Test Org' },
        language: 'en'
      })).rejects.toThrow('AI service unavailable');
    });

    test('should log errors with proper context', async () => {
      aiService.generate.mockRejectedValue(new Error('Generation timeout'));

      try {
        await agent.execute({
          opportunity: { title: 'Failed Grant' },
          missionStatement: 'Test mission',
          organization: { name: 'Test Org' },
          language: 'en'
        });
      } catch (error) {
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error generating proposal'),
          expect.anything()
        );
      }
    });
  });
});