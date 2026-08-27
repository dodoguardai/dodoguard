import * as fs from 'fs';
import * as path from 'path';

import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';
import { getDb, getSqliteInstance, getDbType, getMysqlConnection } from './database/index';
import logger from './logger';
import { initializeBuiltinPlugins } from './dify-pentest/services/pluginInitializer';
import { getEnvString, getEnvInt } from './envars';

/**
 * Verify that a table exists in the database
 */
async function verifyTableExists(tableName: string): Promise<boolean> {
  try {
    const dbType = getDbType();

    if (dbType === 'mysql') {
      const mysqlConn = getMysqlConnection();
      if (!mysqlConn) {
        logger.error('MySQL connection is not available');
        return false;
      }

      // Get database name from environment config instead of DATABASE() function
      // DATABASE() can return NULL in some connection states
      const dbName = getEnvString('DB_NAME', 'dodoguard');

      // Use LOWER() for case-insensitive comparison
      // MySQL table names can be case-sensitive on Linux systems
      const [rows] = (await mysqlConn.execute(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND LOWER(TABLE_NAME) = LOWER(?)',
        [dbName, tableName],
      )) as any[];

      const exists = rows.length > 0;
      if (!exists) {
        logger.debug(`Table ${tableName} not found in database ${dbName}`);
      }
      return exists;
    } else {
      const sqliteInstance = getSqliteInstance();
      if (!sqliteInstance) {
        logger.error('SQLite instance is not available');
        return false;
      }

      const result = sqliteInstance
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName) as { name: string } | undefined;

      return result !== undefined;
    }
  } catch (error: any) {
    const errorCode = error?.code || error?.errno;
    const errorMessage = error?.message || String(error);

    // Check for connection errors
    if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
      logger.error(
        `Cannot connect to MySQL database while verifying table ${tableName}. ` +
          `Please ensure MySQL is running. Error: ${errorMessage}`,
      );
    } else {
      logger.error(`Error verifying table ${tableName}:`, {
        message: errorMessage,
        code: errorCode,
        errno: error?.errno,
      });
    }
    return false;
  }
}

/**
 * When the main `drizzle/` journal is MySQL-only, SQLite cannot apply those SQL files.
 * Use `drizzle/sqlite-bootstrap/` (generated via `drizzle-kit export` from `tables.ts`) instead.
 *
 * Tries `baseDrizzleFolder/sqlite-bootstrap` first (e.g. dist/drizzle after `npm run build`),
 * then `<projectRoot>/drizzle/sqlite-bootstrap` so dev works if dist/ is stale.
 */
function resolveSqliteMigrationsFolder(baseDrizzleFolder: string, projectRoot: string): string {
  const candidates = [
    path.join(baseDrizzleFolder, 'sqlite-bootstrap'),
    path.join(projectRoot, 'drizzle', 'sqlite-bootstrap'),
  ];
  for (const bootstrap of candidates) {
    const journalPath = path.join(bootstrap, 'meta', '_journal.json');
    const baselineSql = path.join(bootstrap, '0000_sqlite_baseline_export.sql');
    if (!fs.existsSync(journalPath) || !fs.existsSync(baselineSql)) {
      continue;
    }
    try {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8')) as { dialect?: string };
      if (journal?.dialect === 'sqlite') {
        return bootstrap;
      }
    } catch {
      continue;
    }
  }
  return baseDrizzleFolder;
}

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 *
 * Note: For SQLite, the underlying drizzle-orm migrate() function is synchronous, we wrap it in a Promise
 * with setImmediate to avoid blocking the event loop during startup. For MySQL, it's async.
 */
