import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import type { SessionRegistry } from '../runtime/session-registry.js';
import { ControllerError, formatSafeErrorMessage } from '../shared/errors.js';

export function createControllerMcpServer(
  workerManager: E2BWorkerManager,
  registry: SessionRegistry
): McpServer {
  const server = new McpServer({
    name: 'e2b-agent-runtime-controller',
    version: '0.0.1',
  });

  // 1. runtime_create_session
  server.tool(
    'runtime_create_session',
    'Create a disposable E2B Worker Sandbox session for isolated code execution',
    {
      timeoutMs: z
        .number()
        .optional()
        .describe('Optional worker session timeout in milliseconds'),
      taskLabel: z
        .string()
        .optional()
        .describe('Optional label or short task description'),
      metadata: z
        .record(z.string())
        .optional()
        .describe('Optional string key-value metadata pairs'),
    },
    async (args) => {
      try {
        const record = await workerManager.createWorkerSession({
          timeoutMs: args.timeoutMs,
          taskLabel: args.taskLabel,
          metadata: args.metadata,
        });

        const publicInfo = {
          sessionId: record.sessionId,
          state: record.state,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          workspacePath: '/workspace',
          taskLabel: record.taskLabel,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(publicInfo, null, 2) }],
        };
      } catch (error) {
        const safe = formatSafeErrorMessage(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }],
        };
      }
    }
  );

  // 2. runtime_list_sessions
  server.tool(
    'runtime_list_sessions',
    'List all active and recent worker runtime sessions owned by this controller',
    {},
    async () => {
      try {
        const sessions = await registry.listSessions();
        const sanitizedList = sessions.map((s) => ({
          sessionId: s.sessionId,
          state: s.state,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          expiresAt: s.expiresAt,
          taskLabel: s.taskLabel,
          lastCommandStatus: s.lastCommandStatus,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(sanitizedList, null, 2) }],
        };
      } catch (error) {
        const safe = formatSafeErrorMessage(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }],
        };
      }
    }
  );

  // 3. runtime_get_session
  server.tool(
    'runtime_get_session',
    'Retrieve state and lifecycle information for a specific runtime session',
    {
      sessionId: z.string().describe('Opaque runtime session ID'),
    },
    async (args) => {
      try {
        const session = await registry.getSession(args.sessionId);
        if (!session) {
          throw new ControllerError(
            'SESSION_NOT_FOUND',
            `Session "${args.sessionId}" not found.`,
            404
          );
        }

        const publicDetails = {
          sessionId: session.sessionId,
          state: session.state,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          expiresAt: session.expiresAt,
          taskLabel: session.taskLabel,
          lastCommandStatus: session.lastCommandStatus,
          failureReason: session.failureReason,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(publicDetails, null, 2) }],
        };
      } catch (error) {
        const safe = formatSafeErrorMessage(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }],
        };
      }
    }
  );

  // 4. runtime_run_command
  server.tool(
    'runtime_run_command',
    'Execute a terminal command inside the specified worker sandbox restricted to /workspace',
    {
      sessionId: z.string().describe('Opaque runtime session ID'),
      command: z.string().describe('Terminal shell command to execute'),
      cwd: z
        .string()
        .optional()
        .describe('Working directory inside sandbox (default: /workspace)'),
      timeoutMs: z
        .number()
        .optional()
        .describe('Optional command execution timeout in milliseconds'),
    },
    async (args) => {
      try {
        const result = await workerManager.runCommand(
          args.sessionId,
          args.command,
          args.cwd,
          args.timeoutMs
        );

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const safe = formatSafeErrorMessage(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }],
        };
      }
    }
  );

  // 5. runtime_destroy_session
  server.tool(
    'runtime_destroy_session',
    'Idempotently kill and destroy a worker sandbox session',
    {
      sessionId: z.string().describe('Opaque runtime session ID to destroy'),
    },
    async (args) => {
      try {
        const success = await workerManager.destroySession(args.sessionId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: args.sessionId,
                  destroyed: success,
                  state: 'destroyed',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const safe = formatSafeErrorMessage(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }],
        };
      }
    }
  );

  // 6. runtime_destroy_all_sessions
  server.tool(
    'runtime_destroy_all_sessions',
    'Emergency operation: Destroy all active worker sandbox sessions owned by this controller',
    {
      confirm: z
        .boolean()
        .describe('Set to true to explicitly confirm destroying all active sessions'),
    },
    async (args) => {
      try {
        if (!args.confirm) {
          throw new ControllerError(
            'INVALID_INPUT',
            'Confirmation required: Set "confirm: true" to proceed with destroying all active sessions.',
            400
          );
        }

        const results = await workerManager.destroyAllSessions();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  confirmed: true,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const safe = formatSafeErrorMessage(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }],
        };
      }
    }
  );

  return server;
}
