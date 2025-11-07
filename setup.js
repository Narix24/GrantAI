// setup.js
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs'; // ✅ Move to top-level (required in ESM)

// ✅ Correct import path: ./backend/services/dbRouter.js (not ./services/dbRouter.js)
import { dbRouter } from './backend/services/dbRouter.js';
import { logger } from './backend/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildFrontend() {
  const frontendDist = path.join(__dirname, 'frontend', 'dist');
  try {
    // ✅ fs is now available at top level — no need to re-import
    if (!fs.existsSync(frontendDist)) {
      console.log('📦 Frontend build missing. Running npm build...');
      execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
      console.log('✅ Frontend built successfully');
    }
  } catch (err) {
    console.error('❌ Frontend build failed:', err);
    process.exit(1);
  }
}

async function initializeDatabase() {
  console.log('🗃️ Initializing database...');
  try {
    await dbRouter.initialize();
    console.log('✅ SQLite is active');

    // Insert dummy proposals for testing
    try {
      const adapter = dbRouter.getAdapter();
      // ✅ SQLite adapter is accessed directly, not via .adapters.sqlite
      if (adapter && typeof adapter.save === 'function') {
        await adapter.save({
          id: 'prop_dummy_1',
          content: { title: 'Dummy Proposal 1', description: 'Test content' },
          language: 'en',
          tone: 'formal',
          status: 'draft',
        });
        await adapter.save({
          id: 'prop_dummy_2',
          content: { title: 'Dummy Proposal 2', description: 'Test content' },
          language: 'en',
          tone: 'formal',
          status: 'draft',
        });
        console.log('✅ Dummy proposals added');
      } else {
        console.warn('⚠️ Dummy proposal insert skipped: SQLite adapter not available');
      }
    } catch (err) {
      console.warn('⚠️ Dummy proposal insert failed:', err.message);
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

async function main() {
  await buildFrontend();
  await initializeDatabase();
  console.log('🚀 Setup complete. You can now run `npm run dev` or `node backend/server.js`');
}

main().catch(err => {
  console.error('💥 Fatal error in setup:', err);
  process.exit(1);
});