/**
 * One-time script to create the attack_tasks table in MySQL
 * Run with: node scripts/create-attack-tasks-table.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function createAttackTasksTable() {
  let connection;

  try {
    // Database connection config
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root12345',
      database: process.env.DB_NAME || 'dodoguard',
    });

    console.log('Connected to MySQL database');

    // Read the migration SQL file
    const migrationPath = path.join(
      __dirname,
      '../backend/src/database/migrations/007_create_attack_tasks_table.sql',
    );
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration SQL...');

    // Execute the migration
    await connection.execute(migrationSQL);

    console.log('✅ Successfully created attack_tasks table');

    // Verify the table was created
    const [rows] = await connection.execute('SHOW TABLES LIKE "attack_tasks"');
    if (rows.length > 0) {
      console.log('✅ Table verification successful');
    } else {
      console.log('❌ Table verification failed');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the migration
createAttackTasksTable().catch(console.error);
