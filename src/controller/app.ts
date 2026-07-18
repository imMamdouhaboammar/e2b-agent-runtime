import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ControllerConfig } from '../config.js';
import { createControllerMcpServer } from '../mcp/create-server.js';
import type { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import type { SessionRegistry } from '../runtime/session-registry.js';
import { logger } from '../shared/logger.js';
import { createAuthMiddleware } from './auth.js';

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

  // Public Health Endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'e2b-agent-runtime-controller',
      version: '0.0.1',
    });
  });

  // Public Readiness Endpoint
  app.get('/ready', async (_req: Request, res: Response) => {
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
