import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Sandbox } from 'e2b';

export async function safelyCloseClient(
  client: Client | null | undefined
): Promise<boolean> {
  if (!client) return false;
  try {
    await client.close();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: Failed to close MCP client cleanly: ${message}`);
    return false;
  }
}

export async function safelyKillSandbox(
  sandbox: Sandbox | null | undefined
): Promise<boolean> {
  if (!sandbox) return false;
  try {
    await sandbox.kill();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: Failed to kill Sandbox cleanly: ${message}`);
    return false;
  }
}