export async function runDbMigrations(): Promise<void> {
  if (process.env.DODOGUARD_SKIP_DB_MIGRATIONS === '1') {
    logger.warn('Skipping DB migrations because DODOGUARD_SKIP_DB_MIGRATIONS=1');
    return;
  }

  const dbType = getDbType();
  // Resolve migrations folder in a way that works for both dev (TypeScript) and build output:
  // - In dev, compiled code may run from backend/src, with migrations in <repoRoot>/drizzle
  // - In production, compiled code runs from dist/src, with migrations copied to <repoRoot>/dist/drizzle
  const projectRoot = path.resolve(__dirname, '..', '..');
  const candidatePaths = [
    // Source tree (development)
    path.join(projectRoot, 'drizzle'),
    // Production / build output
    path.join(projectRoot, 'dist', 'drizzle'),
  ];

  const migrationsFolder = candidatePaths.find((p) => fs.existsSync(p)) ?? candidatePaths[0];
  const sqliteMigrationsFolder =
    dbType === 'sqlite'
      ? resolveSqliteMigrationsFolder(migrationsFolder, projectRoot)
      : migrationsFolder;

  // Verify migrations folder exists
  if (!fs.existsSync(migrationsFolder)) {
    const error = new Error(
      `Migrations folder not found at ${migrationsFolder}. ` +
        `Expected Drizzle migrations under either 'drizzle/' (source) or 'dist/drizzle/' (build output) at the project root.`,
    );
    logger.error(error.message);
    throw error;
  }

  logger.info(
    `Running database migrations from: ${dbType === 'sqlite' ? sqliteMigrationsFolder : migrationsFolder} (DB Type: ${dbType})`,
  );

  if (dbType === 'mysql') {
    // MySQL migrations (async)
    try {
      logger.info('Running MySQL schema migration...');

      // Execute table creation statements individually
      const db = getDb();

      // Create tables one by one to avoid issues with complex SQL files
      const tableStatements = [
        // organizations
        `CREATE TABLE IF NOT EXISTS \`organizations\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`name\` VARCHAR(255) NOT NULL,
          \`slug\` VARCHAR(255) NOT NULL,
          \`plan_id\` VARCHAR(36),
          \`subscription_id\` VARCHAR(36),
          \`status\` VARCHAR(20),
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY \`slug_idx\` (\`slug\`),
          KEY \`status_idx\` (\`status\`)
        )`,

        // teams
        `CREATE TABLE IF NOT EXISTS \`teams\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`name\` VARCHAR(255) NOT NULL,
          \`description\` TEXT,
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY \`organization_id_idx\` (\`organization_id\`)
        )`,

        // users
        `CREATE TABLE IF NOT EXISTS \`users\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36),
          \`email\` VARCHAR(255) NOT NULL,
          \`name\` VARCHAR(255),
          \`avatar\` VARCHAR(500),
          \`role\` VARCHAR(50),
          \`status\` VARCHAR(20),
          \`email_verified\` BOOLEAN DEFAULT FALSE,
          \`password_hash\` VARCHAR(255),
          \`mfa_enabled\` BOOLEAN DEFAULT FALSE,
          \`mfa_secret\` VARCHAR(255),
          \`last_login_at\` TIMESTAMP,
          \`last_activity_at\` TIMESTAMP,
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY \`email_idx\` (\`email\`),
          KEY \`organization_id_idx\` (\`organization_id\`)
        )`,

        // Basic tables created, now add foreign key constraints
        `ALTER TABLE \`teams\` ADD CONSTRAINT \`teams_organization_id_fk\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE`,
        `ALTER TABLE \`users\` ADD CONSTRAINT \`users_organization_id_fk\` FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE`,

        // user_teams junction table
        `CREATE TABLE IF NOT EXISTS \`user_teams\` (
          \`user_id\` VARCHAR(36) NOT NULL,
          \`team_id\` VARCHAR(36) NOT NULL,
          \`role\` VARCHAR(50) DEFAULT 'member',
          \`permissions\` JSON,
          \`joined_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`user_id\`, \`team_id\`),
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE CASCADE,
          INDEX \`idx_user_teams_user_id\` (\`user_id\`),
          INDEX \`idx_user_teams_team_id\` (\`team_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // dify_plugins table (required for existing functionality)
        `CREATE TABLE IF NOT EXISTS \`dify_plugins\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`name\` VARCHAR(255) NOT NULL,
          \`description\` TEXT,
          \`version\` VARCHAR(50) NOT NULL DEFAULT '1.0.0',
          \`author\` VARCHAR(255),
          \`homepage\` VARCHAR(500),
          \`enabled\` BOOLEAN NOT NULL DEFAULT TRUE,
          \`metadata\` TEXT,
          \`installed_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY \`dify_plugins_enabled_idx\` (\`enabled\`)
        )`,

        // roles table
        `CREATE TABLE IF NOT EXISTS \`roles\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`name\` VARCHAR(255) NOT NULL,
          \`description\` TEXT,
          \`type\` VARCHAR(20) DEFAULT 'custom',
          \`permissions\` JSON,
          \`is_default\` BOOLEAN DEFAULT false,
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE,
          UNIQUE KEY \`roles_org_name_idx\` (\`organization_id\`, \`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // permissions table
        `CREATE TABLE IF NOT EXISTS \`permissions\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`name\` VARCHAR(255) UNIQUE NOT NULL,
          \`resource\` VARCHAR(100),
          \`action\` VARCHAR(50),
          \`scope\` VARCHAR(20) DEFAULT 'organization',
          \`description\` TEXT,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          UNIQUE KEY \`permissions_name_idx\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // system_configs table
        `CREATE TABLE IF NOT EXISTS \`system_configs\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`category\` VARCHAR(50) NOT NULL,
          \`key\` VARCHAR(255) UNIQUE NOT NULL,
          \`value\` JSON,
          \`type\` VARCHAR(20) NOT NULL DEFAULT 'string',
          \`description\` TEXT,
          \`editable\` BOOLEAN DEFAULT true,
          \`requires_restart\` BOOLEAN DEFAULT false,
          \`updated_by\` VARCHAR(36),
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
          INDEX \`system_configs_category_idx\` (\`category\`),
          UNIQUE KEY \`system_configs_key_unique\` (\`key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // feature_flags table
        `CREATE TABLE IF NOT EXISTS \`feature_flags\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`name\` VARCHAR(255) UNIQUE NOT NULL,
          \`enabled\` BOOLEAN DEFAULT false,
          \`description\` TEXT,
          \`affects\` JSON DEFAULT '[]',
          \`updated_by\` VARCHAR(36),
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
          UNIQUE KEY \`feature_flags_name_idx\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // integration_configs table
        `CREATE TABLE IF NOT EXISTS \`integration_configs\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`type\` VARCHAR(50) NOT NULL COMMENT 'llm, vector_db, payment, sso, webhook, email, sms',
          \`name\` VARCHAR(255) NOT NULL,
          \`provider\` VARCHAR(100),
          \`config\` JSON,
          \`enabled\` BOOLEAN DEFAULT false,
          \`test_status\` VARCHAR(20) COMMENT 'success, failed, pending',
          \`last_tested\` TIMESTAMP NULL,
          \`updated_by\` VARCHAR(36),
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
          INDEX \`integration_configs_type_idx\` (\`type\`),
          INDEX \`integration_configs_enabled_idx\` (\`enabled\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // subscription_plans table
        `CREATE TABLE IF NOT EXISTS \`subscription_plans\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`name\` VARCHAR(255) NOT NULL,
          \`type\` VARCHAR(50) NOT NULL,
          \`price_monthly\` DECIMAL(10,2),
          \`price_quarterly\` DECIMAL(10,2),
          \`price_yearly\` DECIMAL(10,2),
          \`quotas\` JSON,
          \`features\` JSON,
          \`enabled\` BOOLEAN DEFAULT TRUE,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY \`type_idx\` (\`type\`),
          KEY \`enabled_idx\` (\`enabled\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // organization_subscriptions table
        `CREATE TABLE IF NOT EXISTS \`organization_subscriptions\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`plan_id\` VARCHAR(36) NOT NULL,
          \`billing_cycle\` VARCHAR(20) NOT NULL,
          \`status\` VARCHAR(20) NOT NULL,
          \`current_period_start\` TIMESTAMP,
          \`current_period_end\` TIMESTAMP,
          \`cancel_at_period_end\` BOOLEAN DEFAULT FALSE,
          \`price\` DECIMAL(10,2) NOT NULL,
          \`currency\` VARCHAR(10) DEFAULT 'USD',
          \`payment_method_id\` VARCHAR(255),
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY \`organization_id_idx\` (\`organization_id\`),
          KEY \`plan_id_idx\` (\`plan_id\`),
          KEY \`status_idx\` (\`status\`),
          KEY \`period_idx\` (\`current_period_start\`, \`current_period_end\`),
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`plan_id\`) REFERENCES \`subscription_plans\`(\`id\`) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // usage_records table
        `CREATE TABLE IF NOT EXISTS \`usage_records\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`team_id\` VARCHAR(36),
          \`user_id\` VARCHAR(36),
          \`metric\` VARCHAR(100) NOT NULL,
          \`quantity\` INT NOT NULL,
          \`period\` VARCHAR(7) NOT NULL,
          \`timestamp\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`metadata\` JSON,
          KEY \`org_period_idx\` (\`organization_id\`, \`period\`),
          KEY \`metric_idx\` (\`metric\`),
          KEY \`timestamp_idx\` (\`timestamp\`),
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // quota_usage table (composite primary key)
        `CREATE TABLE IF NOT EXISTS \`quota_usage\` (
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`period\` VARCHAR(7) NOT NULL,
          \`quotas\` JSON NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (\`organization_id\`, \`period\`),
          KEY \`period_idx\` (\`period\`),
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // vulnerabilities table (required for attack_commands, attack_results)
        `CREATE TABLE IF NOT EXISTS \`vulnerabilities\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`avd_id\` VARCHAR(50) NOT NULL,
          \`name\` VARCHAR(255) NOT NULL,
          \`type\` VARCHAR(20) NOT NULL,
          \`category\` VARCHAR(100),
          \`risk_level\` VARCHAR(20) NOT NULL,
          \`status\` VARCHAR(20) NOT NULL,
          \`disclosed_at\` TIMESTAMP NULL,
          \`description\` TEXT,
          \`affected_targets\` JSON,
          \`impact_scope\` TEXT,
          \`cwe_id\` VARCHAR(20),
          \`mitre_id\` VARCHAR(50),
          \`owasp_id\` VARCHAR(50),
          \`owasp_llm_top10_mapping\` JSON,
          \`exploitability\` JSON,
          \`patch_status\` JSON,
          \`audit_notes\` TEXT,
          \`tags\` JSON,
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          \`created_by\` VARCHAR(36),
          \`updated_by\` VARCHAR(36),
          UNIQUE KEY \`avd_id_idx\` (\`avd_id\`),
          KEY \`type_idx\` (\`type\`),
          KEY \`risk_level_idx\` (\`risk_level\`),
          KEY \`status_idx\` (\`status\`),
          KEY \`category_idx\` (\`category\`),
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
          FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // attack_commands table (depends on vulnerabilities)
        `CREATE TABLE IF NOT EXISTS \`attack_commands\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`vulnerability_id\` VARCHAR(36) NOT NULL,
          \`name\` VARCHAR(255) NOT NULL,
          \`content\` TEXT NOT NULL,
          \`attack_mode\` VARCHAR(20) NOT NULL,
          \`expected_success\` TEXT,
          \`non_vulnerability\` TEXT,
          \`risk_level\` VARCHAR(20),
          \`enabled\` BOOLEAN DEFAULT TRUE,
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY \`vulnerability_id_idx\` (\`vulnerability_id\`),
          KEY \`attack_mode_idx\` (\`attack_mode\`),
          KEY \`enabled_idx\` (\`enabled\`),
          FOREIGN KEY (\`vulnerability_id\`) REFERENCES \`vulnerabilities\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // attack_tasks table (depends on organizations, teams, users)
        `CREATE TABLE IF NOT EXISTS \`attack_tasks\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`team_id\` VARCHAR(36),
          \`user_id\` VARCHAR(36) NOT NULL,
          \`name\` VARCHAR(255) NOT NULL,
          \`description\` TEXT,
          \`target_type\` VARCHAR(50),
          \`target_config\` JSON,
          \`vulnerabilities\` JSON,
          \`attack_mode\` VARCHAR(20),
          \`composite_attack_config\` JSON,
          \`detection_config\` JSON,
          \`agent_config\` JSON,
          \`status\` VARCHAR(20),
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          KEY \`attack_tasks_organization_id_idx\` (\`organization_id\`),
          KEY \`attack_tasks_status_idx\` (\`status\`),
          KEY \`attack_tasks_org_status_created_idx\` (\`organization_id\`, \`status\`, \`created_at\`),
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE SET NULL,
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // attack_results table (depends on attack_tasks, vulnerabilities, attack_commands)
        `CREATE TABLE IF NOT EXISTS \`attack_results\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`task_id\` VARCHAR(36) NOT NULL,
          \`vulnerability_id\` VARCHAR(36),
          \`command_id\` VARCHAR(36),
          \`attack_mode\` VARCHAR(20),
          \`request\` JSON,
          \`response\` JSON,
          \`conversation_history\` JSON,
          \`detection_results\` JSON,
          \`final_verdict\` JSON,
          \`agent_actions\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`metadata\` JSON,
          KEY \`attack_results_task_id_idx\` (\`task_id\`),
          KEY \`attack_results_vulnerability_id_idx\` (\`vulnerability_id\`),
          FOREIGN KEY (\`task_id\`) REFERENCES \`attack_tasks\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`vulnerability_id\`) REFERENCES \`vulnerabilities\`(\`id\`) ON DELETE SET NULL,
          FOREIGN KEY (\`command_id\`) REFERENCES \`attack_commands\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // target_agents table (depends on organizations, teams)
        `CREATE TABLE IF NOT EXISTS \`target_agents\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`team_id\` VARCHAR(36),
          \`name\` VARCHAR(255) NOT NULL,
          \`description\` TEXT,
          \`type\` VARCHAR(20),
          \`icon\` VARCHAR(50),
          \`config\` JSON,
          \`metadata\` JSON,
          \`status\` VARCHAR(20),
          \`health_status\` JSON,
          \`statistics\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          KEY \`target_agents_organization_id_idx\` (\`organization_id\`),
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`team_id\`) REFERENCES \`teams\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // managed_llm_models table (depends on organizations)
        `CREATE TABLE IF NOT EXISTS \`managed_llm_models\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`name\` VARCHAR(255) NOT NULL,
          \`provider\` VARCHAR(100) NOT NULL,
          \`model_key\` VARCHAR(255) NOT NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'active',
          \`health_status\` VARCHAR(20) NOT NULL DEFAULT 'unknown',
          \`quota_monthly\` INT NOT NULL DEFAULT 100000,
          \`quota_used\` INT NOT NULL DEFAULT 0,
          \`provider_config\` JSON,
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          KEY \`managed_llm_models_org_idx\` (\`organization_id\`),
          KEY \`managed_llm_models_org_status_idx\` (\`organization_id\`, \`status\`),
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // report_templates table
        `CREATE TABLE IF NOT EXISTS \`report_templates\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`name\` VARCHAR(255) NOT NULL,
          \`description\` TEXT,
          \`html_template\` TEXT,
          \`styles\` TEXT,
          \`sections\` JSON,
          \`enabled\` BOOLEAN DEFAULT TRUE,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          KEY \`report_templates_enabled_idx\` (\`enabled\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // reports table (depends on attack_tasks, organizations, report_templates)
        `CREATE TABLE IF NOT EXISTS \`reports\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`task_id\` VARCHAR(36) NOT NULL,
          \`organization_id\` VARCHAR(36) NOT NULL,
          \`template_id\` VARCHAR(36),
          \`format\` VARCHAR(10) NOT NULL,
          \`content\` TEXT,
          \`file_path\` VARCHAR(500),
          \`file_size\` BIGINT,
          \`metadata\` JSON,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          KEY \`reports_task_id_idx\` (\`task_id\`),
          KEY \`reports_organization_id_idx\` (\`organization_id\`),
          KEY \`reports_template_id_idx\` (\`template_id\`),
          KEY \`reports_format_idx\` (\`format\`),
          FOREIGN KEY (\`task_id\`) REFERENCES \`attack_tasks\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`organization_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`template_id\`) REFERENCES \`report_templates\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // agent_attack_history table (depends on target_agents, attack_tasks, reports)
        `CREATE TABLE IF NOT EXISTS \`agent_attack_history\` (
          \`id\` VARCHAR(36) PRIMARY KEY,
          \`agent_id\` VARCHAR(36) NOT NULL,
          \`task_id\` VARCHAR(36) NOT NULL,
          \`task_name\` VARCHAR(255),
          \`status\` VARCHAR(20),
          \`vulnerabilities_found\` JSON,
          \`start_time\` TIMESTAMP NULL,
          \`end_time\` TIMESTAMP NULL,
          \`duration\` INT,
          \`report_id\` VARCHAR(36),
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          KEY \`agent_attack_history_agent_id_idx\` (\`agent_id\`),
          KEY \`agent_attack_history_task_id_idx\` (\`task_id\`),
          FOREIGN KEY (\`agent_id\`) REFERENCES \`target_agents\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`task_id\`) REFERENCES \`attack_tasks\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`report_id\`) REFERENCES \`reports\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

        // __drizzle_migrations table (required by Drizzle)
        `CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
          \`id\` SERIAL PRIMARY KEY,
          \`hash\` TEXT NOT NULL,
          \`created_at\` BIGINT
        )`,
      ];

      // Test MySQL connection before executing migrations
      try {
        const mysqlConn = getMysqlConnection();
        if (!mysqlConn) {
          throw new Error('MySQL connection pool is not available');
        }
        // Try a simple query to verify connection
        await mysqlConn.execute('SELECT 1');
        logger.info('MySQL connection verified successfully');
      } catch (connError: any) {
        const errorCode = connError?.code || connError?.errno;
        const errorMessage = connError?.message || String(connError);

        if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
          const dbHost = getEnvString('DB_HOST', 'localhost');
          const dbPort = getEnvInt('DB_PORT', 3306);
          const dbSocket = process.env.DB_SOCKET ?? '';
          const connectionInfo = dbSocket ? `socket: ${dbSocket}` : `${dbHost}:${dbPort}`;

          const error = new Error(
            `Cannot connect to MySQL database at ${connectionInfo}. ` +
              `Please ensure MySQL is running and accessible. ` +
              `Error: ${errorMessage}`,
          );
          logger.error(error.message);
          throw error;
        }
        throw connError;
      }

      // Execute each statement
      for (const statement of tableStatements) {
        try {
          await db.execute(sql.raw(statement));
          logger.debug(`Executed: ${statement.substring(0, 50)}...`);
        } catch (error: any) {
          const errorCode = error?.code || error?.errno;
          const errorMessage = error?.message || String(error);

          // Check for connection errors
          if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
            const dbHost = getEnvString('DB_HOST', 'localhost');
            const dbPort = getEnvInt('DB_PORT', 3306);
            const dbSocket = process.env.DB_SOCKET ?? '';
            const connectionInfo = dbSocket ? `socket: ${dbSocket}` : `${dbHost}:${dbPort}`;

            const connError = new Error(
              `Lost connection to MySQL database at ${connectionInfo} during migration. ` +
                `Please ensure MySQL is running. Error: ${errorMessage}`,
            );
            logger.error(connError.message);
            throw connError;
          }

          // Ignore table already exists errors
          if (
            !errorMessage.includes('already exists') &&
            !errorMessage.includes('Duplicate key name')
          ) {
            logger.warn(`Non-critical error executing statement: ${errorMessage}`);
          }
        }
      }

      // Seed initial subscription plans (Free, Starter, Professional, Enterprise)
      logger.info('Seeding initial subscription plans...');
      const seedPlansStatements = [
        // Free Plan (7-day trial)
        `INSERT INTO \`subscription_plans\` (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
         SELECT 
           'plan-free-001',
           'Free',
           'free',
           0.00,
           0.00,
           0.00,
           '{"targetAgents":3,"attackTasksPerMonth":10,"teams":1,"teamMembers":1,"auditLogRetentionDays":0}',
           '["basic_dashboard","basic_reports","simple_attack_mode","rule_detection","community_support","7_day_trial"]',
           true
         WHERE NOT EXISTS (SELECT 1 FROM \`subscription_plans\` WHERE type = 'free')`,

        // Starter Plan
        `INSERT INTO \`subscription_plans\` (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
         SELECT 
           'plan-starter-001',
           'Starter',
           'starter',
           39.99,
           107.99,
           399.99,
           '{"targetAgents":10,"attackTasksPerMonth":100,"teams":3,"teamMembers":5,"auditLogRetentionDays":0}',
           '["advanced_dashboard","custom_reports","pdf_reports","conversation_attack_mode","llm_detection","email_support","api_access","webhook_integration","team_collaboration","basic_rbac"]',
           true
         WHERE NOT EXISTS (SELECT 1 FROM \`subscription_plans\` WHERE type = 'starter')`,

        // Professional Plan
        `INSERT INTO \`subscription_plans\` (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
         SELECT 
           'plan-professional-001',
           'Professional',
           'professional',
           129.99,
           349.99,
           1299.99,
           '{"targetAgents":50,"attackTasksPerMonth":500,"teams":10,"teamMembers":20,"auditLogRetentionDays":90}',
           '["all_starter_features","composite_attack_mode","agent_driven_attacks","knowledge_base_detection","advanced_integrations","sso_auth","slack_integration","teams_integration","priority_support","audit_logs","custom_integrations","advanced_reports","data_export","ip_whitelist","advanced_rbac"]',
           true
         WHERE NOT EXISTS (SELECT 1 FROM \`subscription_plans\` WHERE type = 'professional')`,

        // Enterprise Plan - Custom Pricing (includes ALL features)
        `INSERT INTO \`subscription_plans\` (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
         SELECT 
           'plan-enterprise-001',
           'Enterprise',
           'enterprise',
           NULL,
           NULL,
           NULL,
           '{"targetAgents":-1,"attackTasksPerMonth":-1,"teams":-1,"teamMembers":-1,"auditLogRetentionDays":365}',
           '["basic_dashboard","advanced_dashboard","basic_reports","custom_reports","pdf_reports","advanced_reports","simple_attack_mode","conversation_attack_mode","composite_attack_mode","agent_driven_attacks","rule_detection","llm_detection","knowledge_base_detection","community_support","email_support","priority_support","dedicated_support","api_access","webhook_integration","advanced_integrations","custom_integrations","slack_integration","teams_integration","team_collaboration","basic_rbac","advanced_rbac","sso_auth","audit_logs","data_export","ip_whitelist","unlimited_quotas","white_label","custom_feature_development","on_premise_deployment","sla_guarantee","compliance_support","soc2_compliance","iso27001_compliance","gdpr_compliance","advanced_analytics","bi_integration","multi_region_deployment","custom_dashboard","advanced_security","4h_support_response","custom_pricing","7_day_trial"]',
           true
         WHERE NOT EXISTS (SELECT 1 FROM \`subscription_plans\` WHERE type = 'enterprise')`,
      ];

      for (const seedStatement of seedPlansStatements) {
        try {
          await db.execute(sql.raw(seedStatement));
          logger.debug(`Seeded subscription plan`);
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          // Ignore duplicate key errors (plan already exists)
          if (
            !errorMessage.includes('Duplicate entry') &&
            !errorMessage.includes('already exists')
          ) {
            logger.warn(`Error seeding subscription plan: ${errorMessage}`);
          }
        }
      }
      logger.info('Subscription plans seeding completed');

      logger.info('MySQL database schema migration completed');

      // Execute additional migration files from drizzle directory
      try {
        logger.info('Checking for additional migration files...');
        const migrationFiles = fs
          .readdirSync(migrationsFolder)
          // Only execute versioned migration files (e.g. 0031_xxx.sql).
          // This prevents running full DB dump snapshots by mistake (e.g. dodoguard0412.sql).
          .filter(
            (file) =>
              file.endsWith('.sql') &&
              file !== '0030_mysql_schema_migration.sql' &&
              /^\d{4}_.*\.sql$/.test(file),
          )
          .sort(); // Sort to ensure execution order

        for (const migrationFile of migrationFiles) {
          const migrationPath = path.join(migrationsFolder, migrationFile);
          logger.info(`Executing migration file: ${migrationFile}`);

          const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

          // Better SQL splitting: handle multi-line statements properly
          // Remove comments first
          let cleanSQL = migrationSQL
            .split('\n')
            .filter((line) => !line.trim().startsWith('--') && line.trim() !== '')
            .join('\n');

          // Remove block comments
          cleanSQL = cleanSQL.replace(/\/\*[\s\S]*?\*\//g, '');

          // Split by semicolon, but keep track of statement boundaries
          const statements: string[] = [];
          let currentStatement = '';

          for (const line of cleanSQL.split('\n')) {
            const trimmedLine = line.trim();
            if (!trimmedLine) { continue; }

            currentStatement += (currentStatement ? '\n' : '') + line;

            // Check if line ends with semicolon (statement complete)
            if (trimmedLine.endsWith(';')) {
              const statement = currentStatement.trim();
              if (statement && statement !== ';') {
                statements.push(statement);
              }
              currentStatement = '';
            }
          }

          // Add any remaining statement (shouldn't happen with proper SQL, but just in case)
          if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
          }

          for (const statement of statements) {
            if (statement.trim()) {
              try {
                await db.execute(sql.raw(statement));
                logger.debug(`Executed: ${statement.substring(0, 80)}...`);
              } catch (error: any) {
                const errorMessage = error?.message || String(error);
                // Ignore table/index already exists errors (these are expected if running migration multiple times)
                if (
                  !errorMessage.includes('already exists') &&
                  !errorMessage.includes('Duplicate key name') &&
                  !errorMessage.includes('Duplicate column name') &&
                  !errorMessage.includes('Duplicate index name') &&
                  !errorMessage.includes('key name') &&
                  !errorMessage.includes('ER_DUP_KEYNAME')
                ) {
                  logger.warn(
                    `Non-critical error executing statement from ${migrationFile}: ${errorMessage}`,
                  );
                } else {
                  logger.debug(`Skipped (already exists): ${statement.substring(0, 60)}...`);
                }
              }
            }
          }
          logger.info(`Completed migration file: ${migrationFile}`);
        }
      } catch (migrationFileError: any) {
        logger.warn(
          `Error processing additional migration files (non-critical): ${migrationFileError?.message || migrationFileError}`,
        );
        // Don't throw - allow migration to continue even if additional files fail
      }

      // Pure YAML config scan task (metadata.taskKind config_static); wizard requires task_types.code match.
      const seedDifyConfigStaticTaskType = `INSERT INTO \`task_types\` (id, code, name, platform_family, default_scan_mode, default_report_type, description, enabled)
SELECT 'a1b2c3d4-e5f6-4a7b-8c9d-111111111105', 'dify_config_static', 'Dify 纯配置 YAML 扫描', 'dify', 'static', 'dify_config', '基于导出 YAML 的规则与命令准则检测（不调用发布 API）', TRUE
WHERE NOT EXISTS (SELECT 1 FROM \`task_types\` WHERE code = 'dify_config_static')`;
      try {
        await db.execute(sql.raw(seedDifyConfigStaticTaskType));
        logger.info('Ensured task_types row for dify_config_static (if table exists)');
      } catch (seedTaskTypeErr: any) {
        const msg = seedTaskTypeErr?.message || String(seedTaskTypeErr);
        if (!msg.includes("doesn't exist") && !msg.includes('Unknown table')) {
          logger.warn(`Could not seed dify_config_static task type: ${msg}`);
        }
      }

      const seedCommercialApiScanTaskType = `INSERT INTO \`task_types\` (id, code, name, platform_family, default_scan_mode, default_report_type, description, enabled)
SELECT 'b2c3d4e5-f6a7-4b8c-9d0e-222222222206', 'commercial_api_scan', '商业 API 黑盒安全扫描', 'custom_api', 'runtime', 'api_blackbox', '针对第三方 Custom API（OpenAI 兼容 / LangServe）的运行时黑盒安全检测', TRUE
WHERE NOT EXISTS (SELECT 1 FROM \`task_types\` WHERE code = 'commercial_api_scan')`;
      try {
        await db.execute(sql.raw(seedCommercialApiScanTaskType));
        logger.info('Ensured task_types row for commercial_api_scan (if table exists)');
      } catch (seedCommercialApiErr: any) {
        const msg = seedCommercialApiErr?.message || String(seedCommercialApiErr);
        if (!msg.includes("doesn't exist") && !msg.includes('Unknown table')) {
          logger.warn(`Could not seed commercial_api_scan task type: ${msg}`);
        }
      }

      // Verify critical tables exist after migration
      logger.info('Verifying required tables exist after migration...');
      const requiredTables = [
        'organizations',
        'users',
        'dify_plugins',
        'roles',
        'permissions',
        '__drizzle_migrations',
      ];
      const missingTables: string[] = [];

      for (const tableName of requiredTables) {
        const exists = await verifyTableExists(tableName);
        logger.info(`Table ${tableName} exists: ${exists}`);
        if (!exists) {
          missingTables.push(tableName);
        }
      }

      if (missingTables.length > 0) {
        const error = new Error(
          `Migration completed but required tables are missing: ${missingTables.join(', ')}. ` +
            'This may indicate that migrations did not execute properly. ' +
            'Please check the migration files and ensure they are being applied correctly.',
        );
        logger.error(error.message);
        throw error;
      }

      logger.info('Verified required tables exist after migration');

      // 初始化内置插件（仅在首次安装时）
      try {
        await initializeBuiltinPlugins();
        logger.debug('Builtin plugins initialization completed');
      } catch (error: any) {
        // Plugin initialization failure is non-critical, but log it
        logger.warn(`Plugin initialization failed (non-critical): ${error?.message || error}`);
        // Don't throw - allow migration to succeed even if plugin init fails
      }
      return; // MySQL migration is complete, return early
    } catch (migrationError: any) {
      const errorMessage = migrationError?.message || String(migrationError);
      logger.error(`MySQL migration failed: ${errorMessage}`);
      throw migrationError;
    }
  } else {
    // SQLite migrations (sync, wrapped in Promise)
    return new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          const db = getDb();
          try {
            // Temporarily disable foreign key checks to allow migrations with foreign key constraints
            // to execute successfully even if referenced tables don't exist yet
            const sqliteInstance = getSqliteInstance();
            if (sqliteInstance) {
              const originalFkState = sqliteInstance.prepare('PRAGMA foreign_keys').get() as {
                foreign_keys: number;
              };
              const fkWasEnabled = originalFkState.foreign_keys === 1;

              if (fkWasEnabled) {
                logger.debug('Temporarily disabling foreign key checks for migration');
                sqliteInstance.pragma('foreign_keys = OFF');
              }

              try {
                if (dbType !== 'sqlite' || !db) {
                  throw new Error('Expected SQLite database but got different type or null');
                }
                migrateSqlite(db as any, { migrationsFolder: sqliteMigrationsFolder });
                logger.info('SQLite database migrations completed');

                // Re-enable foreign key checks if they were enabled before
                if (fkWasEnabled) {
                  sqliteInstance.pragma('foreign_keys = ON');
                  logger.debug('Re-enabled foreign key checks');
                }
              } catch (migrationError: any) {
                // Re-enable foreign key checks even if migration failed
                if (fkWasEnabled) {
                  sqliteInstance.pragma('foreign_keys = ON');
                }

                // Check if error is due to recoverable issues
                // Drizzle errors may have the actual error in cause.message
                const errorMessage = migrationError?.message || String(migrationError);
                const causeMessage = (migrationError as any)?.cause?.message || '';
                // Try to extract SQLite error from various error properties
                const sqliteError =
                  (migrationError as any)?.cause?.cause?.message ||
                  (migrationError as any)?.cause?.cause ||
                  (migrationError as any)?.sqliteError ||
                  (migrationError as any)?.code ||
                  '';
                const fullErrorMessage = `${errorMessage} ${causeMessage} ${sqliteError}`.trim();

                // Check if the error is because a table already exists (which is fine with IF NOT EXISTS)
                // or if it's a query execution error that might be recoverable
                const isRecoverable =
                  fullErrorMessage.includes('table already exists') ||
                  fullErrorMessage.includes('already exists') ||
                  fullErrorMessage.includes('duplicate column name') ||
                  fullErrorMessage.includes('duplicate index') ||
                  fullErrorMessage.includes('UNIQUE constraint failed') ||
                  (fullErrorMessage.includes('Failed to run the query') &&
                    (fullErrorMessage.includes('already exists') ||
                      fullErrorMessage.includes('CREATE TABLE')));

                // Check for "no such table" errors (including when wrapped in "Failed to run the query")
                const isMissingTableError =
                  fullErrorMessage.includes('no such table') ||
                  fullErrorMessage.includes('no such table:') ||
                  (fullErrorMessage.includes('Failed to run the query') &&
                    (fullErrorMessage.toLowerCase().includes('no such table') ||
                      (fullErrorMessage.toLowerCase().includes('table') &&
                        fullErrorMessage.toLowerCase().includes('not exist'))));

                if (isRecoverable) {
                  logger.warn(
                    `Migration encountered recoverable error (table/index may already exist): ${fullErrorMessage.substring(0, 300)}. ` +
                      `This is expected if tables were created manually. Continuing...`,
                  );
                  // Don't fail completely - tables may already exist from manual creation
                  logger.info(
                    'Migration execution completed with warnings (some operations may have been skipped)',
                  );
                } else if (isMissingTableError) {
                  // Missing table errors indicate a migration dependency issue
                  // In build mode, this is a critical error
                  const isBuildMode =
                    process.env.DODOGUARD_CONFIG_DIR === '/tmp/db-init' ||
                    process.env.DODOGUARD_CONFIG_DIR === '/tmp/db-init' ||
                    process.env.DOCKER_BUILD === '1' ||
                    process.env.CI === 'true';

                  if (isBuildMode) {
                    // Log full error details including stack trace and cause
                    logger.error(`Migration failed during build: Missing table error`);
                    logger.error(`Error message: ${errorMessage}`);
                    logger.error(`Cause message: ${causeMessage}`);
                    logger.error(`Full error: ${fullErrorMessage.substring(0, 1000)}`);
                    if (migrationError?.stack) {
                      logger.error(`Stack trace: ${migrationError.stack.substring(0, 500)}`);
                    }
                    throw migrationError;
                  } else {
                    logger.warn(
                      `Migration encountered missing table error: ${fullErrorMessage.substring(0, 300)}. ` +
                        `This may indicate a migration dependency issue. Continuing...`,
                    );
                    logger.info('Migration execution completed with warnings');
                  }
                } else {
                  // For other errors, check if we're in build mode (strict mode)
                  const isBuildMode =
                    process.env.DODOGUARD_CONFIG_DIR === '/tmp/db-init' ||
                    process.env.DODOGUARD_CONFIG_DIR === '/tmp/db-init' ||
                    process.env.DOCKER_BUILD === '1' ||
                    process.env.CI === 'true';

                  if (isBuildMode) {
                    // In build mode, we must fail on any migration error
                    // Extract the actual SQLite error message
                    const actualError = sqliteError || causeMessage || errorMessage;
                    // Try to extract just the error part, not the full SQL
                    const errorMatch = actualError.match(
                      /(?:near|syntax error|no such table|UNIQUE constraint|FOREIGN KEY constraint)[^:]*:?\s*(.+?)(?:\n|$)/i,
                    );
                    const shortError = errorMatch
                      ? errorMatch[1].substring(0, 200)
                      : actualError.substring(0, 200);

                    logger.error(`Migration failed during build`);
                    logger.error(`Error: ${shortError}`);
                    if (errorMessage.length > 200) {
                      logger.error(
                        `Full error message (truncated): ${errorMessage.substring(0, 200)}...`,
                      );
                    }
                    throw migrationError;
                  } else {
                    // In runtime mode, check if critical tables exist - if they do, we can continue
                    logger.error(`Migration failed: ${fullErrorMessage.substring(0, 500)}`);
                    const criticalTablesExist =
                      (await verifyTableExists('dify_plugins')) &&
                      (await verifyTableExists('__drizzle_migrations'));

                    if (criticalTablesExist) {
                      logger.warn('Critical tables exist, continuing despite migration error');
                    } else {
                      throw migrationError;
                    }
                  }
                }
              }
            } else {
              // Fallback to normal migration if we can't access sqlite instance
              try {
                if (dbType !== 'sqlite' || !db) {
                  throw new Error('Expected SQLite database but got different type or null');
                }
                migrateSqlite(db as any, { migrationsFolder: sqliteMigrationsFolder });
                logger.info('SQLite database migrations completed');
              } catch (migrationError: any) {
                const errorMessage = migrationError?.message || String(migrationError);
                // Check if critical tables exist before failing
                const criticalTablesExist =
                  (await verifyTableExists('dify_plugins')) &&
                  (await verifyTableExists('__drizzle_migrations'));

                if (criticalTablesExist) {
                  logger.warn(
                    `Migration failed but critical tables exist: ${errorMessage.substring(0, 200)}. Continuing...`,
                  );
                } else {
                  throw migrationError;
                }
              }
            }
          } catch (migrationError: any) {
            // Handle errors from the inner try block
            const errorMessage = migrationError?.message || String(migrationError);
            logger.error(`Migration error in inner try block: ${errorMessage}`);
            throw migrationError;
          }
        } catch (migrationError: any) {
          // Final check - if critical tables exist, we can continue
          const criticalTablesExist =
            (await verifyTableExists('dify_plugins')) &&
            (await verifyTableExists('__drizzle_migrations'));

          if (criticalTablesExist) {
            logger.warn(
              `Migration encountered error but critical tables exist: ${migrationError?.message || migrationError}. ` +
                `Continuing with application startup...`,
            );
            // Don't reject - allow application to continue
          } else {
            const error = new Error(
              `Migration failed: ${migrationError?.message || migrationError}`,
            );
            logger.error(error.message);
            reject(error);
            return;
          }
        }

        // Verify critical tables exist after migration
        logger.info('Verifying required tables exist after migration...');
        const requiredTables = ['dify_plugins', '__drizzle_migrations'];
        const missingTables: string[] = [];

        for (const tableName of requiredTables) {
          const exists = await verifyTableExists(tableName);
          logger.info(`Table ${tableName} exists: ${exists}`);
          if (!exists) {
            missingTables.push(tableName);
          }
        }

        if (missingTables.length > 0) {
          const error = new Error(
            `Migration completed but required tables are missing: ${missingTables.join(', ')}. ` +
              'This may indicate that migrations did not execute properly. ' +
              'Please check the migration files and ensure they are being applied correctly.',
          );
          logger.error(error.message);
          reject(error);
          return;
        }

        logger.info('Verified required tables exist after migration');

        // 初始化内置插件（仅在首次安装时）
        try {
          await initializeBuiltinPlugins();
          logger.debug('Builtin plugins initialization completed');
        } catch (error: any) {
          // Plugin initialization failure is non-critical, but log it
          logger.warn(`Plugin initialization failed (non-critical): ${error?.message || error}`);
          // Don't reject - allow migration to succeed even if plugin init fails
        }

        resolve();
      });
    });
  }
}

if (require.main === module) {
  // Run migrations and exit with appropriate code
  runDbMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
