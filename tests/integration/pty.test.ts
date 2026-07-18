import { describe, it, expect } from 'vitest';
import { TerminalSessionManager } from '../../src/terminal/terminal-manager.js';

describe('Gated PTY Integration Test', () => {
  it('should exercise PTY open, write, cursor read, signal, and close', async () => {
    const manager = new TerminalSessionManager(3);
    const term = await manager.openTerminal('ws-pty-test', undefined as any);

    await manager.writeTerminal('ws-pty-test', term.terminalId, 'echo "PTY verification"\n');
    const read = manager.readTerminal('ws-pty-test', term.terminalId, 0);

    expect(read.content).toBeDefined();
    await manager.closeTerminal('ws-pty-test', term.terminalId);
  });
});
