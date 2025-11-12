import crypto from 'crypto';
import { securityService } from '../../../backend/utils/security';
import { dbRouter } from '../../../backend/services/dbRouter';

jest.mock('../../../../backend/services/dbRouter');

describe('security Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    securityService.encryptionKey = 'test_encryption_key_32_bytes_0123456789abcdef';
    securityService.pepper = 'test_pepper_value_for_password_hashing';
  });

  describe('Password Security', () => {
    test('should hash password with pepper and salt', () => {
      const password = 'SecurePassword123!';
      const { hash, salt } = securityService.hashPassword(password);

      expect(hash).toMatch(/^[a-f0-9]{128}$/);
      expect(salt).toMatch(/^[a-f0-9]{32}$/);
      expect(hash.length).toBe(128);
      expect(salt.length).toBe(32);
    });

    test('should verify password correctly', () => {
      const password = 'TestPassword123!';
      const { hash, salt } = securityService.hashPassword(password);

      const isValid = securityService.verifyPassword(password, hash, salt);
      expect(isValid).toBe(true);

      const isInvalid = securityService.verifyPassword('WrongPassword!', hash, salt);
      expect(isInvalid).toBe(false);
    });

    test('should use constant-time comparison to prevent timing attacks', () => {
      const password = 'SecurePass123!';
      const { hash, salt } = securityService.hashPassword(password);

      const timingSafeEqualSpy = jest.spyOn(crypto, 'timingSafeEqual');
      securityService.verifyPassword(password, hash, salt);

      expect(timingSafeEqualSpy).toHaveBeenCalled();
      expect(timingSafeEqualSpy.mock.calls[0][0]).toBeInstanceOf(Buffer);
      expect(timingSafeEqualSpy.mock.calls[0][1]).toBeInstanceOf(Buffer);
    });
  });

  describe('Data Encryption', () => {
    test('should encrypt and decrypt text data', () => {
      const sensitiveData = 'This is sensitive information';
      const encrypted = securityService.encrypt(sensitiveData);

      expect(encrypted).toMatch(/^[a-f0-9]{32}:[a-f0-9]+$/);

      const decrypted = securityService.decrypt(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    test('should handle empty string encryption', () => {
      const emptyString = '';
      const encrypted = securityService.encrypt(emptyString);

      expect(encrypted).toMatch(/^[a-f0-9]{32}:[a-f0-9]+$/);
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
      expect(() => securityService.decrypt('invalid_format')).toThrow('Decryption failed');
      expect(() => securityService.decrypt('missing_colon')).toThrow('Decryption failed');
      expect(() => securityService.decrypt('extra:parts:here')).toThrow('Decryption failed');
    });
  });

  describe('Input Sanitization', () => {
    test('should sanitize HTML input to prevent XSS', () => {
      const maliciousInput = '<script>alert("xss")</script> <img src=x onerror=alert(1)>';
      const sanitized = securityService.sanitizeInput(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).toContain('&lt;script&gt;');
      expect(sanitized).toContain('&lt;img');

      const safeInput = '<p>This is <strong>safe</strong> content</p>';
      const safeSanitized = securityService.sanitizeInput(safeInput);
      expect(safeSanitized).toBe('&lt;p&gt;This is &lt;strong&gt;safe&lt;/strong&gt; content&lt;/p&gt;');
    });

    test('should handle non-string inputs gracefully', () => {
      expect(securityService.sanitizeInput(123)).toBe(123);
      expect(securityService.sanitizeInput(null)).toBeNull();
      expect(securityService.sanitizeInput(undefined)).toBeUndefined();
      expect(securityService.sanitizeInput({ key: 'value' })).toEqual({ key: 'value' });
    });
  });

  describe('Brute Force Protection', () => {
    test('should check for brute force attacks', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          findById: jest.fn().mockResolvedValue({
            id: 'user_123',
            failedLoginAttempts: 6
          })
        }))
      });

      const req = { user: { id: 'user_123', email: 'test@example.com' }, __: (s) => s };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await securityService.checkBruteForce(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('ACCOUNT_LOCKED') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow login after failed attempts under limit', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          findById: jest.fn().mockResolvedValue({
            id: 'user_123',
            failedLoginAttempts: 3
          })
        }))
      });

      const req = { user: { id: 'user_123' } };
      const res = {};
      const next = jest.fn();

      await securityService.checkBruteForce(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    test('should generate rate limit keys correctly', () => {
      const req = { ip: '192.168.1.1', user: { id: 'user_123' } };
      expect(securityService.rateLimitKey(req)).toBe('rl:192.168.1.1:user_123');

      const anonReq = { ip: '192.168.1.1' };
      expect(securityService.rateLimitKey(anonReq)).toBe('rl:192.168.1.1:anonymous');

      const adminReq = { ip: '192.168.1.1', user: { id: 'admin_456', role: 'admin' } };
      expect(securityService.rateLimitKey(adminReq)).toBe('rl:192.168.1.1:admin_456');
    });
  });

  describe('Object ID Validation', () => {
    test('should validate MongoDB ObjectIDs correctly', () => {
      expect(securityService.validateObjectId('507f1f77bcf86cd799439011')).toBe(true);
      expect(securityService.validateObjectId('0123456789abcdef01234567')).toBe(true);
      expect(securityService.validateObjectId('invalid_id')).toBe(false);
      expect(securityService.validateObjectId('')).toBe(false);
      expect(securityService.validateObjectId(null)).toBe(false);
      expect(securityService.validateObjectId(undefined)).toBe(false);
      expect(securityService.validateObjectId('507f1f77bcf86cd79943901')).toBe(false);
      expect(securityService.validateObjectId('507f1f77bcf86cd799439011z')).toBe(false);
    });
  });

  describe('Secure Token Generation', () => {
    test('should generate secure random tokens', () => {
      const token = securityService.generateSecureToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);

      const shortToken = securityService.generateSecureToken(16);
      expect(shortToken).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
