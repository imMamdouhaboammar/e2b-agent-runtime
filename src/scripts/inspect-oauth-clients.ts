import pg from 'pg';

const dbUrl = 'postgresql://postgres.lqekyrkxnxqtclhkaknm:H%24eGMzD5zrC5P%40%40@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function main() {
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    console.log('=== Clients in auth.oauth_clients ===');
    const clientsRes = await client.query(
      `SELECT id, client_name, redirect_uris, grant_types, client_type, token_endpoint_auth_method FROM auth.oauth_clients`
    );
    clientsRes.rows.forEach(r => {
      console.log(`- ID: ${r.id}`);
      console.log(`  Name: ${r.client_name}`);
      console.log(`  Redirect URIs: ${r.redirect_uris}`);
      console.log(`  Grant Types: ${r.grant_types}`);
      console.log(`  Client Type: ${r.client_type}`);
      console.log(`  Auth Method: ${r.token_endpoint_auth_method}`);
      console.log('---');
    });

    console.log('\n=== Client Policies in mcp_private.mcp_client_policies ===');
    try {
      const policyRes = await client.query(
        `SELECT * FROM mcp_private.mcp_client_policies`
      );
      policyRes.rows.forEach(r => {
        console.log(`- Client ID: ${r.client_id}`);
        console.log(`  Display Name: ${r.display_name}`);
        console.log(`  Trust State: ${r.trust_state}`);
        console.log(`  Max Role: ${r.maximum_role}`);
        console.log(`  Allow Read Tools: ${r.allow_read_tools}`);
        console.log(`  Allow Worker Writes: ${r.allow_worker_writes}`);
        console.log(`  Allow External Writes: ${r.allow_external_writes}`);
        console.log('---');
      });
    } catch (e: any) {
      console.log(`Failed to load client policies: ${e.message}`);
    }

    client.release();
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
