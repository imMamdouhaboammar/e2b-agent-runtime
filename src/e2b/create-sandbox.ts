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

  // Ensure /workspace exists and has write permissions inside the Sandbox
  await sandbox.commands.run('sudo mkdir -p /workspace && sudo chmod 777 /workspace');

  return sandbox;
}
