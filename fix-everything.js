#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const prettier = require('prettier');
const babelParse = require('@babel/parser').parse;
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const cwd = process.cwd();
const APPLIED = new Set();
const DRY_RUN = !process.argv.includes('--apply');

console.log(DRY_RUN ? 'DRY-RUN mode – nothing will be written' : 'APPLY mode – files will be overwritten');

const log = (msg, file) => console.log(`${DRY_RUN ? '[DRY]' : '[FIX]'} ${msg}  ${path.relative(cwd, file)}`);

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    console.error(e.stdout || e.message);
    process.exit(1);
  }
}

// Async wrapper to handle prettier.resolveConfig (async-only in Prettier 3+)
async function main() {
  const prettierOpts = (await prettier.resolveConfig(cwd)) || { semi: true, singleQuote: true };

  function eslintFix(file) {
    try {
      exec(`npx eslint --fix "${file}"`);
      log('eslint --fix', file);
    } catch {}
  }

  function transform(code, filePath) {
    const ast = babelParse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
    });

    let dirty = false;

    traverse(ast, {
      ImportDeclaration(pathNode) {
        const source = pathNode.node.source.value;
        if (source.startsWith('.') && !path.extname(source)) {
          const tryExts = ['.ts', '.tsx', '.js', '.jsx'];
          for (const e of tryExts) {
            try {
              fs.readFileSync(path.resolve(path.dirname(filePath), source + e), 'utf8');
              pathNode.node.source.value = source + e;
              dirty = true;
              log(`added extension ${e} to import`, filePath);
              break;
            } catch {}
          }
        }
      },
      VariableDeclarator(pathNode) {
        const binding = pathNode.scope.getBinding(pathNode.node.id.name);
        if (!binding) return;
        const refs = binding.referencePaths;
        if (refs.length === 0 && !t.isIdentifier(pathNode.node.init)) {
          pathNode.remove();
          dirty = true;
          log(`removed unused var ${pathNode.node.id.name}`, filePath);
        }
      },
    });

    if (!dirty) return code;
    const { code: out } = generate(ast, {}, code);
    return out;
  }

  function processFile(file) {
    const code = fs.readFileSync(file, 'utf8');
    let out = transform(code, file);
    out = prettier.format(out, { ...prettierOpts, filepath: file });
    if (out.trim() !== code.trim()) {
      APPLIED.add(file);
      if (!DRY_RUN) fs.writeFileSync(file, out, 'utf8');
    }
    eslintFix(file);
  }

  const pkg = loadJson(path.join(cwd, 'package.json'));
  if (!pkg) throw new Error('package.json not found');

  const exts = ['.js', '.jsx', '.ts', '.tsx'];
  const gitFiles = exec('git ls-files')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && exts.includes(path.extname(l)));

  gitFiles.forEach(processFile);

  console.log('\nRunning tsc --noEmit …');
  exec('npx tsc --noEmit');

  console.log(`\n✅  ${APPLIED.size} files would be changed.` +
    (DRY_RUN ? '\nRe-run with --apply to write changes.' : '\nChanges applied. Review with: git diff --name-only'));

  if (!DRY_RUN && APPLIED.size) console.log('\nQuick sanity test: npm run build');
}

main().catch(err => { console.error(err); process.exit(1); });