/**
 * Run all missing MySQL migrations (organizations.icon, teams.logo, attack_tasks, target_agents, user_teams, vulnerabilities)
 * Usage: npx tsx scripts/run-missing-mysql-migrations.ts
 */

import { getDb, getDbType, getMysqlConnection, closeDb } from '../backend/src/database';
import logger from '../backend/src/logger';

async function runMissingMigrations() {
  try {
    getDb();
    const dbType = getDbType();
    if (dbType !== 'mysql') {
      logger.info('This script is for MySQL only. Skipping.');
      await closeDb();
      process.exit(0);
    }

    const conn = getMysqlConnection();
    if (!conn) {
      logger.error('MySQL connection not available');
      await closeDb();
      process.exit(1);
    }

    // 1. organizations.icon (migration 006)
    const [orgIconCols] = await conn.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations' AND COLUMN_NAME = 'icon'",
    );
    if ((orgIconCols as { COLUMN_NAME: string }[]).length === 0) {
      logger.info('Adding organizations.icon...');
      await conn.execute('ALTER TABLE organizations ADD COLUMN icon TEXT AFTER slug');
      await conn.execute("UPDATE organizations SET icon = 'Building2' WHERE icon IS NULL");
    } else {
      logger.info('organizations.icon already exists.');
    }

    // 2. teams.logo (migration 004)
    const [teamsLogoCols] = await conn.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'logo'",
    );
    if ((teamsLogoCols as { COLUMN_NAME: string }[]).length === 0) {
      logger.info('Adding teams.logo...');
      await conn.execute('ALTER TABLE teams ADD COLUMN logo TEXT AFTER name');
      await conn.execute("UPDATE teams SET logo = 'Users' WHERE logo IS NULL");
    } else {
      logger.info('teams.logo already exists.');
    }

    // 3. attack_tasks table (migration 007)
    const [attackTasksTables] = await conn.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attack_tasks'",
    );
    if ((attackTasksTables as { TABLE_NAME: string }[]).length === 0) {
      logger.info('Creating attack_tasks table...');
      await conn.execute(`
        CREATE TABLE attack_tasks (
          id VARCHAR(36) PRIMARY KEY,
          organization_id VARCHAR(36) NOT NULL,
          team_id VARCHAR(36),
          user_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          target_type VARCHAR(50),
          target_config JSON,
          vulnerabilities JSON,
          attack_mode VARCHAR(20),
          composite_attack_config JSON,
          detection_config JSON,
          agent_config JSON,
          status VARCHAR(20),
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX attack_tasks_organization_id_idx (organization_id),
          INDEX attack_tasks_status_idx (status),
          INDEX attack_tasks_org_status_created_idx (organization_id, status, created_at),
          INDEX attack_tasks_user_id_idx (user_id),
          INDEX attack_tasks_created_at_idx (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      logger.info('attack_tasks table already exists.');
    }

    // 4. target_agents table (with icon to match tables-mysql schema)
    const [targetAgentsTables] = await conn.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'target_agents'",
    );
    if ((targetAgentsTables as { TABLE_NAME: string }[]).length === 0) {
      logger.info('Creating target_agents table...');
      await conn.execute(`
        CREATE TABLE target_agents (
          id VARCHAR(36) PRIMARY KEY,
          organization_id VARCHAR(36) NOT NULL,
          team_id VARCHAR(36),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          type VARCHAR(20),
          icon VARCHAR(50),
          config JSON,
          metadata JSON,
          status VARCHAR(20),
          health_status JSON,
          statistics JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
          INDEX target_agents_organization_id_idx (organization_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      // If table exists but missing icon column, add it
      const [targetIconCols] = await conn.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'target_agents' AND COLUMN_NAME = 'icon'",
      );
      if ((targetIconCols as { COLUMN_NAME: string }[]).length === 0) {
        logger.info('Adding target_agents.icon...');
        await conn.execute('ALTER TABLE target_agents ADD COLUMN icon VARCHAR(50) AFTER type');
      }
    }

    // 5. user_teams table (with organization_id to match tables-mysql)
    const [userTeamsTables] = await conn.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_teams'",
    );
    if ((userTeamsTables as { TABLE_NAME: string }[]).length === 0) {
      logger.info('Creating user_teams table...');
      await conn.execute(`
        CREATE TABLE user_teams (
          user_id VARCHAR(36) NOT NULL,
          team_id VARCHAR(36) NOT NULL,
          organization_id VARCHAR(36) NOT NULL,
          role VARCHAR(50),
          permissions JSON,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (user_id, team_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          INDEX idx_user_teams_organization_id (organization_id),
          INDEX idx_user_teams_org_user (organization_id, user_id),
          INDEX idx_user_teams_org_team (organization_id, team_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      // If table exists but missing organization_id, add it (migration 010)
      const [utOrgCols] = await conn.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_teams' AND COLUMN_NAME = 'organization_id'",
      );
      if ((utOrgCols as { COLUMN_NAME: string }[]).length === 0) {
        logger.info('Adding user_teams.organization_id...');
        await conn.execute(
          'ALTER TABLE user_teams ADD COLUMN organization_id VARCHAR(36) AFTER team_id',
        );
        await conn.execute(
          'UPDATE user_teams ut INNER JOIN teams t ON ut.team_id = t.id SET ut.organization_id = t.organization_id WHERE ut.organization_id IS NULL',
        );
        await conn.execute('ALTER TABLE user_teams MODIFY organization_id VARCHAR(36) NOT NULL');
        await conn.execute(
          'ALTER TABLE user_teams ADD FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE',
        );
      }
    }

    // 6. vulnerabilities table (matches tables-mysql schema)
    const [vulnTables] = await conn.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vulnerabilities'",
    );
    if ((vulnTables as { TABLE_NAME: string }[]).length === 0) {
      logger.info('Creating vulnerabilities table...');
      await conn.execute(`
        CREATE TABLE vulnerabilities (
          id VARCHAR(36) PRIMARY KEY,
          avd_id VARCHAR(50) NOT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(20) NOT NULL,
          category VARCHAR(100),
          risk_level VARCHAR(20) NOT NULL,
          cvss_score DECIMAL(3,1),
          status VARCHAR(20) NOT NULL,
          disclosed_at TIMESTAMP,
          description TEXT,
          affected_targets JSON,
          impact_scope TEXT,
          cwe_id VARCHAR(20),
          mitre_id VARCHAR(50),
          owasp_id VARCHAR(50),
          owasp_llm_top10_mapping JSON,
          exploitability JSON,
          patch_status JSON,
          audit_notes TEXT,
          tags JSON,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          created_by VARCHAR(36),
          updated_by VARCHAR(36),
          UNIQUE KEY vulnerabilities_avd_id_idx (avd_id),
          KEY vulnerabilities_type_idx (type),
          KEY vulnerabilities_risk_level_idx (risk_level),
          KEY vulnerabilities_cvss_score_idx (cvss_score),
          KEY vulnerabilities_status_idx (status),
          KEY vulnerabilities_category_idx (category),
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      logger.info('vulnerabilities table already exists.');
    }

    // 7. Vulnerability-related tables (attack_commands, detection_rules, solutions, etc.) - require vulnerabilities to exist
    const vulnRelatedTables = [
      {
        name: 'attack_commands',
        sql: `
        CREATE TABLE IF NOT EXISTS attack_commands (
          id VARCHAR(36) PRIMARY KEY,
          vulnerability_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          attack_mode VARCHAR(20) NOT NULL,
          expected_success TEXT,
          non_vulnerability TEXT,
          risk_level VARCHAR(20),
          enabled BOOLEAN DEFAULT TRUE,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY vulnerability_id_idx (vulnerability_id),
          KEY attack_mode_idx (attack_mode),
          KEY enabled_idx (enabled),
          FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      },
      {
        name: 'detection_rules',
        sql: `
        CREATE TABLE IF NOT EXISTS detection_rules (
          id VARCHAR(36) PRIMARY KEY,
          vulnerability_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          pattern TEXT NOT NULL,
          severity VARCHAR(20),
          confidence DECIMAL(3,2),
          enabled BOOLEAN DEFAULT TRUE,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY vulnerability_id_idx (vulnerability_id),
          KEY type_idx (type),
          KEY enabled_idx (enabled),
          FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      },
      {
        name: 'solutions',
        sql: `
        CREATE TABLE IF NOT EXISTS solutions (
          id VARCHAR(36) PRIMARY KEY,
          vulnerability_id VARCHAR(36) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          steps JSON,
          \`references\` JSON,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY vulnerability_id_idx (vulnerability_id),
          FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      },
      {
        name: 'success_indicators',
        sql: `
        CREATE TABLE IF NOT EXISTS success_indicators (
          id VARCHAR(36) PRIMARY KEY,
          vulnerability_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          pattern TEXT,
          description TEXT,
          confidence DECIMAL(3,2),
          severity VARCHAR(20),
          enabled BOOLEAN DEFAULT TRUE,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY vulnerability_id_idx (vulnerability_id),
          KEY type_idx (type),
          KEY enabled_idx (enabled),
          FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      },
      {
        name: 'failure_indicators',
        sql: `
        CREATE TABLE IF NOT EXISTS failure_indicators (
          id VARCHAR(36) PRIMARY KEY,
          vulnerability_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          pattern TEXT,
          description TEXT,
          enabled BOOLEAN DEFAULT TRUE,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY vulnerability_id_idx (vulnerability_id),
          KEY type_idx (type),
          KEY enabled_idx (enabled),
          FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      },
      {
        name: 'waf_rules',
        sql: `
        CREATE TABLE IF NOT EXISTS waf_rules (
          id VARCHAR(36) PRIMARY KEY,
          vulnerability_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(20) NOT NULL,
          rule TEXT NOT NULL,
          description TEXT,
          text_pattern TEXT,
          text_match_type VARCHAR(20),
          semantic_prompt TEXT,
          semantic_threshold DECIMAL(3,2),
          enabled BOOLEAN DEFAULT TRUE,
          priority INT DEFAULT 0,
          action VARCHAR(20) DEFAULT 'alert',
          applicable_scenarios JSON,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY vulnerability_id_idx (vulnerability_id),
          KEY type_idx (type),
          KEY enabled_idx (enabled),
          FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      },
      {
        name: 'llm_review_instructions',
        sql: `
        CREATE TABLE IF NOT EXISTS llm_review_instructions (
          id VARCHAR(36) PRIMARY KEY,
          vulnerability_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          description TEXT,
          model VARCHAR(100),
          temperature DECIMAL(3,2),
          max_tokens INT,
          enabled BOOLEAN DEFAULT TRUE,
          priority INT DEFAULT 0,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY vulnerability_id_idx (vulnerability_id),
          KEY type_idx (type),
          KEY enabled_idx (enabled),
          FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      },
    ];
    for (const { name, sql } of vulnRelatedTables) {
      const [tables] = await conn.execute(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [name],
      );
      if ((tables as { TABLE_NAME: string }[]).length === 0) {
        logger.info(`Creating ${name} table...`);
        await conn.execute(sql);
      }
    }

    logger.info('All missing MySQL migrations completed successfully.');
    await closeDb();
    process.exit(0);
  } catch (error: any) {
    logger.error('Migration failed:', error);
    await closeDb();
    process.exit(1);
  }
}

runMissingMigrations();
