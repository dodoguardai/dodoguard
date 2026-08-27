import { defineConfig } from 'drizzle-kit';
import { getDbPath, getDbType } from './backend/src/database';
import { getEnvString, getEnvInt } from './backend/src/envars';

const dbType = getDbType();

let config;

if (dbType === 'mysql') {
  // MySQL configuration
  const dbUrl = getEnvString('DATABASE_URL');
  let dbCredentials: {
    url?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    socketPath?: string;
  };

  if (dbUrl) {
    dbCredentials = { url: dbUrl };
  } else {
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

    dbCredentials = dbSocket
      ? {
          user: dbUser,
          password: dbPassword,
          database: dbName,
          socketPath: dbSocket,
        }
      : {
          host: dbHost,
          port: dbPort,
          user: dbUser,
          password: dbPassword,
          database: dbName,
        };
  }

  config = defineConfig({
    dialect: 'mysql',
    schema: './backend/src/database/tables-mysql.ts',
    out: './drizzle',
    dbCredentials,
  });
} else {
  // SQLite configuration (default)
  config = defineConfig({
    dialect: 'turso',
    schema: './backend/src/database/tables.ts',
    out: './drizzle',
    dbCredentials: {
      url: `file:${getDbPath()}`,
    },
  });
}

export default config;
