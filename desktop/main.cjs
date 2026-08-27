const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const waitOn = require('wait-on');

const { runEnvironmentCheck } = require('./env-check.cjs');
const mysqlManager = require('./mysql-manager.cjs');
const {
  DEFAULT_DATABASE,
  writeDesktopEnv,
  testExternalConnection,
  importZhianSql,
} = require('./setup-db.cjs');
const setupState = require('./setup-state.cjs');

const API_PORT = Number(process.env.API_PORT || 15500);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const HEALTH_CHECK_URL = `${API_URL}/health`;
const IS_HEADLESS = process.env.DODOGUARD_HEADLESS === '1';

let serverProcess = null;
/** @type {number | null} */
let serverLogFd = null;
/** @type {BrowserWindow | null} */
let setupWindow = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Promise<void> | null} */
let bootstrapPromise = null;

function closeServerLogFd() {
  if (serverLogFd !== null) {
    try {
      fs.closeSync(serverLogFd);
    } catch {
      /* ignore */
    }
    serverLogFd = null;
  }
}

function getUserDataDir() {
  const userDataDir = app.getPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });
  return userDataDir;
}

function isBundledMysqlMode() {
  return process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux';
}

function usesSetupWizard() {
  return isBundledMysqlMode();
}

function isMysqlSetupComplete() {
  return setupState.isSetupComplete(getUserDataDir());
}

function getDesktopIconPath() {
  if (app.isPackaged) {
    const packagedIcon = path.join(process.resourcesPath, 'dodoguard-icon.png');
    if (fs.existsSync(packagedIcon)) {
      return packagedIcon;
    }
  }
  const devIcon = path.join(__dirname, '..', 'build', 'icon.png');
  return fs.existsSync(devIcon) ? devIcon : undefined;
}

function getOfflineSqlPath() {
  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, 'dodoguard-offline', 'dodoguard.sql');
    if (fs.existsSync(packaged)) {
      return packaged;
    }
  }
  const developmentCandidates = [
    path.join(__dirname, '..', 'release', 'dodoguard.sql'),
    path.join(__dirname, '..', 'dodoguard-offline', 'dodoguard.sql'),
  ];
  for (const developmentPath of developmentCandidates) {
    if (fs.existsSync(developmentPath)) {
      return developmentPath;
    }
  }
  throw new Error(
    '未找到 dodoguard.sql：开发环境请确认仓库中存在 release/dodoguard.sql；安装包请在打包配置中包含该文件。',
  );
}

function formatSqlSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function writeSetupMarkerModeA() {
  setupState.writeMarker(getUserDataDir(), {
    mode: 'A',
    finishedAt: new Date().toISOString(),
  });
}

function writeSetupMarkerModeB(mysqlPort) {
  setupState.writeMarker(getUserDataDir(), {
    mode: 'B',
    finishedAt: new Date().toISOString(),
    mysqlPort,
  });
  setupState.patchState(getUserDataDir(), {
    mode: 'B',
    step: 3,
    mysql: { port: mysqlPort, database: mysqlManager.DEFAULT_DATABASE },
    finishedAt: new Date().toISOString(),
  });
}

async function finishBundledSetupAndStart() {
  const userDataDir = getUserDataDir();
  await runBootstrapApp();
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.close();
  }
  setupWindow = null;
  const secrets = mysqlManager.readSecrets(userDataDir);
  writeSetupMarkerModeB(secrets?.port ?? mysqlManager.getDefaultMysqlPort());
  return { ok: true, message: '已启动。' };
}

/**
 * 服务器部署可用的显式无界面安装路径。仅由 DODOGUARD_HEADLESS=1 调用，
 * 普通桌面版仍保留用户确认的首次安装向导。
 */
async function installBundledDatabaseAndStart() {
  const userDataDir = getUserDataDir();
  const sqlPath = getOfflineSqlPath();
  setupState.patchState(userDataDir, { mode: 'B', step: 2 });
  const dbCfg = await mysqlManager.installBundledDatabase(userDataDir, sqlPath);
  writeDesktopEnv(setupState.getEnvPath(userDataDir), {
    host: '127.0.0.1',
    port: dbCfg.port,
    user: dbCfg.user,
    password: dbCfg.password,
    database: dbCfg.database,
    apiPort: API_PORT,
  });
  setupState.patchState(userDataDir, {
    mode: 'B',
    step: 2,
    mysql: { port: dbCfg.port, database: dbCfg.database },
  });
  return finishBundledSetupAndStart();
}

