import { Worker } from 'bullmq';
import { emailService } from '../services/emailService.js';
import { dbRouter } from '../services/dbRouter.js';
import { logger } from '../utils/logger.js';
import { recoveryOrchestrator } from './recoveryOrchestrator.js';
import { queue } from './queue.js';

export function registerSubmitterWorker() {
  new Worker('submitter-queue', async (job) => {
    const { proposalId, recipient, language } = job.data;
    
    logger.info(`📤 Submitting proposal ${proposalId} to ${recipient}`);
    
    try {
      // 🗃️ Get proposal from database
      const db = dbRouter.getAdapter();
      let proposal;
      
      if (db.model) {
        proposal = await db.model('Proposal').findOne({ id: proposalId });
      } else {
        proposal = await db.adapters.sqlite.get(
          'SELECT * FROM proposals WHERE id = ?',
          proposalId
        );
      }
      
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }
      
      // 📧 Send email
      const result = await emailService.sendProposal(
        proposal, 
        recipient, 
        language || proposal.language || 'en'
      );
      
      // 🗃️ Update proposal status
      if (db.model) {
        await db.model('Proposal').updateOne(
          { id: proposalId },
          { 
            $set: { 
              status: 'SUBMITTED',
              submittedAt: new Date(),
              submissionResult: result 
            }
          }
        );
      } else {
        await db.adapters.sqlite.run(`
          UPDATE proposals
          SET status = 'SUBMITTED',
              submittedAt = ?,
              submissionResult = ?
          WHERE id = ?
        `, [new Date().toISOString(), JSON.stringify(result), proposalId]);
      }
      
      logger.info(`✅ Proposal ${proposalId} submitted successfully to ${recipient}`);
      
      // 📊 Track metrics
      import('../utils/metrics.js').then(({ metrics }) => {
        metrics.increment('proposals_submitted', 1, { 
          language: language || proposal.language || 'en'
        });
      });
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error(`❌ Submission failed for ${proposalId}`, error);
      
      // 🔄 Trigger recovery
      await recoveryOrchestrator.triggerRecovery(error, { 
        service: 'proposal_submitter',
        proposalId,
        recipient
      });
      
      // 📉 Update proposal status to FAILED
      const db = dbRouter.getAdapter();
      if (db.model) {
        await db.model('Proposal').updateOne(
          { id: proposalId },
          { $set: { status: 'FAILED', updatedAt: new Date() } }
        );
      } else {
        await db.adapters.sqlite.run(`
          UPDATE proposals
          SET status = 'FAILED',
              updatedAt = ?
          WHERE id = ?
        `, [new Date().toISOString(), proposalId]);
      }
      
      throw error;
    }
  }, {
    connection: queue.connection,
    concurrency: 5,
    lockDuration: 120000 // 2 minutes
  });
  
  logger.info('✅ Submitter worker registered');
}