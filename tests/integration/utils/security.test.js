const { securityService } = require('../../../backend/utils/security');
const { dbRouter } = require('../../../backend/services/dbRouter');

jest.mock('../../../backend/services/dbRouter');

describe('Security Service Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset encryption key for each test
    securityService.encryptionKey = crypto.randomBytes(32).toString('hex');
  });

  describe('Password Hashing', () => {
    test('should hash passwords with pepper and salt', () => {
      const password = 'SecurePassword123!';
      const result = securityService.hashPassword(password);
      
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('salt');
      
      // Verify hash format
      expect(result.hash).toMatch(/^[a-f0-9]{128}$/); // 64 bytes as hex
      expect(result.salt).toMatch(/^[a-f0-9]{32}$/); // 16 bytes as hex
    });

    test('should verify passwords correctly', () => {
      const password = 'TestPassword123!';
      const { hash, salt } = securityService.hashPassword(password);
      
      const isValid = securityService.verifyPassword(password, hash, salt);
      expect(isValid).toBe(true);
      
      // Test incorrect password
      const isInvalid = securityService.verifyPassword('WrongPassword!', hash, salt);
      expect(isInvalid).toBe(false);
    });

    test('should use constant-time comparison for security', () => {
      const password = 'SecurePass123!';
      const { hash, salt } = securityService.hashPassword(password);
      
      // Create a slightly different hash
      const differentHash = hash.slice(0, -1) + (hash.slice(-1) === 'a' ? 'b' : 'a');
      
      // Spy on timingSafeEqual
      const timingSafeEqualSpy = jest.spyOn(crypto, 'timingSafeEqual');
      
      securityService.verifyPassword(password, differentHash, salt);
      
      expect(timingSafeEqualSpy).toHaveBeenCalled();
      expect(timingSafeEqualSpy.mock.calls[0][0]).toBeInstanceOf(Buffer);
      expect(timingSafeEqualSpy.mock.calls[0][1]).toBeInstanceOf(Buffer);
    });
  });

  describe('Data Encryption', () => {
    test('should encrypt and decrypt text data', () => {
      const sensitiveData = 'This is sensitive information that needs encryption';
      
      const encrypted = securityService.encrypt(sensitiveData);
      expect(encrypted).toMatch(/^[a-f0-9]{32}:[a-f0-9]+$/); // iv:encrypted format
      
      const decrypted = securityService.decrypt(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    test('should handle encryption failures gracefully', () => {
      // Invalid encrypted format
      expect(() => securityService.decrypt('invalid_format')).toThrow('Decryption failed');
      
      // Corrupted data
      expect(() => securityService.decrypt('a1b2c3d4:corrupted_data')).toThrow('Decryption failed');
    });
  });

  describe('Brute Force Protection', () => {
    test('should block accounts after too many failed attempts', async () => {
      // Mock database with failed attempts
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          findById: jest.fn().mockResolvedValue({
            id: 'user_123',
            failedLoginAttempts: 6 // Exceeds limit of 5
          })
        }))
      });
      
      const req = { user: { id: 'user_123' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      await securityService.checkBruteForce(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('locked') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow login after cooldown period', async () => {
      dbRouter.getAdapter.mockReturnValue({
        model: jest.fn().mockImplementation(() => ({
          findById: jest.fn().mockResolvedValue({
            id: 'user_123',
            failedLoginAttempts: 3 // Under limit
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

  describe('Input Sanitization', () => {
    test('should sanitize HTML input to prevent XSS', () => {
      const maliciousInput = '<script>alert("xss")</script> <img src=x onerror=alert(1)>';
      const sanitized = securityService.sanitizeInput(maliciousInput);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).toContain('<script>');
      expect(sanitized).toContain('<img');
    });

    test('should handle non-string inputs gracefully', () => {
      expect(securityService.sanitizeInput(123)).toBe(123);
      expect(securityService.sanitizeInput(null)).toBeNull();
      expect(securityService.sanitizeInput(undefined)).toBeUndefined();
      expect(securityService.sanitizeInput({ key: 'value' })).toEqual({ key: 'value' });
    });
  });

  describe('Rate Limiting', () => {
    test('should generate rate limit keys correctly', () => {
      const req = {
        ip: '192.168.1.1',
        user: { id: 'user_123' }
      };
      
      const key = securityService.rateLimitKey(req);
      expect(key).toBe('rl:192.168.1.1:user_123');
      
      // Anonymous user
      const anonReq = { ip: '192.168.1.1' };
      const anonKey = securityService.rateLimitKey(anonReq);
      expect(anonKey).toBe('rl:192.168.1.1:anonymous');
    });
  });

  describe('Object ID Validation', () => {
    test('should validate MongoDB ObjectIDs correctly', () => {
      // Valid ObjectID
      expect(securityService.validateObjectId('507f1f77bcf86cd799439011')).toBe(true);
      
      // Invalid ObjectID
      expect(securityService.validateObjectId('invalid_id')).toBe(false);
      expect(securityService.validateObjectId('')).toBe(false);
      expect(securityService.validateObjectId(null)).toBe(false);
      expect(securityService.validateObjectId(undefined)).toBe(false);
    });
  });
});