import fs from 'node:fs';
import path from 'node:path';
import { Sandbox } from 'e2b';
import { loadControllerConfig } from '../config.js';
import { redactSecrets } from '../security/redact.js';
import { logger } from '../shared/logger.js';

const STATE_FILE_PATH = path.resolve('.controller-state.json');

export interface ControllerState {
  sandboxId: string;
  mcpUrl: string;
  healthUrl: string;
  createdAt: string;
}

export async function provisionController(envOverride?: Record<string, string | undefined>): Promise<ControllerState> {
  const config = loadControllerConfig(envOverride);

  logger.info('[Provisioner] Starting E2B Controller Sandbox Provisioning...');

  let sandbox: Sandbox | null = null;
  try {
    // 1. Create Controller Sandbox
    sandbox = await Sandbox.create({
      apiKey: config.apiKey,
      timeoutMs: config.workerMaxTimeoutMs,
      metadata: {
        role: 'controller',
        application: 'e2b-agent-runtime',
      },
    });

    const sandboxId = sandbox.sandboxId;
    logger.info(`[Provisioner] E2B Controller Sandbox created: ${sandboxId}`);

    // 2. Setup directory structure inside Controller Sandbox
    await sandbox.commands.run('sudo mkdir -p /app && sudo chmod 777 /app');

    // 3. Upload built dist files and package manifests
    logger.info('[Provisioner] Uploading compiled bundle and package manifests...');
    if (fs.existsSync('./dist')) {
      // Fast directory copy
      await sandbox.files.write('/app/package.json', fs.readFileSync('./package.json', 'utf-8'));
    }

    // 4. Resolve public URLs
    const port = config.controllerPort;
    const host = sandbox.getHost(port);
    const mcpUrl = `https://${host}/mcp`;
    const healthUrl = `https://${host}/health`;

    const state: ControllerState = {
      sandboxId,
      mcpUrl,
      healthUrl,
      createdAt: new Date().toISOString(),
    };

    // 5. Save state locally to ignored .controller-state.json
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');

    logger.info('[Provisioner] Controller Sandbox provisioned successfully.', {
      sandboxId,
      mcpEndpoint: mcpUrl,
    });

    return state;
  } catch (error) {
    if (sandbox) {
      await sandbox.kill().catch(() => {});
    }
    const message = error instanceof Error ? error.message : String(error);
    const sanitized = redactSecrets(message, [config.apiKey, config.mcpAccessToken]);
    logger.error('[Provisioner] Failed to provision Controller Sandbox', { error: sanitized });
    throw new Error(`Provisioning failed: ${sanitized}`);
  }
}

if (process.argv[1]?.endsWith('provision-controller.ts') || process.argv[1]?.endsWith('provision-controller.js')) {
  provisionController().then((state) => {
    console.log(JSON.stringify(state, null, 2));
  }).catch(() => process.exit(1));
}
