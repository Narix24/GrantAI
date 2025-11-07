// backend/services/vectorStore/chroma.js
import { ChromaClient } from 'chromadb';
import { logger } from '../../utils/logger.js';
import { dbRouter } from '../dbRouter.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

class ChromaVectorStore {
  constructor() {
    this.client = null;
    this.isInitialized = false;
    this.retryAttempts = 0;
    this.maxRetries = 5;
    this.fallbackEnabled = false; // disabled by default now
    this.sqliteCache = null;
  }

  /** Initialize Chroma or fallback SQLite */
  async initialize() {
    if (this.isInitialized) return true;

    try {
      if (process.env.DISABLE_CHROMA === 'true') {
        logger.warn('🚫 ChromaDB disabled, using SQLite fallback');
        await this.initializeFallback();
        return false;
      }

      if (!process.env.CHROMA_URL) {
        logger.warn('⚠️ CHROMA_URL not set, using SQLite fallback');
        await this.initializeFallback();
        return false;
      }

      this.client = new ChromaClient({
        path: process.env.CHROMA_URL,
        fetchOptions: {
          headers: {
            'Content-Type': 'application/json',
            'X-Chroma-API-Version': process.env.CHROMA_API_VERSION || '1'
          },
          timeout: 5000
        }
      });

      await this.client.heartbeat();

      logger.info('✅ ChromaDB vector store initialized');
      this.isInitialized = true;
      this.retryAttempts = 0;
      return true;

    } catch (error) {
      this.retryAttempts++;
      logger.error(`❌ ChromaDB init failed (${this.retryAttempts}/${this.maxRetries}):`, error.message);

      if (this.retryAttempts >= this.maxRetries) {
        logger.error('❌ Max retries reached, falling back to SQLite');
        await this.initializeFallback();
        return false;
      }

      const delay = Math.pow(2, this.retryAttempts) * 1000;
      logger.info(`🔄 Retrying ChromaDB in ${delay}ms`);
      await new Promise(res => setTimeout(res, delay));
      return this.initialize();
    }
  }

  /** Initialize SQLite fallback — TEMPORARILY DISABLED */
  async initializeFallback() {
    // Temporarily disable this by just returning false
    logger.warn('⚠️ Vector store fallback temporarily disabled for deployment');
    return false;

    /*
    try {
      const cacheDir = './data/embeddings_cache';
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

      await dbRouter.initialize();
      const adapter = dbRouter.getAdapter();
      if (!adapter) throw new Error('No database adapter for SQLite fallback');

      // ✅ FIXED: Use `.run()` for CREATE TABLE (not `.get()`)
      await adapter.run(`
        CREATE TABLE IF NOT EXISTS embeddings_cache (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding BLOB,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.sqliteCache = adapter;
      this.fallbackEnabled = true;

      logger.info('✅ SQLite embeddings cache ready');
      return true;

    } catch (error) {
      logger.error('❌ Failed to initialize SQLite fallback:', error);
      this.fallbackEnabled = false;
      return false;
    }
    */
  }

  /** Insert embedding into Chroma or fallback SQLite */
  async upsert({ id, content, embedding, metadata = {} }) {
    if (this.isInitialized && this.client) {
      try {
        await this.client.upsert([{ id, embedding, metadata, content }]);
        return true;
      } catch (err) {
        logger.warn('⚠️ ChromaDB upsert failed, falling back to SQLite:', err.message);
      }
    }

    // Fallback path will never activate because initializeFallback() now returns false
    if (this.fallbackEnabled && this.sqliteCache) {
      try {
        const metaString = JSON.stringify(metadata);
        await this.sqliteCache.run(`
          INSERT OR REPLACE INTO embeddings_cache (id, content, embedding, metadata)
          VALUES (?, ?, ?, ?)
        `, [id, content, embedding ? Buffer.from(embedding) : null, metaString]);
        return true;
      } catch (err) {
        logger.error('❌ SQLite upsert failed:', err);
        return false;
      }
    }

    logger.warn('⚠️ No vector store available for upsert');
    return false;
  }

  /** Search embeddings with optional ranking */
  async search(query, options = {}) {
    if (this.isInitialized && this.client) {
      try {
        return await this.client.search(query, options);
      } catch (err) {
        logger.warn('⚠️ ChromaDB search failed, using SQLite fallback:', err.message);
      }
    }

    // Fallback path disabled
    if (this.fallbackEnabled && this.sqliteCache) {
      try {
        const results = await this.sqliteCache.all(`
          SELECT * FROM embeddings_cache
          WHERE content LIKE ? OR metadata LIKE ?
          ORDER BY created_at DESC
          LIMIT ?
        `, [`%${query}%`, `%${query}%`, options.limit || 5]);

        return results.map(r => ({
          id: r.id,
          content: r.content,
          metadata: JSON.parse(r.metadata || '{}'),
          score: this._simulateScore(query, r.content),
          source: 'sqlite'
        }));
      } catch (err) {
        logger.error('❌ SQLite search failed:', err);
        return [];
      }
    }

    logger.warn('⚠️ No vector store available');
    return [];
  }

  /** Close connections */
  async close() {
    this.isInitialized = false;
    if (this.client) this.client = null;
    logger.info('✅ Vector store connections closed');
  }

  /** Simulate score for fallback search */
  _simulateScore(query, content) {
    const hits = content.toLowerCase().split(query.toLowerCase()).length - 1;
    return Math.min(1, hits / 5);
  }

  /** Generate a deterministic UUID for embedding storage */
  generateId(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}

export const chromaStore = new ChromaVectorStore();