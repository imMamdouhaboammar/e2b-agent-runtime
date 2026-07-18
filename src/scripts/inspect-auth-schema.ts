import pg from 'pg';

const dbUrl = 'postgresql://postgres.lqekyrkxnxqtclhkaknm:H%24eGMzD5zrC5P%40%40@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function main() {
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    // 1. List all tables in 'auth' schema
    console.log('=== Tables in schema "auth" ===');
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth' ORDER BY table_name`
    );
    tablesRes.rows.forEach(r => console.log(`- ${r.table_name}`));

    // 2. Count users, identities, sessions
    console.log('\n=== Counts ===');
    try {
      const usersCount = await client.query('SELECT COUNT(*) FROM auth.users');
      console.log(`- Users in auth.users: ${usersCount.rows[0].count}`);
    } catch (e: any) {
      console.log(`Failed to count auth.users: ${e.message}`);
    }

    try {
      const identCount = await client.query('SELECT COUNT(*) FROM auth.identities');
      console.log(`- Identities in auth.identities: ${identCount.rows[0].count}`);
    } catch (e: any) {
      console.log(`Failed to count auth.identities: ${e.message}`);
    }

    try {
      const sessCount = await client.query('SELECT COUNT(*) FROM auth.sessions');
      console.log(`- Sessions in auth.sessions: ${sessCount.rows[0].count}`);
    } catch (e: any) {
      console.log(`Failed to count auth.sessions: ${e.message}`);
    }

    try {
      const clientCount = await client.query('SELECT COUNT(*) FROM auth.oauth_clients');
      console.log(`- Clients in auth.oauth_clients: ${clientCount.rows[0].count}`);
    } catch (e: any) {
      console.log(`Failed to count auth.oauth_clients: ${e.message}`);
    }

    // 3. Inspect columns of auth.users
    console.log('\n=== Columns of auth.users ===');
    const colsRes = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users'`
    );
    colsRes.rows.forEach(r => console.log(`- ${r.column_name}: ${r.data_type}`));

    client.release();
  } catch (err: any) {
    console.error('Error during inspection:', err.message);
  } finally {
    await pool.end();
  }
}

main();
