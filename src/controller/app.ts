import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ControllerConfig } from '../config.js';
import { createControllerMcpServer } from '../mcp/create-server.js';
import type { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import type { SessionRegistry } from '../runtime/session-registry.js';
import { logger } from '../shared/logger.js';
import { createAuthMiddleware } from './auth.js';
import { checkDbConnection } from '../persistence/postgres/client.js';

let isDraining = false;
let isStarted = false;

export function setDraining(val: boolean) {
  isDraining = val;
}

export function setStarted(val: boolean) {
  isStarted = val;
}

export function createControllerApp(
  config: ControllerConfig,
  workerManager: E2BWorkerManager,
  registry: SessionRegistry
): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Host Header validation middleware
  app.use((req: Request, res: Response, next) => {
    const host = req.headers.host;
    if (host && (host.includes('<script>') || host.includes('\n') || host.includes('\r'))) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Malformed Host header.' });
      return;
    }
    next();
  });

  // 1. Liveness health check
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'e2b-agent-runtime-controller',
      version: '0.0.1',
    });
  });

  // Keep compatibility with legacy /health path
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'e2b-agent-runtime-controller',
      version: '0.0.1',
    });
  });

  // 2. Readiness health check
  app.get('/health/ready', async (_req: Request, res: Response) => {
    if (isDraining) {
      res.status(503).json({
        status: 'draining',
        message: 'Server is shutting down.',
      });
      return;
    }

    try {
      // Check database connection if configured
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      if (dbUrl) {
        const dbConnected = await checkDbConnection(dbUrl);
        if (!dbConnected) {
          res.status(503).json({
            status: 'not_ready',
            message: 'Database connection failed',
          });
          return;
        }
      }

      await registry.listSessions();
      res.status(200).json({
        status: 'ready',
        service: 'e2b-agent-runtime-controller',
      });
    } catch {
      res.status(503).json({
        status: 'not_ready',
        message: 'Session registry unavailable',
      });
    }
  });

  // Keep legacy /ready path
  app.get('/ready', async (req: Request, res: Response) => {
    if (isDraining) {
      res.status(503).json({ status: 'draining', message: 'Server is shutting down.' });
      return;
    }
    try {
      await registry.listSessions();
      res.status(200).json({
        status: 'ready',
        service: 'e2b-agent-runtime-controller',
      });
    } catch {
      res.status(503).json({
        status: 'not_ready',
        message: 'Session registry unavailable',
      });
    }
  });

  // 3. Startup health check
  app.get('/health/startup', (_req: Request, res: Response) => {
    if (isStarted) {
      res.status(200).json({
        status: 'started',
        service: 'e2b-agent-runtime-controller',
      });
    } else {
      res.status(503).json({
        status: 'starting',
        message: 'Server is still initializing',
      });
    }
  });

  // Create MCP Server & Transport
  const mcpServer = createControllerMcpServer(workerManager, registry);
  const mcpTransport = new StreamableHTTPServerTransport({});

  mcpServer.connect(mcpTransport).catch((err) => {
    logger.error('Failed to connect MCP server to StreamableHTTP transport', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Protected MCP HTTP Endpoint
  const authMiddleware = createAuthMiddleware(config.mcpAccessToken);

  app.all('/mcp', authMiddleware, (req: Request, res: Response) => {
    if (isDraining) {
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Server is draining and shutting down.',
      });
      return;
    }

    mcpTransport.handleRequest(req, res).catch((err) => {
      logger.error('Error handling StreamableHTTP MCP request', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'An internal error occurred while processing MCP transport request.',
        });
      }
    });
  });

  return app;
}