async function applyExternalAndStart(cfg) {
  const userDataDir = getUserDataDir();
  const sqlPath = getOfflineSqlPath();
  await importZhianSql(cfg, sqlPath);
  writeDesktopEnv(setupState.getEnvPath(userDataDir), {
    host: cfg.host,
    port: cfg.port || 3306,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || DEFAULT_DATABASE,
    apiPort: API_PORT,
  });

  try {
    await runBootstrapApp();
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.close();
    }
    setupWindow = null;
    writeSetupMarkerModeA();
    setupState.patchState(userDataDir, { mode: 'A', step: 3 });
    return { ok: true, message: '已启动。' };
  } catch (e) {
    try {
      if (fs.existsSync(setupState.getEnvPath(userDataDir))) {
        fs.unlinkSync(setupState.getEnvPath(userDataDir));
      }
    } catch {
      /* ignore */
    }
    throw e;
  }
}

async function prepareExternalDatabase(cfg) {
  const userDataDir = getUserDataDir();
  const sqlPath = getOfflineSqlPath();
  await importZhianSql(cfg, sqlPath);
  writeDesktopEnv(setupState.getEnvPath(userDataDir), {
    host: cfg.host,
    port: cfg.port || 3306,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database || DEFAULT_DATABASE,
    apiPort: API_PORT,
  });
  setupState.patchState(userDataDir, {
    mode: 'A',
    step: 2,
    mysql: { port: cfg.port || 3306, database: cfg.database || DEFAULT_DATABASE },
  });
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    icon: getDesktopIconPath(),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
  win.loadURL(API_URL);
}

