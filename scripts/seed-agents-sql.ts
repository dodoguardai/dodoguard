/**
 * Seed script to create sample target agents using raw SQL
 * Run with: npx tsx scripts/seed-agents-sql.ts
 */

import { getDb, getDbType } from '../backend/src/database/index';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function seedAgents() {
  const db = getDb();
  const dbType = getDbType();

  try {
    // Get or create organization
    let orgId: string;

    const orgs = await db.execute(sql`SELECT id, name FROM organizations LIMIT 1`);
    const orgRows = orgs as any[];

    if (orgRows.length === 0) {
      orgId = uuidv4();
      if (dbType === 'mysql') {
        await db.execute(
          sql`INSERT INTO organizations (id, name, slug, status, created_at, updated_at) 
              VALUES (${orgId}, 'Default Organization', 'default-org', 'active', NOW(), NOW())`,
        );
      } else {
        await db.execute(
          sql`INSERT INTO organizations (id, name, slug, status, created_at, updated_at) 
              VALUES (${orgId}, 'Default Organization', 'default-org', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        );
      }
      console.log(`✓ Created organization: Default Organization (${orgId})`);
    } else {
      orgId = orgRows[0].id;
      console.log(`Using organization: ${orgRows[0].name} (${orgId})`);
    }

    // Check if agents already exist
    const existingAgents = await db.execute(
      sql.raw(`SELECT id FROM target_agents WHERE organization_id = '${orgId}' LIMIT 2`),
    );

    if ((existingAgents as any[]).length >= 2) {
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
      const timestamp = dbType === 'mysql' ? 'NOW()' : 'CURRENT_TIMESTAMP';
      const query = `INSERT INTO target_agents 
        (id, organization_id, name, description, type, config, metadata, status, health_status, statistics, created_at, updated_at)
        VALUES 
        ('${agent.id}', '${orgId}', ${db.escape(agent.name)}, ${db.escape(agent.description)}, '${agent.type}', 
         '${agent.config.replace(/'/g, "''")}', '${agent.metadata.replace(/'/g, "''")}', '${agent.status}', 
         '${agent.healthStatus.replace(/'/g, "''")}', '${agent.statistics.replace(/'/g, "''")}', ${timestamp}, ${timestamp})`;

      await db.execute(sql.raw(query));
      console.log(`✓ Created agent: ${agent.name}`);
    }

    console.log('\n✅ Successfully seeded 2 sample agents!');
  } catch (error) {
    console.error('Error seeding agents:', error);
    process.exit(1);
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
