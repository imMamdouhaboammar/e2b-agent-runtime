import fs from 'node:fs';
import path from 'node:path';
import { Sandbox } from 'e2b';
import { loadControllerConfig } from '../config.js';
import { redactSecrets } from '../security/redact.js';
import type { ControllerState } from './provision-controller.js';

const STATE_FILE_PATH = path.resolve('.controller-state.json');

export async function getControllerLogs(envOverride?: Record<string, string | undefined>) {
  if (!fs.existsSync(STATE_FILE_PATH)) {
    throw new Error('No .controller-state.json file found.');
  }

  const config = loadControllerConfig(envOverride);
  const state: ControllerState = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf-8'));

  const sandbox = await Sandbox.connect(state.sandboxId, { apiKey: config.apiKey });
  const res = await sandbox.commands.run('cat /var/log/controller.log 2>/dev/null || echo "No logs found."');

  const redactedStdout = redactSecrets(res.stdout, [config.apiKey, config.mcpAccessToken]);

  return {
    sandboxId: state.sandboxId,
    logs: redactedStdout,
  };
}

if (process.argv[1]?.endsWith('controller-logs.ts') || process.argv[1]?.endsWith('controller-logs.js')) {
  getControllerLogs().then((res) => console.log(JSON.stringify(res, null, 2))).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
