const fs = require('node:fs');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Windows 上 mysqld 退出后文件句柄释放可能有延迟，删除 datadir 需重试。
 * @param {string} dir
 * @param {{ attempts?: number }} [opts]
 */
async function removeDirWithRetry(dir, opts = {}) {
  const attempts = opts.attempts ?? 6;
  if (!dir || !fs.existsSync(dir)) {
    return;
  }
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 300,
      });
      return;
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

/**
 * @param {unknown} err
 * @param {string} targetPath
 */
function formatWindowsPermissionHint(err, targetPath) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EACCES' && !msg.includes('EPERM'))) {
    return msg;
  }
  return [
    `无法访问 MySQL 数据目录（${targetPath}）。`,
    '常见原因：① 上次安装未退出，mysqld 仍占用文件；② OneDrive/杀毒软件锁定 AppData；③ 无写入权限。',
    '请：完全退出 DodoGuard → 任务管理器结束 mysqld.exe（若有）→ 删除上述目录 → 以普通用户重试；',
    '若仍失败，将 DodoGuard 安装目录与 %LOCALAPPDATA%\\DodoGuard 加入杀毒/OneDrive 排除项。',
    `原始错误：${msg}`,
  ].join('\n');
}

module.exports = {
  removeDirWithRetry,
  formatWindowsPermissionHint,
  sleep,
};
