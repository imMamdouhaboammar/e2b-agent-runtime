import { runMigrations } from '../persistence/postgres/migrations/runner.js';
import { logger } from '../shared/logger.js';
import dotenv from 'dotenv';

// Load variables from local .env
dotenv.config();

const SUPABASE_DB_URL = process.env.DATABASE_URL;

async function main() {
  if (!SUPABASE_DB_URL) {
    logger.error('No DATABASE_URL environment variable set.');
    process.exit(1);
  }

  logger.info('Connecting to Supabase PostgreSQL database to apply migrations...');
  try {
    await runMigrations(SUPABASE_DB_URL);
    logger.info('All migrations have been successfully pushed and applied to Supabase!');
  } catch (err: any) {
    logger.error('Failed to apply migrations to Supabase database', { error: err.message });
    process.exit(1);
  }
}

main();
