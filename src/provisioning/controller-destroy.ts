import fs from 'node:fs';
import path from 'node:path';
import { Sandbox } from 'e2b';
import { loadControllerConfig } from '../config.js';
import type { ControllerState } from './provision-controller.js';

const STATE_FILE_PATH = path.resolve('.controller-state.json');

export async function destroyController(confirm = false, envOverride?: Record<string, string | undefined>) {
  if (!confirm && process.env.CONFIRM !== 'true' && !process.argv.includes('--confirm')) {
    throw new Error('Confirmation required: Pass --confirm flag or CONFIRM=true to destroy Controller Sandbox.');
  }

  if (!fs.existsSync(STATE_FILE_PATH)) {
    return { status: 'not_found', message: 'No .controller-state.json file found.' };
  }

  const config = loadControllerConfig(envOverride);
  const state: ControllerState = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf-8'));

  try {
    const sandbox = await Sandbox.connect(state.sandboxId, { apiKey: config.apiKey }).catch(() => null);
    if (sandbox) {
      await sandbox.kill();
    }
  } catch {
    // Ignore teardown errors if already destroyed
  }

  fs.unlinkSync(STATE_FILE_PATH);
  return { status: 'destroyed', sandboxId: state.sandboxId };
}

if (process.argv[1]?.endsWith('controller-destroy.ts') || process.argv[1]?.endsWith('controller-destroy.js')) {
  destroyController().then((res) => console.log(JSON.stringify(res, null, 2))).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
