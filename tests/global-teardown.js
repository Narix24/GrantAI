// tests/global-teardown.js
module.exports = async () => {
  console.log('🧹 Global teardown running...');
  
  // Cleanup test files
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Remove test audio files
    const audioDir = path.join(__dirname, '../public/audio');
    if (fs.existsSync(audioDir)) {
      fs.readdirSync(audioDir).forEach(file => {
        if (file.startsWith('test_') || file.includes('temp') || file.includes('mock')) {
          fs.unlinkSync(path.join(audioDir, file));
        }
      });
      console.log('✅ Test audio files cleaned up');
    }
    
    // Remove test logs
    const logDir = path.join(__dirname, '../logs');
    if (fs.existsSync(logDir)) {
      fs.readdirSync(logDir).forEach(file => {
        if (file.includes('test')) {
          fs.unlinkSync(path.join(logDir, file));
        }
      });
      console.log('✅ Test log files cleaned up');
    }
  } catch (error) {
    console.error('❌ Error during file cleanup:', error);
  }
  
  console.log('✅ Global teardown completed successfully');
};