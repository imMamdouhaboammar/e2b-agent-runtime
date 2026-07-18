import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PostgresLeaseManager } from '../../src/persistence/postgres/leases.js';
import { PostgresRateLimiter } from '../../src/persistence/postgres/rateLimiter.js';
import { QuotaManager, QuotaError } from '../../src/persistence/postgres/quotaManager.js';
import { createControllerApp, setDraining, setStarted } from '../../src/controller/app.js';
import { TaskStore } from '../../src/workflow/task-store.js';
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
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: 'test-owner', expires_at: new Date(Date.now() + 100000) }] });

      const manager = new PostgresLeaseManager('test-owner');
      const acquired = await manager.acquireLease('test-job', 10000);
      expect(acquired).toBe(true);
    });

    it('should fail to acquire lease when already held by another owner', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: 'other-owner', expires_at: new Date(Date.now() + 100000) }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const manager = new PostgresLeaseManager('test-owner');
      const acquired = await manager.acquireLease('test-job', 10000);
      expect(acquired).toBe(false);
    });
  });

  describe('PostgresRateLimiter', () => {
    it('should allow request when within limit', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ cnt: 1 }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const limiter = new PostgresRateLimiter();
      limiter['useDb'] = true;

      const limited = await limiter.isRateLimited('test-ip', 5, 60000);
      expect(limited).toBe(false);
    });

    it('should limit request when exceeding limit', async () => {
      const mockQuery = vi.mocked(db.query);
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ cnt: 6 }] });

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

  describe('TaskStore transaction locking', () => {
    it('uses the transaction client for every database operation inside a locked task creation', async () => {
      const transactionQuery = vi.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });
      const transactionClient = { query: transactionQuery };

      vi.mocked(db.withTransaction).mockImplementationOnce(async (callback: any) => callback(transactionClient));

      const store = new TaskStore();
      store['useDb'] = true;

      const task = await store.createTask({
        workspaceId: 'workspace-transaction-test',
        repository: 'owner/repository',
        taskMode: 'feature',
        taskLabel: 'Transaction client regression test',
        userRequestSummary: 'Verify all locked writes use one PostgreSQL transaction client',
      });

      expect(task.workspaceId).toBe('workspace-transaction-test');
      expect(transactionQuery).toHaveBeenCalledTimes(3);
      expect(db.query).not.toHaveBeenCalled();
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

    describe('OAuth Discovery and Dynamic Registration', () => {
      it('should return 200 and valid metadata for protected resource discovery', async () => {
        const res = await request(app).get('/.well-known/oauth-protected-resource');
        expect(res.status).toBe(200);
        expect(res.body.resource).toContain('/mcp');
        expect(res.body.authorization_servers).toHaveLength(1);
      });

      it('should return 200 and valid openid configuration', async () => {
        const res = await request(app).get('/.well-known/openid-configuration');
        expect(res.status).toBe(200);
        expect(res.body.issuer).toBeDefined();
        expect(res.body.authorization_endpoint).toContain('/oauth/authorize');
        expect(res.body.registration_endpoint).toContain('/oauth/register');
      });

      it('should successfully register a dynamic client', async () => {
        const mockQuery = vi.mocked(db.query);
        mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert success

        const res = await request(app)
          .post('/oauth/register')
          .send({
            client_name: 'Test Client',
            redirect_uris: ['https://example.com/callback'],
            grant_types: ['authorization_code'],
            token_endpoint_auth_method: 'none'
          });

        expect(res.status).toBe(201);
        expect(res.body.client_id).toBeDefined();
        expect(res.body.client_name).toBe('Test Client');
        expect(res.body.redirect_uris).toEqual(['https://example.com/callback']);
        expect(res.body.token_endpoint_auth_method).toBe('none');
      });

      it('should reject dynamic client registration when redirect_uris is missing or empty', async () => {
        const res = await request(app)
          .post('/oauth/register')
          .send({
            client_name: 'Test Client'
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_client_metadata');
      });
    });
  });
});
