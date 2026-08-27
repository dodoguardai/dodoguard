#!/usr/bin/env node
/**
 * 下载 MySQL 8.0 Linux x64 GLIBC 便携包并解压到 desktop/vendor/mysql/linux-x64，
 * 供 electron-builder 打入 Linux 安装包（extraResources → resources/mysql）。
 *
 * 用法：node scripts/fetch-mysql-portable-linux.cjs
 * 可选环境变量：
 *   MYSQL_LINUX_TAR_URL — 自定义 tar.xz 直链
 *   MYSQL_LINUX_VERSION — 8.0.x 小版本（默认 8.0.46）
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'desktop', 'vendor', 'mysql', 'linux-x64');
const CACHE_DIR = path.join(ROOT, 'desktop', 'vendor', 'cache');
const VERSION = process.env.MYSQL_LINUX_VERSION || '8.0.46';

function getCandidates() {
  if (process.env.MYSQL_LINUX_TAR_URL) return [process.env.MYSQL_LINUX_TAR_URL];
  return [
    `https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-${VERSION}-linux-glibc2.28-x86_64.tar.xz`,
    `https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-${VERSION}-linux-glibc2.17-x86_64-minimal.tar.xz`,
  ];
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        output.close();
        fs.rmSync(destination, { force: true });
        download(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        output.close();
        fs.rmSync(destination, { force: true });
        reject(new Error(`下载失败 HTTP ${String(response.statusCode)}: ${url}`));
        return;
      }
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', reject);
    }).on('error', reject);
  });
}

function findMysqlRoot(extractDir) {
  for (const entry of fs.readdirSync(extractDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const candidate = path.join(extractDir, entry.name);
      if (fs.existsSync(path.join(candidate, 'bin', 'mysqld'))) return candidate;
    }
  }
  throw new Error(`在 ${extractDir} 中未找到 bin/mysqld`);
}

async function main() {
  if (fs.existsSync(path.join(OUT_DIR, 'bin', 'mysqld'))) {
    console.log(`已存在 ${OUT_DIR}，跳过下载（删除该目录可强制重新拉取）`);
    return;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let archivePath;
  let lastError;
  for (const url of getCandidates()) {
    const candidate = path.join(CACHE_DIR, path.basename(new URL(url).pathname));
    try {
      if (!fs.existsSync(candidate)) {
        console.log(`正在下载 ${url} …`);
        await download(url, candidate);
      } else {
        console.log(`使用缓存 ${candidate}`);
      }
      archivePath = candidate;
      break;
    } catch (error) {
      lastError = error;
      console.warn(error instanceof Error ? error.message : String(error));
    }
  }
  if (!archivePath) throw lastError || new Error('没有可用的 Linux MySQL 下载地址。');

  const extractDir = path.join(CACHE_DIR, 'extract-linux-tmp');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    console.log('正在解压…');
    execFileSync('tar', ['-xJf', archivePath, '-C', extractDir], { stdio: 'inherit' });
    const mysqlRoot = findMysqlRoot(extractDir);
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(OUT_DIR), { recursive: true });
    fs.renameSync(mysqlRoot, OUT_DIR);
    for (const name of ['mysqld', 'mysql', 'mysqladmin']) {
      const binary = path.join(OUT_DIR, 'bin', name);
      if (fs.existsSync(binary)) fs.chmodSync(binary, 0o755);
    }
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  console.log(`MySQL Linux 便携包已就绪：${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
