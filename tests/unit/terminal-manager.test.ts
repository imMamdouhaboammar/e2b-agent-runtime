import { describe, it, expect } from 'vitest';
import { TerminalSessionManager } from '../../src/terminal/terminal-manager.js';

describe('TerminalSessionManager Unit Tests', () => {
  const manager = new TerminalSessionManager(3);

  it('should open a terminal session', async () => {
    const term = await manager.openTerminal('ws-1', undefined as any, { shell: '/bin/bash' });
    expect(term.terminalId).toBeDefined();
    expect(term.workspaceId).toBe('ws-1');
    expect(term.state).toBe('open');
  });

  it('should enforce max terminals per workspace limit', async () => {
    const ws = 'ws-limit';
    await manager.openTerminal(ws, undefined as any);
    await manager.openTerminal(ws, undefined as any);
    await manager.openTerminal(ws, undefined as any);

    await expect(manager.openTerminal(ws, undefined as any)).rejects.toThrow(/MAX_TERMINALS_REACHED/);
  });

  it('should reject unapproved shell', async () => {
    await expect(
      manager.openTerminal('ws-shell', undefined as any, { shell: '/bin/zsh' })
    ).rejects.toThrow(/DISALLOWED_SHELL/);
  });

  it('should reject invalid cwd path traversal', async () => {
    await expect(
      manager.openTerminal('ws-cwd', undefined as any, { cwd: '/workspace/../../etc' })
    ).rejects.toThrow(/INVALID_CWD/);
  });

  it('should write to terminal buffer and read incrementally', async () => {
    const term = await manager.openTerminal('ws-io', undefined as any);
    await manager.writeTerminal('ws-io', term.terminalId, 'echo hello\n');

    const read = manager.readTerminal('ws-io', term.terminalId, 0);
    expect(read.content).toContain('echo hello\n');
  });

  it('should resize terminal within bounds', async () => {
    const term = await manager.openTerminal('ws-resize', undefined as any);
    const res = await manager.resizeTerminal('ws-resize', term.terminalId, 160, 50);
    expect(res.cols).toBe(160);
    expect(res.rows).toBe(50);
  });

  it('should restrict allowed signals', async () => {
    const term = await manager.openTerminal('ws-sig', undefined as any);
    const res = await manager.sendSignal('ws-sig', term.terminalId, 'SIGINT');
    expect(res.signalSent).toBe('SIGINT');

    await expect(
      manager.sendSignal('ws-sig', term.terminalId, 'SIGKILL' as any)
    ).rejects.toThrow(/DISALLOWED_SIGNAL/);
  });

  it('should close terminal idempotently', async () => {
    const term = await manager.openTerminal('ws-close', undefined as any);
    const c1 = await manager.closeTerminal('ws-close', term.terminalId);
    expect(c1.closed).toBe(true);

    const c2 = await manager.closeTerminal('ws-close', term.terminalId);
    expect(c2.closed).toBe(true);
  });
});
