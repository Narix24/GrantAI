// tests/integration/services/vectorStore.test.js
const { chromaStore } = require('../../../backend/services/vectorStore/chroma');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { aiService } = require('../../../backend/services/aiService');

jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/services/aiService');
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    heartbeat: jest.fn().mockResolvedValue({}),
    getOrCreateCollection: jest.fn().mockResolvedValue({
      add: jest.fn(),
      query: jest.fn()
    }),
    reset: jest.fn()
  }))
}));

describe('Chroma Vector Store Integration', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterAll(() => {
    console.warn.mockRestore();
    console.info.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CHROMA_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    delete process.env.CHROMA_URL;
    delete process.env.USE_SQLITE;
  });

  describe('Initialization', () => {
    test('should initialize ChromaDB client successfully', async () => {
      await chromaStore.initialize();

      expect(require('chromadb').ChromaClient).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'http://localhost:8000',
          fetchOptions: expect.objectContaining({
            timeout: 10000,
            headers: expect.objectContaining({
              'Authorization': expect.any(String)
            })
          })
        })
      );

      expect(chromaStore.isInitialized).toBe(true);
      expect(chromaStore.collection).toBeDefined();
    });

    test('should fall back to SQLite when ChromaDB initialization fails', async () => {
      require('chromadb').ChromaClient.mockImplementation(() => ({
        heartbeat: jest.fn().mockRejectedValue(new Error('Connection refused'))
      }));

      const mockExec = jest.fn();
      dbRouter.getAdapter.mockReturnValue({
        adapters: {
          sqlite: {
            exec: mockExec,
            run: jest.fn(),
            get: jest.fn()
          }
        }
      });

      await chromaStore.initialize();

      expect(chromaStore.isInitialized).toBe(true);
      expect(chromaStore.collection.add).toBeDefined();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to SQLite embeddings cache')
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS embeddings')
      );
    });

    test('should retry initialization with exponential backoff', async () => {
      let callCount = 0;
      require('chromadb').ChromaClient.mockImplementation(() => ({
        heartbeat: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 3) throw new Error('Temporary failure');
          return {};
        })
      }));

      await chromaStore.initialize();

      expect(callCount).toBe(3); // retried twice before succeeding
      expect(chromaStore.isInitialized).toBe(true);
    });
  });

  describe('Document Operations', () => {
    test('should add documents to ChromaDB collection', async () => {
      await chromaStore.initialize();
      aiService.generateEmbedding.mockResolvedValue(Array(1536).fill(0.1));

      const documents = [
        { content: 'Test document 1', meta: { id: 'doc1', type: 'test' } },
        { content: 'Test document 2', meta: { id: 'doc2', type: 'test' } }
      ];

      await chromaStore.addDocuments(documents);

      expect(chromaStore.collection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: expect.arrayContaining(['doc1', 'doc2']),
          embeddings: expect.arrayContaining([
            expect.arrayContaining(Array(1536).fill(0.1)),
            expect.arrayContaining(Array(1536).fill(0.1))
          ]),
          documents: expect.arrayContaining(['Test document 1', 'Test document 2']),
          metadatas: expect.arrayContaining([
            expect.objectContaining({ id: 'doc1' }),
            expect.objectContaining({ id: 'doc2' })
          ])
        })
      );
    });

    test('should query similar documents with metadata filtering', async () => {
      await chromaStore.initialize();
      aiService.generateEmbedding.mockResolvedValue(Array(1536).fill(0.1));

      chromaStore.collection.query.mockResolvedValue({
        ids: [['result1']],
        documents: [['Result document content']],
        metadatas: [[{ id: 'result1', type: 'proposal' }]],
        distances: [[0.1]]
      });

      const results = await chromaStore.querySimilar('test query', 5, { type: 'proposal' });

      expect(results.length).toBe(1);
      expect(results[0]).toHaveProperty('id', 'result1');
      expect(results[0]).toHaveProperty('text', 'Result document content');
      expect(results[0]).toHaveProperty('meta.type', 'proposal');
      expect(results[0]).toHaveProperty('similarity', 0.9); // 1 - 0.1

      expect(chromaStore.collection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          queryEmbeddings: [expect.any(Array)],
          nResults: 5,
          where: { type: 'proposal' },
          include: ['documents', 'metadatas', 'distances']
        })
      );
    });
  });

  describe('SQLite Fallback Operations', () => {
    test('should add documents to SQLite embeddings table', async () => {
      process.env.USE_SQLITE = 'true';
      const mockRun = jest.fn();
      dbRouter.getAdapter.mockReturnValue({
        adapters: {
          sqlite: {
            prepare: jest.fn().mockResolvedValue({
              run: mockRun,
              finalize: jest.fn()
            })
          }
        }
      });

      await chromaStore.initialize();

      const embedding = Array(1536).fill(0.1);
      await chromaStore.fallbackAdd({
        ids: ['sqlite_doc1'],
        embeddings: [embedding],
        documents: ['SQLite test document'],
        metadatas: [{ id: 'sqlite_doc1', type: 'sqlite' }]
      });

      expect(mockRun).toHaveBeenCalledWith(
        'sqlite_doc1',
        'SQLite test document',
        JSON.stringify(embedding),
        JSON.stringify({ id: 'sqlite_doc1', type: 'sqlite' })
      );
    });

    test('should compute cosine similarity for SQLite queries', async () => {
      dbRouter.getAdapter.mockReturnValue({
        adapters: {
          sqlite: {
            all: jest.fn().mockResolvedValue([
              {
                id: 'sqlite_result1',
                text: 'SQLite result content',
                metadata: JSON.stringify({ type: 'proposal' }),
                similarity: 0.85
              }
            ])
          }
        }
      });

      const queryEmbedding = Array(1536).fill(0.2);

      const results = await chromaStore.fallbackQuery({ queryEmbeddings: [queryEmbedding], nResults: 3 });

      expect(results).toEqual({
        ids: [['sqlite_result1']],
        documents: [['SQLite result content']],
        metadatas: [[{ type: 'proposal' }]],
        distances: [[0.15]] // 1 - 0.85
      });
    });
  });

  describe('Health and Recovery', () => {
    test('should warm up embeddings cache with common contexts', async () => {
      await chromaStore.initialize();
      aiService.generateEmbedding.mockResolvedValue(Array(1536).fill(0.1));
      chromaStore.addDocuments = jest.fn();

      await chromaStore.warmupEmbeddings();

      expect(chromaStore.addDocuments).toHaveBeenCalledWith(expect.any(Array));
      expect(chromaStore.addDocuments.mock.calls[0][0].length).toBe(5);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Embeddings cache warmed up with common contexts')
      );
    });

    test('should handle partial failures during warmup', async () => {
      await chromaStore.initialize();
      let callCount = 0;
      aiService.generateEmbedding.mockImplementation(() => {
        callCount++;
        if (callCount === 3) throw new Error('Temporary embedding failure');
        return Array(1536).fill(0.1);
      });
      chromaStore.addDocuments = jest.fn();

      await chromaStore.warmupEmbeddings();

      expect(chromaStore.addDocuments).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Warmup failed for context'));
    });

    test('should close connection properly', async () => {
      await chromaStore.initialize();
      const resetSpy = jest.spyOn(chromaStore.client, 'reset');

      await chromaStore.close();

      expect(resetSpy).toHaveBeenCalled();
      expect(chromaStore.isInitialized).toBe(false);
    });
  });
});
