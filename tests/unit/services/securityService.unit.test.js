// tests/unit/services/securityService.unit.test.js
// javascript
import { securityService } from '../../../../backend/services/securityService';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

jest.mock('jsonwebtoken');
jest.mock('bcrypt');

describe('securityService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    securityService.encryptionKey = 'test_encryption_key_32_bytes_0123456789';
    securityService.pepper = 'test_pepper_value_for_password_hashing';
    jwt.verify = jest.fn();
    jwt.sign = jest.fn();
    bcrypt.hash = jest.fn();
    bcrypt.compare = jest.fn();
  });

  describe('JWT Operations', () => {
    test('should generate valid JWT token', () => {
      const payload = { userId: 'user_123', role: 'admin' };
      const secret = 'jwt_secret';
      const options = { expiresIn: '1h' };
      
      jwt.sign.mockReturnValue('mock_jwt_token');
      
      const token = securityService.generateToken(payload, secret, options);
      
      expect(jwt.sign).toHaveBeenCalledWith(
        payload,
        secret,
        options
      );
      expect(token).toBe('mock_jwt_token');
    });

    test('should verify valid JWT token', () => {
      const token = 'valid_token';
      const secret = 'jwt_secret';
      
      jwt.verify.mockReturnValue({
        userId: 'user_123',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      });
      
      const decoded = securityService.verifyToken(token, secret);
      
      expect(jwt.verify).toHaveBeenCalledWith(token, secret);
      expect(decoded).toHaveProperty('userId', 'user_123');
      expect(decoded).toHaveProperty('role', 'admin');
    });

    test('should handle expired JWT token', () => {
      const token = 'expired_token';
      const secret = 'jwt_secret';
      
      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      
      jwt.verify.mockImplementation(() => {
        throw expiredError;
      });
      
      expect(() => securityService.verifyToken(token, secret))
        .toThrow('Token expired');
    });

    test('should handle invalid JWT token', () => {
      const token = 'invalid_token';
      const secret = 'jwt_secret';
      
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      expect(() => securityService.verifyToken(token, secret))
        .toThrow('Invalid token');
    });
  });

  describe('Password Hashing', () => {
    test('should hash password with pepper and salt', async () => {
      const password = 'SecurePassword123!';
      
      // Mock bcrypt hash
      bcrypt.hash.mockResolvedValue('hashed_password_with_salt');
      
      const result = await securityService.hashPassword(password);
      
      expect(bcrypt.hash).toHaveBeenCalledWith(
        password + securityService.pepper,
        10 // saltRounds
      );
      
      expect(result).toBe('hashed_password_with_salt');
    });

    test('should verify password correctly', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = 'hashed_test_password';
      
      // Mock bcrypt compare
      bcrypt.compare.mockResolvedValue(true);
      
      const isValid = await securityService.verifyPassword(password, hashedPassword);
      
      expect(bcrypt.compare).toHaveBeenCalledWith(
        password + securityService.pepper,
        hashedPassword
      );
      
      expect(isValid).toBe(true);
    });

    test('should return false for incorrect password', async () => {
      const password = 'WrongPassword!';
      const hashedPassword = 'hashed_test_password';
      
      bcrypt.compare.mockResolvedValue(false);
      
      const isValid = await securityService.verifyPassword(password, hashedPassword);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Data Encryption', () => {
    test('should encrypt and decrypt text data', () => {
      const sensitiveData = 'This is sensitive information that needs encryption';
      const encrypted = securityService.encrypt(sensitiveData);
      
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/); // iv:encrypted format
      
      const decrypted = securityService.decrypt(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    test('should handle empty string encryption', () => {
      const emptyString = '';
      const encrypted = securityService.encrypt(emptyString);
      
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
      
      const decrypted = securityService.decrypt(encrypted);
      expect(decrypted).toBe(emptyString);
    });

    test('should handle special characters in encryption', () => {
      const specialChars = 'Special chars: !@#$%^&*()_+-=[]{}|;:\'",.<>/?`~';
      const encrypted = securityService.encrypt(specialChars);
      
      const decrypted = securityService.decrypt(encrypted);
      expect(decrypted).toBe(specialChars);
    });

    test('should throw error for invalid encrypted format', () => {
      expect(() => securityService.decrypt('invalid_format')).toThrow('Invalid encrypted format');
      expect(() => securityService.decrypt('missing_colon')).toThrow('Invalid encrypted format');
      expect(() => securityService.decrypt('extra:parts:here')).toThrow('Invalid encrypted format');
    });
  });

  describe('Input Validation', () => {
    test('should validate email format correctly', () => {
      expect(securityService.validateEmail('test@example.com')).toBe(true);
      expect(securityService.validateEmail('user.name+tag+sorting@example.com')).toBe(true);
      expect(securityService.validateEmail('user@sub.example.co.uk')).toBe(true);
      
      expect(securityService.validateEmail('plainaddress')).toBe(false);
      expect(securityService.validateEmail('@missingusername.com')).toBe(false);
      expect(securityService.validateEmail('username@.com')).toBe(false);
      expect(securityService.validateEmail('username@com.')).toBe(false);
      expect(securityService.validateEmail('username@-example.com')).toBe(false);
      expect(securityService.validateEmail('username@example..com')).toBe(false);
    });

    test('should validate password strength', () => {
      // Valid passwords
      expect(securityService.validatePassword('SecurePass123!')).toBe(true);
      expect(securityService.validatePassword('LongSecurePassword123')).toBe(true);
      expect(securityService.validatePassword('WithSpecial@Chars1')).toBe(true);
      
      // Invalid passwords
      expect(securityService.validatePassword('short1')).toBe(false);
      expect(securityService.validatePassword('nouppercase123!')).toBe(false);
      expect(securityService.validatePassword('NOLOWERCASE123!')).toBe(false);
      expect(securityService.validatePassword('MissingNumbers!')).toBe(false);
      expect(securityService.validatePassword('MissingSpecialChar123')).toBe(false);
      expect(securityService.validatePassword(' ')).toBe(false);
      expect(securityService.validatePassword('')).toBe(false);
    });

    test('should sanitize HTML input to prevent XSS', () => {
      const maliciousInput = '<script>alert("xss")</script> <img src=x onerror=alert(1)>';
      const sanitized = securityService.sanitizeInput(maliciousInput);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).toContain('&lt;script&gt;');
      expect(sanitized).toContain('&lt;img');
      
      // Should preserve safe HTML
      const safeInput = '<p>This is <strong>safe</strong> content</p>';
      const safeSanitized = securityService.sanitizeInput(safeInput);
      expect(safeSanitized).toBe(safeInput);
    });
  });

  describe('Rate Limiting', () => {
    test('should generate rate limit keys correctly', () => {
      const req = {
        ip: '192.168.1.1',
        user: { id: 'user_123' }
      };
      
      const key = securityService.getRateLimitKey(req);
      expect(key).toBe('rl:192.168.1.1:user_123');
      
      // Anonymous user
      const anonReq = { ip: '192.168.1.1' };
      const anonKey = securityService.getRateLimitKey(anonReq);
      expect(anonKey).toBe('rl:192.168.1.1:anonymous');
      
      // Admin user (no rate limiting)
      const adminReq = {
        ip: '192.168.1.1',
        user: { id: 'admin_456', role: 'admin' }
      };
      const adminKey = securityService.getRateLimitKey(adminReq);
      expect(adminKey).toBeNull();
    });
  });

  describe('Object ID Validation', () => {
    test('should validate MongoDB ObjectIDs correctly', () => {
      // Valid ObjectID
      expect(securityService.validateObjectId('507f1f77bcf86cd799439011')).toBe(true);
      expect(securityService.validateObjectId('0123456789abcdef01234567')).toBe(true);
      
      // Invalid ObjectID
      expect(securityService.validateObjectId('invalid_id')).toBe(false);
      expect(securityService.validateObjectId('')).toBe(false);
      expect(securityService.validateObjectId(null)).toBe(false);
      expect(securityService.validateObjectId(undefined)).toBe(false);
      expect(securityService.validateObjectId('507f1f77bcf86cd79943901')).toBe(false); // Too short
      expect(securityService.validateObjectId('507f1f77bcf86cd799439011z')).toBe(false); // Invalid character
    });
  });

  describe('CSRF Protection', () => {
    test('should generate and validate CSRF tokens', () => {
      const token = securityService.generateCSRFToken();
      
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/); // 32 character base64 token
      
      // Validate same token
      expect(securityService.validateCSRFToken(token, token)).toBe(true);
      
      // Validate different token
      expect(securityService.validateCSRFToken(token, 'different_token')).toBe(false);
      
      // Validate null/undefined tokens
      expect(securityService.validateCSRFToken(null, token)).toBe(false);
      expect(securityService.validateCSRFToken(token, null)).toBe(false);
    });
  });
});