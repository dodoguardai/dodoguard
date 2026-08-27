/**
 * Seed script to create sample target agents
 * Run with: npx tsx scripts/seed-agents.ts
 */

import { getDb, getDbType } from '../backend/src/database/index';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Import tables based on database type
const dbType = getDbType();
let targetAgentsTable: any;
let organizationsTable: any;

if (dbType === 'mysql') {
  const mysqlTables = require('../backend/src/database/tables-mysql');
  targetAgentsTable = mysqlTables.targetAgentsTable;
  organizationsTable = mysqlTables.organizationsTable;
} else if (dbType === 'postgres') {
  const pgTables = require('../backend/src/database/tables-enterprise');
  targetAgentsTable = pgTables.targetAgentsTable;
  organizationsTable = pgTables.organizationsTable;
} else {
  // SQLite - use enterprise tables
  const sqliteTables = require('../backend/src/database/tables-enterprise');
  targetAgentsTable = sqliteTables.targetAgentsTable;
  organizationsTable = sqliteTables.organizationsTable;
}

async function seedAgents() {
  const db = getDb();

  try {
    // Get the first organization (or create one if none exists)
    let [org] = await db.select().from(organizationsTable).limit(1);

    if (!org) {
      console.log('No organization found. Creating a default organization...');
      const [newOrg] = await db
        .insert(organizationsTable)
        .values({
          name: 'Default Organization',
          slug: 'default-org',
          status: 'active',
        })
        .returning();
      org = newOrg;
      console.log(`✓ Created organization: ${org.name} (${org.id})`);
    }

    console.log(`Using organization: ${org.name} (${org.id})`);

    // Check if agents already exist
    const existingAgents = await db
      .select()
      .from(targetAgentsTable)
      .where(eq(targetAgentsTable.organizationId, org.id))
      .limit(2);

    if (existingAgents.length >= 2) {
      console.log('Sample agents already exist. Skipping seed.');
      return;
    }

    // Create two sample agents
    const agents = [
      {
        id: uuidv4(),
        organizationId: org.id,
        name: 'OpenAI GPT-4 Agent',
        description: 'OpenAI GPT-4 API endpoint for security testing',
        type: 'llm',
        config: {
          apiBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-***',
          model: 'gpt-4',
          authType: 'bearer',
        },
        metadata: {
          version: '1.0.0',
          platform: 'openai',
          environment: 'production',
          tags: ['llm', 'openai', 'gpt-4'],
        },
        status: 'active',
        healthStatus: {
          lastCheck: new Date().toISOString(),
          status: 'healthy',
          responseTime: 150,
        },
        statistics: {
          totalAttacks: 12,
          successfulAttacks: 8,
          vulnerabilitiesFound: 3,
        },
      },
      {
        id: uuidv4(),
        organizationId: org.id,
        name: 'Anthropic Claude Agent',
        description: 'Anthropic Claude API endpoint for comprehensive security assessment',
        type: 'llm',
        config: {
          apiBaseUrl: 'https://api.anthropic.com/v1',
          apiKey: 'sk-ant-***',
          model: 'claude-3-opus-20240229',
          authType: 'bearer',
        },
        metadata: {
          version: '2.1.0',
          platform: 'anthropic',
          environment: 'production',
          tags: ['llm', 'anthropic', 'claude'],
        },
        status: 'active',
        healthStatus: {
          lastCheck: new Date().toISOString(),
          status: 'healthy',
          responseTime: 120,
        },
        statistics: {
          totalAttacks: 25,
          successfulAttacks: 18,
          vulnerabilitiesFound: 7,
        },
      },
    ];

    // Insert agents
    for (const agent of agents) {
      await db.insert(targetAgentsTable).values(agent);
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
