// backend/services/dbRouter.js – Multi-Database Abstraction (Error-Free)
import mongoose from "mongoose";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseRouter {
  constructor() {
    this.adapters = {};
    this.currentAdapter = null;
    this.sqliteConnection = null;
  }

  async initialize() {
    logger.info("Initializing database connections...");

    // === Try MongoDB if configured ===
    if (process.env.MONGODB_URI && !process.env.FORCE_SQLITE) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          maxPoolSize: 50,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000,
        });

        this.adapters.mongodb = {
          name: "mongodb",
          model: (name, schema) => mongoose.model(name, schema),
          connection: mongoose.connection,
          close: async () => mongoose.disconnect(),
          healthCheck: () => mongoose.connection.readyState === 1,
        };

        logger.info("✅ MongoDB connected");
      } catch (err) {
        logger.warn("⚠️ MongoDB connection failed, fallback to SQLite:", err.message);
      }
    }

    // === Always load SQLite fallback ===
    try {
      const dbPath =
        process.env.SQLITE_DB_PATH ||
        path.join(__dirname, "../../grant_ai.db");

      if (!fs.existsSync(path.dirname(dbPath))) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      }

      this.sqliteConnection = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });

      await this._createTables(this.sqliteConnection);

      this.adapters.sqlite = {
        name: "sqlite",
        get: async (id) =>
          this.sqliteConnection.get(
            "SELECT * FROM proposals WHERE id = ?",
            id
          ),
        save: async (proposal) => {
          await this.sqliteConnection.run(
            `INSERT OR REPLACE INTO proposals
              (id, content, language, tone, deadline, status, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
              proposal.id,
              JSON.stringify(proposal.content),
              proposal.language,
              proposal.tone || "formal",
              proposal.deadline || null,
              proposal.status || "DRAFT",
            ]
          );
        },
        close: async () => {
          await this.sqliteConnection.close();
          logger.info("✅ SQLite closed");
        },
        healthCheck: async () => {
          try {
            await this.sqliteConnection.get("SELECT 1");
            return true;
          } catch {
            return false;
          }
        },
      };

      logger.info(`✅ SQLite ready at ${dbPath}`);
    } catch (err) {
      logger.error("❌ SQLite init failed:", err);
    }

    // === Decide Active Adapter ===
    if (this.adapters.mongodb?.healthCheck()) {
      this.currentAdapter = this.adapters.mongodb;
      logger.info("🗃️ Active DB: MongoDB");
    } else if (await this.adapters.sqlite?.healthCheck()) {
      this.currentAdapter = this.adapters.sqlite;
      logger.info("🗃️ Active DB: SQLite");
    } else {
      throw new Error(
        "No available database adapter. Check MongoDB/SQLite configs."
      );
    }
  }

  async _createTables(conn) {
    await conn.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        language TEXT NOT NULL,
        tone TEXT,
        deadline DATETIME,
        status TEXT DEFAULT 'DRAFT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await conn.exec(`
      CREATE TABLE IF NOT EXISTS grants (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        deadline DATETIME,
        amount REAL,
        currency TEXT,
        source TEXT,
        url TEXT,
        categories TEXT,
        language TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await conn.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  getAdapter() {
    if (!this.currentAdapter) {
      logger.warn("⚠️ No adapter active, falling back to SQLite.");
      this.currentAdapter = this.adapters.sqlite;
    }
    return this.currentAdapter;
  }

  async shutdown() {
    logger.info("🧹 Shutting down database connections...");
    try {
      for (const adapter of Object.values(this.adapters)) {
        if (adapter.close) await adapter.close();
      }
      logger.info("✅ All database connections closed");
    } catch (err) {
      logger.error("❌ Database shutdown error:", err);
    }
  }
}

export const dbRouter = new DatabaseRouter();
