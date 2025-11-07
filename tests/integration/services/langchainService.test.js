const { langchainService } = require('../../../backend/services/langchainService');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { aiService } = require('../../../backend/services/aiService');

jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/services/aiService');

describe('LangChain Service Integration', () => {
  beforeAll(async () => {
    await langchainService.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('Document Processing', () => {
    test('should split text into chunks with proper overlap', async () => {
      const longText = 'This is a test document. '.repeat(50);
      const chunks = await langchainService.textSplitter.splitText(longText);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(1000);
      expect(chunks[1].length).toBeLessThanOrEqual(1000);

      const overlap = chunks[0].slice(-200) + chunks[1].slice(0, 200);
      expect(overlap).toContain('test document');
    });

    test('should handle markdown and HTML content properly', async () => {
      const markdownContent = `
        # Header
        **Bold text** and *italic text*
        
        - List item 1
        - List item 2
        
        [Link](https://example.com)
        
        > Blockquote
        
        \`\`\`javascript
        console.log('code block');
        \`\`\`
      `;

      const chunks = await langchainService.textSplitter.splitText(markdownContent);

      expect(chunks[0]).toContain('Header');
      expect(chunks[0]).toContain('Bold text');
      expect(chunks[0]).toContain('List item');
      expect(chunks[0]).not.toContain('```javascript');
    });
  });

  describe('Embedding Generation', () => {
    test('should generate embeddings for text content', async () => {
      aiService.generateEmbedding.mockResolvedValue(Array(1536).fill(0.1));
      const text = 'Test document for embedding';
      const embedding = await langchainService.generateEmbedding(text);

      expect(embedding.length).toBe(1536);
      expect(embedding[0]).toBe(0.1);
      expect(aiService.generateEmbedding).toHaveBeenCalledWith(text);
    });

    test('should handle long text by truncating', async () => {
      const longText = 'x'.repeat(10000);
      await langchainService.generateEmbedding(longText);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Text truncated for embedding generation')
      );

      expect(aiService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringMatching(/^x{8192}$/)
      );
    });
  });

  describe('Vector Store Operations', () => {
    test('should add documents to vector store', async () => {
      aiService.generateEmbedding.mockResolvedValue(Array(1536).fill(0.1));

      const documents = [
        {
          content: 'First test document',
          meta: { type: 'proposal', id: 'doc_1' }
        },
        {
          content: 'Second test document',
          meta: { type: 'grant', id: 'doc_2' }
        }
      ];

      await langchainService.addDocuments(documents);

      expect(require('../../../backend/services/vectorStore/chroma').chromaStore.addDocuments)
        .toHaveBeenCalledWith(expect.arrayContaining([
          expect.objectContaining({
            pageContent: 'First test document',
            metaData: expect.objectContaining({ id: 'doc_1' })
          }),
          expect.objectContaining({
            pageContent: 'Second test document',
            metaData: expect.objectContaining({ id: 'doc_2' })
          })
        ]));

      expect(langchainService.vectorStore.addDocuments).toHaveBeenCalled();
    });

    test('should search similar documents with filters', async () => {
      langchainService.vectorStore.similaritySearch.mockResolvedValue([
        {
          pageContent: 'Similar document content',
          meta: { id: 'sim_1', type: 'proposal' }
        }
      ]);

      const results = await langchainService.similaritySearch(
        'query text',
        5,
        { type: 'proposal' }
      );

      expect(results.length).toBe(1);
      expect(results[0]).toHaveProperty('text', 'Similar document content');
      expect(results[0]).toHaveProperty('meta.id', 'sim_1');
      expect(results[0]).toHaveProperty('similarity');
    });

    test('should fall back to memory store when ChromaDB fails', async () => {
      require('../../../backend/services/vectorStore/chroma').chromaStore.similaritySearch
        .mockRejectedValue(new Error('ChromaDB connection failed'));

      langchainService.vectorStore.similaritySearch.mockResolvedValue([
        { pageContent: 'Fallback document content', meta: { id: 'fallback_1' } }
      ]);

      const results = await langchainService.similaritySearch('query text', 3);

      expect(results.length).toBe(1);
      expect(results[0].text).toBe('Fallback document content');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('ChromaDB search failed, falling back to memory store')
      );
    });
  });

  describe('Context Retrieval', () => {
    test('should retrieve relevant context for proposal generation', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                {
                  id: 'prop_1',
                  content: 'Proposal about climate research',
                  language: 'en',
                  status: 'SUBMITTED'
                }
              ])
            })
          })
        }))
      });

      aiService.generateEmbedding.mockResolvedValue(Array(1536).fill(0.1));

      await langchainService.warmupVectorStore();

      const results = await langchainService.similaritySearch(
        'climate change research proposal',
        3
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toContain('climate research');
    });
  });

  describe('Resource Management', () => {
    test('should close vector store properly on shutdown', async () => {
      const removeSpy = jest.spyOn(langchainService.vectorStore, 'removeAll');

      await langchainService.close();

      expect(removeSpy).toHaveBeenCalled();
      expect(langchainService.vectorStore).toBeNull();
    });

    test('should handle initialization failures gracefully', async () => {
      process.env.OPENAI_API_KEY = 'invalid_key';
      langchainService.initialize = jest.fn().mockRejectedValue(
        new Error('Invalid API key')
      );

      await langchainService.initialize().catch(() => {});

      expect(langchainService.embeddings).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to custom embedding function')
      );
    });
  });
});
