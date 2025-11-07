const request = require('supertest');
const { app } = require('../../../backend/server');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { queue } = require('../../../backend/orchestration/queue');

jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/orchestration/queue');

describe('Grant Routes Integration', () => {
  beforeAll(async () => {
    await dbRouter.initialize();
  });

  afterAll(async () => {
    await dbRouter.shutdown();
  });

  describe('Grant Discovery', () => {
    test('should trigger grant discovery successfully', async () => {
      queue.add.mockResolvedValue({ id: 'job_123' });
      
      const response = await request(app)
        .post('/api/grants/discover')
        .set('Authorization', 'Bearer test_token')
        .send({ sources: ['NSF', 'Horizon Europe'] });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('message', 'Grant discovery started');
      expect(response.body).toHaveProperty('jobId');
      
      expect(queue.add).toHaveBeenCalledWith(
        'scrape_grants',
        expect.objectContaining({
          sources: ['NSF', 'Horizon Europe']
        }),
        expect.any(Object)
      );
    });

    test('should reject discovery without authentication', async () => {
      const response = await request(app)
        .post('/api/grants/discover')
        .send({ sources: ['NSF'] });
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('Grant Listing', () => {
    test('should list grants with filters', async () => {
      // Mock database response
      const mockGrants = [
        {
          id: 'grant_1',
          title: 'NSF Research Grant',
          description: 'Funding for research',
          deadline: new Date('2025-12-31'),
          amount: 100000,
          currency: 'USD',
          organization: 'NSF',
          categories: ['research', 'stem'],
          language: 'en',
          source: 'NSF',
          lastCrawled: new Date()
        }
      ];
      
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(mockGrants)
              })
            })
          }),
          countDocuments: jest.fn().mockResolvedValue(1)
        }))
      });
      
      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', 'Bearer test_token')
        .query({
          deadlineFrom: '2025-01-01',
          deadlineTo: '2025-12-31',
          amountMin: '50000',
          amountMax: '200000',
          language: 'en',
          categories: 'research,stem'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.grants.length).toBe(1);
      expect(response.body.grants[0]).toHaveProperty('title', 'NSF Research Grant');
      expect(response.body.pagination).toHaveProperty('total', 1);
    });

    test('should handle SQLite database queries', async () => {
      // Mock SQLite adapter
      dbRouter.getAdapter.mockReturnValue({
        adapters: {
          sqlite: {
            all: jest.fn().mockResolvedValue([
              {
                id: 'sqlite_grant_1',
                title: 'SQLite Grant',
                deadline: '2025-12-31T00:00:00.000Z',
                amount: 75000,
                currency: 'USD',
                organization: 'SQLite Org',
                categories: JSON.stringify(['research']),
                language: 'en',
                source: 'SQLite',
                lastCrawled: '2025-11-01T00:00:00.000Z'
              }
            ]),
            get: jest.fn().mockResolvedValue({ count: 1 })
          }
        }
      });
      
      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', 'Bearer test_token');
      
      expect(response.statusCode).toBe(200);
      expect(response.body.grants.length).toBe(1);
      expect(response.body.grants[0]).toHaveProperty('title', 'SQLite Grant');
    });

    test('should translate category names for non-English languages', async () => {
      // Mock grants with categories
      const mockGrants = [{
        id: 'grant_1',
        title: 'Grant Test',
        categories: ['research'],
        language: 'en'
      }];
      
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(mockGrants)
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
            if (language === 'de' && text === 'research') return 'Forschung';
            return text;
          })
        }
      }));
      
      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', 'Bearer test_token')
        .query({ language: 'de' });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.grants[0].categories).toContain('Forschung');
      expect(require('../../../backend/services/i18nService').i18nService.translate).toHaveBeenCalled();
    });
  });

  describe('Calendar Reminders', () => {
    test('should set calendar reminder for grant', async () => {
      // Mock CalendarSyncAgent
      jest.mock('../../../backend/agents/CalendarSyncAgent', () => ({
        CalendarSyncAgent: jest.fn().mockImplementation(() => ({
          createReminder: jest.fn().mockResolvedValue({ success: true, reminderId: 'rem_123' })
        }))
      }));
      
      const response = await request(app)
        .post('/api/grants/grant_123/reminders')
        .set('Authorization', 'Bearer test_token')
        .send({ remindAt: '2025-06-01T09:00:00Z' });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('reminderId', 'rem_123');
      
      expect(require('../../../backend/agents/CalendarSyncAgent').CalendarSyncAgent).toHaveBeenCalled();
    });

    test('should reject reminder creation with invalid date', async () => {
      const response = await request(app)
        .post('/api/grants/grant_123/reminders')
        .set('Authorization', 'Bearer test_token')
        .send({ remindAt: 'invalid-date' });
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection failures gracefully', async () => {
      dbRouter.getAdapter.mockImplementation(() => {
        throw new Error('Database connection failed');
      });
      
      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', 'Bearer test_token');
      
      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error', 'Database connection failed');
    });

    test('should handle empty grant results', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([])
              })
            })
          }),
          countDocuments: jest.fn().mockResolvedValue(0)
        }))
      });
      
      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', 'Bearer test_token');
      
      expect(response.statusCode).toBe(200);
      expect(response.body.grants.length).toBe(0);
      expect(response.body.pagination.total).toBe(0);
    });
  });
});