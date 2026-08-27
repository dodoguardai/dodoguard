#!/usr/bin/env node
/**
 * 下载 MySQL 8.0 macOS x64 TAR 包并解压到 desktop/vendor/mysql/darwin-x64，
 * 供 electron-builder 打入 macOS 安装包（extraResources → resources/mysql）。
 *
 * 用法：node scripts/fetch-mysql-portable-mac.cjs
 * 可选环境变量：
 *   MYSQL_MAC_TAR_URL — 自定义 tar.gz 直链
 *   MYSQL_MAC_VERSION — 8.0.x 小版本（默认 8.0.46）
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const https = require('node:https');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'desktop', 'vendor', 'mysql', 'darwin-x64');
const CACHE_DIR = path.join(ROOT, 'desktop', 'vendor', 'cache');
const DEFAULT_MYSQL_VERSION = process.env.MYSQL_MAC_VERSION || '8.0.46';

function cdnTarUrl(version, macosMajor, arch) {
  return `https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-${version}-macos${macosMajor}-${arch}.tar.gz`;
}

function resolveDownloadCandidates() {
  if (process.env.MYSQL_MAC_TAR_URL) {
    return [process.env.MYSQL_MAC_TAR_URL];
  }
  return [
    cdnTarUrl(DEFAULT_MYSQL_VERSION, '15', 'x86_64'),
    cdnTarUrl(DEFAULT_MYSQL_VERSION, '15', 'arm64'),
    cdnTarUrl(DEFAULT_MYSQL_VERSION, '14', 'x86_64'),
    cdnTarUrl(DEFAULT_MYSQL_VERSION, '14', 'arm64'),
  ];
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
      file.on('finish', () => file.close(resolve));
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

async function downloadFirstAvailable(urls) {
  let lastError = null;
  for (const url of urls) {
    const tarName = path.basename(new URL(url).pathname);
    const tarPath = path.join(CACHE_DIR, tarName);
    if (fs.existsSync(tarPath)) {
      return tarPath;
    }
    console.log(`正在下载 ${url} …`);
    try {
      await download(url, tarPath);
      console.log(`已保存到 ${tarPath}`);
      return tarPath;
    } catch (e) {
      lastError = e;
      try {
        if (fs.existsSync(tarPath)) {
          fs.unlinkSync(tarPath);
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
  throw lastError || new Error('所有 macOS MySQL 候选下载地址均失败。');
}

function findMysqlRoot(extractDir) {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) {
      continue;
    }
    const candidate = path.join(extractDir, ent.name);
    if (fs.existsSync(path.join(candidate, 'bin', 'mysqld'))) {
      return candidate;
    }
  }
  if (fs.existsSync(path.join(extractDir, 'bin', 'mysqld'))) {
    return extractDir;
  }
  throw new Error(`在 ${extractDir} 中未找到 bin/mysqld`);
}

function chmodExecutables(root) {
  for (const name of ['mysqld', 'mysql', 'mysqladmin']) {
    const p = path.join(root, 'bin', name);
    if (fs.existsSync(p)) {
      fs.chmodSync(p, 0o755);
    }
  }
}

async function main() {
  if (fs.existsSync(path.join(OUT_DIR, 'bin', 'mysqld'))) {
    console.log(`已存在 ${OUT_DIR}，跳过下载（删除该目录可强制重新拉取）`);
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let tarPath = null;
  for (const url of resolveDownloadCandidates()) {
    const candidatePath = path.join(CACHE_DIR, path.basename(new URL(url).pathname));
    if (fs.existsSync(candidatePath)) {
      console.log(`使用缓存 ${candidatePath}`);
      tarPath = candidatePath;
      break;
    }
  }
  if (!tarPath) {
    tarPath = await downloadFirstAvailable(resolveDownloadCandidates());
  }

  const tmpExtract = path.join(CACHE_DIR, 'extract-mac-tmp');
  fs.rmSync(tmpExtract, { recursive: true, force: true });
  fs.mkdirSync(tmpExtract, { recursive: true });

  console.log('正在解压…');
  execFileSync('tar', ['-xzf', tarPath, '-C', tmpExtract], { stdio: 'inherit' });

  const mysqlRoot = findMysqlRoot(tmpExtract);
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(OUT_DIR), { recursive: true });
  fs.renameSync(mysqlRoot, OUT_DIR);
  chmodExecutables(OUT_DIR);
  fs.rmSync(tmpExtract, { recursive: true, force: true });

  console.log(`MySQL macOS 便携包已就绪：${OUT_DIR}`);
  console.log('下一步：npm run desktop:dist:mac');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