function createSetupWindow() {
  const useWizard = usesSetupWizard();
  setupWindow = new BrowserWindow({
    width: useWizard ? 680 : 640,
    height: useWizard ? 820 : 780,
    minWidth: useWizard ? 560 : 520,
    minHeight: useWizard ? 680 : 640,
    autoHideMenuBar: true,
    title: useWizard ? 'DodoGuard — 首次安装向导' : 'DodoGuard — 数据库配置',
    icon: getDesktopIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload-setup.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  setupWindow.loadFile(path.join(__dirname, useWizard ? 'setup-wizard.html' : 'setup.html'));
  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

function getDesktopServerLogPath() {
  return path.join(getUserDataDir(), 'desktop-server.log');
}

function readLogTailForDialog(logPath, maxLen = 3800) {
  try {
    if (!fs.existsSync(logPath)) {
      return '（尚无 desktop-server.log 文件）';
    }
    const raw = fs.readFileSync(logPath, 'utf8');
    if (raw.length <= maxLen) {
      return raw;
    }
    return `…（仅展示末尾 ${maxLen} 字符）\n${raw.slice(-maxLen)}`;
  } catch (e) {
    return `（读取日志失败：${e instanceof Error ? e.message : String(e)}）`;
  }
}

function startServerProcess() {
  const serverEntry = path.join(app.getAppPath(), 'dist', 'src', 'server', 'index.js');
  const userDataDir = getUserDataDir();
  const logPath = getDesktopServerLogPath();

  closeServerLogFd();

  fs.appendFileSync(
    logPath,
    `\n--- ${new Date().toISOString()} 启动内嵌服务 (port ${API_PORT}) ---\n`,
    'utf8',
  );
  serverLogFd = fs.openSync(logPath, 'a');

  const appPath = app.getAppPath();
  const packagedFrontendDist = path.join(appPath, 'frontend', 'dist');
  const spawnEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    API_PORT: String(API_PORT),
    BROWSER: 'none',
    DODOGUARD_DESKTOP_EMBEDDED: '1',
    // The bundled SQL is the base data set. Always apply newer tracked
    // migrations before serving the desktop UI.
    DODOGUARD_SKIP_DB_MIGRATIONS: '0',
  };
  if (fs.existsSync(packagedFrontendDist)) {
    spawnEnv.FRONTEND_DIST_DIR = packagedFrontendDist;
  }

  const child = spawn(process.execPath, [serverEntry], {
    cwd: userDataDir,
    env: spawnEnv,
    stdio: ['ignore', serverLogFd, serverLogFd],
  });
  serverProcess = child;

  child.on('exit', (code) => {
    const isCurrentServer = serverProcess === child;
    if (isCurrentServer) {
      serverProcess = null;
    }
    closeServerLogFd();
    if (!isCurrentServer) {
      return;
    }
    if (code !== 0 && !app.isQuitting) {
      const tail = readLogTailForDialog(logPath);
      const message = [
        `内嵌服务进程异常退出（代码 ${String(code)}）。`,
        `常见原因：端口 ${String(API_PORT)} 已被占用；MySQL 不可连或 .env 有误；缺少依赖（见日志）。`,
        `完整日志：${logPath}`,
        '',
        '—— 日志末尾 ——',
        tail,
      ].join('\n');
      if (IS_HEADLESS) {
        console.error(message);
      } else {
        dialog.showErrorBox('DodoGuard 服务启动失败', message);
      }
      app.quit();
    }
  });
}

async function waitForHealth(timeout) {
  try {
    await waitOn({
      resources: [HEALTH_CHECK_URL],
      timeout,
      interval: 300,
      tcpTimeout: 800,
      window: 300,
    });
    return true;
  } catch {
    return false;
  }
}

async function doBootstrapApp() {
  const userDataDir = getUserDataDir();
  if (setupState.getSetupMode(userDataDir) === 'B') {
    await mysqlManager.ensureMysqldRunning(userDataDir);
  }

  if (await waitForHealth(1_200)) {
    if (!IS_HEADLESS) {
      createMainWindow();
    }
    return;
  }

  startServerProcess();

  if (!(await waitForHealth(90_000))) {
    throw new Error(`内嵌服务启动超时：${HEALTH_CHECK_URL}`);
  }

  if (!IS_HEADLESS) {
    createMainWindow();
  }
}

async function runBootstrapApp() {
  if (!bootstrapPromise) {
    bootstrapPromise = doBootstrapApp().finally(() => {
      bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

function stopServerProcess() {
  if (!serverProcess) {
    closeServerLogFd();
    return;
  }
  try {
    serverProcess.kill(process.platform === 'win32' ? 'SIGKILL' : 'SIGTERM');
  } catch {
    /* ignore */
  }
  serverProcess = null;
  closeServerLogFd();
}

async function stopBundledMysqlIfNeeded() {
  const userDataDir = getUserDataDir();
  if (setupState.getSetupMode(userDataDir) === 'B') {
    await mysqlManager.stopMysqld(userDataDir);
  }
}

function registerSetupIpc() {
  ipcMain.handle('setup:get-platform-info', async () => {
    const userDataDir = getUserDataDir();
    const state = setupState.readState(userDataDir);
    const envPath = setupState.getEnvPath(userDataDir);
    return {
      platform: process.platform,
      isWindowsBundled: process.platform === 'win32',
      isBundledMode: isBundledMysqlMode(),
      usesSetupWizard: usesSetupWizard(),
      bundledMysqlAvailable: mysqlManager.isBundledMysqlAvailable(),
      mysqlPort: mysqlManager.getDefaultMysqlPort(),
      apiPort: API_PORT,
      currentStep: state?.step ?? 0,
      hasEnvFile: fs.existsSync(envPath),
    };
  });

  ipcMain.handle('setup:run-env-check', async () => {
    try {
      const userDataDir = getUserDataDir();
      const result = await runEnvironmentCheck({
        userDataDir,
        apiPort: API_PORT,
        mysqlPort: mysqlManager.getDefaultMysqlPort(),
        bundledMysqlAvailable: mysqlManager.isBundledMysqlAvailable(),
        bundledMysqlRequired: isBundledMysqlMode(),
      });
      if (result.ok) {
        setupState.patchState(userDataDir, { mode: isBundledMysqlMode() ? 'B' : 'A', step: 1 });
      }
      return result;
    } catch (e) {
      return {
        ok: false,
        checks: [
          {
            id: 'error',
            ok: false,
            label: '检测异常',
            message: e instanceof Error ? e.message : String(e),
          },
        ],
      };
    }
  });

  ipcMain.handle('setup:install-bundled-mysql', async () => {
    const userDataDir = getUserDataDir();
    try {
      const sqlPath = getOfflineSqlPath();
      setupState.patchState(userDataDir, { mode: 'B', step: 2 });
      const dbCfg = await mysqlManager.installBundledDatabase(userDataDir, sqlPath);
      writeDesktopEnv(setupState.getEnvPath(userDataDir), {
        host: '127.0.0.1',
        port: dbCfg.port,
        user: dbCfg.user,
        password: dbCfg.password,
        database: dbCfg.database,
        apiPort: API_PORT,
      });
      setupState.patchState(userDataDir, {
        mode: 'B',
        step: 2,
        mysql: { port: dbCfg.port, database: dbCfg.database },
      });
      return {
        ok: true,
        message: `数据库已安装（库名 ${dbCfg.database}，端口 ${dbCfg.port}）。请点击下一步启动应用。`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('setup:start-application', async () => {
    const userDataDir = getUserDataDir();
    try {
      if (!fs.existsSync(setupState.getEnvPath(userDataDir))) {
        return { ok: false, message: '请先完成数据库安装步骤。' };
      }
      if (setupState.getSetupMode(userDataDir) === 'B') {
        return await finishBundledSetupAndStart();
      } else {
        await runBootstrapApp();
        if (setupWindow && !setupWindow.isDestroyed()) {
          setupWindow.close();
        }
        setupWindow = null;
        writeSetupMarkerModeA();
        setupState.patchState(userDataDir, { mode: 'A', step: 3 });
        return { ok: true, message: '已启动。' };
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('setup:bundled-sql-status', async () => {
    try {
      const p = getOfflineSqlPath();
      const st = fs.statSync(p);
      return {
        ok: true,
        exists: true,
        path: p,
        sizeLabel: formatSqlSize(st.size),
      };
    } catch (e) {
      return {
        ok: false,
        exists: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('setup:get-logo-data-url', async () => {
    try {
      const iconPath = getDesktopIconPath();
      if (!iconPath) {
        return { ok: false, message: '未找到 logo 图标。' };
      }
      const data = fs.readFileSync(iconPath);
      return { ok: true, dataUrl: `data:image/png;base64,${data.toString('base64')}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('setup:test-connection', async (_event, cfg) => {
    try {
      return await testExternalConnection(cfg, getOfflineSqlPath());
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('setup:apply-and-start', async (_event, cfg) => {
    try {
      return await applyExternalAndStart(cfg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }
  });

  ipcMain.handle('setup:prepare-external-db', async (_event, cfg) => {
    try {
      await prepareExternalDatabase(cfg);
      const database = cfg?.database || DEFAULT_DATABASE;
      return {
        ok: true,
        message:
          cfg?.importBundledSql === false
            ? `数据库配置已保存（库名 ${database}）。请点击下一步部署应用。`
            : `数据库已导入（库名 ${database}）。请点击下一步部署应用。`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
}

registerSetupIpc();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      const win = wins[0];
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  let quitCleanupDone = false;
  const FORCE_QUIT_MS = 4000;

  app.on('before-quit', (event) => {
    if (quitCleanupDone) {
      return;
    }
    event.preventDefault();
    app.isQuitting = true;

    const forceQuit = () => {
      if (quitCleanupDone) {
        return;
      }
      quitCleanupDone = true;
      stopServerProcess();
      process.exit(0);
    };

    const forceTimer = setTimeout(forceQuit, FORCE_QUIT_MS);
    stopServerProcess();
    stopBundledMysqlIfNeeded()
      .catch(() => {})
      .finally(() => {
        clearTimeout(forceTimer);
        if (quitCleanupDone) {
          return;
        }
        quitCleanupDone = true;
        app.quit();
      });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.whenReady().then(async () => {
  try {
    if (IS_HEADLESS) {
      if (!isBundledMysqlMode()) {
        throw new Error('无界面部署仅支持内置 MySQL 模式。');
      }
      if (!isMysqlSetupComplete()) {
        console.log('DodoGuard 无界面部署：正在初始化内置 MySQL 并导入离线数据…');
        await installBundledDatabaseAndStart();
      } else {
        await runBootstrapApp();
      }
      console.log(`DodoGuard 无界面服务已就绪：${API_URL}`);
      return;
    }
    if (!isMysqlSetupComplete()) {
      createSetupWindow();
      return;
    }
    await runBootstrapApp();
  } catch (error) {
    const message = `启动失败：${error instanceof Error ? error.message : String(error)}`;
    if (IS_HEADLESS) {
      console.error(message);
    } else {
      dialog.showErrorBox('DodoGuard 启动失败', message);
    }
    app.quit();
  }
});

  app.on('activate', () => {
    if (IS_HEADLESS) {
      return;
    }
    if (!app.isReady()) {
      return;
    }
    if (!isMysqlSetupComplete()) {
      if (BrowserWindow.getAllWindows().length === 0) {
        createSetupWindow();
      }
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
      runBootstrapApp().catch((error) => {
        dialog.showErrorBox(
          'DodoGuard 启动失败',
          error instanceof Error ? error.message : String(error),
        );
      });
    }
  });
}
