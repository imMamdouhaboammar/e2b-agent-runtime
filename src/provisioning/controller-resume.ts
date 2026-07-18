import fs from 'node:fs';
import path from 'node:path';
import { Sandbox } from 'e2b';
import { loadControllerConfig } from '../config.js';
import type { ControllerState } from './provision-controller.js';

const STATE_FILE_PATH = path.resolve('.controller-state.json');

export async function resumeController(envOverride?: Record<string, string | undefined>) {
  if (!fs.existsSync(STATE_FILE_PATH)) {
    throw new Error('No .controller-state.json file found to resume.');
  }

  const config = loadControllerConfig(envOverride);
  const state: ControllerState = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf-8'));

  const sandbox = await Sandbox.connect(state.sandboxId, { apiKey: config.apiKey });
  await sandbox.setTimeout(config.workerMaxTimeoutMs);

  return {
    status: 'resumed',
    sandboxId: state.sandboxId,
    mcpUrl: state.mcpUrl,
  };
}

if (process.argv[1]?.endsWith('controller-resume.ts') || process.argv[1]?.endsWith('controller-resume.js')) {
  resumeController().then((res) => console.log(JSON.stringify(res, null, 2))).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
