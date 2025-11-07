import express from 'express';
import jwt from 'jsonwebtoken';
import { userService } from '../services/userService.js';
import { logger } from '../utils/logger.js';
// import { validateLogin, validateRegister } from '../utils/validation.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// 🔐 Login with email/password
router.post('/login', async (req, res) => {
  try {
    const { error, value } = validateLogin(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    
    const { email, password } = value;
    const user = await userService.authenticate(email, password);
    
    if (!user) {
      return res.status(401).json({ error: req.__('INVALID_CREDENTIALS') });
    }
    
    // 🗝️ Generate JWT with refresh token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );
    
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );
    
    // 💾 Store session
    await userService.createSession(user.id, refreshToken, req.ip, req.headers['user-agent']);
    
    // 🍪 Set secure cookies
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role 
      }
    });
  } catch (error) {
    logger.error('Login failed', error);
    res.status(500).json({ error: req.__('SERVER_ERROR') });
  }
});

// 🔄 Refresh token endpoint
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: req.__('NO_REFRESH_TOKEN') });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await userService.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: req.__('INVALID_REFRESH_TOKEN') });
    }
    
    // 🗝️ Generate new access token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );
    
    res.json({ token });
  } catch (error) {
    // 🧹 Clear invalid refresh token
    res.clearCookie('refreshToken');
    res.status(401).json({ error: req.__('TOKEN_EXPIRED') });
  }
});

// 🚪 Logout endpoint
router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (refreshToken) {
    try {
      await userService.revokeSession(refreshToken);
    } catch (error) {
      logger.warn('Session revocation failed', error);
    }
  }
  
  res.clearCookie('refreshToken');
  res.json({ success: true });
});

export default router;