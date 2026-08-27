const fs = require('node:fs');
const mysql = require('mysql2/promise');

const DEFAULT_DATABASE = 'dodoguard';

function dotenvEscapeLine(value) {
  const s = String(value ?? '');
  if (s === '') {
    return '""';
  }
  if (/[\s#"']/.test(s) || s.includes('\\')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return s;
}

function assertDbName(name) {
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('数据库名只能包含字母、数字与下划线');
  }
}

function fmtMysqlErr(err) {
  const code = err && err.code ? String(err.code) : '';
  const msg = err instanceof Error ? err.message : String(err);
  return code ? `${msg} (${code})` : msg;
}

/**
 * @param {string} envPath
 * @param {{ host: string; port: number; user: string; password: string; database: string; apiPort: number }} cfg
 */
function writeDesktopEnv(envPath, cfg) {
  const lines = [
    'DB_TYPE=mysql',
    `DB_HOST=${dotenvEscapeLine(cfg.host)}`,
    `DB_PORT=${String(cfg.port)}`,
    `DB_USER=${dotenvEscapeLine(cfg.user)}`,
    `DB_PASSWORD=${dotenvEscapeLine(cfg.password)}`,
    `DB_NAME=${dotenvEscapeLine(cfg.database)}`,
    'DODOGUARD_SKIP_DB_MIGRATIONS=0',
    `API_PORT=${cfg.apiPort}`,
    'BROWSER=none',
    '',
  ];
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
}

/**
 * @param {{ host: string; port: number; user: string; password: string; database?: string; importBundledSql?: boolean }} cfg
 * @param {string} sqlPath
 */
async function testExternalConnection(cfg, sqlPath) {
  const database = cfg.database || DEFAULT_DATABASE;
  assertDbName(database);
  const importBundledSql = cfg.importBundledSql !== false;

  try {
    const conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port || 3306,
      user: cfg.user,
      password: cfg.password,
      database,
    });
    await conn.ping();
    await conn.end();
    return { ok: true, message: '连接成功，目标库已存在。' };
  } catch (e) {
    if (e.code === 'ER_BAD_DB_ERROR') {
      if (!importBundledSql) {
        return {
          ok: false,
          message: `未勾选「导入」时，数据库「${database}」必须已存在。请先在 MySQL 中建库并初始化表结构后再测试。`,
        };
      }
      try {
        const conn2 = await mysql.createConnection({
          host: cfg.host,
          port: cfg.port || 3306,
          user: cfg.user,
          password: cfg.password,
        });
        await conn2.ping();
        await conn2.end();
        return {
          ok: true,
          message: `MySQL 可连；库「${database}」不存在，下一步将自动创建并导入 dodoguard.sql。`,
        };
      } catch (e2) {
        return { ok: false, message: fmtMysqlErr(e2) };
      }
    }
    return { ok: false, message: fmtMysqlErr(e) };
  }
}

/**
 * @param {{ host: string; port: number; user: string; password: string; database?: string; importBundledSql?: boolean }} cfg
 * @param {string} sqlPath
 */
async function importZhianSql(cfg, sqlPath) {
  const database = cfg.database || DEFAULT_DATABASE;
  assertDbName(database);
  const importBundledSql = cfg.importBundledSql !== false;

  if (!importBundledSql) {
    let verifyConn;
    try {
      verifyConn = await mysql.createConnection({
        host: cfg.host,
        port: cfg.port || 3306,
        user: cfg.user,
        password: cfg.password,
        database,
      });
      await verifyConn.ping();
      await verifyConn.end();
    } catch (e) {
      if (verifyConn) {
        try {
          await verifyConn.end();
        } catch {
          /* ignore */
        }
      }
      throw new Error(
        `未勾选导入时，要求目标库「${database}」已存在且账号可连接。${fmtMysqlErr(e)}`,
      );
    }
    return;
  }

  const sqlText = fs.readFileSync(sqlPath, 'utf8');

  let adminConn;
  try {
    adminConn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port || 3306,
      user: cfg.user,
      password: cfg.password,
      multipleStatements: false,
    });
    const escapedDb = `\`${database.replace(/`/g, '``')}\``;
    await adminConn.query(
      `CREATE DATABASE IF NOT EXISTS ${escapedDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await adminConn.end();
    adminConn = null;
  } catch (e) {
    if (adminConn) {
      try {
        await adminConn.end();
      } catch {
        /* ignore */
      }
    }
    throw new Error(`创建数据库失败：${fmtMysqlErr(e)}`);
  }

  let dataConn;
  try {
    dataConn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port || 3306,
      user: cfg.user,
      password: cfg.password,
      database,
      multipleStatements: true,
    });
    await dataConn.query(sqlText);
    await dataConn.end();
  } catch (e) {
    if (dataConn) {
      try {
        await dataConn.end();
      } catch {
        /* ignore */
      }
    }
    throw new Error(`导入 SQL 失败：${fmtMysqlErr(e)}`);
  }
}

module.exports = {
  DEFAULT_DATABASE,
  dotenvEscapeLine,
  assertDbName,
  fmtMysqlErr,
  writeDesktopEnv,
  testExternalConnection,
  importZhianSql,
};
