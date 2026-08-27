/**
 * Seed script to create sample target agents
 * Run with: npx tsx scripts/seed-agents-simple.ts
 */

import mysql from 'mysql2/promise';
import { getEnvString } from '../backend/src/envars';
import { v4 as uuidv4 } from 'uuid';

async function seedAgents() {
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
        name: 'OpenAI GPT-4 Agent',
        description: 'OpenAI GPT-4 API endpoint for security testing',
        type: 'llm',
        config: JSON.stringify({
          apiBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-***',
          model: 'gpt-4',
          authType: 'bearer',
        }),
        metadata: JSON.stringify({
          version: '1.0.0',
          platform: 'openai',
          environment: 'production',
          tags: ['llm', 'openai', 'gpt-4'],
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
        name: 'Anthropic Claude Agent',
        description: 'Anthropic Claude API endpoint for comprehensive security assessment',
        type: 'llm',
        config: JSON.stringify({
          apiBaseUrl: 'https://api.anthropic.com/v1',
          apiKey: 'sk-ant-***',
          model: 'claude-3-opus-20240229',
          authType: 'bearer',
        }),
        metadata: JSON.stringify({
          version: '2.1.0',
          platform: 'anthropic',
          environment: 'production',
          tags: ['llm', 'anthropic', 'claude'],
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

    console.log('\n✅ Successfully seeded 2 sample agents!');
  } catch (error: any) {
    console.error('Error seeding agents:', error.message);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error('\n⚠️  Table does not exist. Please run migrations first:');
      console.error('   npm run db:migrate');
    }
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run the seed function
seedAgents()
  .then(() => {
    console.log('Seed completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
