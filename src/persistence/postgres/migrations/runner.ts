import pg from 'pg';
import { getDbPool } from '../client.js';
import { logger } from '../../../shared/logger.js';
import { INITIAL_SCHEMA_SQL } from './0001_initial_schema.js';

// Unique lock ID for migration advisory lock
const MIGRATION_LOCK_ID = 1784365276;

export interface MigrationStatus {
  name: string;
  applied: boolean;
  appliedAt?: Date;
}

// Static definition of migrations to avoid tsc / compile SQL assets discovery problems in built dist/ runtime
const MIGRATIONS = [
  { name: '0001_initial_schema.sql', sql: INITIAL_SCHEMA_SQL },
];

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const pool = getDbPool(databaseUrl);
  const client = await pool.connect();

  try {
    // Acquire session advisory lock so only one controller runs migrations at a time
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    logger.info('Database migration lock acquired.');

    // 1. Create migration table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(256) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Get applied migrations
    const { rows } = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM schema_migrations'
    );
    const applied = new Set(rows.map((r) => r.migration_name));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) {
        logger.debug(`Migration ${migration.name} is already applied.`);
        continue;
      }

      logger.info(`Applying migration: ${migration.name}`);

      // Execute migration inside a local transaction
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [migration.name]
        );
        await client.query('COMMIT');
        logger.info(`Migration ${migration.name} applied successfully.`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error(`Migration ${migration.name} failed and was rolled back`, { error: err.message });
        throw err;
      }
    }

    logger.info('All database migrations are up to date.');
  } finally {
    // Release the advisory lock
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

export async function getMigrationStatus(databaseUrl?: string): Promise<MigrationStatus[]> {
  const pool = getDbPool(databaseUrl);
  const client = await pool.connect();

  try {
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(256) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows } = await client.query<{ migration_name: string; applied_at: Date }>(
      'SELECT migration_name, applied_at FROM schema_migrations'
    );
    const appliedMap = new Map(rows.map((r) => [r.migration_name, r.applied_at]));

    return MIGRATIONS.map((migration) => ({
      name: migration.name,
      applied: appliedMap.has(migration.name),
      appliedAt: appliedMap.get(migration.name),
    }));
  } finally {
    client.release();
  }
}
