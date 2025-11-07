const { dbRouter } = require('../../../backend/services/dbRouter');
const mongoose = require('mongoose');
const sqlite3 = require('sqlite3');

jest.mock('mongoose');
jest.mock('sqlite3');
jest.mock('sqlite', () => ({
  open: jest.fn(),
  Database: jest.fn()
}));

describe('Database Router Integration', () => {
  beforeAll(async () => {
    // Clear environment variables before tests
    delete process.env.MONGODB_URI;
    delete process.env.FORCE_SQLITE;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('MongoDB Initialization', () => {
    test('should initialize MongoDB when URI is provided', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
      
      // Mock MongoDB connection
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1 // 1 = connected
        }
      });
      
      await dbRouter.initialize();
      
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/test_db',
        expect.objectContaining({
          maxPoolSize: 50,
          serverSelectionTimeoutMS: 5000
        })
      );
      
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.mongodb);
      expect(dbRouter.adapters.mongodb).toBeDefined();
    });

    test('should handle MongoDB connection failure', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
      
      // Mock connection failure
      mongoose.connect.mockRejectedValue(new Error('Connection refused'));
      
      await dbRouter.initialize();
      
      // Should fallback to SQLite
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.sqlite);
      expect(dbRouter.adapters.sqlite).toBeDefined();
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB initialization failed, falling back to SQLite')
      );
    });
  });

  describe('SQLite Initialization', () => {
    test('should initialize SQLite when no MongoDB URI or FORCE_SQLITE is set', async () => {
      delete process.env.MONGODB_URI;
      process.env.FORCE_SQLITE = 'true';
      
      // Mock SQLite initialization
      const mockExec = jest.fn().mockResolvedValue();
      const mockOpen = jest.fn().mockResolvedValue({
        exec: mockExec,
        close: jest.fn()
      });
      
      require('sqlite').open.mockResolvedValue(mockOpen);
      
      await dbRouter.initialize();
      
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS proposals'));
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.sqlite);
    });

    test('should handle SQLite initialization failure', async () => {
      delete process.env.MONGODB_URI;
      process.env.FORCE_SQLITE = 'true';
      
      // Mock SQLite failure
      require('sqlite').open.mockRejectedValue(new Error('SQLite file not writable'));
      
      await expect(dbRouter.initialize())
        .rejects
        .toThrow('No database available - MongoDB and SQLite initialization failed');
    });
  });

  describe('Automatic Failover', () => {
    test('should automatically failover to SQLite when MongoDB connection is lost', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
      
      // Initialize with MongoDB
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1,
          db: {
            admin: jest.fn().mockReturnValue({
              ping: jest.fn().mockResolvedValue({ ok: 1 })
            })
          }
        }
      });
      
      await dbRouter.initialize();
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.mongodb);
      
      // Simulate MongoDB connection loss
      mongoose.connection.readyState = 0; // 0 = disconnected
      
      // Get adapter should trigger failover
      const adapter = dbRouter.getAdapter();
      expect(adapter).toBe(dbRouter.adapters.sqlite);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB degraded - switching to SQLite')
      );
    });

    test('should restore MongoDB connection when it becomes available', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
      
      // Initialize with MongoDB
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1
        }
      });
      
      await dbRouter.initialize();
      
      // Simulate MongoDB connection loss
      mongoose.connection.readyState = 0;
      
      // Trigger failover
      dbRouter.getAdapter();
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.sqlite);
      
      // Restore MongoDB connection
      mongoose.connection.readyState = 1;
      
      // Next adapter request should use MongoDB again
      const adapter = dbRouter.getAdapter();
      expect(adapter).toBe(dbRouter.adapters.mongodb);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB connection restored')
      );
    });
  });

  describe('Data Operations', () => {
    test('should save proposal to MongoDB', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
      
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1
        }
      });
      
      // Mock MongoDB model
      const mockModel = {
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
      };
      
      mongoose.model.mockReturnValue(mockModel);
      
      await dbRouter.initialize();
      
      const proposal = {
        id: 'prop_123',
        content: 'Test content',
        language: 'en'
      };
      
      // Get adapter should return MongoDB adapter
      const adapter = dbRouter.getAdapter();
      adapter.model('Proposal').updateOne(
        { id: proposal.id },
        proposal,
        { upsert: true, runValidators: true }
      );
      
      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { id: 'prop_123' },
        expect.objectContaining({
          content: 'Test content',
          language: 'en'
        }),
        { upsert: true, runValidators: true }
      );
    });

    test('should save proposal to SQLite', async () => {
      delete process.env.MONGODB_URI;
      
      // Mock SQLite initialization
      const mockRun = jest.fn().mockResolvedValue({ changes: 1 });
      const mockOpen = jest.fn().mockResolvedValue({
        exec: jest.fn(),
        run: mockRun,
        close: jest.fn()
      });
      
      require('sqlite').open.mockResolvedValue(mockOpen);
      
      await dbRouter.initialize();
      
      const proposal = {
        id: 'prop_sqlite',
        content: 'SQLite content',
        language: 'en'
      };
      
      // Get adapter should return SQLite adapter
      const adapter = dbRouter.getAdapter();
      await adapter.adapters.sqlite.save(proposal);
      
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO proposals'),
        expect.arrayContaining([
          'prop_sqlite',
          JSON.stringify('SQLite content'),
          'en'
        ])
      );
    });
  });

  describe('Graceful Shutdown', () => {
    test('should close MongoDB connection on shutdown', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
      
      const mockDisconnect = jest.fn().mockResolvedValue();
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1
        },
        disconnect: mockDisconnect
      });
      
      await dbRouter.initialize();
      await dbRouter.shutdown();
      
      expect(mockDisconnect).toHaveBeenCalled();
    });

    test('should close SQLite connection on shutdown', async () => {
      delete process.env.MONGODB_URI;
      
      const mockClose = jest.fn().mockResolvedValue();
      const mockOpen = jest.fn().mockResolvedValue({
        exec: jest.fn(),
        close: mockClose
      });
      
      require('sqlite').open.mockResolvedValue(mockOpen);
      
      await dbRouter.initialize();
      await dbRouter.shutdown();
      
      expect(mockClose).toHaveBeenCalled();
    });
  });
});