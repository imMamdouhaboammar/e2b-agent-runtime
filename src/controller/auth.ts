import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import * as jose from 'jose';
import { logger } from '../shared/logger.js';
import * as db from '../persistence/postgres/client.js';

const JWKS_URL = 'https://lqekyrkxnxqtclhkaknm.supabase.co/auth/v1/.well-known/jwks.json';
let jwksKeys: any = null;

function getJwks() {
  if (!jwksKeys) {
    jwksKeys = jose.createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwksKeys;
}

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

    // Dynamically build resource metadata URL to support multiple environments seamlessly
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const resourceMetadataUrl = `${protocol}://${host}/.well-known/oauth-protected-resource/mcp`;

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization Bearer header.',
      });
      return;
    }

    const providedToken = authHeader.substring(7).trim();

    // 1. Try checking if it's a Supabase-issued OAuth or User JWT
    let isJwt = false;
    let payload: any = null;

    if (providedToken.split('.').length === 3) {
      try {
        const jwks = getJwks();
        const verifyRes = await jose.jwtVerify(providedToken, jwks, {
          issuer: 'https://lqekyrkxnxqtclhkaknm.supabase.co/auth/v1',
        });
        payload = verifyRes.payload;
        isJwt = true;
      } catch (err: any) {
        logger.debug('Token format matched JWT but JWKS verification failed', { error: err.message });
      }
    }

    if (isJwt && payload) {
      if (useDb) {
        try {
          const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
          
          // Verify user membership is active
          const memberRes = await db.query(
            `SELECT role, status FROM public.runtime_memberships WHERE user_id = $1 AND status = 'active'`,
            [payload.sub],
            dbUrl
          );

          if (!memberRes.rowCount || memberRes.rowCount === 0) {
            res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="User does not have an active membership.", resource_metadata="${resourceMetadataUrl}"`);
            res.status(401).json({
              error: 'UNAUTHORIZED',
              message: 'User does not have an active membership in this controller.',
            });
            return;
          }

          const member = memberRes.rows[0];

          // If client_id / azp is present (meaning third-party OAuth connection), verify the client grant is active
          const clientId = payload.client_id || payload.azp;
          if (clientId && clientId !== payload.sub) {
            const grantRes = await db.query(
              `SELECT status FROM public.mcp_user_client_grants WHERE user_id = $1 AND client_id = $2 AND status = 'active'`,
              [payload.sub, clientId],
              dbUrl
            );

            if (!grantRes.rowCount || grantRes.rowCount === 0) {
              res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="OAuth client connection has not been approved or has been revoked.", resource_metadata="${resourceMetadataUrl}"`);
              res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'OAuth client connection has not been approved or has been revoked.',
              });
              return;
            }

            // Log last used timestamp asynchronously
            db.query(
              'UPDATE public.mcp_user_client_grants SET last_used_at = NOW() WHERE user_id = $1 AND client_id = $2',
              [payload.sub, clientId],
              dbUrl
            ).catch(() => {});
          }

          // Populate user context
          (req as any).user = {
            id: payload.sub,
            email: payload.email,
            role: member.role,
            clientId: clientId || null,
          };

          next();
          return;
        } catch (err: any) {
          logger.error('Database membership check failed during JWT authentication', { error: err.message });
          res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Database query failed during authentication.' });
          return;
        }
      } else {
        // Fallback for DB-less modes
        (req as any).user = {
          id: payload.sub,
          email: payload.email,
          role: 'developer',
          clientId: payload.client_id || payload.azp || null,
        };
        next();
        return;
      }
    }

    // 2. Try checking if it's a Database-backed static token
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
            res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="Token has been revoked.", resource_metadata="${resourceMetadataUrl}"`);
            res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token has been revoked.' });
            return;
          }
          if (t.expires_at && new Date(t.expires_at) < new Date()) {
            res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="Token has expired.", resource_metadata="${resourceMetadataUrl}"`);
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

    // 3. Fallback to expected/config master token
    if (!timingSafeTokenMatch(providedToken, expectedToken)) {
      res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="Invalid access token provided.", resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid access token provided.',
      });
      return;
    }

    next();
  };
}
