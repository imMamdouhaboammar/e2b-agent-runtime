import fs from 'node:fs';
import path from 'node:path';
import { Sandbox } from 'e2b';
import { loadControllerConfig } from '../config.js';
import type { ControllerState } from './provision-controller.js';

const STATE_FILE_PATH = path.resolve('.controller-state.json');

export async function getControllerStatus(envOverride?: Record<string, string | undefined>) {
  if (!fs.existsSync(STATE_FILE_PATH)) {
    return { status: 'not_provisioned', message: 'No .controller-state.json file found.' };
  }

  const config = loadControllerConfig(envOverride);
  const state: ControllerState = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf-8'));

  try {
    const sandbox = await Sandbox.connect(state.sandboxId, { apiKey: config.apiKey });
    const isRunning = await sandbox.isRunning();

    return {
      status: isRunning ? 'running' : 'paused_or_stopped',
      sandboxId: state.sandboxId,
      mcpUrl: state.mcpUrl,
      createdAt: state.createdAt,
    };
  } catch (err) {
    return {
      status: 'error',
      sandboxId: state.sandboxId,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

if (process.argv[1]?.endsWith('controller-status.ts') || process.argv[1]?.endsWith('controller-status.js')) {
  getControllerStatus().then((res) => console.log(JSON.stringify(res, null, 2)));
}
