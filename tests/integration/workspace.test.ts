import { describe, it, expect } from 'vitest';
import { loadControllerConfig } from '../../src/config.js';
import { CodingWorkspaceOrchestrator } from '../../src/workspace/workspace-orchestrator.js';

describe('Gated Workspace Integration Test', () => {
  it('should run workspace lifecycle test when E2B API key available', async () => {
    if (!process.env.E2B_API_KEY) {
      console.log('Skipping real E2B workspace integration test (E2B_API_KEY not set).');
      return;
    }

    const config = loadControllerConfig({
      E2B_API_KEY: process.env.E2B_API_KEY,
      MCP_ACCESS_TOKEN: process.env.MCP_ACCESS_TOKEN || 'test_token',
    });

    const orchestrator = new CodingWorkspaceOrchestrator(config);
    const ws = await orchestrator.startWorkspace({
      repository: 'octocat/Hello-World',
      initialTerminal: true,
    });

    expect(ws.state).toBe('READY');
    await orchestrator.destroyWorkspace(ws.workspaceId, true);
  });
});
