/**
 * Idempotent subscription schema bootstrap.
 * Ensures subscription tables + default plans exist even when full migrations are skipped
 * (e.g. customer Docker with DODOGUARD_SKIP_DB_MIGRATIONS=1 and a partial dodoguard.sql).
 */

import { sql } from 'drizzle-orm';
import { db, getDbType, getSqliteInstance } from '../database';
import logger from '../logger';

const MYSQL_SUBSCRIPTION_DDL = [
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
  `CREATE TABLE IF NOT EXISTS \`organization_subscriptions\` (
    \`id\` VARCHAR(36) PRIMARY KEY,
    \`organization_id\` VARCHAR(36) NOT NULL,
    \`plan_id\` VARCHAR(36) NOT NULL,
    \`billing_cycle\` VARCHAR(20) NOT NULL,
    \`status\` VARCHAR(20) NOT NULL,
    \`current_period_start\` TIMESTAMP NULL,
    \`current_period_end\` TIMESTAMP NULL,
    \`cancel_at_period_end\` BOOLEAN DEFAULT FALSE,
    \`price\` DECIMAL(10,2) NOT NULL,
    \`currency\` VARCHAR(10) DEFAULT 'USD',
    \`payment_method_id\` VARCHAR(255),
    \`metadata\` JSON,
    \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY \`organization_id_idx\` (\`organization_id\`),
    KEY \`plan_id_idx\` (\`plan_id\`),
    KEY \`status_idx\` (\`status\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
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
    KEY \`metric_idx\` (\`metric\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`quota_usage\` (
    \`organization_id\` VARCHAR(36) NOT NULL,
    \`period\` VARCHAR(7) NOT NULL,
    \`quotas\` JSON NOT NULL,
    \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (\`organization_id\`, \`period\`),
    KEY \`period_idx\` (\`period\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const SQLITE_SUBSCRIPTION_DDL = [
  `CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    price_monthly REAL,
    price_quarterly REAL,
    price_yearly REAL,
    quotas TEXT,
    features TEXT,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS subscription_plans_type_idx ON subscription_plans (type)`,
  `CREATE INDEX IF NOT EXISTS subscription_plans_enabled_idx ON subscription_plans (enabled)`,
  `CREATE TABLE IF NOT EXISTS organization_subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_start INTEGER,
    current_period_end INTEGER,
    cancel_at_period_end INTEGER DEFAULT 0,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    payment_method_id TEXT,
    metadata TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS org_subscriptions_org_id_idx ON organization_subscriptions (organization_id)`,
  `CREATE INDEX IF NOT EXISTS org_subscriptions_status_idx ON organization_subscriptions (status)`,
  `CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    team_id TEXT,
    user_id TEXT,
    metric TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    period TEXT NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    metadata TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS usage_records_org_period_idx ON usage_records (organization_id, period)`,
  `CREATE TABLE IF NOT EXISTS quota_usage (
    organization_id TEXT NOT NULL,
    period TEXT NOT NULL,
    quotas TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
    PRIMARY KEY (organization_id, period)
  )`,
];

const SEED_PLANS = [
  {
    id: 'plan-free-001',
    name: 'Free',
    type: 'free',
    quotas:
      '{"targetAgents":3,"attackTasksPerMonth":10,"teams":1,"teamMembers":1,"auditLogRetentionDays":0}',
    features:
      '["basic_dashboard","basic_reports","simple_attack_mode","rule_detection","community_support","7_day_trial"]',
  },
  {
    id: 'plan-starter-001',
    name: 'Starter',
    type: 'starter',
    quotas:
      '{"targetAgents":10,"attackTasksPerMonth":100,"teams":3,"teamMembers":5,"auditLogRetentionDays":0}',
    features:
      '["advanced_dashboard","custom_reports","pdf_reports","conversation_attack_mode","llm_detection","email_support","api_access","webhook_integration","team_collaboration","basic_rbac"]',
  },
  {
    id: 'plan-professional-001',
    name: 'Professional',
    type: 'professional',
    quotas:
      '{"targetAgents":50,"attackTasksPerMonth":500,"teams":10,"teamMembers":20,"auditLogRetentionDays":90}',
    features:
      '["all_starter_features","composite_attack_mode","agent_driven_attacks","knowledge_base_detection","advanced_integrations","sso_auth","slack_integration","teams_integration","priority_support","audit_logs","custom_integrations","advanced_reports","data_export","ip_whitelist","advanced_rbac"]',
  },
  {
    id: 'plan-enterprise-001',
    name: 'Enterprise',
    type: 'enterprise',
    quotas:
      '{"targetAgents":-1,"attackTasksPerMonth":-1,"teams":-1,"teamMembers":-1,"auditLogRetentionDays":365}',
    features:
      '["basic_dashboard","advanced_dashboard","basic_reports","custom_reports","pdf_reports","advanced_reports","simple_attack_mode","conversation_attack_mode","composite_attack_mode","agent_driven_attacks","rule_detection","llm_detection","knowledge_base_detection","community_support","email_support","priority_support","dedicated_support","api_access","webhook_integration","advanced_integrations","custom_integrations","slack_integration","teams_integration","team_collaboration","basic_rbac","advanced_rbac","sso_auth","audit_logs","data_export","ip_whitelist","unlimited_quotas","white_label","custom_feature_development","on_premise_deployment","sla_guarantee","compliance_support","soc2_compliance","iso27001_compliance","gdpr_compliance","advanced_analytics","bi_integration","multi_region_deployment","custom_dashboard","advanced_security","4h_support_response","custom_pricing","7_day_trial"]',
  },
];

async function seedSubscriptionPlansIfEmpty(): Promise<void> {
  const dbType = getDbType();

  for (const plan of SEED_PLANS) {
    try {
      if (dbType === 'mysql') {
        await db.execute(
          sql.raw(`
          INSERT INTO \`subscription_plans\` (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
          SELECT '${plan.id}', '${plan.name}', '${plan.type}', 0.00, 0.00, 0.00, '${plan.quotas}', '${plan.features}', true
          WHERE NOT EXISTS (SELECT 1 FROM \`subscription_plans\` WHERE type = '${plan.type}')
        `),
        );
      } else if (dbType === 'sqlite') {
        const sqlite = getSqliteInstance();
        if (!sqlite) { continue; }
        const exists = sqlite
          .prepare('SELECT 1 FROM subscription_plans WHERE type = ? LIMIT 1')
          .get(plan.type);
        if (!exists) {
          sqlite
            .prepare(
              `INSERT INTO subscription_plans (id, name, type, price_monthly, price_quarterly, price_yearly, quotas, features, enabled)
               VALUES (?, ?, ?, 0, 0, 0, ?, ?, 1)`,
            )
            .run(plan.id, plan.name, plan.type, plan.quotas, plan.features);
        }
      }
    } catch (error) {
      logger.debug('Subscription plan seed skipped:', { type: plan.type, error });
    }
  }
}

export async function ensureSubscriptionSchema(): Promise<void> {
  const dbType = getDbType();

  try {
    if (dbType === 'mysql') {
      for (const statement of MYSQL_SUBSCRIPTION_DDL) {
        try {
          await db.execute(sql.raw(statement));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('already exists') && !message.includes('Duplicate')) {
            logger.warn('Subscription DDL warning:', { message });
          }
        }
      }
    } else if (dbType === 'sqlite') {
      const sqlite = getSqliteInstance();
      if (sqlite) {
        for (const statement of SQLITE_SUBSCRIPTION_DDL) {
          try {
            sqlite.exec(statement);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('already exists')) {
              logger.warn('Subscription SQLite DDL warning:', { message });
            }
          }
        }
      }
    }

    await seedSubscriptionPlansIfEmpty();
    logger.debug('Subscription schema bootstrap completed');
  } catch (error) {
    logger.warn('Subscription schema bootstrap failed (non-fatal):', error);
  }
}
