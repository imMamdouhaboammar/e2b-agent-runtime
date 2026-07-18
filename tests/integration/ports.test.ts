import { describe, it, expect } from 'vitest';
import { loadControllerConfig } from '../../src/config.js';
import { CodingWorkspaceOrchestrator } from '../../src/workspace/workspace-orchestrator.js';

describe('Gated Port Detection Integration Test', () => {
  it('should list open ports cleanly', async () => {
    const config = loadControllerConfig({
      E2B_API_KEY: 'mock_key',
      MCP_ACCESS_TOKEN: 'mock_token',
    });
    const orchestrator = new CodingWorkspaceOrchestrator(config);
    const ws = await orchestrator.startWorkspace({ repository: 'octocat/Hello-World' });

    const ports = await orchestrator.listPorts(ws.workspaceId);
    expect(Array.isArray(ports)).toBe(true);
  });
});
