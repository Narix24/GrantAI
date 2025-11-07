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
    // 🧠 Initialize embeddings based on available providers
    if (process.env.OPENAI_API_KEY) {
      this.embeddings = new OpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY,
        modelName: 'text-embedding-3-small'
      });
    } else {
      // Fallback to custom embedding function
      this.embeddings = {
        embedDocuments: async (texts) => {
          return Promise.all(texts.map(text => aiService.generateEmbedding(text)));
        },
        embedQuery: async (text) => {
          return aiService.generateEmbedding(text);
        }
      };
    }
    
    // 🗃️ Initialize vector store
    this.vectorStore = new MemoryVectorStore(this.embeddings);
    logger.info('🧠 LangChain service initialized');
    
    // 🔄 Warm up with existing documents
    this.warmupVectorStore();
  }

  async warmupVectorStore() {
    try {
      // Load recent proposals into vector store
      const { dbRouter } = await import('./dbRouter.js');
      const db = dbRouter.getAdapter();
      
      let proposals;
      if (db.model) {
        proposals = await db.model('Proposal')
          .find({ status: 'SUBMITTED' })
          .sort({ submittedAt: -1 })
          .limit(50)
          .lean();
      } else {
        proposals = await db.adapters.sqlite.all(`
          SELECT * FROM proposals 
          WHERE status = 'SUBMITTED'
          ORDER BY submittedAt DESC
          LIMIT 50
        `);
      }
      
      if (proposals.length > 0) {
        await this.addDocuments(proposals.map(p => ({
          content: p.content,
          metadata: {
            id: p.id,
            title: p.title,
            type: 'proposal',
            language: p.language
          }
        })));
        logger.info(`📚 Warmed up vector store with ${proposals.length} proposals`);
      }
    } catch (error) {
      logger.warn('⚠️ Vector store warmup failed', error);
    }
  }

  async addDocuments(documents) {
    const splitDocuments = [];
    
    for (const doc of documents) {
      const splits = await this.textSplitter.splitText(doc.content);
      splitDocuments.push(
        ...splits.map(chunk => new Document({
          pageContent: chunk,
          metadata: { 
            ...doc.metadata,
            chunkIndex: splits.indexOf(chunk)
          }
        }))
      );
    }
    
    // 📦 Add to ChromaDB
    await chromaStore.addDocuments(splitDocuments);
    
    // 🧠 Add to in-memory store for fast retrieval
    await this.vectorStore.addDocuments(splitDocuments);
    
    logger.info(`✅ Added ${splitDocuments.length} document chunks to vector stores`);
  }

  async similaritySearch(query, k = 4, filter = {}) {
    // 1️⃣ First, try ChromaDB for persistent storage
    try {
      const chromaResults = await chromaStore.similaritySearch(query, k, filter);
      if (chromaResults.length > 0) {
        return chromaResults;
      }
    } catch (error) {
      logger.warn('⚠️ ChromaDB search failed, falling back to memory store', error);
    }
    
    // 2️⃣ Fall back to in-memory store
    return this.vectorStore.similaritySearch(query, k, filter);
  }

  async generateEmbedding(text) {
    return this.embeddings.embedQuery(text);
  }

  async close() {
    if (this.vectorStore) {
      await this.vectorStore.removeAll();
    }
  }
}

export const langchainService = new LangChainService();
langchainService.initialize().catch(logger.error);