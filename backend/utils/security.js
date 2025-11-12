import crypto from 'crypto';
import { logger } from './logger.js';

export class SecurityService {
  constructor() {
    // AES-256 key must be 32 bytes = 64 hex chars
    this.encryptionKey =
      process.env.ENCRYPTION_KEY ||
      crypto.randomBytes(32).toString('hex');
    this.ivLength = 16; // AES block size
    this.pepper =
      process.env.PEPPER ||
      crypto.randomBytes(32).toString('hex');
  }

  /** Password Hashing */
  hashPassword(password) {
    const pepperedPassword = password + this.pepper;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(pepperedPassword, salt, 100_000, 64, 'sha512')
      .toString('hex');
    return { hash, salt };
  }

  verifyPassword(password, storedHash, salt) {
    const pepperedPassword = password + this.pepper;
    const hash = crypto
      .pbkdf2Sync(pepperedPassword, salt, 100_000, 64, 'sha512')
      .toString('hex');

    // Constant-time comparison
    const hashBuffer = Buffer.from(hash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');

    // Ensure same length
    if (hashBuffer.length !== storedBuffer.length) return false;

    return crypto.timingSafeEqual(hashBuffer, storedBuffer);
  }

  /** AES-256-CBC Encryption */
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

  /** Secure Token */
  generateSecureToken(length = 32) {
    // length in bytes
    return crypto.randomBytes(length).toString('hex');
  }

  /** MongoDB ObjectID validation */
  validateObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  /** Basic XSS Sanitization */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /** Rate Limit Key */
  rateLimitKey(req) {
    return `rl:${req.ip}:${req.user?.id || 'anonymous'}`;
  }

  /** Brute Force Protection */
  async checkBruteForce(req, res, next) {
    if (!req.user) return next();

    const { dbRouter } = await import('../services/dbRouter.js');
    const db = dbRouter.getAdapter();

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
      logger.warn(
        `🔒 Account locked for ${req.user.email || req.user.id} due to brute force attempts`
      );
      return res.status(429).json({
        error: req.__ ? req.__('ACCOUNT_LOCKED') : 'Account locked due to failed login attempts'
      });
    }

    next();
  }
}

export const securityService = new SecurityService();