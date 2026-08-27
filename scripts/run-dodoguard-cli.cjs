#!/usr/bin/env node
/**
 * CLI entry wrapper: prefer compiled dist/src/main.js; fall back to ts-node for local dev
 * when dist/ is missing or incomplete (e.g. npm run build failed on frontend).
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const distMain = path.join(root, 'dist/src/main.js');
const distInvariant = path.join(root, 'dist/src/util/invariant.js');
const args = process.argv.slice(2);

function isDistReady() {
  return fs.existsSync(distMain) && fs.existsSync(distInvariant);
}

function run(nodeArgs) {
  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  const code = result.status ?? 1;
  if (code !== 0) {
    process.exit(code);
  }
}

if (isDistReady()) {
  run([distMain, ...args]);
} else {
  const tsNode = path.join(root, 'node_modules/ts-node/dist/bin.js');
  const tsMain = path.join(root, 'backend/src/main.ts');
  if (!fs.existsSync(tsNode) || !fs.existsSync(tsMain)) {
    console.error(
      'DodoGuard CLI is not built. Run: npm install && npm run build:cli\nOr use: npm run local -- <command>',
    );
    process.exit(1);
  }
  run([tsNode, '--cwdMode', '--transpileOnly', tsMain, ...args]);
}
