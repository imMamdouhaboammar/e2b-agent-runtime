import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

// Ensure database mode is enabled for auth middleware testing
process.env.DATABASE_URL = 'postgresql://localhost:5432/postgres';

import { createAuthMiddleware, timingSafeTokenMatch } from '../../src/controller/auth.js';

// Mock jose.jwtVerify to return mock JWT payloads cleanly
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    jwtVerify: async (token: string) => {
      if (token === 'mock.user.jwt') {
        return {
          payload: {
            sub: 'f87a329c-efb1-4bc1-9c60-84a1e9df641b',
            email: 'test-user@e2b.dev',
            iss: 'https://lqekyrkxnxqtclhkaknm.supabase.co/auth/v1',
          },
        };
      }
      if (token === 'mock.oauth.jwt') {
        return {
          payload: {
            sub: 'f87a329c-efb1-4bc1-9c60-84a1e9df641b',
            email: 'test-user@e2b.dev',
            iss: 'https://lqekyrkxnxqtclhkaknm.supabase.co/auth/v1',
            client_id: 'mock-oauth-client-id-xyz',
          },
        };
      }
      if (token === 'mock.revoked.jwt') {
        return {
          payload: {
            sub: 'f87a329c-efb1-4bc1-9c60-84a1e9df641b',
            email: 'test-user@e2b.dev',
            iss: 'https://lqekyrkxnxqtclhkaknm.supabase.co/auth/v1',
            client_id: 'revoked-oauth-client-id',
          },
        };
      }
      throw new Error('Invalid signature');
    },
  };
});

// Mock database query responses to check memberships and client grants
vi.mock('../../src/persistence/postgres/client.js', () => {
  return {
    query: async (text: string, params?: any[]) => {
      // Membership status check
      if (text.includes('SELECT role, status FROM public.runtime_memberships')) {
        const userId = params?.[0];
        if (userId === 'f87a329c-efb1-4bc1-9c60-84a1e9df641b') {
          return {
            rowCount: 1,
            rows: [{ role: 'developer', status: 'active' }],
          };
        }
        return { rowCount: 0, rows: [] };
      }

      // OAuth client grant status check
      if (text.includes('SELECT status FROM public.mcp_user_client_grants')) {
        const userId = params?.[0];
        const clientId = params?.[1];
        if (userId === 'f87a329c-efb1-4bc1-9c60-84a1e9df641b' && clientId === 'mock-oauth-client-id-xyz') {
          return {
            rowCount: 1,
            rows: [{ status: 'active' }],
          };
        }
        return { rowCount: 0, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    },
    checkDbConnection: async () => true,
  };
});

describe('Auth Security Module', () => {
  describe('timingSafeTokenMatch', () => {
    it('should return true for matching tokens', () => {
      expect(timingSafeTokenMatch('secret_token_123', 'secret_token_123')).toBe(true);
    });

    it('should return false for different length tokens', () => {
      expect(timingSafeTokenMatch('short', 'longer_token')).toBe(false);
    });

    it('should return false for mismatched content of same length', () => {
      expect(timingSafeTokenMatch('token_aaaaa', 'token_bbbbb')).toBe(false);
    });

    it('should return false if token is empty or undefined', () => {
      expect(timingSafeTokenMatch('', 'expected')).toBe(false);
      expect(timingSafeTokenMatch('provided', '')).toBe(false);
    });
  });

  describe('createAuthMiddleware & Supabase JWKS', () => {
    const expectedToken = 'valid_mcp_access_token_999';
    const app = express();
    app.use('/mcp', createAuthMiddleware(expectedToken), (req, res) => {
      res.status(200).json({ 
        status: 'authenticated', 
        user: (req as any).user 
      });
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).post('/mcp').send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
      expect(res.headers['www-authenticate']).toContain('resource_metadata=');
      expect(res.headers['www-authenticate']).toContain('/.well-known/oauth-protected-resource/mcp');
    });

    it('should return 401 when Authorization header is not Bearer', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .send({});
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain('resource_metadata=');
    });

    it('should allow request when expected static Bearer token is correct', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${expectedToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('authenticated');
    });

    it('should allow access when a valid personal Supabase JWT is provided', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer mock.user.jwt')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('authenticated');
      expect(res.body.user.id).toBe('f87a329c-efb1-4bc1-9c60-84a1e9df641b');
      expect(res.body.user.role).toBe('developer');
    });

    it('should allow access when a valid third-party OAuth client JWT is approved', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer mock.oauth.jwt')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('authenticated');
      expect(res.body.user.clientId).toBe('mock-oauth-client-id-xyz');
    });

    it('should reject access when a third-party OAuth client grant is not approved/revoked', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer mock.revoked.jwt')
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('OAuth client connection has not been approved');
    });
  });
});
