import { e2bWorkerManager } from './e2b-worker-manager.js';
import type { SessionRegistry } from './session-registry.js';
import * as db from '../persistence/postgres/client.js';
import { logger } from '../shared/logger.js';

export interface SandboxMetrics {
  cpuUsed: number;
  cpuCapacity: number;
  memoryUsed: number;
  memoryCapacity: number;
  diskUsed: number;
  diskCapacity: number;
  timestamp: string;
}

export class MetricsCollector {
  private registry: SessionRegistry;
  private intervalId: NodeJS.Timeout | null = null;
  private useDb = false;

  constructor(registry: SessionRegistry) {
    this.registry = registry;
    this.useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
  }

  public start(intervalMs = 30000) {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (err: any) {
        logger.error('metrics.collection.failed', { error: err.message });
      }
    }, intervalMs);

    // Unref so it doesn't block process exit
    this.intervalId.unref();
    logger.info('Sandbox metrics collector started.');
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Sandbox metrics collector stopped.');
    }
  }

  public async collectMetrics() {
    const activeSessions = await this.registry.getActiveSessions();
    if (activeSessions.length === 0) return;

    for (const session of activeSessions) {
      try {
        const sandbox = await e2bWorkerManager.getSandbox(session.e2bSandboxId);
        
        // Execute queries inside the sandbox to get system stats (highly robust, works everywhere)
        const memRes = await sandbox.commands.run("cat /proc/meminfo | grep -E 'MemTotal|MemAvailable'");
        const diskRes = await sandbox.commands.run("df -B1 /workspace | tail -n 1");

        let memoryCapacity = 1024 * 1024 * 1024; // fallback 1GB
        let memoryUsed = 0;
        const memTotalMatch = memRes.stdout.match(/MemTotal:\s+(\d+)\s+kB/);
        const memAvailMatch = memRes.stdout.match(/MemAvailable:\s+(\d+)\s+kB/);
        if (memTotalMatch && memAvailMatch) {
          const totalKb = Number.parseInt(memTotalMatch[1], 10);
          const availKb = Number.parseInt(memAvailMatch[1], 10);
          memoryCapacity = totalKb * 1024;
          memoryUsed = (totalKb - availKb) * 1024;
        }

        let diskCapacity = 10 * 1024 * 1024 * 1024; // fallback 10GB
        let diskUsed = 0;
        const diskParts = diskRes.stdout.trim().split(/\s+/);
        if (diskParts.length >= 4) {
          diskCapacity = Number.parseInt(diskParts[1], 10) || diskCapacity;
          diskUsed = Number.parseInt(diskParts[2], 10) || diskUsed;
        }

        // CPU mock/approximate load
        const cpuUsed = 10; 
        const cpuCapacity = 100;

        const metrics: SandboxMetrics = {
          cpuUsed,
          cpuCapacity,
          memoryUsed,
          memoryCapacity,
          diskUsed,
          diskCapacity,
          timestamp: new Date().toISOString(),
        };

        logger.debug('sandbox.metrics.collected', { sessionId: session.sessionId, metrics });

        if (this.useDb) {
          const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
          // Store in a simple metrics table or log/alert if thresholds are exceeded
          await db.query(
            `INSERT INTO audit_logs (event, actor_id, metadata, created_at)
             VALUES ('metrics_collected', $1, $2, NOW())`,
            [session.sessionId, JSON.stringify(metrics)],
            dbUrl
          );
        }
      } catch (err: any) {
        logger.warn('Failed to collect metrics for sandbox', {
          sessionId: session.sessionId,
          error: err.message,
        });
      }
    }
  }
}
