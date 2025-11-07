const { WriterWorker } = require('../../../backend/orchestration/writerWorker');
const { ProposalWriterAgent } = require('../../../backend/agents/ProposalWriterAgent');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { logger } = require('../../../backend/utils/logger');
const { recoveryOrchestrator } = require('../../../backend/orchestration/recoveryOrchestrator');

jest.mock('../../../backend/agents/ProposalWriterAgent');
jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/utils/logger');
jest.mock('../../../backend/orchestration/recoveryOrchestrator');

describe('WriterWorker Integration', () => {
  let worker;
  
  beforeEach(() => {
    worker = new WriterWorker();
    jest.clearAllMocks();
    
    // Mock database adapter
    dbRouter.getAdapter.mockReturnValue({
      model: jest.fn().mockImplementation(() => ({
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
      })),
      adapters: {
        sqlite: {
          run: jest.fn().mockResolvedValue({ changes: 1 })
        }
      }
    });
  });

  describe('Job Processing', () => {
    test('should process proposal generation jobs successfully', async () => {
      // Mock proposal generation
      const mockProposal = {
        content: '# Test Proposal\nThis is a test proposal content.',
        meta: {
          toneAnalysis: { primaryTone: 'formal', confidence: 95 },
          wordCount: 1200
        }
      };
      
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockProposal)
      }));
      
      const job = {
        id: 'writer_job_123',
        timestamp: Date.now(),
        data: {
          opportunity: {
            id: 'opp_123',
            title: 'Test Grant',
            deadline: new Date('2025-12-31')
          },
          missionStatement: 'Test mission statement',
          organization: { name: 'Test Organization' },
          language: 'en',
          tone: 'formal',
          proposalId: 'prop_123'
        }
      };
      
      const result = await worker.processJob(job);
      
      expect(result).toEqual({
        success: true,
        proposalId: 'prop_123',
        wordCount: 1200,
        tone: 'formal'
      });
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Proposal generated successfully'),
        expect.objectContaining({ proposalId: 'prop_123' })
      );
    });

    test('should save proposal to MongoDB successfully', async () => {
      const mockProposal = {
        content: 'Test content',
        meta: {
          toneAnalysis: { primaryTone: 'formal' },
          wordCount: 1000
        }
      };
      
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockProposal)
      }));
      
      const job = {
        id: 'writer_job_mongo',
        timestamp: Date.now(),
        data: {
          opportunity: { id: 'opp_123', title: 'MongoDB Test' },
          missionStatement: 'MongoDB test mission',
          organization: { name: 'MongoDB Org' },
          proposalId: 'mongo_prop_123'
        }
      };
      
      await worker.processJob(job);
      
      expect(dbRouter.getAdapter().model).toHaveBeenCalledWith('Proposal');
      expect(dbRouter.getAdapter().model().updateOne).toHaveBeenCalledWith(
        { id: 'mongo_prop_123' },
        expect.objectContaining({
          content: 'Test content',
          wordCount: 1000,
          status: 'DRAFT'
        }),
        expect.objectContaining({
          upsert: true
        })
      );
    });

    test('should save proposal to SQLite successfully', async () => {
      // Mock SQLite adapter
      dbRouter.getAdapter.mockReturnValue({
        adapters: {
          sqlite: {
            run: jest.fn().mockResolvedValue({ changes: 1 })
          }
        }
      });
      
      const mockProposal = {
        content: 'SQLite test content',
        meta: {
          toneAnalysis: { primaryTone: 'formal' },
          wordCount: 800
        }
      };
      
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockProposal)
      }));
      
      const job = {
        id: 'writer_job_sqlite',
        timestamp: Date.now(),
        data: {
          opportunity: { id: 'opp_123', title: 'SQLite Test' },
          missionStatement: 'SQLite test mission',
          organization: { name: 'SQLite Org' },
          proposalId: 'sqlite_prop_123'
        }
      };
      
      await worker.processJob(job);
      
      expect(dbRouter.getAdapter().adapters.sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO proposals'),
        expect.arrayContaining([
          'sqlite_prop_123',
          expect.any(String),
          'SQLite test content',
          'en',
          'DRAFT',
          expect.any(String),
          'opp_123',
          expect.any(String),
          800,
          expect.any(String),
          expect.any(String)
        ])
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle agent execution failures', async () => {
      // Mock agent failure
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(new Error('AI generation failed'))
      }));
      
      const job = {
        id: 'writer_job_fail',
        timestamp: Date.now(),
        data: {
          opportunity: { id: 'opp_fail' },
          missionStatement: 'Failed mission',
          organization: { name: 'Fail Org' },
          proposalId: 'fail_prop_123'
        }
      };
      
      await expect(worker.processJob(job))
        .rejects
        .toThrow('AI generation failed');
      
      // Should trigger recovery
      expect(recoveryOrchestrator.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          service: 'proposal_writer',
          opportunityId: 'opp_fail',
          jobId: 'writer_job_fail'
        })
      );
    });

    test('should handle database save failures', async () => {
      const mockProposal = {
        content: 'DB fail content',
        meta: {
          toneAnalysis: { primaryTone: 'formal' },
          wordCount: 500
        }
      };
      
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockProposal)
      }));
      
      // Mock database failure
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          updateOne: jest.fn().mockRejectedValue(new Error('Database save failed'))
        }))
      });
      
      const job = {
        id: 'writer_job_db_fail',
        timestamp: Date.now(),
        data: {
          opportunity: { id: 'opp_db' },
          missionStatement: 'DB fail mission',
          organization: { name: 'DB Fail Org' },
          proposalId: 'db_fail_prop_123'
        }
      };
      
      await expect(worker.processJob(job))
        .rejects
        .toThrow('Database save failed');
      
      // Should trigger recovery
      expect(recoveryOrchestrator.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          service: 'database',
          proposalId: 'db_fail_prop_123'
        })
      );
    });
  });

  describe('Metrics Tracking', () => {
    test('should track proposal generation metrics', async () => {
      const mockMetrics = {
        increment: jest.fn(),
        timing: jest.fn()
      };
      
      jest.mock('../../../backend/utils/metrics', () => ({
        metrics: mockMetrics
      }), { virtual: true });
      
      const mockProposal = {
        content: 'Metric test content',
        meta: {
          toneAnalysis: { primaryTone: 'formal' },
          wordCount: 1500
        }
      };
      
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockProposal)
      }));
      
      const job = {
        id: 'writer_job_metrics',
        timestamp: Date.now() - 5000, // 5 seconds ago
        data: {
          opportunity: { id: 'opp_metrics' },
          missionStatement: 'Metrics test mission',
          organization: { name: 'Metrics Org' },
          language: 'de',
          proposalId: 'metrics_prop_123'
        }
      };
      
      await worker.processJob(job);
      
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'proposals_generated',
        1,
        expect.objectContaining({
          language: 'de',
          wordCount: 1500
        })
      );
      
      expect(mockMetrics.timing).toHaveBeenCalledWith(
        'proposal_generation_time',
        expect.any(Number)
      );
    });
  });

  describe('Tone Analysis Integration', () => {
    test('should include tone analysis in proposal metadata', async () => {
      const mockProposal = {
        content: 'Tone analysis content',
        meta: {
          toneAnalysis: {
            primaryTone: 'persuasive',
            confidence: 87.5,
            keywords: ['urgent', 'critical']
          },
          wordCount: 1000
        }
      };
      
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockProposal)
      }));
      
      const job = {
        id: 'writer_job_tone',
        timestamp: Date.now(),
        data: {
          opportunity: { id: 'opp_tone' },
          missionStatement: 'Tone test mission',
          organization: { name: 'Tone Org' },
          proposalId: 'tone_prop_123'
        }
      };
      
      await worker.processJob(job);
      
      // Verify tone analysis is saved
      expect(dbRouter.getAdapter().model().updateOne).toHaveBeenCalledWith(
        { id: 'tone_prop_123' },
        expect.objectContaining({
          toneAnalysis: {
            primaryTone: 'persuasive',
            confidence: 87.5,
            keywords: ['urgent', 'critical']
          }
        }),
        expect.anything()
      );
    });
  });

  describe('Multilingual Support', () => {
    test('should handle German language proposals', async () => {
      const mockProposal = {
        content: 'Deutscher Inhalt mit Umlauten äöü',
        meta: {
          toneAnalysis: { primaryTone: 'formal' },
          wordCount: 1200
        }
      };
      
      ProposalWriterAgent.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(mockProposal)
      }));
      
      const job = {
        id: 'writer_job_german',
        timestamp: Date.now(),
        data: {
          opportunity: { id: 'opp_de' },
          missionStatement: 'Deutsche Mission',
          organization: { name: 'Deutsche Org' },
          language: 'de',
          proposalId: 'de_prop_123'
        }
      };
      
      await worker.processJob(job);
      
      expect(dbRouter.getAdapter().model().updateOne).toHaveBeenCalledWith(
        { id: 'de_prop_123' },
        expect.objectContaining({
          language: 'de',
          content: 'Deutscher Inhalt mit Umlauten äöü'
        }),
        expect.anything()
      );
    });
  });
});