import type { Server } from 'node:http';
import { loadControllerConfig } from '../config.js';
import { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import { LifecycleReconciler } from '../runtime/lifecycle-reconciler.js';
import { SessionRegistry } from '../runtime/session-registry.js';
import { logger } from '../shared/logger.js';
import { createControllerApp } from './app.js';

export async function startServer(envOverride?: Record<string, string | undefined>): Promise<{
  server: Server;
  port: number;
  stop: () => Promise<void>;
}> {
  const config = loadControllerConfig(envOverride);

  // 1. Initialize session registry
  const registry = new SessionRegistry(config.sessionRegistryPath);
  await registry.load();

  // 2. Initialize worker manager & reconciler
  const workerManager = new E2BWorkerManager(config, registry);
  const reconciler = new LifecycleReconciler(config, registry, workerManager);

  // 3. Perform startup reconciliation pass & start unref periodic timer
  await reconciler.reconcileNow();
  reconciler.startPeriodic(60000);

  // 4. Create Express Application
  const app = createControllerApp(config, workerManager, registry);

  // 5. Start HTTP Listener
  const port = config.controllerPort;
  const server = app.listen(port, () => {
    logger.info('Remote MCP Controller Server started successfully', {
      port,
      healthEndpoint: `http://localhost:${port}/health`,
      mcpEndpoint: `http://localhost:${port}/mcp`,
    });
  });

  const stop = async (): Promise<void> => {
    reconciler.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    logger.info('Remote MCP Controller Server stopped cleanly.');
  };

  return { server, port, stop };
}

// Entrypoint execution when started directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer().then(({ server, stop }) => {
    const handleShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Initiating graceful shutdown...`);
      await stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  }).catch((err) => {
    logger.error('Failed to start Remote MCP Controller Server', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
