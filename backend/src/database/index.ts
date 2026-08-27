import '../loadEnv';


import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';

// @ts-ignore - postgres-js is optional, only needed for PostgreSQL
let drizzlePg: any;
// @ts-ignore - postgres is optional, only needed for PostgreSQL
let postgres: any;

import * as path from 'path';

import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import mysql from 'mysql2/promise';
import { getEnvBool, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

export class DrizzleLogWriter implements LogWriter {
  write(message: string) {
    if (getEnvBool('DODOGUARD_ENABLE_DATABASE_LOGS', false)) {
      logger.debug(`Drizzle: ${message}`);
    }
  }
}

let dbInstance: ReturnType<typeof drizzle> | ReturnType<typeof drizzleMysql> | any | null = null;
let sqliteInstance: Database.Database | null = null;
let mysqlConnection: mysql.Pool | null = null;
// @ts-ignore - postgres is optional
let pgConnection: any = null;

const SQLITE_DB_FILE = 'dodoguard.db';

export function getDbPath() {
  const dir = getConfigDirectoryPath(true /* createIfNotExists */);
  return path.resolve(dir, SQLITE_DB_FILE);
}

export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

export function getDbType(): 'sqlite' | 'mysql' | 'postgres' {
  // Empty DB_TYPE in .env is non-undefined → would wrongly fall through to sqlite and disable MySQL-only features (e.g. workflow_config_assets).
  const raw = getEnvString('DB_TYPE', 'mysql').trim().toLowerCase();
  const dbType = raw === '' ? 'mysql' : raw;
  if (dbType === 'postgres' || dbType === 'postgresql') {
    return 'postgres';
  }
  if (dbType === 'mysql' || dbType === 'mariadb') {
    return 'mysql';
  }
  return 'sqlite';
}

export function getDb() {
  if (!dbInstance) {
    const dbType = getDbType();

    if (dbType === 'postgres') {
      try {
        // Dynamically import postgres modules only when needed
        if (!drizzlePg || !postgres) {
          const postgresModule = require('postgres');
          const drizzlePgModule = require('drizzle-orm/postgres-js');
          postgres = postgresModule.default || postgresModule;
          drizzlePg = drizzlePgModule.drizzle;
        }

        // PostgreSQL connection
        const dbUrl = getEnvString('DATABASE_URL');
        if (dbUrl) {
          // Use connection string
          pgConnection = postgres(dbUrl, {
            max: 10,
            idle_timeout: 20,
            connect_timeout: 10,
          });
          logger.info('Connected to PostgreSQL database using DATABASE_URL');
        } else {
          // Build connection string from individual components
          const dbHost = getEnvString('DB_HOST', 'localhost');
          const dbPort = getEnvInt('DB_PORT', 5432);
          const dbUser = getEnvString('DB_USER', 'postgres');
          const dbPassword = getEnvString('DB_PASSWORD', 'password');
          const dbName = getEnvString('DB_NAME', 'dodoguard');

          const connectionString = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
          pgConnection = postgres(connectionString, {
            max: 10,
            idle_timeout: 20,
            connect_timeout: 10,
          });
          logger.info(`Connected to PostgreSQL database: ${dbHost}:${dbPort}/${dbName}`);
        }

        const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
        dbInstance = drizzlePg(pgConnection, { logger: drizzleLogger });
      } catch (error: any) {
        if (
          error.code === 'MODULE_NOT_FOUND' &&
          (error.message?.includes('postgres') ||
            error.requireStack?.some((s: string) => s.includes('postgres')))
        ) {
          logger.error('PostgreSQL module not found. Please install it: npm install postgres');
          throw new Error(
            'PostgreSQL support requires the "postgres" package. Install it with: npm install postgres',
          );
        }
        throw error;
      }
    } else if (dbType === 'mysql') {
      const readPoolInt = (name: string, defaultValue: number) => {
        const raw = process.env[name];
        if (!raw) {
          return defaultValue;
        }
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : defaultValue;
      };
      const poolOptions: mysql.PoolOptions = {
        waitForConnections: true,
        connectionLimit: readPoolInt('DB_POOL_SIZE', 10),
        queueLimit: 0,
        connectTimeout: readPoolInt('DB_CONNECT_TIMEOUT_MS', 30_000),
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      };

      // MySQL connection
      const dbUrl = getEnvString('DATABASE_URL');
      if (dbUrl) {
        mysqlConnection = mysql.createPool({
          uri: dbUrl,
          ...poolOptions,
        });
        logger.info('Connected to MySQL database using DATABASE_URL');
      } else {
        // Build connection string from individual components
        const dbHost = getEnvString('DB_HOST', 'localhost');
        const dbPort = getEnvInt('DB_PORT', 3306);
        const dbUser = getEnvString('DB_USER', 'root');
        const dbPassword = getEnvString('DB_PASSWORD', 'root12345');
        const dbName = getEnvString('DB_NAME', 'dodoguard');
        const dbSocketRaw = getEnvString('DB_SOCKET');
        const dbSocket =
          dbSocketRaw !== undefined && String(dbSocketRaw).trim() !== ''
            ? String(dbSocketRaw).trim()
            : undefined;

        const poolConfig: mysql.PoolOptions = {
          user: dbUser,
          password: dbPassword,
          database: dbName,
          ...poolOptions,
        };

        // 仅当显式设置 DB_SOCKET 时用 Unix socket；默认走 TCP（Docker/远程 MySQL）
        if (dbSocket) {
          poolConfig.socketPath = dbSocket;
          logger.info(`Connected to MySQL database via socket: ${dbSocket}/${dbName}`);
        } else {
          poolConfig.host = dbHost;
          poolConfig.port = dbPort;
          logger.info(`Connected to MySQL database: ${dbHost}:${dbPort}/${dbName}`);
        }

        mysqlConnection = mysql.createPool(poolConfig);
      }

      const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
      dbInstance = drizzleMysql(mysqlConnection, { logger: drizzleLogger });
    } else {
      // SQLite connection (default)
      const isMemoryDb = getEnvBool('IS_TESTING');
      const dbPath = isMemoryDb ? ':memory:' : getDbPath();

      sqliteInstance = new Database(dbPath);

      // Enable foreign key constraints (SQLite requires explicit enabling)
      try {
        sqliteInstance.pragma('foreign_keys = ON');
        logger.debug('Foreign key constraints enabled');
      } catch (err) {
        logger.warn(`Failed to enable foreign key constraints: ${err}`);
      }

      // Configure WAL mode unless explicitly disabled or using in-memory database
      if (!isMemoryDb && !getEnvBool('DODOGUARD_DISABLE_WAL_MODE', false)) {
        try {
          // Enable WAL mode for better concurrency
          sqliteInstance.pragma('journal_mode = WAL');

          // Verify WAL mode was actually enabled
          const result = sqliteInstance.prepare('PRAGMA journal_mode').get() as {
            journal_mode: string;
          };

          if (result.journal_mode.toLowerCase() === 'wal') {
            logger.debug('Successfully enabled SQLite WAL mode');
          } else {
            logger.warn(
              `Failed to enable WAL mode (got '${result.journal_mode}'). ` +
                'Database performance may be reduced. This can happen on network filesystems. ' +
                'Set DODOGUARD_DISABLE_WAL_MODE=true to suppress this warning.',
            );
          }

          // Additional WAL configuration for optimal performance
          sqliteInstance.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
          sqliteInstance.pragma('synchronous = NORMAL'); // Good balance of safety and speed with WAL
        } catch (err) {
          logger.warn(
            `Error configuring SQLite WAL mode: ${err}. ` +
              'Database will use default journal mode. Performance may be reduced. ' +
              'This can happen on network filesystems or certain containerized environments. ' +
              'Set DODOGUARD_DISABLE_WAL_MODE=true to suppress this warning.',
          );
        }
      }

      const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
      dbInstance = drizzle(sqliteInstance, { logger: drizzleLogger });
    }
  }
  return dbInstance;
}

export async function closeDb() {
  if (pgConnection) {
    try {
      await pgConnection.end();
      logger.debug('PostgreSQL database connection closed successfully');
    } catch (err) {
      logger.error(`Error closing PostgreSQL database connection: ${err}`);
    } finally {
      pgConnection = null;
      dbInstance = null;
    }
  }

  if (sqliteInstance) {
    try {
      // Attempt to checkpoint WAL file before closing
      if (!getEnvBool('IS_TESTING') && !getEnvBool('DODOGUARD_DISABLE_WAL_MODE', false)) {
        try {
          sqliteInstance.pragma('wal_checkpoint(TRUNCATE)');
          logger.debug('Successfully checkpointed WAL file before closing');
        } catch (err) {
          logger.debug(`Could not checkpoint WAL file: ${err}`);
        }
      }

      sqliteInstance.close();
      logger.debug('SQLite database connection closed successfully');
    } catch (err) {
      logger.error(`Error closing SQLite database connection: ${err}`);
    } finally {
      sqliteInstance = null;
      dbInstance = null;
    }
  }

  if (mysqlConnection) {
    try {
      await mysqlConnection.end();
      logger.debug('MySQL database connection closed successfully');
    } catch (err) {
      logger.error(`Error closing MySQL database connection: ${err}`);
    } finally {
      mysqlConnection = null;
      dbInstance = null;
    }
  }
}

/**
 * Check if the database is currently open
 */
export function isDbOpen(): boolean {
  return (
    (sqliteInstance !== null || mysqlConnection !== null || pgConnection !== null) &&
    dbInstance !== null
  );
}

/**
 * Get the underlying SQLite instance for direct queries
 * Use with caution - prefer using the drizzle instance when possible
 */
export function getSqliteInstance(): Database.Database | null {
  return sqliteInstance;
}

/**
 * Get the underlying MySQL connection for direct queries
 * Use with caution - prefer using the drizzle instance when possible
 */
export function getMysqlConnection(): mysql.Pool | null {
  return mysqlConnection;
}

/**
 * Get the underlying PostgreSQL connection for direct queries
 * Use with caution - prefer using the drizzle instance when possible
 */
export function getPgConnection(): any {
  return pgConnection;
}

/**
 * Default database instance export
 * This is a convenience export that calls getDb() to get the database instance
 */
export const db = getDb();
