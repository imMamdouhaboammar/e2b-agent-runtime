import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PostgresLeaseManager } from '../../src/persistence/postgres/leases.js';
import { PostgresRateLimiter } from '../../src/persistence/postgres/rateLimiter.js';
import { QuotaManager, QuotaError } from '../../src/persistence/postgres/quotaManager.js';
import { createControllerApp, setDraining, setStarted } from '../../src/controller/app.js';
import { SessionRegistry } from '../../src/runtime/session-registry.js';
import { E2BWorkerManager } from '../../src/runtime/e2b-worker-manager.js';
import * as db from '../../src/persistence/postgres/client.js';

vi.mock('../../src/persistence/postgres/client.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn((cb) => cb({ query: vi.fn() })),
  checkDbConnection: vi.fn(() => Promise.resolve(true)),
  closeDbPool: vi.fn(),
}));

describe('Phase 9 Production Hardening Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PostgresLeaseManager', () => {
    it('should acquire lease when database query reports success', async () => {
      const mockQuery = vi.mocked(db.query);
      // First insert DO NOTHING, second update sets active
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert success
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: 'test-owner', expires_at: new Date(Date.now() + 100000) }] }); // active check

      const manager = new PostgresLeaseManager('test-owner');
      const acquired = await manager.acquireLease('test-job', 10000);
      expect(acquired).toBe(true);
    });

    it('should fail to acquire lease when already held by another owner', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // insert conflict
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: 'other-owner', expires_at: new Date(Date.now() + 100000) }] }); // active check false
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // update failed

      const manager = new PostgresLeaseManager('test-owner');
      const acquired = await manager.acquireLease('test-job', 10000);
      expect(acquired).toBe(false);
    });
  });

  describe('PostgresRateLimiter', () => {
    it('should allow request when within limit', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // delete success
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ cnt: 1 }] }); // count within limit
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert success

      const limiter = new PostgresRateLimiter();
      // Enable database mode explicitly for the test
      limiter['useDb'] = true;
      
      const limited = await limiter.isRateLimited('test-ip', 5, 60000);
      expect(limited).toBe(false);
    });

    it('should limit request when exceeding limit', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // delete success
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ cnt: 6 }] }); // count exceeds limit

      const limiter = new PostgresRateLimiter();
      limiter['useDb'] = true;

      const limited = await limiter.isRateLimited('test-ip', 5, 60000);
      expect(limited).toBe(true);
    });
  });

  describe('QuotaManager', () => {
    it('should allow creation when quota is not exceeded', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 2 }] });

      const quota = new QuotaManager();
      quota['useDb'] = true;

      await expect(quota.checkQuota('token-1', 'active_workers', 5)).resolves.not.toThrow();
    });

    it('should throw QuotaError when quota is exceeded', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 5 }] });

      const quota = new QuotaManager();
      quota['useDb'] = true;

      await expect(quota.checkQuota('token-1', 'active_workers', 5)).rejects.toThrow(QuotaError);
    });
  });

  describe('Health Endpoints & Graceful Draining', () => {
    let app: express.Express;
    let mockRegistry: any;
    let mockWorkerManager: any;

    beforeEach(() => {
      setDraining(false);
      setStarted(true);
      mockRegistry = {
        listSessions: vi.fn().mockResolvedValue([]),
      };
      mockWorkerManager = {};
      app = createControllerApp({ mcpAccessToken: 'test' } as any, mockWorkerManager, mockRegistry);
    });

    it('should return 200 for liveness health check', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should return 200 for readiness health check when DB is connected', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    it('should return 503 for readiness health check when server is draining', async () => {
      setDraining(true);
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('draining');
    });

    it('should reject MCP calls with 503 when server is draining', async () => {
      setDraining(true);
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test')
        .send({});
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
