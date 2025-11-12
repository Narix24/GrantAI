//GRANT-AI/tests/unit/services/dbRouter.unit.test.js
import { dbRouter } from '../../../../backend/services/dbRouter';
import mongoose from 'mongoose';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

jest.mock('mongoose');
jest.mock('sqlite3');
jest.mock('sqlite', () => ({
  open: jest.fn(),
  Database: jest.fn()
}));

describe('dbRouter Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbRouter.adapters = {};
    dbRouter.currentAdapter = null;
    
    // Set environment variables
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
    process.env.USE_SQLITE = 'false';
    process.env.SQLITE_PATH = './test.db';
  });

  describe('Initialization', () => {
    test('should initialize MongoDB adapter when URI is provided', async () => {
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
      
      expect(dbRouter.adapters.mongodb).toBeDefined();
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.mongodb);
    });

    test('should initialize SQLite adapter when forced', async () => {
      process.env.USE_SQLITE = 'true';
      process.env.MONGODB_URI = '';
      
      // Mock SQLite initialization
      const mockSQLite = {
        exec: jest.fn(),
        close: jest.fn()
      };
      
      open.mockResolvedValue(mockSQLite);
      
      await dbRouter.initialize();
      
      expect(open).toHaveBeenCalledWith({
        filename: './test.db',
        driver: sqlite3.Database
      });
      
      expect(mockSQLite.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS proposals'));
      
      expect(dbRouter.adapters.sqlite).toBeDefined();
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.sqlite);
    });

    test('should fallback to SQLite when MongoDB initialization fails', async () => {
      // Mock MongoDB failure
      mongoose.connect.mockRejectedValue(new Error('Connection refused'));
      
      // Mock SQLite initialization
      const mockSQLite = {
        exec: jest.fn(),
        close: jest.fn()
      };
      
      open.mockResolvedValue(mockSQLite);
      
      await dbRouter.initialize();
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB initialization failed, falling back to SQLite')
      );
      
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.sqlite);
    });
  });

  describe('Health Checking', () => {
    test('should use SQLite when MongoDB is degraded', async () => {
      // Initialize with MongoDB
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1
        }
      });
      
      await dbRouter.initialize();
      
      // Simulate MongoDB degradation
      mongoose.connection.readyState = 0; // 0 = disconnected
      
      const adapter = dbRouter.getAdapter();
      
      expect(adapter).toBe(dbRouter.adapters.sqlite);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB degraded - switching to SQLite')
      );
    });

    test('should restore MongoDB when connection is recovered', async () => {
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
      
      // Restore MongoDB connection
      mongoose.connection.readyState = 1;
      
      const adapter = dbRouter.getAdapter();
      
      expect(adapter).toBe(dbRouter.adapters.mongodb);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB connection restored')
      );
    });
  });

  describe('SQLite Operations', () => {
    test('should save proposal to SQLite', async () => {
      process.env.USE_SQLITE = 'true';
      process.env.MONGODB_URI = '';
      
      const mockSQLite = {
        exec: jest.fn(),
        run: jest.fn(),
        close: jest.fn()
      };
      
      open.mockResolvedValue(mockSQLite);
      
      await dbRouter.initialize();
      
      const proposal = {
        id: 'prop_123',
        content: 'Test content',
        language: 'en'
      };
      
      await dbRouter.adapters.sqlite.save(proposal);
      
      expect(mockSQLite.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO proposals'),
        expect.arrayContaining([
          'prop_123',
          JSON.stringify(proposal.content),
          'en',
          expect.any(String)
        ])
      );
    });

    test('should get proposal from SQLite', async () => {
      process.env.USE_SQLITE = 'true';
      process.env.MONGODB_URI = '';
      
      const mockSQLite = {
        exec: jest.fn(),
        get: jest.fn().mockResolvedValue({
          content: 'Test content',
          language: 'en'
        }),
        close: jest.fn()
      };
      
      open.mockResolvedValue(mockSQLite);
      
      await dbRouter.initialize();
      
      const result = await dbRouter.adapters.sqlite.get('prop_123');
      
      expect(mockSQLite.get).toHaveBeenCalledWith(
        'SELECT * FROM proposals WHERE id = ?',
        'prop_123'
      );
      
      expect(result).toEqual({
        content: 'Test content',
        language: 'en'
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle SQLite initialization failure', async () => {
      process.env.USE_SQLITE = 'true';
      process.env.MONGODB_URI = '';
      
      open.mockRejectedValue(new Error('SQLite file not writable'));
      
      await expect(dbRouter.initialize())
        .rejects
        .toThrow('No database available - MongoDB and SQLite initialization failed');
    });

    test('should handle MongoDB connection failure during operations', async () => {
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1
        }
      });
      
      await dbRouter.initialize();
      
      // Mock operation failure
      mongoose.connection.readyState = 0;
      
      const mockGet = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      dbRouter.adapters.mongodb = {
        model: jest.fn().mockReturnValue({
          findOne: mockGet
        })
      };
      
      await expect(dbRouter.getAdapter().model('Proposal').findOne({ id: 'test' }))
        .rejects
        .toThrow('Operation failed');
      
      // Should still be on MongoDB adapter
      expect(dbRouter.currentAdapter).toBe(dbRouter.adapters.mongodb);
    });
  });

  describe('Graceful Shutdown', () => {
    test('should close MongoDB connection on shutdown', async () => {
      mongoose.connect.mockResolvedValue({
        connection: {
          readyState: 1
        },
        disconnect: jest.fn()
      });
      
      await dbRouter.initialize();
      await dbRouter.shutdown();
      
      expect(mongoose.disconnect).toHaveBeenCalled();
    });

    test('should close SQLite connection on shutdown', async () => {
      process.env.USE_SQLITE = 'true';
      process.env.MONGODB_URI = '';
      
      const mockClose = jest.fn();
      const mockSQLite = {
        exec: jest.fn(),
        close: mockClose
      };
      
      open.mockResolvedValue(mockSQLite);
      
      await dbRouter.initialize();
      await dbRouter.shutdown();
      
      expect(mockClose).toHaveBeenCalled();
    });
  });
});