import { describe, it, expect } from 'vitest';
import { CodingWorkspaceOrchestrator } from '../../src/workspace/workspace-orchestrator.js';
import { loadControllerConfig } from '../../src/config.js';

describe('CodingWorkspaceOrchestrator Unit Tests', () => {
  const config = loadControllerConfig({
    E2B_API_KEY: 'e2b_0000000000000000000000000000000000000000',
    MCP_ACCESS_TOKEN: 'mock_token',
    SUPABASE_URL: 'https://example-supabase-project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_pub_dummy_key_to_satisfy_github_push_protection',
    SUPABASE_SECRET_KEY: 'sb_sec_dummy_key_to_satisfy_github_push_protection',
  });

  const mockWorkerManager: any = {
    createWorkerSession: async () => ({
      sessionId: 'mock-session-123',
      e2bSandboxId: 'mock-sandbox-123',
    }),
    getSandbox: async () => undefined,
    destroySession: async () => true,
  };

  const orchestrator = new CodingWorkspaceOrchestrator(
    config,
    undefined,
    mockWorkerManager
  );

  it('should start a coding workspace transactionally', async () => {
    const ws = await orchestrator.startWorkspace({
      repository: 'octocat/Hello-World',
      taskMode: 'feature',
      initialTerminal: false,
    });

    expect(ws.workspaceId).toBeDefined();
    expect(ws.repository).toBe('octocat/hello-world');
    expect(ws.state).toBe('READY');
    expect(ws.selectedWorkflow).toBe('feature-to-pr');
  });

  it('should reject invalid repository format', async () => {
    await expect(
      orchestrator.startWorkspace({ repository: 'invalid/repository/format/extra' })
    ).rejects.toThrow(/Repository must be in "owner\/repo" format/);
  });

  it('should retrieve workspace state and active terminals', async () => {
    const ws = await orchestrator.startWorkspace({
      repository: 'octocat/Hello-World',
    });

    const info = orchestrator.getWorkspace(ws.workspaceId);
    expect(info.workspaceId).toBe(ws.workspaceId);
    expect(info.activeTerminals).toBeDefined();
  });

  it('should destroy workspace idempotently', async () => {
    const ws = await orchestrator.startWorkspace({
      repository: 'octocat/Hello-World',
    });

    await expect(orchestrator.destroyWorkspace(ws.workspaceId, false)).rejects.toThrow(/CONFIRMATION_REQUIRED/);

    const d1 = await orchestrator.destroyWorkspace(ws.workspaceId, true);
    expect(d1.destroyed).toBe(true);

    const d2 = await orchestrator.destroyWorkspace(ws.workspaceId, true);
    expect(d2.destroyed).toBe(true);
  });
});
