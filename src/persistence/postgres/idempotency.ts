import { IdempotencyStore, IdempotencyRecord } from '../contracts/idempotency.js';
import { query } from './client.js';

export class PostgresIdempotencyStore implements IdempotencyStore {
  public async getRecord(key: string): Promise<IdempotencyRecord | null> {
    const res = await query(
      'SELECT key, response_body, created_at FROM idempotency_records WHERE key = $1',
      [key]
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return {
      key: row.key,
      responseBody: row.response_body,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  public async saveRecord(key: string, responseBody: any): Promise<void> {
    await query(
      `INSERT INTO idempotency_records (key, response_body, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET response_body = $2, created_at = NOW()`,
      [key, responseBody]
    );
  }

  public async deleteRecord(key: string): Promise<void> {
    await query('DELETE FROM idempotency_records WHERE key = $1', [key]);
  }
}
