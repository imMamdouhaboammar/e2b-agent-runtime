import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../shared/logger.js';
import * as db from '../persistence/postgres/client.js';

export function timingSafeTokenMatch(providedToken: string, expectedToken: string): boolean {
  if (!providedToken || !expectedToken) return false;

  const a = Buffer.from(providedToken, 'utf-8');
  const b = Buffer.from(expectedToken, 'utf-8');

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createAuthMiddleware(expectedToken: string) {
  const useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization Bearer header.',
      });
      return;
    }

    const providedToken = authHeader.substring(7).trim();

    if (useDb) {
      try {
        const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
        const hashed = hashToken(providedToken);
        const tokenRes = await db.query(
          `SELECT id, expires_at, revoked FROM tokens WHERE token_hash = $1`,
          [hashed],
          dbUrl
        );

        if (tokenRes.rowCount && tokenRes.rowCount > 0) {
          const t = tokenRes.rows[0];
          if (t.revoked) {
            res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token has been revoked.' });
            return;
          }
          if (t.expires_at && new Date(t.expires_at) < new Date()) {
            res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token has expired.' });
            return;
          }

          // Update last used timestamp in the background
          db.query(
            'UPDATE tokens SET last_used_at = NOW() WHERE id = $1',
            [t.id],
            dbUrl
          ).catch(() => {});

          next();
          return;
        }
      } catch (err: any) {
        logger.error('Database token auth check failed', { error: err.message });
      }
    }

    // Fallback to environment/expected token
    if (!timingSafeTokenMatch(providedToken, expectedToken)) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid access token provided.',
      });
      return;
    }

    next();
  };
}
