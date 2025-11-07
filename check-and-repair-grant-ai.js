#!/usr/bin/env node
/**
 * Grant-AI Project Health and Auto-Repair Script
 * Author: ChatGPT (GPT-5)
 * Date: 2025-11-07
 * 
 * Usage: node check-and-repair-grant-ai.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import fetch from 'node-fetch';
import os from 'os';

// CONFIG
const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, `.backup_${new Date().toISOString().split('T')[0]}`);
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const BACKEND_DIR = path.join(ROOT, 'backend');
const LOG_FILE = path.join(ROOT, 'project_check.log');

const log = msg => {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
};

log(`\n==== Grant-AI System Diagnostic (${new Date().toLocaleString()}) ====\n`);


// ---------- STEP 1: BACKUP CRITICAL FILES ----------
const criticalFiles = [
  'package.json',
  'package-lock.json',
  'docker-compose.yml',
  'docker-compose.prod.yml',
  'backend/db.config.js',
  '.env'
].filter(f => fs.existsSync(path.join(ROOT, f)));

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
criticalFiles.forEach(f => {
  const src = path.join(ROOT, f);
  const dest = path.join(BACKUP_DIR, f.replace(/[\\/]/g, '_'));
  fs.copyFileSync(src, dest);
});
log(`✅ Backup complete (${criticalFiles.length} files copied to ${BACKUP_DIR})`);


// ---------- STEP 2: DEPENDENCY CHECK ----------
log(`\n🔍 Checking Node dependencies...`);
try {
  execSync('npm ls --depth=0', { stdio: 'pipe' });
  log('✅ All dependencies are correctly installed.');
} catch (err) {
  log('⚠️  Some dependencies are missing or mismatched. Attempting to fix...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    log('✅ Dependencies reinstalled successfully.');
  } catch (installErr) {
    log('❌ npm install failed. Manual review required.');
  }
}


// ---------- STEP 3: SYNTAX + IMPORT CHECK ----------
log(`\n🔍 Validating JS/JSX import structure...`);
try {
  execSync('npx eslint . --ext .js,.jsx --max-warnings=0', { stdio: 'pipe' });
  log('✅ ESLint found no critical issues.');
} catch {
  log('⚠️ ESLint found issues. Run "npx eslint . --fix" for auto-fixes.');
}


// ---------- STEP 4: URL + CONNECTION TESTS ----------
const urlsToCheck = new Set();

// Parse backend config files for URLs
function extractUrlsFromFile(file) {
  const content = fs.readFileSync(file, 'utf-8');
  const matches = content.match(/https?:\/\/[^\s'"]+/g);
  if (matches) matches.forEach(u => urlsToCheck.add(u));
}

log(`\n🔍 Extracting URLs from config and source files...`);
const candidates = [
  'backend/ai.config.js',
  'backend/db.config.js',
  'backend/emailService.js',
  'frontend/manifest.json',
  'docker/nginx.conf',
  'README.md'
].filter(f => fs.existsSync(path.join(ROOT, f)));

for (const file of candidates) extractUrlsFromFile(path.join(ROOT, file));
log(`Found ${urlsToCheck.size} URLs. Testing connectivity...`);

for (const url of urlsToCheck) {
  try {
    const res = await fetch(url, { method: 'HEAD', timeout: 5000 });
    if (res.status >= 400) log(`❌ ${url} -> HTTP ${res.status}`);
    else log(`✅ ${url} -> OK`);
  } catch (e) {
    log(`⚠️ ${url} -> ${e.message}`);
  }
}


// ---------- STEP 5: DATABASE / REDIS CONNECTIVITY ----------
import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

log(`\n🔍 Checking Redis and Prisma connections...`);

try {
  const redis = createClient();
  await redis.connect();
  await redis.ping();
  log('✅ Redis connection OK');
  await redis.disconnect();
} catch (e) {
  log(`❌ Redis connection failed: ${e.message}`);
}

try {
  const prisma = new PrismaClient();
  await prisma.$connect();
  log('✅ Prisma (DB) connection OK');
  await prisma.$disconnect();
} catch (e) {
  log(`❌ Prisma connection failed: ${e.message}`);
}


// ---------- STEP 6: FRONTEND BUILD CHECK ----------
if (fs.existsSync(FRONTEND_DIR)) {
  log(`\n🔍 Checking React build integrity...`);
  try {
    execSync('npm run build --prefix frontend', { stdio: 'pipe' });
    log('✅ Frontend build passed.');
  } catch {
    log('⚠️ Frontend build errors detected. Run "npm run build --prefix frontend" manually.');
  }
}


// ---------- STEP 7: SECURITY + VULNERABILITY AUDIT ----------
log(`\n🔍 Running npm audit (security scan)...`);
try {
  execSync('npm audit --audit-level=moderate', { stdio: 'pipe' });
  log('✅ No critical vulnerabilities detected.');
} catch {
  log('⚠️ npm audit found potential issues. Review manually.');
}


// ---------- STEP 8: SUMMARY ----------
log(`\n🏁 Grant-AI Health Check Complete.`);
log(`Results saved to: ${LOG_FILE}`);
log(`Backup stored in: ${BACKUP_DIR}`);
console.log(`\n👉 Review ${LOG_FILE} for detailed results.\n`);

// ---------- STEP 9: AUTO-REPAIR SAFE ISSUES ----------
if (fs.existsSync(path.join(ROOT, 'package-lock.json'))) {
  log('\n🧩 Running lockfile refresh...');
  execSync('npm dedupe', { stdio: 'pipe' });
  log('✅ npm dedupe completed.');
}
