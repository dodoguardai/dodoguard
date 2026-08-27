const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const { getMysqlStorageRoot } = require('./storage-paths.cjs');

const MIN_DISK_BYTES = 2 * 1024 * 1024 * 1024;
const MIN_FREE_RAM_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * @param {string} dir
 */
function getFreeDiskBytes(dir) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(dir);
      return Number(st.bavail) * Number(st.bsize);
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * @param {{
 *   userDataDir: string;
 *   apiPort: number;
 *   mysqlPort: number;
 *   bundledMysqlAvailable: boolean;
 *   bundledMysqlRequired?: boolean;
 * }} opts
 */
async function runEnvironmentCheck(opts) {
  const checks = [];
  let ok = true;

  const platform = process.platform;
  const arch = process.arch;
  const bundledMysqlRequired = opts.bundledMysqlRequired !== false;

  if (bundledMysqlRequired && platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
    checks.push({
      id: 'platform',
      ok: false,
      label: '操作系统',
      message: `内置 MySQL 安装当前仅支持 Windows/macOS/Linux（当前：${platform}）。`,
    });
    ok = false;
  } else {
    checks.push({
      id: 'platform',
      ok: true,
      label: '操作系统',
      message:
        platform === 'win32'
          ? `Windows ${os.release()} (${arch})`
          : `${platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : platform} ${os.release()} (${arch})`,
    });
  }

  if (bundledMysqlRequired && !opts.bundledMysqlAvailable) {
    checks.push({
      id: 'bundled-mysql',
      ok: false,
      label: '内置 MySQL',
      message:
        process.platform === 'darwin'
          ? '安装包中未找到 MySQL 运行文件。请先执行 npm run desktop:fetch-mysql:mac 后重新打包，或使用完整 macOS 安装包。'
          : process.platform === 'linux'
            ? '安装包中未找到 MySQL 运行文件。请先执行 npm run desktop:fetch-mysql:linux 后重新打包，或使用完整 Linux 安装包。'
            : '安装包中未找到 MySQL 运行文件。请先执行 npm run desktop:fetch-mysql:win 后重新打包，或使用完整 Windows 安装包。',
    });
    ok = false;
  } else {
    checks.push({
      id: 'bundled-mysql',
      ok: true,
      label: bundledMysqlRequired ? '内置 MySQL' : '数据库模式',
      message: bundledMysqlRequired
        ? '已检测到安装包内的 MySQL 8 组件。'
        : '将连接当前环境中的 MySQL，并从安装包导入 dodoguard.sql。',
    });
  }

  try {
    const mysqlRoot = getMysqlStorageRoot(opts.userDataDir);
    fs.mkdirSync(mysqlRoot, { recursive: true });
    const probe = path.join(mysqlRoot, '.write-test');
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    checks.push({
      id: 'writable',
      ok: true,
      label: 'MySQL 数据目录可写',
      message:
        process.platform === 'win32'
          ? `${mysqlRoot}（Windows 使用 Local，避免 OneDrive 锁定 Roaming）`
          : mysqlRoot,
    });
  } catch (e) {
    checks.push({
      id: 'writable',
      ok: false,
      label: 'MySQL 数据目录可写',
      message: e instanceof Error ? e.message : String(e),
    });
    ok = false;
  }

  try {
    fs.mkdirSync(opts.userDataDir, { recursive: true });
    const probe = path.join(opts.userDataDir, '.write-test');
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    checks.push({
      id: 'writable-config',
      ok: true,
      label: '应用配置目录可写',
      message: opts.userDataDir,
    });
  } catch (e) {
    checks.push({
      id: 'writable-config',
      ok: false,
      label: '应用配置目录可写',
      message: e instanceof Error ? e.message : String(e),
    });
    ok = false;
  }

  const diskProbeDir = getMysqlStorageRoot(opts.userDataDir);
  const freeDisk = getFreeDiskBytes(diskProbeDir);
  if (freeDisk === null) {
    checks.push({
      id: 'disk',
      ok: true,
      label: '磁盘空间',
      message: '无法检测剩余空间（已跳过，请确保至少有 2GB 可用）。',
    });
  } else if (freeDisk < MIN_DISK_BYTES) {
    checks.push({
      id: 'disk',
      ok: false,
      label: '磁盘空间',
      message: `可用空间不足（约 ${Math.round(freeDisk / (1024 * 1024))} MB），建议至少 2GB。`,
    });
    ok = false;
  } else {
    checks.push({
      id: 'disk',
      ok: true,
      label: '磁盘空间',
      message: `可用约 ${(freeDisk / (1024 * 1024 * 1024)).toFixed(1)} GB`,
    });
  }

  const freeRam = os.freemem();
  if (freeRam < MIN_FREE_RAM_BYTES) {
    checks.push({
      id: 'memory',
      ok: true,
      label: '可用内存',
      message: `当前可用约 ${Math.round(freeRam / (1024 * 1024))} MB（偏低，安装可能较慢）。`,
    });
  } else {
    checks.push({
      id: 'memory',
      ok: true,
      label: '可用内存',
      message: `约 ${Math.round(freeRam / (1024 * 1024))} MB`,
    });
  }

  const apiFree = await isPortFree(opts.apiPort);
  checks.push({
    id: 'port-api',
    ok: apiFree,
    label: `应用端口 ${opts.apiPort}`,
    message: apiFree ? '未被占用' : '已被占用，请关闭占用该端口的程序后重试。',
  });
  if (!apiFree) {
    ok = false;
  }

  if (bundledMysqlRequired) {
    const mysqlFree = await isPortFree(opts.mysqlPort);
    checks.push({
      id: 'port-mysql',
      ok: mysqlFree,
      label: `内置 MySQL 端口 ${opts.mysqlPort}`,
      message: mysqlFree ? '未被占用' : '已被占用，请关闭占用该端口的程序后重试。',
    });
    if (!mysqlFree) {
      ok = false;
    }
  }

  return { ok, checks };
}

module.exports = {
  runEnvironmentCheck,
  isPortFree,
};
