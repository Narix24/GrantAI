import crypto from 'crypto';
import { logger } from './logger.js';

export class SecurityService {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    this.ivLength = 16; // For AES, this is always 16
    this.pepper = process.env.PEPPER || crypto.randomBytes(32).toString('hex');
  }

  hashPassword(password) {
    // 🔑 Add pepper before hashing
    const pepperedPassword = password + this.pepper;
    
    // 🧂 Generate salt
    const salt = crypto.randomBytes(16).toString('hex');
    
    // 🔐 Hash with PBKDF2
    const hash = crypto.pbkdf2Sync(
      pepperedPassword, 
      salt, 
      100000, // iterations
      64,     // derived key length
      'sha512'
    ).toString('hex');
    
    return { hash, salt };
  }

  verifyPassword(password, storedHash, salt) {
    const pepperedPassword = password + this.pepper;
    const hash = crypto.pbkdf2Sync(
      pepperedPassword, 
      salt, 
      100000, 
      64, 
      'sha512'
    ).toString('hex');
    
    // 🔍 Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(hash), 
      Buffer.from(storedHash)
    );
  }

  encrypt(text) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc', 
      Buffer.from(this.encryptionKey, 'hex'), 
      iv
    );
    
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  decrypt(text) {
    try {
      const [ivHex, encryptedHex] = text.split(':');
      if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted format');
      
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc', 
        Buffer.from(this.encryptionKey, 'hex'), 
        iv
      );
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString();
    } catch (error) {
      logger.error('Decryption failed', error);
      throw new Error('Decryption failed');
    }
  }

  generateSecureToken(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  validateObjectId(id) {
    // MongoDB ObjectId validation
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  sanitizeInput(input) {
    // 🧹 Basic XSS protection
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  rateLimitKey(req) {
    // 🔑 Generate rate limit key based on IP and user ID
    return `rl:${req.ip}:${req.user?.id || 'anonymous'}`;
  }

  async checkBruteForce(req, next) {
    if (!req.user) return next();
    
    const { dbRouter } = await import('../services/dbRouter.js');
    const db = dbRouter.getAdapter();
    
    // 🛡️ Check failed login attempts
    let failedAttempts = 0;
    if (db.model) {
      const user = await db.model('User').findById(req.user.id);
      failedAttempts = user?.failedLoginAttempts || 0;
    } else {
      const result = await db.adapters.sqlite.get(
        'SELECT failedLoginAttempts FROM users WHERE id = ?',
        req.user.id
      );
      failedAttempts = result?.failedLoginAttempts || 0;
    }
    
    if (failedAttempts >= 5) {
      logger.warn(`🔒 Account locked for ${req.user.email} due to brute force attempts`);
      return res.status(429).json({ 
        error: req.__('ACCOUNT_LOCKED') 
      });
    }
    
    next();
  }
}

export const securityService = new SecurityService();