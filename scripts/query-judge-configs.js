#!/usr/bin/env node

const Database = require('better-sqlite3');
const { getDbPath } = require('../dist/src/database/index.js');

const dbPath = getDbPath();
console.log(`查询数据库: ${dbPath}\n`);

const db = new Database(dbPath);

try {
  const configs = db
    .prepare(`
    SELECT 
      id,
      name,
      provider,
      model,
      api_base_url,
      api_key,
      temperature,
      top_p,
      rubric,
      threshold,
      source,
      plugin_id,
      metadata,
      created_at,
      updated_at
    FROM dify_judge_configs
    ORDER BY created_at DESC
  `)
    .all();

  console.log(`找到 ${configs.length} 条记录:\n`);
  console.log('='.repeat(80));

  configs.forEach((config, index) => {
    console.log(`\n记录 #${index + 1}`);
    console.log('-'.repeat(80));
    console.log(`ID:           ${config.id}`);
    console.log(`名称:         ${config.name}`);
    console.log(`Provider:     ${config.provider}`);
    console.log(`Model:        ${config.model}`);
    console.log(`API Base URL: ${config.api_base_url || '(未设置)'}`);
    console.log(
      `API Key:      ${config.api_key ? config.api_key.substring(0, 20) + '...' : '(未设置)'}`,
    );
    console.log(`Temperature:  ${config.temperature}`);
    console.log(`Top P:        ${config.top_p}`);
    console.log(`Threshold:    ${config.threshold}`);
    console.log(`Source:       ${config.source}`);
    console.log(`Plugin ID:    ${config.plugin_id || '(无)'}`);
    console.log(`Metadata:     ${config.metadata || '(无)'}`);
    console.log(`Created At:   ${config.created_at}`);
    console.log(`Updated At:   ${config.updated_at}`);
    console.log(`\nRubric (审查指令):`);
    console.log('-'.repeat(80));
    if (config.rubric) {
      console.log(config.rubric);
    } else {
      console.log('(未设置)');
    }
    console.log('='.repeat(80));
  });

  // 统计信息
  console.log(`\n统计信息:`);
  console.log(`- 总记录数: ${configs.length}`);
  console.log(`- 来源分布:`);
  const sourceStats = db
    .prepare(`
    SELECT source, COUNT(*) as count 
    FROM dify_judge_configs 
    GROUP BY source
  `)
    .all();
  sourceStats.forEach((stat) => {
    console.log(`  - ${stat.source}: ${stat.count} 条`);
  });
} catch (error) {
  console.error('查询错误:', error.message);
  process.exit(1);
} finally {
  db.close();
}
