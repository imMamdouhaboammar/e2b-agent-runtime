import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthMiddleware, timingSafeTokenMatch } from '../../src/controller/auth.js';

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

  describe('createAuthMiddleware', () => {
    const expectedToken = 'valid_mcp_access_token_999';
    const app = express();
    app.use('/mcp', createAuthMiddleware(expectedToken), (_req, res) => {
      res.status(200).json({ status: 'authenticated' });
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).post('/mcp').send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Authorization header is not Bearer', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Bearer token is incorrect', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer wrong_token')
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('should allow request when Bearer token is correct', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${expectedToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('authenticated');
    });
  });
});
