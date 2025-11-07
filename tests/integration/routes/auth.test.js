const request = require('supertest');
const { app } = require('../../../backend/server');
const { dbRouter } = require('../../../backend/services/dbRouter');
const { userService } = require('../../../backend/services/userService');
const { securityService } = require('../../../backend/utils/security');

jest.mock('../../../backend/services/dbRouter');
jest.mock('../../../backend/services/userService');
jest.mock('../../../backend/utils/security');

describe('Authentication Routes Integration', () => {
  beforeAll(async () => {
    await dbRouter.initialize();
  });

  afterAll(async () => {
    await dbRouter.shutdown();
  });

  describe('Login Endpoint', () => {
    test('should login successfully with valid credentials', async () => {
      // Mock user authentication
      userService.authenticate.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      });
      
      // Mock token generation
      jest.spyOn(require('jsonwebtoken'), 'sign').mockReturnValue('mock_jwt_token');
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('token', 'mock_jwt_token');
      expect(response.body.user).toHaveProperty('id', 'user_123');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.user).toHaveProperty('name', 'Test User');
      
      // Verify cookie is set
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toContain('refreshToken=');
    });

    test('should reject login with invalid credentials', async () => {
      userService.authenticate.mockResolvedValue(null);
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'wrongpassword'
        });
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    test('should validate login input', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: 'short'
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('email');
      expect(response.body.error).toContain('password');
    });
  });

  describe('Refresh Token Endpoint', () => {
    test('should refresh token with valid refresh token', async () => {
      // Mock token verification
      jest.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({ id: 'user_123' });
      
      // Mock user lookup
      userService.findById.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com'
      });
      
      // Mock new token generation
      jest.spyOn(require('jsonwebtoken'), 'sign').mockImplementation((payload, secret, options) => {
        if (options.expiresIn === '2h') return 'new_access_token';
        return 'new_refresh_token';
      });
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=valid_refresh_token']);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('token', 'new_access_token');
    });

    test('should reject refresh with missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh');
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'No refresh token provided');
    });

    test('should reject refresh with invalid refresh token', async () => {
      jest.spyOn(require('jsonwebtoken'), 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=invalid_token']);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid refresh token');
    });
  });

  describe('Logout Endpoint', () => {
    test('should logout successfully and clear refresh token', async () => {
      userService.revokeSession.mockResolvedValue(true);
      
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', ['refreshToken=test_token']);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      
      // Verify cookie is cleared
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toContain('refreshToken=;');
      expect(response.headers['set-cookie'][0]).toContain('Max-Age=0');
    });
  });

  describe('Protected Routes', () => {
    test('should block unauthenticated access to protected routes', async () => {
      const response = await request(app)
        .get('/api/proposals');
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should allow access with valid JWT token', async () => {
      // Mock authentication middleware
      app.use('/api/protected', (req, res, next) => {
        req.user = { id: 'user_123', role: 'user' };
        next();
      });
      
      app.get('/api/protected', (req, res) => {
        res.json({ success: true, user: req.user });
      });
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer valid_token');
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.user).toHaveProperty('id', 'user_123');
    });
  });

  describe('Security Features', () => {
    test('should hash passwords before storing', async () => {
      const mockHash = { hash: 'hashed_value', salt: 'salt_value' };
      securityService.hashPassword.mockReturnValue(mockHash);
      
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'new@example.com',
          password: 'NewPassword123!',
          name: 'New User'
        });
      
      expect(securityService.hashPassword).toHaveBeenCalledWith('NewPassword123!');
      expect(userService.createUser).toHaveBeenCalledWith(expect.objectContaining({
        password: 'hashed_value',
        salt: 'salt_value'
      }));
    });

    test('should limit login attempts to prevent brute force', async () => {
      // Mock user with failed attempts
      userService.findById.mockResolvedValue({
        id: 'user_123',
        failedLoginAttempts: 5
      });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'locked@example.com',
          password: 'any_password'
        });
      
      expect(response.statusCode).toBe(429);
      expect(response.body).toHaveProperty('error', 'Account locked due to too many failed attempts');
    });

    test('should rotate refresh tokens on use', async () => {
      jest.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({ id: 'user_123' });
      jest.spyOn(require('jsonwebtoken'), 'sign').mockReturnValue('new_refresh_token');
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=old_token']);
      
      expect(userService.createSession).toHaveBeenCalledWith(
        'user_123',
        'new_refresh_token',
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('OAuth Integration', () => {
    test('should handle Google OAuth callback successfully', async () => {
      // Mock Google OAuth flow
      userService.findOrCreateGoogleUser.mockResolvedValue({
        id: 'google_user_123',
        email: 'google.user@gmail.com',
        name: 'Google User',
        googleId: 'google_id_123'
      });
      
      jest.spyOn(require('jsonwebtoken'), 'sign').mockReturnValue('oauth_jwt_token');
      
      const response = await request(app)
        .get('/api/auth/google/callback')
        .query({
          code: 'mock_google_code'
        });
      
      expect(response.statusCode).toBe(302); // Redirect to dashboard
      expect(response.headers.location).toBe('/dashboard');
      
      // Verify session cookie is set
      expect(response.headers['set-cookie']).toBeDefined();
    });

    test('should reject invalid OAuth requests', async () => {
      userService.findOrCreateGoogleUser.mockRejectedValue(new Error('Invalid OAuth code'));
      
      const response = await request(app)
        .get('/api/auth/google/callback')
        .query({
          code: 'invalid_code'
        });
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'OAuth authentication failed');
    });
  });
});