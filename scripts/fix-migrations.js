#!/usr/bin/env node
/**
 * 修复迁移问题：确保依赖的表在数据迁移之前被创建
 *
 * 这个脚本会：
 * 1. 检查并创建迁移 0023 需要的表（dify_pentest_instruction_sets, dify_pentest_instructions）
 * 2. 确保迁移 0029 的表被正确创建
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function getConfigDir() {
  const env = process.env.DODOGUARD_CONFIG_DIR;
  if (env) {
    return env;
  }
  return path.join(require('os').homedir(), '.dodoguard');
}

function getDbPath() {
  const configDir = getConfigDir();
  return path.resolve(configDir, 'dodoguard.db');
}

const dbPath = getDbPath();
console.log('Database path:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.log('Database does not exist, creating...');
  // 创建目录
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

// 禁用外键检查
db.pragma('foreign_keys = OFF');

try {
  // 1. 创建 dify_pentest_instruction_sets 表（如果不存在）
  const createInstructionSets = `
    CREATE TABLE IF NOT EXISTS dify_pentest_instruction_sets (
      id text PRIMARY KEY NOT NULL,
      module_id text NOT NULL,
      risk_category text,
      title text NOT NULL,
      description text,
      source_type text NOT NULL DEFAULT 'built-in',
      version text NOT NULL DEFAULT '1.0.0',
      enabled integer NOT NULL DEFAULT 1,
      metadata text,
      created_at integer NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at integer NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `;

  db.exec(createInstructionSets);
  console.log('✓ Created dify_pentest_instruction_sets table');

  // 创建索引
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_pentest_instruction_sets_module_idx ON dify_pentest_instruction_sets (module_id)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_pentest_instruction_sets_risk_category_idx ON dify_pentest_instruction_sets (risk_category)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_pentest_instruction_sets_source_type_idx ON dify_pentest_instruction_sets (source_type)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_pentest_instruction_sets_enabled_idx ON dify_pentest_instruction_sets (enabled)',
  );

  // 2. 创建 dify_pentest_instructions 表（如果不存在）
  const createInstructions = `
    CREATE TABLE IF NOT EXISTS dify_pentest_instructions (
      id text PRIMARY KEY NOT NULL,
      instruction_set_id text NOT NULL,
      content text NOT NULL,
      metadata text,
      "order" integer NOT NULL DEFAULT 0,
      created_at integer NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at integer NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (instruction_set_id) REFERENCES dify_pentest_instruction_sets(id) ON UPDATE no action ON DELETE cascade
    );
  `;

  db.exec(createInstructions);
  console.log('✓ Created dify_pentest_instructions table');

  // 创建索引
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_pentest_instructions_set_idx ON dify_pentest_instructions (instruction_set_id)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_pentest_instructions_order_idx ON dify_pentest_instructions ("order")',
  );

  // 3. 创建迁移 0029 需要的表
  const createDifyPlugins = `
    CREATE TABLE IF NOT EXISTS dify_plugins (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT NOT NULL DEFAULT '1.0.0',
      author TEXT,
      homepage TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      metadata TEXT,
      installed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `;

  db.exec(createDifyPlugins);
  db.exec('CREATE INDEX IF NOT EXISTS dify_plugins_enabled_idx ON dify_plugins (enabled)');
  console.log('✓ Created dify_plugins table');

  const createAttackCategories = `
    CREATE TABLE IF NOT EXISTS dify_attack_categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      description TEXT,
      parent_id TEXT,
      source TEXT NOT NULL DEFAULT 'built-in',
      plugin_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (parent_id) REFERENCES dify_attack_categories(id) ON UPDATE CASCADE ON DELETE SET NULL,
      FOREIGN KEY (plugin_id) REFERENCES dify_plugins(id) ON UPDATE CASCADE ON DELETE SET NULL
    );
  `;

  db.exec(createAttackCategories);
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_attack_categories_parent_idx ON dify_attack_categories (parent_id)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_attack_categories_source_idx ON dify_attack_categories (source)',
  );
  console.log('✓ Created dify_attack_categories table');

  const createTargetConfigs = `
    CREATE TABLE IF NOT EXISTS dify_target_configs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      api_base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      user_id TEXT,
      conversation_id TEXT,
      response_mode TEXT DEFAULT 'blocking',
      source TEXT NOT NULL DEFAULT 'user',
      plugin_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (plugin_id) REFERENCES dify_plugins(id) ON UPDATE CASCADE ON DELETE SET NULL
    );
  `;

  db.exec(createTargetConfigs);
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_target_configs_source_idx ON dify_target_configs (source)',
  );
  console.log('✓ Created dify_target_configs table');

  const createDetectionRules = `
    CREATE TABLE IF NOT EXISTS dify_detection_rules (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      pattern TEXT NOT NULL,
      severity_default TEXT,
      confidence_default REAL,
      source TEXT NOT NULL DEFAULT 'built-in',
      plugin_id TEXT,
      metadata TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (plugin_id) REFERENCES dify_plugins(id) ON UPDATE CASCADE ON DELETE SET NULL
    );
  `;

  db.exec(createDetectionRules);
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_detection_rules_type_idx ON dify_detection_rules (type)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_detection_rules_source_idx ON dify_detection_rules (source)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_detection_rules_plugin_idx ON dify_detection_rules (plugin_id)',
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS dify_detection_rules_enabled_idx ON dify_detection_rules (enabled)',
  );
  console.log('✓ Created dify_detection_rules table');

  // 重新启用外键检查
  db.pragma('foreign_keys = ON');

  // 验证表
  console.log('\nVerifying tables:');
  const keyTables = [
    'dify_pentest_instruction_sets',
    'dify_pentest_instructions',
    'dify_plugins',
    'dify_attack_categories',
    'dify_target_configs',
    'dify_detection_rules',
  ];

  for (const table of keyTables) {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    console.log(`  ${table}: ${exists ? '✓' : '✗'}`);
  }

  console.log('\n✓ Migration fix completed successfully!');
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  db.close();
}
