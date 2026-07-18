import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadControllerConfig } from '../../config.js';
import type { SessionRegistry } from '../../runtime/session-registry.js';
import type { E2BWorkerManager } from '../../runtime/e2b-worker-manager.js';
import { checkDbConnection } from '../../persistence/postgres/client.js';

// Simple ring buffer to store recent sanitized incidents
const incidentBuffer: Array<{ timestamp: string; event: string; message: string }> = [];

export function recordIncident(event: string, message: string) {
  incidentBuffer.push({
    timestamp: new Date().toISOString(),
    event,
    message: message.replace(/bearer\s+\S+/gi, '[REDACTED]').replace(/key=\S+/gi, 'key=[REDACTED]'),
  });
  if (incidentBuffer.length > 10) {
    incidentBuffer.shift();
  }
}

export function registerPhase9Tools(
  server: McpServer,
  params: {
    registry: SessionRegistry;
    workerManager: E2BWorkerManager;
  }
) {
  const config = loadControllerConfig();

  // 1. runtime_system_status (read-only)
  server.tool(
    'runtime_system_status',
    'Retrieve Remote MCP Controller health, DB status, active sessions, and job health',
    {},
    async () => {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      let dbConnected = false;
      if (dbUrl) {
        dbConnected = await checkDbConnection(dbUrl);
      }

      const sessions = await params.registry.listSessions();
      const activeSessions = sessions.filter((s) => s.state === 'active');

      const status = {
        service: 'e2b-agent-runtime-controller',
        version: '0.0.1',
        environment: process.env.NODE_ENV || 'development',
        deploymentIdentifier: process.env.DEPLOYMENT_ID || 'local',
        readiness: dbUrl ? dbConnected : true,
        draining: false, // will update dynamically in real integrations
        providerAvailability: !!process.env.E2B_API_KEY,
        databaseAvailability: dbUrl ? dbConnected : 'not_configured',
        activeWorkerCount: activeSessions.length,
        activeWorkspaceCount: sessions.length,
        backgroundJobHealth: 'nominal',
        backupFreshnessStatus: 'current',
        telemetryStatus: process.env.TELEMETRY_DISABLED !== 'true',
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
      };
    }
  );

  // 2. runtime_capacity_status (read-only)
  server.tool(
    'runtime_capacity_status',
    'Retrieve limits, resource capacities, and soft/hard quota usage',
    {},
    async () => {
      const capacity = {
        workerCapacity: config.maxActiveWorkers,
        workspaceCapacity: 50,
        terminalCapacity: config.maxTerminalsPerWorkspace,
        browserCapacity: {
          maxSessionsPerWorkspace: 2,
          maxPagesPerSession: 5,
        },
        artifactQuotaUsage: {
          totalBytes: 0,
          maxBytes: 104857600, // 100MB
        },
        warnings: [] as string[],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(capacity, null, 2) }],
      };
    }
  );

  // 3. runtime_incident_snapshot (read-only)
  server.tool(
    'runtime_incident_snapshot',
    'Retrieve a list of recent system errors and operational failures (sanitized of secrets)',
    {},
    async () => {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(incidentBuffer, null, 2) }],
      };
    }
  );
}
