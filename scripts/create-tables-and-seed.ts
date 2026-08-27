/**
 * Script to create target_agents table and seed sample data
 * Run with: npx tsx scripts/create-tables-and-seed.ts
 */

import mysql from 'mysql2/promise';
import { getEnvString } from '../backend/src/envars';
import { v4 as uuidv4 } from 'uuid';

async function createTablesAndSeed() {
  const databaseUrl = getEnvString(
    'DATABASE_URL',
    'mysql://root:root12345@localhost:3306/dodoguard',
  );

  // Parse MySQL connection string
  const url = new URL(databaseUrl.replace(/^mysql:\/\//, 'http://'));
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username || 'root',
    password: url.password || 'root12345',
    database: url.pathname.slice(1) || 'dodoguard',
  });

  try {
    // Create target_agents table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS target_agents (
        id VARCHAR(36) PRIMARY KEY,
        organization_id VARCHAR(36) NOT NULL,
        team_id VARCHAR(36),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(20) NOT NULL,
        config JSON NOT NULL,
        metadata JSON,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        health_status JSON,
        statistics JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY organization_id_idx (organization_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✓ Created target_agents table');

    // Get or create organization
    const [orgs] = (await connection.execute(
      'SELECT id, name FROM organizations LIMIT 1',
    )) as any[];

    let orgId: string;
    if (orgs.length === 0) {
      orgId = uuidv4();
      await connection.execute(
        'INSERT INTO organizations (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [orgId, 'Default Organization', 'default-org', 'active'],
      );
      console.log(`✓ Created organization: Default Organization (${orgId})`);
    } else {
      orgId = orgs[0].id;
      console.log(`Using organization: ${orgs[0].name} (${orgId})`);
    }

    // Check if agents already exist
    const [existingAgents] = (await connection.execute(
      'SELECT id FROM target_agents WHERE organization_id = ? LIMIT 2',
      [orgId],
    )) as any[];

    if (existingAgents.length >= 2) {
      console.log('Sample agents already exist. Skipping seed.');
      return;
    }

    // Create two sample agents
    const agents = [
      {
        id: uuidv4(),
        name: 'Dify Agent',
        description: 'Dify platform agent for security testing',
        type: 'dify',
        config: JSON.stringify({
          apiBaseUrl: 'https://api.dify.ai/v1',
          apiKey: 'app-***',
          model: 'gpt-4',
          authType: 'bearer',
        }),
        metadata: JSON.stringify({
          version: '1.0.0',
          platform: 'dify',
          environment: 'production',
          tags: ['dify', 'agent', 'llm'],
        }),
        status: 'active',
        healthStatus: JSON.stringify({
          lastCheck: new Date().toISOString(),
          status: 'healthy',
          responseTime: 150,
        }),
        statistics: JSON.stringify({
          totalAttacks: 12,
          successfulAttacks: 8,
          vulnerabilitiesFound: 3,
        }),
      },
      {
        id: uuidv4(),
        name: 'Coze Agent',
        description: 'Coze platform agent for comprehensive security assessment',
        type: 'coze',
        config: JSON.stringify({
          apiBaseUrl: 'https://api.coze.cn/v1',
          apiKey: 'pat-***',
          botId: 'bot-123456',
          authType: 'bearer',
        }),
        metadata: JSON.stringify({
          version: '2.1.0',
          platform: 'coze',
          environment: 'production',
          tags: ['coze', 'agent', 'llm'],
        }),
        status: 'active',
        healthStatus: JSON.stringify({
          lastCheck: new Date().toISOString(),
          status: 'healthy',
          responseTime: 120,
        }),
        statistics: JSON.stringify({
          totalAttacks: 25,
          successfulAttacks: 18,
          vulnerabilitiesFound: 7,
        }),
      },
    ];

    // Insert agents
    for (const agent of agents) {
      await connection.execute(
        `INSERT INTO target_agents 
         (id, organization_id, name, description, type, config, metadata, status, health_status, statistics, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          agent.id,
          orgId,
          agent.name,
          agent.description,
          agent.type,
          agent.config,
          agent.metadata,
          agent.status,
          agent.healthStatus,
          agent.statistics,
        ],
      );
      console.log(`✓ Created agent: ${agent.name}`);
    }

    console.log('\n✅ Successfully created table and seeded 2 sample agents!');
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run the function
createTablesAndSeed()
  .then(() => {
    console.log('Completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
