/**
 * Script to update existing agents to use new type values (dify, coze, api, etc.)
 */

import mysql from 'mysql2/promise';
import { getEnvString } from '../backend/src/envars';

async function updateAgentTypes() {
  const databaseUrl = getEnvString(
    'DATABASE_URL',
    'mysql://root:root12345@localhost:3306/dodoguard',
  );

  // Parse MySQL connection string
  const url = new URL(databaseUrl.replace(/^mysql:\/\//, 'http://'));
  const connection = await mysql.createConnection({
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '3306'),
    user: url.username || 'root',
    password: url.password || 'root12345',
    database: url.pathname.slice(1) || 'dodoguard',
  });

  try {
    console.log('Updating agent types...');

    // Update all old types to 'api'
    await connection.execute(
      `UPDATE target_agents SET type = 'api' WHERE type IN ('llm', 'agent', 'mcp', 'tool', 'platform')`,
    );
    console.log('✓ Updated old types to "api"');

    // Update specific agents
    await connection.execute(
      `UPDATE target_agents 
       SET name = 'Dify Agent', 
           type = 'dify',
           description = 'Dify platform agent for security testing'
       WHERE name LIKE '%OpenAI%' OR name LIKE '%GPT%'`,
    );
    console.log('✓ Updated OpenAI agent to Dify');

    await connection.execute(
      `UPDATE target_agents 
       SET name = 'Coze Agent', 
           type = 'coze',
           description = 'Coze platform agent for comprehensive security assessment'
       WHERE name LIKE '%Anthropic%' OR name LIKE '%Claude%'`,
    );
    console.log('✓ Updated Anthropic agent to Coze');

    // Show updated agents
    const [agents] = (await connection.execute(
      'SELECT id, name, type, status FROM target_agents',
    )) as any[];

    console.log('\nUpdated agents:');
    agents.forEach((agent: any) => {
      console.log(`  - ${agent.name}: ${agent.type} (${agent.status})`);
    });
  } catch (error: any) {
    console.error('Error updating agents:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run the script
updateAgentTypes()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to update agents:', error);
    process.exit(1);
  });
