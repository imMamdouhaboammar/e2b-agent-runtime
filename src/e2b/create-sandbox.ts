import { Sandbox } from 'e2b';
import type { AppConfig } from '../types.js';

export async function createE2BSandbox(config: AppConfig): Promise<Sandbox> {
  const sandbox = await Sandbox.create({
    apiKey: config.apiKey,
    timeoutMs: config.sandboxTimeoutMs,
    metadata: {
      poc: 'phase-1-e2b-mcp',
    },
    mcp: {
      'github/modelcontextprotocol/servers': {
        installCmd: 'npm install',
        runCmd: 'npx -y @modelcontextprotocol/server-filesystem /workspace',
      },
    },
  });

  // Ensure /workspace exists inside the Sandbox
  await sandbox.commands.run('mkdir -p /workspace');

  return sandbox;
}
