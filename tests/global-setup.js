// tests/global-setup.js
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🌍 Global setup running...');

  // 🔧 Environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_MODE = 'true';

  // 🗄️ Database
  if (!process.env.TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = 'mongodb://localhost:27017/grant_ai_test';
  }

  // 🌐 External service mocks
  process.env.CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_gemini_key';
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test_openai_key';

  // 📁 Create required test directories
  const testDirs = [
    path.join(__dirname, '../public/audio'),
    path.join(__dirname, '../public/screenshots'),
    path.join(__dirname, '../logs'),
    path.join(__dirname, '../__mocks__')
  ];

  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created test directory: ${dir}`);
    }
  }

  console.log('✅ Global setup completed successfully');
};