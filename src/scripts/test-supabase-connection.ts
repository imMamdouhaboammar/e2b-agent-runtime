import pg from 'pg';
import { logger } from '../shared/logger.js';
import dotenv from 'dotenv';

// Load variables from local .env
dotenv.config();

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.error('No DATABASE_URL environment variable set.');
    process.exit(1);
  }

  logger.info('Testing connection with Supabase connection pooler via environment...');
  
  let poolConfig: pg.PoolConfig;

  try {
    const parsedUrl = new URL(url);
    poolConfig = {
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      host: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 5432,
      database: parsedUrl.pathname ? parsedUrl.pathname.substring(1) : 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  } catch (err) {
    poolConfig = {
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  if (url.includes('supabase.co') || url.includes('pooler.supabase.com')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);

  try {
    const client = await pool.connect();
    logger.info('Successfully connected to Supabase connection pooler!');
    const res = await client.query('SELECT version()');
    logger.info('Database Version:', { version: res.rows[0].version });
    client.release();
    await pool.end();
  } catch (err: any) {
    logger.error('Database connection test failed', { error: err.message });
    process.exit(1);
  }
}

main();
