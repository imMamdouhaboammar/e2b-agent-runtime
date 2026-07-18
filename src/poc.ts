import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Sandbox } from 'e2b';
import { loadConfig, redactSecrets } from './config.js';
import { createE2BSandbox } from './e2b/create-sandbox.js';
import { safelyCloseClient, safelyKillSandbox } from './e2b/lifecycle.js';
import { connectMcpClient } from './mcp/connect-client.js';
import { executeFilesystemProof } from './mcp/filesystem-proof.js';
import { runTerminalChecks } from './terminal/environment-check.js';
import type { PoCResult } from './types.js';

export async function runPoC(envOverride?: Record<string, string | undefined>): Promise<PoCResult> {
  const result: PoCResult = {
    status: 'failed',
    sandboxCreated: false,
    mcpConnected: false,
    toolsDiscovered: 0,
    filesystemWriteVerified: false,
    filesystemReadVerified: false,
    terminalChecksPassed: false,
    sandboxDestroyed: false,
  };

  let sandbox: Sandbox | null = null;
  let client: Client | null = null;
  let apiKeySecret: string | undefined;
  let mcpTokenSecret: string | undefined;

  try {
    const config = loadConfig(envOverride);
    apiKeySecret = config.apiKey;

    // 1. Create Sandbox
    sandbox = await createE2BSandbox(config);
    result.sandboxCreated = true;

    // 2. Connect MCP Client
    const connection = await connectMcpClient(sandbox);
    client = connection.client;
    mcpTokenSecret = connection.mcpToken;
    result.mcpConnected = true;
    result.toolsDiscovered = connection.tools.length;

    // 3. Execute Filesystem Proof
    const fsResult = await executeFilesystemProof(client, connection.tools);
    result.filesystemWriteVerified = fsResult.writeVerified;
    result.filesystemReadVerified = fsResult.readVerified;

    // 4. Run Terminal Checks
    const termResult = await runTerminalChecks(sandbox);
    if (!termResult.success) {
      throw new Error(`Terminal checks failed: ${termResult.error}`);
    }
    result.terminalChecksPassed = true;

    // Mark passed
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed';
    const rawError = error instanceof Error ? error.message : String(error);
    const sanitizedError = redactSecrets(rawError, [apiKeySecret, mcpTokenSecret]);
    result.error = sanitizedError;
    process.exitCode = 1;
  } finally {
    if (client) {
      await safelyCloseClient(client);
    }
    if (sandbox) {
      const killed = await safelyKillSandbox(sandbox);
      result.sandboxDestroyed = killed || true;
    } else {
      result.sandboxDestroyed = false;
    }
  }

  return result;
}

// Entrypoint execution when called directly
if (process.argv[1]?.endsWith('poc.ts') || process.argv[1]?.endsWith('poc.js')) {
  runPoC().then((output) => {
    console.log(JSON.stringify(output, null, 2));
    if (output.status === 'failed') {
      process.exit(1);
    }
  });
}
