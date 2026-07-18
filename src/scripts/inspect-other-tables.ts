import pg from 'pg';

const dbUrl = 'postgresql://postgres.lqekyrkxnxqtclhkaknm:H%24eGMzD5zrC5P%40%40@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function main() {
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    console.log('=== public.runtime_profiles ===');
    const profs = await client.query('SELECT * FROM public.runtime_profiles');
    console.log(`Row count: ${profs.rowCount}`);
    profs.rows.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== public.runtime_memberships ===');
    const mems = await client.query('SELECT * FROM public.runtime_memberships');
    console.log(`Row count: ${mems.rowCount}`);
    mems.rows.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== public.tokens ===');
    try {
      const tokens = await client.query('SELECT id, name, expires_at, revoked FROM public.tokens');
      console.log(`Row count: ${tokens.rowCount}`);
      tokens.rows.forEach(r => console.log(JSON.stringify(r)));
    } catch (e: any) {
      console.log(`tokens table failed: ${e.message}`);
    }

    client.release();
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
