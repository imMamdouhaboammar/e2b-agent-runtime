import crypto from 'node:crypto';
import { hashToken } from '../controller/auth.js';
import * as db from '../persistence/postgres/client.js';

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  if (!process.env.DATABASE_URL && !process.env.TEST_DB_URL) {
    console.error('Error: DATABASE_URL environment variable is required for database auth operations.');
    process.exit(1);
  }

  const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;

  try {
    switch (action) {
      case 'create': {
        const identifier = args[1];
        const days = args[2] ? Number.parseInt(args[2], 10) : undefined;
        if (!identifier) {
          console.log('Usage: pnpm auth:create-token <identifier> [expiresInDays]');
          process.exit(1);
        }

        // Generate high-entropy token (32 bytes = 256 bits of entropy)
        const plaintext = crypto.randomBytes(32).toString('hex');
        const hash = hashToken(plaintext);
        const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

        await db.query(
          `INSERT INTO tokens (token_hash, token_identifier, expires_at, created_at, revoked)
           VALUES ($1, $2, $3, NOW(), false)`,
          [hash, identifier, expiresAt],
          dbUrl
        );

        console.log('Token created successfully!');
        console.log(`Identifier: ${identifier}`);
        console.log(`Expires At: ${expiresAt ? expiresAt.toISOString() : 'Never'}`);
        console.log(`Plaintext Token (displayed ONLY once): \x1b[32m${plaintext}\x1b[0m`);
        break;
      }

      case 'list': {
        const res = await db.query(
          'SELECT token_identifier, expires_at, revoked, last_used_at, created_at FROM tokens ORDER BY created_at DESC',
          [],
          dbUrl
        );

        console.log('\n--- ACTIVE TOKENS ---');
        if (res.rowCount === 0) {
          console.log('No tokens found.');
        } else {
          for (const r of res.rows) {
            console.log(`Identifier: ${r.token_identifier}`);
            console.log(`  Created At: ${new Date(r.created_at).toISOString()}`);
            console.log(`  Expires At: ${r.expires_at ? new Date(r.expires_at).toISOString() : 'Never'}`);
            console.log(`  Last Used At: ${r.last_used_at ? new Date(r.last_used_at).toISOString() : 'Never'}`);
            console.log(`  Status: ${r.revoked ? '\x1b[31mREVOKED\x1b[0m' : '\x1b[32mACTIVE\x1b[0m'}`);
            console.log('---------------------');
          }
        }
        break;
      }

      case 'revoke': {
        const identifier = args[1];
        if (!identifier) {
          console.log('Usage: pnpm auth:revoke-token <identifier>');
          process.exit(1);
        }

        const res = await db.query(
          'UPDATE tokens SET revoked = true WHERE token_identifier = $1',
          [identifier],
          dbUrl
        );

        console.log(`Revoked ${res.rowCount} token(s) matching identifier "${identifier}".`);
        break;
      }

      case 'rotate': {
        const oldIdentifier = args[1];
        const newIdentifier = args[2] || oldIdentifier;
        const days = args[3] ? Number.parseInt(args[3], 10) : undefined;

        if (!oldIdentifier) {
          console.log('Usage: pnpm auth:rotate-token <oldIdentifier> [newIdentifier] [expiresInDays]');
          process.exit(1);
        }

        // Revoke old tokens
        await db.query(
          'UPDATE tokens SET revoked = true WHERE token_identifier = $1',
          [oldIdentifier],
          dbUrl
        );

        // Generate new token
        const plaintext = crypto.randomBytes(32).toString('hex');
        const hash = hashToken(plaintext);
        const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

        await db.query(
          `INSERT INTO tokens (token_hash, token_identifier, expires_at, created_at, revoked)
           VALUES ($1, $2, $3, NOW(), false)`,
          [hash, newIdentifier, expiresAt],
          dbUrl
        );

        console.log(`Rotated token "${oldIdentifier}" successfully.`);
        console.log(`New Identifier: ${newIdentifier}`);
        console.log(`Plaintext Token (displayed ONLY once): \x1b[32m${plaintext}\x1b[0m`);
        break;
      }

      default: {
        console.log('Unknown action. Supported: create, list, revoke, rotate');
        process.exit(1);
      }
    }
  } catch (err: any) {
    console.error('CLI Operation Failed:', err.message);
    process.exit(1);
  } finally {
    await db.closeDbPool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
