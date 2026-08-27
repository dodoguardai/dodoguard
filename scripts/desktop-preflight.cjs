const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'desktop/main.cjs',
  'desktop/mysql-manager.cjs',
  'desktop/preload-setup.cjs',
  'desktop/setup.html',
  'release/dodoguard.sql',
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error(`Desktop build preflight failed. Missing files:\n${missing.map((file) => `- ${file}`).join('\n')}`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const targets = {
  win: packageJson.build?.win?.target,
  mac: packageJson.build?.mac?.target,
  linux: packageJson.build?.linux?.target,
};

for (const [platform, target] of Object.entries(targets)) {
  if (!Array.isArray(target) || target.length === 0) {
    console.error(`Desktop build preflight failed. No ${platform} target configured.`);
    process.exit(1);
  }
}

// Catch stale CommonJS exports before electron-builder packages them. A syntax
// check alone does not detect `module.exports = { missingIdentifier }`.
try {
  require(path.join(root, 'desktop', 'mysql-manager.cjs'));
} catch (error) {
  console.error(`Desktop build preflight failed. Cannot load mysql manager: ${error.message}`);
  process.exit(1);
}

console.log('Desktop build preflight passed: Windows, macOS, and Linux targets are configured.');
