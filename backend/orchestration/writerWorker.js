import { Worker } from 'bullmq';
import { ProposalWriterAgent } from '../agents/ProposalWriterAgent.js';
import { dbRouter } from '../services/dbRouter.js';
import { logger } from '../utils/logger.js';
import { recoveryOrchestrator } from './recoveryOrchestrator.js';
import { queue } from './queue.js';

export function registerWriterWorker() {
  new Worker('writer-queue', async (job) => {
    const { opportunity, missionStatement, organization, language, tone, proposalId } = job.data;
    
    logger.info(`✍️ Writing proposal for ${opportunity.title} [${job.id}]`);
    
    try {
      const writer = new ProposalWriterAgent();
      const result = await writer.execute({
        opportunity,
        missionStatement,
        organization,
        language,
        tone,
        proposalId
      });
      
      // 🗃️ Save proposal to database
      const db = dbRouter.getAdapter();
      const proposalData = {
        id: proposalId,
        title: `Proposal for ${opportunity.title}`,
        content: result.content,
        language: language || 'en',
        status: 'DRAFT',
        deadline: opportunity.deadline,
        opportunityId: opportunity.id,
        toneAnalysis: result.meta.toneAnalysis,
        wordCount: result.meta.wordCount,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      if (db.model) {
        // MongoDB
        await db.model('Proposal').updateOne(
          { id: proposalId },
          { ...proposalData },
          { upsert: true, runValidators: true }
        );
      } else {
        // SQLite
        await db.adapters.sqlite.run(`
          INSERT INTO proposals (
            id, title, content, language, status, deadline, opportunityId, 
            toneAnalysis, wordCount, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            language = excluded.language,
            status = excluded.status,
            deadline = excluded.deadline,
            opportunityId = excluded.opportunityId,
            toneAnalysis = excluded.toneAnalysis,
            wordCount = excluded.wordCount,
            updatedAt = excluded.updatedAt
        `, [
          proposalId,
          proposalData.title,
          proposalData.content,
          proposalData.language,
          proposalData.status,
          proposalData.deadline.toISOString(),
          proposalData.opportunityId,
          JSON.stringify(proposalData.toneAnalysis),
          proposalData.wordCount,
          proposalData.createdAt.toISOString(),
          proposalData.updatedAt.toISOString()
        ]);
      }
      
      logger.info(`✅ Proposal generated successfully [${proposalId}]`);
      
      // 📊 Track metrics
      import('../utils/metrics.js').then(({ metrics }) => {
        metrics.increment('proposals_generated', 1, { 
          language: language || 'en',
          wordCount: result.meta.wordCount
        });
        metrics.timing('proposal_generation_time', Date.now() - job.timestamp);
      });
      
      return {
        success: true,
        proposalId,
        wordCount: result.meta.wordCount,
        tone: result.meta.toneAnalysis.primaryTone
      };
    } catch (error) {
      logger.error(`❌ Proposal generation failed [${job.id}]`, error);
      
      // 🔄 Trigger recovery
      await recoveryOrchestrator.triggerRecovery(error, { 
        service: 'proposal_writer',
        opportunityId: opportunity.id,
        jobId: job.id
      });
      
      throw error;
    }
  }, {
    connection: queue.connection,
    concurrency: process.env.WRITER_CONCURRENCY || 3,
    lockDuration: 600000 // 10 minutes (for complex proposals)
  });
  
  logger.info('✅ Writer worker registered');
}