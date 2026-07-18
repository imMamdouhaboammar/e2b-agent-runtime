import type { Server } from 'node:http';
import { loadControllerConfig } from '../config.js';
import { loadSandboxProviderConfig } from '../sandbox/providerConfig.js';
import { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import { LifecycleReconciler } from '../runtime/lifecycle-reconciler.js';
import { SessionRegistry } from '../runtime/session-registry.js';
import { logger } from '../shared/logger.js';
import { createControllerApp, setDraining, setStarted } from './app.js';
import { closeDbPool } from '../persistence/postgres/client.js';
import { runMigrations } from '../persistence/postgres/migrations/runner.js';
import { initializeTelemetry } from '../observability/opentelemetry.js';
import { MetricsCollector } from '../runtime/metricsCollector.js';

export async function startServer(envOverride?: Record<string, string | undefined>): Promise<{
  server: Server;
  port: number;
  stop: () => Promise<void>;
}> {
  const config = loadControllerConfig(envOverride);
  const providerConfig = loadSandboxProviderConfig(envOverride);
  logger.info('sandbox.provider.selected', { provider: providerConfig.provider });

  // Initialize Telemetry
  initializeTelemetry();

  // Run DB migrations if configured
  const dbUrl = envOverride?.TEST_DB_URL || envOverride?.DATABASE_URL || process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      logger.info('DATABASE_URL detected. Running database migrations...');
      await runMigrations(dbUrl);
    } catch (err: any) {
      logger.error('Failed to run database migrations at startup', { error: err.message });
      throw err;
    }
  }

  // 1. Initialize session registry
  const registry = new SessionRegistry(config.sessionRegistryPath);
  await registry.load();

  // 2. Initialize worker manager & reconciler
  const workerManager = new E2BWorkerManager(config, registry);
  const reconciler = new LifecycleReconciler(config, registry, workerManager);

  // 3. Perform startup reconciliation pass & start unref periodic timer
  await reconciler.reconcileNow();
  reconciler.startPeriodic(60000);

  // Start E2B Sandbox metrics collector
  const metricsCollector = new MetricsCollector(registry);
  metricsCollector.start(30000);

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

  setStarted(true);

  const stop = async (): Promise<void> => {
    setDraining(true);
    reconciler.stop();
    metricsCollector.stop();
    
    // Allow active connections to drain
    logger.info('Draining server connections...');
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // Close PG connection pool
    await closeDbPool();

    logger.info('Remote MCP Controller Server stopped cleanly.');
  };

  return { server, port, stop };
}

// Entrypoint execution when started directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer().then(({ server, stop }) => {
    const handleShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Initiating graceful shutdown...`);
      try {
        await stop();
        process.exit(0);
      } catch (err: any) {
        logger.error('Graceful shutdown failed', { error: err.message });
        process.exit(1);
      }
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
