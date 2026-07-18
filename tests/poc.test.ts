import { describe, expect, it, vi } from 'vitest';
import * as createSandboxModule from '../src/e2b/create-sandbox.js';
import * as connectClientModule from '../src/mcp/connect-client.js';
import * as filesystemProofModule from '../src/mcp/filesystem-proof.js';
import { runPoC } from '../src/poc.js';
import * as environmentCheckModule from '../src/terminal/environment-check.js';

describe('PoC Main Orchestrator', () => {
  it('should return failure result when E2B_API_KEY is missing', async () => {
    const result = await runPoC({});
    expect(result.status).toBe('failed');
    expect(result.sandboxCreated).toBe(false);
    expect(result.mcpConnected).toBe(false);
    expect(result.sandboxDestroyed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('E2B_API_KEY');
  });

  it('should execute full flow and return structured passed result on success', async () => {
    const mockSandbox = {
      kill: vi.fn().mockResolvedValue(undefined),
    } as any;

    const mockClient = {
      close: vi.fn().mockResolvedValue(undefined),
    } as any;

    vi.spyOn(createSandboxModule, 'createE2BSandbox').mockResolvedValue(mockSandbox);
    vi.spyOn(connectClientModule, 'connectMcpClient').mockResolvedValue({
      client: mockClient,
      tools: [{ name: 'write_file' }, { name: 'read_file' }],
      mcpToken: 'mock_mcp_token_abc',
    });
    vi.spyOn(filesystemProofModule, 'executeFilesystemProof').mockResolvedValue({
      writeVerified: true,
      readVerified: true,
      targetPath: '/workspace/poc-marker.txt',
      expectedContent: 'E2B MCP Phase 1 verified',
    });
    vi.spyOn(environmentCheckModule, 'runTerminalChecks').mockResolvedValue({
      success: true,
      outputs: { pwd: '/workspace' },
    });

    const result = await runPoC({ E2B_API_KEY: 'test_key_secret_123' });

    expect(result.status).toBe('passed');
    expect(result.sandboxCreated).toBe(true);
    expect(result.mcpConnected).toBe(true);
    expect(result.toolsDiscovered).toBe(2);
    expect(result.filesystemWriteVerified).toBe(true);
    expect(result.filesystemReadVerified).toBe(true);
    expect(result.terminalChecksPassed).toBe(true);
    expect(result.sandboxDestroyed).toBe(true);
    expect(mockClient.close).toHaveBeenCalledOnce();
    expect(mockSandbox.kill).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it('should clean up sandbox and client even when MCP proof fails', async () => {
    const mockSandbox = {
      kill: vi.fn().mockResolvedValue(undefined),
    } as any;

    const mockClient = {
      close: vi.fn().mockResolvedValue(undefined),
    } as any;

    vi.spyOn(createSandboxModule, 'createE2BSandbox').mockResolvedValue(mockSandbox);
    vi.spyOn(connectClientModule, 'connectMcpClient').mockResolvedValue({
      client: mockClient,
      tools: [{ name: 'write_file' }, { name: 'read_file' }],
      mcpToken: 'secret_mcp_token_999',
    });
    vi.spyOn(filesystemProofModule, 'executeFilesystemProof').mockRejectedValue(
      new Error('MCP Tool Execution Error with secret_mcp_token_999')
    );

    const result = await runPoC({ E2B_API_KEY: 'secret_api_key_888' });

    expect(result.status).toBe('failed');
    expect(result.sandboxCreated).toBe(true);
    expect(result.mcpConnected).toBe(true);
    expect(result.sandboxDestroyed).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain('secret_mcp_token_999');
    expect(result.error).not.toContain('secret_api_key_888');
    expect(mockClient.close).toHaveBeenCalledOnce();
    expect(mockSandbox.kill).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });
});
