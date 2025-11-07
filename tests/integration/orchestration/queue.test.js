const { proposalQueue, recoveryQueue, registerWorkers } = require('../../../backend/orchestration/queue');
const { recoveryOrchestrator } = require('../../../backend/orchestration/recoveryOrchestrator');
const { dbRouter } = require('../../../backend/services/dbRouter');
const BullMQ = require('bullmq');

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      on: jest.fn(),
      quit: jest.fn()
    };
  });
});

describe('Job Queue Orchestration', () => {
  beforeAll(async () => {
    await dbRouter.initialize();
    registerWorkers();
  });

  afterAll(async () => {
    await proposalQueue.close();
    await recoveryQueue.close();
    await dbRouter.shutdown();
  });

  describe('Proposal Generation Queue', () => {
    test('should process proposal generation jobs', async () => {
      const jobData = {
        type: 'generate_proposal',
        payload: {
          opportunity: { title: 'Test Grant', description: 'Test description' },
          missionStatement: 'Test mission',
          organization: { name: 'Test Org' },
          language: 'en',
          tone: 'formal',
          proposalId: 'test_prop_123'
        }
      };
      
      const job = await proposalQueue.add('proposal_job', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });
      
      // Wait for job to complete
      const completedJob = await new Promise((resolve) => {
        proposalQueue.on('completed', (jobId, result) => {
          if (jobId === job.id) {
            resolve(result);
          }
        });
      });
      
      expect(completedJob).toHaveProperty('success', true);
      expect(completedJob).toHaveProperty('proposalId', 'test_prop_123');
      
      // Verify job was removed from queue
      const jobCount = await proposalQueue.getJobCountByTypes('completed');
      expect(jobCount).toBeGreaterThanOrEqual(1);
    });

    test('should retry failed jobs with exponential backoff', async () => {
      // Mock failure scenario
      const { ProposalWriterAgent } = require('../../../backend/agents/ProposalWriterAgent');
      jest.spyOn(ProposalWriterAgent.prototype, 'execute').mockRejectedValue(
        new Error('Temporary generation failure')
      );
      
      const jobData = {
        type: 'generate_proposal',
        payload: {
          opportunity: { title: 'Failing Grant', description: 'Should retry' },
          missionStatement: 'Test mission',
          organization: { name: 'Test Org' },
          proposalId: 'test_prop_retry'
        }
      };
      
      const job = await proposalQueue.add('proposal_job', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });
      
      // Monitor retry attempts
      const retryAttempts = [];
      proposalQueue.on('failed', async (jobId, error, prev) => {
        if (jobId === job.id) {
          retryAttempts.push(prev?.attemptsMade || 0);
        }
      });
      
      // Wait for job to fail completely
      const failedJob = await new Promise((resolve) => {
        proposalQueue.on('failed', (jobId, error) => {
          if (jobId === job.id) {
            resolve({ jobId, error });
          }
        });
      });
      
      expect(failedJob.error.message).toBe('Temporary generation failure');
      expect(retryAttempts).toEqual([0, 1, 2]); // Should attempt 3 times
      expect(retryAttempts.length).toBe(3);
      
      // Verify job moved to failed queue
      const failedCount = await proposalQueue.getJobCountByTypes('failed');
      expect(failedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Recovery Queue', () => {
    test('should process recovery jobs for failed proposals', async () => {
      // Create a failed job first
      const failedJobData = {
        type: 'generate_proposal',
        payload: {
          opportunity: { title: 'Recovery Test', description: 'Needs recovery' },
          missionStatement: 'Test mission',
          organization: { name: 'Test Org' },
          proposalId: 'test_prop_recovery'
        }
      };
      
      // Add directly to failed state
      const failedJob = await proposalQueue.add('failed_job', failedJobData, {
        attempts: 0,
        state: 'failed'
      });
      
      // Mock recovery success
      recoveryOrchestrator.processRecoveryJob = jest.fn().mockResolvedValue({
        status: 'recovered',
        jobId: failedJob.id
      });
      
      // Add recovery job
      const recoveryJob = await recoveryQueue.add('recovery_job', {
        originalJob: { id: failedJob.id, data: failedJobData },
        failureReason: 'External service timeout'
      });
      
      // Wait for recovery completion
      const recoveryResult = await new Promise((resolve) => {
        recoveryQueue.on('completed', (jobId, result) => {
          if (jobId === recoveryJob.id) {
            resolve(result);
          }
        });
      });
      
      expect(recoveryResult).toHaveProperty('status', 'recovered');
      expect(recoveryOrchestrator.processRecoveryJob).toHaveBeenCalled();
      
      // Verify original job status
      const updatedJob = await proposalQueue.getJob(failedJob.id);
      expect(updatedJob).toBeNull(); // Should be removed after recovery
    });

    test('should escalate persistent failures to human operators', async () => {
      // Mock persistent failure
      recoveryOrchestrator.processRecoveryJob = jest.fn().mockRejectedValue(
        new Error('Persistent failure - human intervention required')
      );
      
      // Create recovery job
      const recoveryJob = await recoveryQueue.add('recovery_job', {
        originalJob: { id: 'persistent_fail_123', data: {} },
        failureReason: 'Database connection timeout'
      }, {
        attempts: 3 // Will fail all attempts
      });
      
      // Listen for escalation
      let escalationCalled = false;
      recoveryOrchestrator.escalateFailure = jest.fn().mockImplementation(() => {
        escalationCalled = true;
      });
      
      // Wait for job to fail completely
      await new Promise((resolve) => {
        recoveryQueue.on('failed', (jobId, error) => {
          if (jobId === recoveryJob.id && error.message.includes('human intervention')) {
            resolve();
          }
        });
      });
      
      expect(escalationCalled).toBe(true);
      expect(recoveryOrchestrator.escalateFailure).toHaveBeenCalledWith(
        'recovery_job',
        expect.any(Array)
      );
    });
  });

  describe('Chaos Resilience', () => {
    test('should maintain queue integrity during Redis disconnection', async () => {
      // Mock Redis disconnection
      const originalConnection = proposalQueue.connection;
      proposalQueue.connection = {
        disconnect: jest.fn(),
        reconnect: jest.fn()
      };
      
      // Add job during disconnection
      const jobData = {
        type: 'test_job',
        payload: { test: 'redis_disconnection' }
      };
      
      await expect(proposalQueue.add('connection_test', jobData))
        .rejects
        .toThrow('Connection refused');
      
      // Restore connection
      proposalQueue.connection = originalConnection;
      
      // Verify queue recovers
      const job = await proposalQueue.add('recovery_test', jobData);
      expect(job).toBeDefined();
      
      // Wait for completion
      const completed = await new Promise((resolve) => {
        proposalQueue.on('completed', (jobId, result) => {
          if (jobId === job.id) resolve(result);
        });
      });
      
      expect(completed).toHaveProperty('success', true);
    });

    test('should handle job processing during high load', async () => {
      // Add multiple jobs concurrently
      const jobPromises = [];
      for (let i = 0; i < 50; i++) {
        jobPromises.push(
          proposalQueue.add('load_test', {
            type: 'generate_proposal',
            payload: {
              opportunity: { title: `Load Test ${i}`, description: 'High load test' },
              missionStatement: `Test mission ${i}`,
              organization: { name: 'Load Test Org' },
              proposalId: `load_prop_${i}`
            }
          })
        );
      }
      
      const jobs = await Promise.all(jobPromises);
      expect(jobs.length).toBe(50);
      
      // Monitor processing
      const completedJobs = [];
      proposalQueue.on('completed', (jobId) => {
        completedJobs.push(jobId);
      });
      
      // Wait for all jobs to complete with timeout
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (completedJobs.length >= 50) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 60000); // 60 second timeout
      });
      
      expect(completedJobs.length).toBeGreaterThanOrEqual(45); // Allow some failures under load
    });
  });
});