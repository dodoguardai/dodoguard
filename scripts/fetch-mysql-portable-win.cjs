#!/usr/bin/env node
/**
 * 下载 MySQL 8.0 Windows x64 ZIP 并解压到 desktop/vendor/mysql/win-x64
 * 供 electron-builder 打入 Windows 安装包（extraResources → resources/mysql）。
 *
 * 用法：node scripts/fetch-mysql-portable-win.cjs
 * 可选环境变量：
 *   MYSQL_WIN_ZIP_URL — 自定义 ZIP 直链
 *   MYSQL_WIN_VERSION — 8.0.x 小版本（默认 8.0.46），失败时自动尝试 8.0.45/44/43
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const https = require('node:https');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'desktop', 'vendor', 'mysql', 'win-x64');
const CACHE_DIR = path.join(ROOT, 'desktop', 'vendor', 'cache');

/** 与 dev.mysql.com 当前 GA 对齐；旧小版本会从 CDN 下架导致 404 */
const DEFAULT_MYSQL_VERSION = process.env.MYSQL_WIN_VERSION || '8.0.46';

/** @param {string} version 如 8.0.46 */
function cdnZipUrl(version) {
  return `https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-${version}-winx64.zip`;
}

/** 主版本失败时依次尝试（从新到旧） */
const FALLBACK_VERSIONS = ['8.0.46', '8.0.45', '8.0.44', '8.0.43'];

function resolveDownloadCandidates() {
  if (process.env.MYSQL_WIN_ZIP_URL) {
    return [process.env.MYSQL_WIN_ZIP_URL];
  }
  const versions = [
    DEFAULT_MYSQL_VERSION,
    ...FALLBACK_VERSIONS.filter((v) => v !== DEFAULT_MYSQL_VERSION),
  ];
  return [...new Set(versions)].map(cdnZipUrl);
}

/**
 * @param {string} url
 * @returns {Promise<{ url: string; zipPath: string }>}
 */
async function downloadFirstAvailable(urls) {
  let lastError = null;
  for (const url of urls) {
    const zipName = path.basename(new URL(url).pathname);
    const zipPath = path.join(CACHE_DIR, zipName);
    if (fs.existsSync(zipPath)) {
      return { url, zipPath };
    }
    console.log(`正在下载 ${url} …`);
    try {
      await download(url, zipPath);
      console.log(`已保存到 ${zipPath}`);
      return { url, zipPath };
    } catch (e) {
      lastError = e;
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      } catch {
        /* ignore */
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('404')) {
        console.warn(`跳过不可用地址：${url}`);
        continue;
      }
      throw e;
    }
  }
  throw (
    lastError ||
    new Error(
      '所有候选下载地址均失败。请设置 MYSQL_WIN_ZIP_URL 指向有效的 mysql-*-winx64.zip，或从 https://dev.mysql.com/downloads/mysql/8.0.html 手动下载后放入 desktop/vendor/cache/',
    )
  );
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`下载失败 HTTP ${res.statusCode}: ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    return;
  }
  execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
}

function findMysqlRoot(extractDir) {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) {
      continue;
    }
    const candidate = path.join(extractDir, ent.name);
    if (fs.existsSync(path.join(candidate, 'bin', 'mysqld.exe'))) {
      return candidate;
    }
  }
  if (fs.existsSync(path.join(extractDir, 'bin', 'mysqld.exe'))) {
    return extractDir;
  }
  throw new Error(`在 ${extractDir} 中未找到 mysqld.exe`);
}

async function main() {
  if (fs.existsSync(path.join(OUT_DIR, 'bin', 'mysqld.exe'))) {
    console.log(`已存在 ${OUT_DIR}，跳过下载（删除该目录可强制重新拉取）`);
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const candidates = resolveDownloadCandidates();
  let zipPath = null;
  for (const url of candidates) {
    const candidatePath = path.join(CACHE_DIR, path.basename(new URL(url).pathname));
    if (fs.existsSync(candidatePath)) {
      console.log(`使用缓存 ${candidatePath}`);
      zipPath = candidatePath;
      break;
    }
  }
  if (!zipPath) {
    const result = await downloadFirstAvailable(candidates);
    zipPath = result.zipPath;
  }

  const tmpExtract = path.join(CACHE_DIR, 'extract-tmp');
  if (fs.existsSync(tmpExtract)) {
    fs.rmSync(tmpExtract, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpExtract, { recursive: true });

  console.log('正在解压…');
  extractZip(zipPath, tmpExtract);

  const mysqlRoot = findMysqlRoot(tmpExtract);
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(OUT_DIR), { recursive: true });
  fs.renameSync(mysqlRoot, OUT_DIR);

  fs.rmSync(tmpExtract, { recursive: true, force: true });

  if (!fs.existsSync(path.join(OUT_DIR, 'bin', 'mysqld.exe'))) {
    throw new Error('解压后仍未找到 mysqld.exe');
  }
  console.log(`MySQL 便携包已就绪：${OUT_DIR}`);
  console.log('下一步：npm run desktop:dist:win');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
