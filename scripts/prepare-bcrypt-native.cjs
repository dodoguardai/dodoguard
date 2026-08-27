/* Ensure bcrypt's prebuilt native binary matches the Electron target platform. */
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const supportedPlatforms = new Set(['win32', 'darwin', 'linux']);

const bcryptRoot = path.join(root, 'node_modules', 'bcrypt');
const version = require(path.join(bcryptRoot, 'package.json')).version;

function download(urlToFetch, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(urlToFetch, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location &&
          redirects < 5
        ) {
          response.resume();
          download(new URL(response.headers.location, urlToFetch).toString(), destination, redirects + 1)
            .then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`下载 bcrypt 原生模块失败：HTTP ${String(response.statusCode)}`));
          return;
        }
        const output = fs.createWriteStream(destination);
        response.pipe(output);
        output.on('finish', () => output.close(resolve));
        output.on('error', reject);
      })
      .on('error', reject);
  });
}

async function prepareBcryptNative({ targetPlatform, targetArch = 'x64', bindingDir }) {
  if (!supportedPlatforms.has(targetPlatform) || targetArch !== 'x64') {
    throw new Error('bcrypt 预编译模块仅支持 win32/darwin/linux x64 目标。');
  }
  const binaryAbi = targetPlatform === 'linux' ? 'glibc' : 'unknown';
  const archiveName = `bcrypt_lib-v${version}-napi-v3-${targetPlatform}-${targetArch}-${binaryAbi}.tar.gz`;
  const url = `https://github.com/kelektiv/node.bcrypt.js/releases/download/v${version}/${archiveName}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dodoguard-bcrypt-'));
  const archivePath = path.join(tempDir, archiveName);
  try {
    await download(url, archivePath);
    execFileSync('tar', ['-xzf', archivePath, '-C', bindingDir], { stdio: 'inherit' });
    const binaryPath = path.join(bindingDir, 'napi-v3', 'bcrypt_lib.node');
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`bcrypt 解压后未找到原生模块：${binaryPath}`);
    }
    console.log(`Prepared bcrypt ${targetPlatform}-${targetArch}: ${binaryPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { prepareBcryptNative };

if (require.main === module) {
  const targetPlatform = process.argv[2];
  const targetArch = process.argv[3] || 'x64';
  prepareBcryptNative({
    targetPlatform,
    targetArch,
    bindingDir: path.join(bcryptRoot, 'lib', 'binding'),
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
