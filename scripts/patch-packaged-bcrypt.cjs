const fs = require('node:fs');
const path = require('node:path');
const { prepareBcryptNative } = require('./prepare-bcrypt-native.cjs');

const appPath = process.argv[2];
const targetPlatform = process.argv[3];
const targetArch = process.argv[4] || 'x64';

if (!appPath || !targetPlatform) {
  throw new Error('Usage: node scripts/patch-packaged-bcrypt.cjs <app-path> <win32|darwin> [x64]');
}

const bindingDir = path.join(
  path.resolve(appPath),
  'Contents',
  'Resources',
  'app.asar.unpacked',
  'node_modules',
  'bcrypt',
  'lib',
  'binding',
);

if (!fs.existsSync(bindingDir)) {
  throw new Error(`未找到已封装 bcrypt 目录：${bindingDir}`);
}

prepareBcryptNative({ targetPlatform, targetArch, bindingDir }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
