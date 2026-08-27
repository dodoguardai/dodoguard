const { app } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const net = require('node:net');
const mysql = require('mysql2/promise');
const waitOn = require('wait-on');

const { DEFAULT_DATABASE, fmtMysqlErr } = require('./setup-db.cjs');
const {
  getMysqlDataDir,
  getMysqlConfigDir,
  getMysqlServerLogPath,
  migrateLegacyMysqlDataDir,
} = require('./storage-paths.cjs');
const {
  removeDirWithRetry,
  formatWindowsPermissionHint,
  sleep,
} = require('./fs-win.cjs');

const execFileAsync = promisify(execFile);
const DEFAULT_MYSQL_PORT = 13306;
const APP_DB_USER = 'zhian';

/** @type {import('node:child_process').ChildProcess | null} */
let mysqldProcess = null;
/** @type {number | null} */
let mysqldLogFd = null;

/**
 * @param {string} userDataDir
 */
function getSecretsPath(userDataDir) {
  return path.join(userDataDir, 'mysql-secrets.json');
}

function getInitMarkerPath(userDataDir) {
  return path.join(getMysqlDataDir(userDataDir), '.dodoguard-initialized');
}

function getMysqlConfigPath(userDataDir) {
  return path.join(getMysqlConfigDir(userDataDir), 'my.cnf');
}

function getMysqlBootstrapSqlPath(userDataDir) {
  return path.join(getMysqlConfigDir(userDataDir), 'bootstrap-localhost.sql');
}

function getBundledMysqlRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mysql');
  }
  if (process.platform === 'darwin') {
    return path.join(__dirname, 'vendor', 'mysql', process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64');
  }
  if (process.platform === 'linux') {
    return path.join(__dirname, 'vendor', 'mysql', 'linux-x64');
  }
  return path.join(__dirname, 'vendor', 'mysql', 'win-x64');
}

function toCnfPath(p) {
  return p.replace(/\\/g, '/');
}

function getMysqldPath() {
  return path.join(getBundledMysqlRoot(), 'bin', process.platform === 'win32' ? 'mysqld.exe' : 'mysqld');
}

function getMysqladminPath() {
  return path.join(
    getBundledMysqlRoot(),
    'bin',
    process.platform === 'win32' ? 'mysqladmin.exe' : 'mysqladmin',
  );
}

/**
 * mysql.exe/mysqladmin.exe read client options from [client]/[mysqladmin], not [mysqld].
 * Keep explicit TCP args as a guard against falling back to localhost:3306 on first install.
 * @param {string} userDataDir
 */
function getMysqlClientConnectionArgs(userDataDir) {
  const port = readSecrets(userDataDir)?.port ?? DEFAULT_MYSQL_PORT;
  return [
    `--defaults-file=${getMysqlConfigPath(userDataDir)}`,
    '--protocol=TCP',
    '--host=localhost',
    `--port=${String(port)}`,
  ];
}

/**
 * 生成 mysqld 首次启动 init-file，在服务端权限上下文中创建 TCP 本机 root 账号。
 * 否则新初始化的 MySQL 只有 root@localhost，客户端通过 TCP 会被识别为 root@127.0.0.1 并被拒绝。
 * @param {string} userDataDir
 */
function writeBootstrapLocalhostSql(userDataDir) {
  const sql = `
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
`.trimStart();
  fs.mkdirSync(getMysqlConfigDir(userDataDir), { recursive: true });
  const bootstrapPath = getMysqlBootstrapSqlPath(userDataDir);
  fs.writeFileSync(bootstrapPath, sql, 'utf8');
  return bootstrapPath;
}

/**
 * @param {string} userDataDir
 */
function removeBootstrapLocalhostSql(userDataDir) {
  try {
    const bootstrapPath = getMysqlBootstrapSqlPath(userDataDir);
    if (fs.existsSync(bootstrapPath)) {
      fs.unlinkSync(bootstrapPath);
    }
  } catch {
    /* ignore */
  }
}

function isBundledMysqlAvailable() {
  return fs.existsSync(getMysqldPath());
}

function randomPassword(len = 24) {
  return crypto.randomBytes(18).toString('base64url').slice(0, len);
}

/**
 * @param {string} userDataDir
 */
