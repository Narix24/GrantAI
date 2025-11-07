const request = require('supertest');
const { app } = require('../../../backend/server');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { queue } = require('../../../backend/orchestration/queue');
const { v4: uuidv4 } = require('uuid');

jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/orchestration/queue');
jest.mock('uuid');

describe('Proposal Routes Integration', () => {
  beforeAll(async () => {
    await dbRouter.initialize();
  });

  afterAll(async () => {
    await dbRouter.shutdown();
  });

  describe('Proposal Generation', () => {
    test('should generate proposal successfully', async () => {
      // Mock UUID generation
      uuidv4.mockReturnValue('mock_uuid_123');
      
      // Mock proposal generation
      queue.add.mockResolvedValue({ id: 'job_123' });
      
      const response = await request(app)
        .post('/api/proposals/generate')
        .set('Authorization', 'Bearer test_token')
        .send({
          opportunity: {
            id: 'opp_123',
            title: 'Test Grant',
            description: 'Test description',
            deadline: '2025-12-31'
          },
          missionStatement: 'Test mission statement',
          organization: {
            name: 'Test Organization',
            mission: 'Test mission',
            pastGrants: ['Grant 1', 'Grant 2']
          },
          language: 'en',
          tone: 'formal'
        });
      
      expect(response.statusCode).toBe(202);
      expect(response.body).toHaveProperty('proposalId', 'prop_mock_uuid_123');
      expect(response.body).toHaveProperty('status', 'queued');
      expect(response.body).toHaveProperty('message', 'Proposal generation started');
      
      expect(queue.add).toHaveBeenCalledWith(
        'generate_proposal',
        expect.objectContaining({
          payload: expect.objectContaining({
            opportunity: expect.objectContaining({
              id: 'opp_123',
              title: 'Test Grant'
            }),
            missionStatement: 'Test mission statement',
            organization: expect.objectContaining({
              name: 'Test Organization'
            }),
            language: 'en',
            tone: 'formal',
            proposalId: 'prop_mock_uuid_123'
          })
        }),
        expect.objectContaining({
          attempts: 3,
          priority: 10
        })
      );
    });

    test('should validate proposal input', async () => {
      uuidv4.mockReturnValue('mock_uuid_456');
      
      const response = await request(app)
        .post('/api/proposals/generate')
        .set('Authorization', 'Bearer test_token')
        .send({
          opportunity: { title: 'Missing ID' }, // Invalid opportunity
          missionStatement: '', // Empty mission
          organization: { name: '' } // Invalid organization
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('opportunity');
      expect(response.body.error).toContain('missionStatement');
      expect(response.body.error).toContain('organization');
    });

    test('should handle premium user priority', async () => {
      uuidv4.mockReturnValue('mock_uuid_premium');
      
      const response = await request(app)
        .post('/api/proposals/generate')
        .set('Authorization', 'Bearer premium_token')
        .set('x-user-role', 'premium') // Mock header for testing
        .send({
          opportunity: { id: 'opp_premium', title: 'Premium Grant' },
          missionStatement: 'Premium mission',
          organization: { name: 'Premium Org' }
        });
      
      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          priority: 1 // Premium users get higher priority
        })
      );
    });
  });

  describe('Proposal Listing', () => {
    test('should list user proposals with pagination', async () => {
      const mockProposals = [
        {
          id: 'prop_1',
          title: 'Proposal 1',
          content: 'Content 1',
          language: 'en',
          status: 'DRAFT',
          deadline: new Date('2025-12-31'),
          opportunityId: 'opp_1',
          authorId: 'user_123',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(mockProposals)
              })
            })
          }),
          countDocuments: jest.fn().mockResolvedValue(1)
        }))
      });
      
      const response = await request(app)
        .get('/api/proposals')
        .set('Authorization', 'Bearer test_token')
        .query({
          page: 1,
          limit: 10,
          status: 'DRAFT',
          sortBy: 'createdAt',
          sortOrder: 'desc'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.proposals.length).toBe(1);
      expect(response.body.pagination).toHaveProperty('total', 1);
      expect(response.body.proposals[0]).toHaveProperty('statusLabel');
    });

    test('should translate status labels for non-English languages', async () => {
      const mockProposals = [{
        id: 'prop_1',
        status: 'DRAFT',
        authorId: 'user_123'
      }];
      
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(mockProposals)
              })
            })
          }),
          countDocuments: jest.fn().mockResolvedValue(1)
        }))
      });
      
      // Mock i18n service
      jest.mock('../../../backend/services/i18nService', () => ({
        i18nService: {
          translate: jest.fn().mockImplementation((text, language) => {
            if (language === 'de' && text === 'STATUS_DRAFT') return 'ENTWURF';
            return text;
          })
        }
      }));
      
      const response = await request(app)
        .get('/api/proposals')
        .set('Authorization', 'Bearer test_token')
        .set('Accept-Language', 'de'); // Set language header
      
      expect(response.statusCode).toBe(200);
      expect(response.body.proposals[0]).toHaveProperty('statusLabel', 'ENTWURF');
      expect(require('../../../backend/services/i18nService').i18nService.translate).toHaveBeenCalled();
    });
  });

  describe('Proposal Submission', () => {
    test('should submit proposal via email', async () => {
      queue.add.mockResolvedValue({ id: 'submit_job_123' });
      
      const response = await request(app)
        .post('/api/proposals/prop_123/submit')
        .set('Authorization', 'Bearer test_token')
        .send({
          recipient: 'committee@example.com',
          language: 'en'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Submission queued');
      
      expect(queue.add).toHaveBeenCalledWith(
        'submit_proposal',
        expect.objectContaining({
          proposalId: 'prop_123',
          recipient: 'committee@example.com',
          language: 'en'
        }),
        expect.any(Object)
      );
    });

    test('should reject submission with missing recipient', async () => {
      const response = await request(app)
        .post('/api/proposals/prop_123/submit')
        .set('Authorization', 'Bearer test_token')
        .send({}); // No recipient
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing recipient email');
    });
  });

  describe('Voice Playback', () => {
    test('should get voice playback URL for proposal', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          findOne: jest.fn().mockResolvedValue({
            id: 'prop_123',
            voiceUrl: '/audio/prop_123.mp3'
          })
        }))
      });
      
      const response = await request(app)
        .get('/api/proposals/prop_123/voice')
        .set('Authorization', 'Bearer test_token');
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('voiceUrl', '/audio/prop_123.mp3');
    });

    test('should return 404 when voice URL not available', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          findOne: jest.fn().mockResolvedValue({
            id: 'prop_456',
            voiceUrl: null
          })
        }))
      });
      
      const response = await request(app)
        .get('/api/proposals/prop_456/voice')
        .set('Authorization', 'Bearer test_token');
      
      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty('error', 'Voice playback not available for this proposal');
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      dbRouter.getAdapter.mockImplementation(() => {
        throw new Error('Database connection failed');
      });
      
      const response = await request(app)
        .get('/api/proposals')
        .set('Authorization', 'Bearer test_token');
      
      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error', 'Database connection failed');
    });

    test('should handle unauthorized access to other users proposals', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          findOne: jest.fn().mockResolvedValue(null) // Not found for this user
        }))
      });
      
      const response = await request(app)
        .get('/api/proposals/other_user_prop/voice')
        .set('Authorization', 'Bearer test_token');
      
      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty('error', 'Voice playback not available for this proposal');
    });
  });
});