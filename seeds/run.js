const { pool, query } = require('../src/config/database');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/shared/utils/logger');

async function runSeeds() {
  try {
    const seedsDir = path.join(__dirname);
    const files = await fs.readdir(seedsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    for (const file of sqlFiles) {
      logger.info(`Running seed: ${file}`);
      const sql = await fs.readFile(path.join(seedsDir, file), 'utf8');
      await query(sql);
      logger.info(`Seed ${file} completed`);
    }

    logger.info('All seeds completed');
  } catch (err) {
    logger.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeeds();