function readSecrets(userDataDir) {
  const p = getSecretsPath(userDataDir);
  if (!fs.existsSync(p)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * @param {string} userDataDir
 * @param {object} secrets
 */
function writeSecrets(userDataDir, secrets) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(getSecretsPath(userDataDir), JSON.stringify(secrets, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * @param {number} port
 */
function waitForMysqlPort(port, timeoutMs = 120_000) {
  return waitOn({
    resources: [`tcp:127.0.0.1:${port}`],
    timeout: timeoutMs,
    interval: 500,
    tcpTimeout: 1_000,
    window: 500,
  });
}

/**
 * @param {number} port
 */
function isMysqlPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(2_000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * @param {string} userDataDir
 * @param {number} port
 */
function writeMyCnf(userDataDir, port) {
  const basedir = getBundledMysqlRoot();
  const datadir = getMysqlDataDir(userDataDir);
  fs.mkdirSync(getMysqlConfigDir(userDataDir), { recursive: true });
  const lines = [
    '[client]',
    'protocol=TCP',
    'host=localhost',
    `port=${port}`,
    '',
    '[mysql]',
    'protocol=TCP',
    'host=localhost',
    `port=${port}`,
    '',
    '[mysqladmin]',
    'protocol=TCP',
    'host=localhost',
    `port=${port}`,
    '',
    '[mysqld]',
    `basedir=${toCnfPath(basedir)}`,
    `datadir=${toCnfPath(datadir)}`,
    `port=${port}`,
    'bind-address=127.0.0.1',
    'character-set-server=utf8mb4',
    'collation-server=utf8mb4_unicode_ci',
    'default_authentication_plugin=mysql_native_password',
    'max_allowed_packet=256M',
    'skip-name-resolve',
    '',
  ];
  fs.writeFileSync(getMysqlConfigPath(userDataDir), lines.join('\n'), 'utf8');
}

function closeMysqldLogFd() {
  if (mysqldLogFd !== null) {
    try {
      fs.closeSync(mysqldLogFd);
    } catch {
      /* ignore */
    }
    mysqldLogFd = null;
  }
}

/**
 * @param {string} userDataDir
 */
async function initializeDataDir(userDataDir) {
  migrateLegacyMysqlDataDir(userDataDir);

  const dataDir = getMysqlDataDir(userDataDir);
  const marker = getInitMarkerPath(userDataDir);
  if (fs.existsSync(marker)) {
    return;
  }

  if (fs.existsSync(dataDir)) {
    let entries = [];
    try {
      entries = fs.readdirSync(dataDir);
    } catch (e) {
      throw new Error(formatWindowsPermissionHint(e, dataDir));
    }
    if (entries.length > 0) {
      await stopMysqld(userDataDir).catch(() => {});
      await sleep(800);
      try {
        await removeDirWithRetry(dataDir);
      } catch (e) {
        throw new Error(
          formatWindowsPermissionHint(
            e,
            dataDir,
          ) ||
            'MySQL 数据目录已存在但未完成初始化，请完全退出 DodoGuard 并手动删除该目录后重试。',
        );
      }
    }
  }

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    throw new Error(formatWindowsPermissionHint(e, dataDir));
  }

  writeMyCnf(userDataDir, DEFAULT_MYSQL_PORT);

  const mysqld = getMysqldPath();
  await new Promise((resolve, reject) => {
    const child = spawn(
      mysqld,
      [`--defaults-file=${getMysqlConfigPath(userDataDir)}`, '--initialize-insecure'],
      {
        cwd: getBundledMysqlRoot(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let errText = '';
    let outText = '';
    child.stdout?.on('data', (chunk) => {
      outText += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      errText += String(chunk);
    });
    child.on('error', (spawnErr) => {
      reject(new Error(formatWindowsPermissionHint(spawnErr, dataDir)));
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = [errText, outText].filter(Boolean).join('\n').trim();
        reject(
          new Error(
            formatWindowsPermissionHint(
              new Error(detail || `exit ${String(code)}`),
              dataDir,
            ) || `mysqld --initialize-insecure 失败（代码 ${code}）：${detail || '无输出'}`,
          ),
        );
      }
    });
  });

  try {
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
  } catch (e) {
    throw new Error(formatWindowsPermissionHint(e, marker));
  }
}

/**
 * @param {string} userDataDir
 * @param {{ port?: number; initFile?: string }} [opts]
 */
async function startMysqld(userDataDir, opts = {}) {
  const port = opts.port ?? readSecrets(userDataDir)?.port ?? DEFAULT_MYSQL_PORT;

  if (await isMysqlPortOpen(port)) {
    if (mysqldProcess && !mysqldProcess.killed) {
      return { alreadyRunning: true, port };
    }
    throw new Error(
      `内置 MySQL 端口 ${String(port)} 已被其他程序占用。请关闭占用该端口的 MySQL/Docker 容器后，重新执行环境检测；DodoGuard 不会连接外部数据库来完成内置安装。`,
    );
  }

  if (!fs.existsSync(getInitMarkerPath(userDataDir))) {
    throw new Error('MySQL 尚未初始化，请先完成数据库安装步骤。');
  }

  writeMyCnf(userDataDir, port);

  const logPath = getMysqlServerLogPath(userDataDir);
  closeMysqldLogFd();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `\n--- ${new Date().toISOString()} start mysqld ---\n`, 'utf8');
  mysqldLogFd = fs.openSync(logPath, 'a');

  const args = [`--defaults-file=${getMysqlConfigPath(userDataDir)}`];
  if (opts.initFile) {
    args.push(`--init-file=${toCnfPath(opts.initFile)}`);
  }

  mysqldProcess = spawn(getMysqldPath(), args, {
    cwd: getBundledMysqlRoot(),
    windowsHide: true,
    stdio: ['ignore', mysqldLogFd, mysqldLogFd],
    detached: false,
  });

  mysqldProcess.on('exit', () => {
    mysqldProcess = null;
    closeMysqldLogFd();
  });

  await waitForMysqlPort(port);
  return { alreadyRunning: false, port };
}

/**
 * @param {string} userDataDir
 */
async function stopMysqld(userDataDir) {
  const secrets = readSecrets(userDataDir);
  const port = secrets?.port ?? DEFAULT_MYSQL_PORT;

  if (mysqldProcess) {
    try {
      if (process.platform === 'win32') {
        mysqldProcess.kill();
      } else {
        mysqldProcess.kill('SIGTERM');
      }
    } catch {
      /* ignore */
    }
    mysqldProcess = null;
    closeMysqldLogFd();
    await sleep(600);
  }

  if (!(await isMysqlPortOpen(port))) {
    return;
  }

  const mysqladmin = getMysqladminPath();
  if (fs.existsSync(mysqladmin)) {
    const args = [
      ...getMysqlClientConnectionArgs(userDataDir),
      '-u',
      'root',
      'shutdown',
    ];
    if (secrets?.rootPassword) {
      args.push(`-p${secrets.rootPassword}`);
    }

    try {
      await execFileAsync(mysqladmin, args, {
        cwd: getBundledMysqlRoot(),
        windowsHide: true,
        timeout: 30_000,
      });
    } catch {
      /* 可能尚未设置 root 密码或进程已退出 */
    }
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!(await isMysqlPortOpen(port))) {
      return;
    }
    await sleep(300);
  }
}

/**
 * @param {string} userDataDir
 * @param {string} sqlPath
 */
async function configureUsersAndImport(userDataDir, sqlPath) {
  const port = DEFAULT_MYSQL_PORT;
  const rootPassword = randomPassword();
  const appPassword = randomPassword();

  // A new MySQL data directory has
  // no application database yet, so create it before asking mysql.exe to read
  // the dump. Passing the database as a client argument alone fails before
  // the first SQL statement can run.
  await createApplicationDatabase(port);
  await importBundledSqlWithMysqlProtocol(sqlPath, port);

  let conn;
  try {
    conn = await mysql.createConnection({
      host: '127.0.0.1',
      port,
      user: 'root',
      password: '',
      multipleStatements: true,
    });

    await conn.query(`ALTER USER 'root'@'localhost' IDENTIFIED BY ?`, [rootPassword]);
    await conn.query(`ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY ?`, [rootPassword]);
    await conn.query(`CREATE USER IF NOT EXISTS ?@'localhost' IDENTIFIED BY ?`, [
      APP_DB_USER,
      appPassword,
    ]);
    await conn.query(`CREATE USER IF NOT EXISTS ?@'127.0.0.1' IDENTIFIED BY ?`, [
      APP_DB_USER,
      appPassword,
    ]);
    await conn.query(
      `GRANT ALL PRIVILEGES ON \`${DEFAULT_DATABASE}\`.* TO '${APP_DB_USER}'@'localhost'`,
    );
    await conn.query(
      `GRANT ALL PRIVILEGES ON \`${DEFAULT_DATABASE}\`.* TO '${APP_DB_USER}'@'127.0.0.1'`,
    );
    await conn.query('FLUSH PRIVILEGES');
    await conn.end();
    conn = null;
  } catch (e) {
    if (conn) {
      try {
        await conn.end();
      } catch {
        /* ignore */
      }
    }
    throw new Error(`配置 MySQL 账号失败：${fmtMysqlErr(e)}`);
  }

  writeSecrets(userDataDir, {
    port,
    rootPassword,
    appUser: APP_DB_USER,
    appPassword,
    database: DEFAULT_DATABASE,
  });

  return {
    port,
    user: APP_DB_USER,
    password: appPassword,
    database: DEFAULT_DATABASE,
  };
}

/**
 * @param {number} port
 */
async function createApplicationDatabase(port) {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: '127.0.0.1',
      port,
      user: 'root',
    });
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DEFAULT_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } catch (e) {
    throw new Error(`创建应用数据库失败：${fmtMysqlErr(e)}`);
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

/**
 * Import the dump one complete SQL statement at a time through the MySQL
 * protocol.  The Windows mysql.exe client treats backslashes in the Navicat
 * JSON/YAML data as client commands, so piping this dump through that client
 * is not reliable.  Individual statements are at most ~46 MB, below our
 * 256 MB server packet limit.
 * @param {string} sqlPath
 * @param {number} port
 */
async function importBundledSqlWithMysqlProtocol(sqlPath, port) {
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`未找到离线 SQL 文件：${sqlPath}`);
  }

  let conn;
  let statement = '';
  let statementStartLine = 1;
  let lineNumber = 0;
  try {
    conn = await mysql.createConnection({
      host: '127.0.0.1',
      port,
      user: 'root',
      database: DEFAULT_DATABASE,
      multipleStatements: false,
    });

    const lines = readline.createInterface({
      input: fs.createReadStream(sqlPath),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      lineNumber += 1;
      if (statement === '' && line.trim() === '') {
        continue;
      }
      if (statement === '') {
        statementStartLine = lineNumber;
      }
      statement += `${line}\n`;
      if (!line.trimEnd().endsWith(';')) {
        continue;
      }
      await conn.query(statement);
      statement = '';
    }
    if (statement.trim() !== '') {
      throw new Error(`离线 SQL 在第 ${String(statementStartLine)} 行后缺少语句结束符；请检查 SQL 文件。`);
    }
  } catch (e) {
    const position = statement ? `第 ${String(statementStartLine)}-${String(lineNumber)} 行` : `第 ${String(lineNumber)} 行`;
    throw new Error(`导入离线 SQL 失败（${position}）：${fmtMysqlErr(e)}`);
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

/**
 * 清理失败的半成品数据目录（仅当尚未成功写入 secrets）
 * @param {string} userDataDir
 */
async function cleanupFailedInstall(userDataDir) {
  if (fs.existsSync(getSecretsPath(userDataDir))) {
    return;
  }
  await stopMysqld(userDataDir).catch(() => {});
  await sleep(800);

  const dataDir = getMysqlDataDir(userDataDir);
  try {
    await removeDirWithRetry(dataDir);
  } catch {
    /* 清理失败不覆盖原始错误；用户可手动删除 */
  }

  const legacyDataDir = path.join(userDataDir, 'mysql-data');
  if (legacyDataDir !== dataDir && fs.existsSync(legacyDataDir)) {
    try {
      await removeDirWithRetry(legacyDataDir);
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} userDataDir
 * @param {string} sqlPath
 */
async function installBundledDatabase(userDataDir, sqlPath) {
  if (!isBundledMysqlAvailable()) {
    const hint =
      process.platform === 'darwin'
        ? '请先运行 npm run desktop:fetch-mysql:mac 后重新打包，或使用完整 macOS 安装包。'
        : process.platform === 'linux'
          ? '请先运行 npm run desktop:fetch-mysql:linux 后重新打包，或使用完整 Linux 安装包。'
          : '请先运行 npm run desktop:fetch-mysql:win 后重新打包，或使用完整 Windows 安装包。';
    throw new Error(`未找到内置 MySQL，${hint}`);
  }

  try {
    await initializeDataDir(userDataDir);
    const bootstrapPath = writeBootstrapLocalhostSql(userDataDir);
    await startMysqld(userDataDir, { initFile: bootstrapPath });
    removeBootstrapLocalhostSql(userDataDir);
    const dbCfg = await configureUsersAndImport(userDataDir, sqlPath);
    return dbCfg;
  } catch (e) {
    removeBootstrapLocalhostSql(userDataDir);
    await stopMysqld(userDataDir).catch(() => {});
    await cleanupFailedInstall(userDataDir);
    const dataDir = getMysqlDataDir(userDataDir);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('EPERM') || msg.includes('Permission denied')) {
      throw new Error(formatWindowsPermissionHint(e, dataDir));
    }
    throw e;
  }
}

/**
 * @param {string} userDataDir
 */
async function ensureMysqldRunning(userDataDir) {
  const secrets = readSecrets(userDataDir);
  if (!secrets) {
    throw new Error('未找到 MySQL 配置，请重新运行安装向导。');
  }
  await startMysqld(userDataDir, { port: secrets.port });
  return secrets;
}

function getDefaultMysqlPort() {
  return DEFAULT_MYSQL_PORT;
}

module.exports = {
  DEFAULT_MYSQL_PORT,
  APP_DB_USER,
  DEFAULT_DATABASE,
  getBundledMysqlRoot,
  getMysqldPath,
  isBundledMysqlAvailable,
  readSecrets,
  getSecretsPath,
  initializeDataDir,
  startMysqld,
  stopMysqld,
  installBundledDatabase,
  ensureMysqldRunning,
  cleanupFailedInstall,
  getDefaultMysqlPort,
};
