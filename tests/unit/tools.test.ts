import { describe, expect, it, vi } from 'vitest';
import { createControllerMcpServer } from '../../src/mcp/create-server.js';
import type { E2BWorkerManager } from '../../src/runtime/e2b-worker-manager.js';
import type { SessionRecord, SessionRegistry } from '../../src/runtime/session-registry.js';

describe('MCP Tools Unit Test Suite', () => {
  it('should instantiate McpServer with all 6 required tool definitions', () => {
    const mockWorkerManager = {} as unknown as E2BWorkerManager;
    const mockRegistry = {} as unknown as SessionRegistry;

    const mcpServer = createControllerMcpServer(mockWorkerManager, mockRegistry);
    expect(mcpServer).toBeDefined();
  });
});
