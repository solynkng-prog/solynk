const { pool, query } = require('../src/config/database');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/shared/utils/logger');

async function runMigrations() {
  try {
    // Create migrations tracking table
    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname);
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    for (const file of sqlFiles) {
      const checkResult = await query(
        'SELECT * FROM migrations WHERE filename = $1',
        [file]
      );

      if (checkResult.rows.length > 0) {
        logger.info(`Migration ${file} already executed, skipping`);
        continue;
      }

      logger.info(`Executing migration: ${file}`);
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await query(sql);

      await query(
        'INSERT INTO migrations (filename) VALUES ($1)',
        [file]
      );

      logger.info(`Migration ${file} executed successfully`);
    }

    logger.info('All migrations completed');
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
