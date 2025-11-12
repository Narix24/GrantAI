// GRANT-AI/backend/services/langchainService.js
import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { logger } from '../utils/logger.js';
import { aiService } from './aiService.js';
import { chromaStore } from './vectorStore/chroma.js';

class LangChainService {
  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', ' ', '']
    });
    this.embeddings = null;
    this.vectorStore = null;
  }

  async initialize() {
    try {
      // 🧠 Initialize embeddings
      if (process.env.OPENAI_API_KEY) {
        this.embeddings = new OpenAIEmbeddings({
          apiKey: process.env.OPENAI_API_KEY,
          modelName: 'text-embedding-3-small'
        });
      } else {
        this.embeddings = {
          embedDocuments: async (texts) => {
            return Promise.all(texts.map(text => aiService.generateEmbedding(text)));
          },
          embedQuery: async (text) => aiService.generateEmbedding(text)
        };
      }

      // 🗃️ Initialize in-memory vector store
      this.vectorStore = new MemoryVectorStore(this.embeddings);
      logger.info('🧠 LangChain service initialized');

      // 🔄 Warm up vector store (await to avoid unhandled promise)
      await this.warmupVectorStore();

    } catch (error) {
      logger.error('⚠️ LangChain initialization failed', error);
    }
  }

  async warmupVectorStore() {
    try {
      const { dbRouter } = await import('./dbRouter.js').catch(() => ({}));
      if (!dbRouter) {
        logger.warn('⚠️ dbRouter not found, skipping vector store warmup');
        return;
      }

      const db = dbRouter.getAdapter?.();
      let proposals = [];

      if (db?.model) {
        proposals = await db.model('Proposal')
          .find({ status: 'SUBMITTED' })
          .sort({ submittedAt: -1 })
          .limit(50)
          .lean();
      } else if (db?.adapters?.sqlite?.all) {
        proposals = await db.adapters.sqlite.all(`
          SELECT * FROM proposals 
          WHERE status = 'SUBMITTED'
          ORDER BY submittedAt DESC
          LIMIT 50
        `);
      }

      if (!proposals?.length) {
        logger.info('ℹ️ No proposals found for warmup');
        return;
      }

      const docsToAdd = proposals.map(p => ({
        content: p.content || '',
        metadata: {
          id: p.id,
          title: p.title,
          type: 'proposal',
          language: p.language
        }
      }));

      await this.addDocuments(docsToAdd);
      logger.info(`📚 Warmed up vector store with ${proposals.length} proposals`);
      
    } catch (error) {
      logger.warn('⚠️ Vector store warmup failed', error);
    }
  }

  async addDocuments(documents = []) {
    if (!documents.length || !this.vectorStore) return;

    const splitDocuments = [];

    for (const doc of documents) {
      const splits = await this.textSplitter.splitText(doc.content || '');
      splits.forEach((chunk, idx) => {
        splitDocuments.push(new Document({
          pageContent: chunk,
          metadata: { ...doc.metadata, chunkIndex: idx }
        }));
      });
    }

    try {
      if (chromaStore?.addDocuments) {
        await chromaStore.addDocuments(splitDocuments);
      }
      await this.vectorStore.addDocuments(splitDocuments);

      logger.info(`✅ Added ${splitDocuments.length} document chunks to vector stores`);
    } catch (error) {
      logger.warn('⚠️ Failed to add documents to vector stores', error);
    }
  }

  async similaritySearch(query, k = 4, filter = {}) {
    try {
      if (chromaStore?.similaritySearch) {
        const chromaResults = await chromaStore.similaritySearch(query, k, filter);
        if (chromaResults?.length) return chromaResults;
      }
    } catch (error) {
      logger.warn('⚠️ ChromaDB search failed, falling back to memory store', error);
    }

    return this.vectorStore?.similaritySearch?.(query, k, filter) || [];
  }

  async generateEmbedding(text) {
    return this.embeddings?.embedQuery?.(text) || [];
  }

  async close() {
    if (this.vectorStore?.removeAll) {
      await this.vectorStore.removeAll();
    }
  }
}

export const langchainService = new LangChainService();
langchainService.initialize();