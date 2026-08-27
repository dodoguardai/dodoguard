const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PRODUCT_DIR = 'DodoGuard';

/**
 * Windows：MySQL 数据/配置放在 Local（避免 Roaming + OneDrive 锁文件导致 EPERM）。
 * 其他平台：与 Electron userData 一致。
 * @param {string} userDataDir
 */
function getMysqlStorageRoot(userDataDir) {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const root = path.join(localAppData, PRODUCT_DIR);
      fs.mkdirSync(root, { recursive: true });
      return root;
    }
    const fallback = path.join(os.homedir(), 'AppData', 'Local', PRODUCT_DIR);
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
  return userDataDir;
}

/**
 * @param {string} userDataDir
 */
function getMysqlDataDir(userDataDir) {
  return path.join(getMysqlStorageRoot(userDataDir), 'mysql-data');
}

/**
 * @param {string} userDataDir
 */
function getMysqlConfigDir(userDataDir) {
  return path.join(getMysqlStorageRoot(userDataDir), 'mysql');
}

/**
 * @param {string} userDataDir
 */
function getMysqlServerLogPath(userDataDir) {
  return path.join(getMysqlStorageRoot(userDataDir), 'mysql-server.log');
}

/**
 * 旧版曾把 mysql-data 放在 Roaming userData，尝试迁移到 Local。
 * @param {string} userDataDir
 */
function migrateLegacyMysqlDataDir(userDataDir) {
  const newDataDir = getMysqlDataDir(userDataDir);
  const legacyDataDir = path.join(userDataDir, 'mysql-data');
  if (newDataDir === legacyDataDir) {
    return;
  }
  if (!fs.existsSync(legacyDataDir)) {
    return;
  }
  if (fs.existsSync(newDataDir)) {
    return;
  }
  try {
    fs.renameSync(legacyDataDir, newDataDir);
  } catch {
    /* 迁移失败则继续使用新路径重新初始化 */
  }
}

module.exports = {
  PRODUCT_DIR,
  getMysqlStorageRoot,
  getMysqlDataDir,
  getMysqlConfigDir,
  getMysqlServerLogPath,
  migrateLegacyMysqlDataDir,
};
