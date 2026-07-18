import { describe, expect, it, vi } from 'vitest';
import { ConcurrencyGate } from '../../src/runtime/concurrency-gate.js';
import type { SessionRecord, SessionRegistry } from '../../src/runtime/session-registry.js';

describe('Concurrency Gate Module', () => {
  it('should allow acquisition when active session count is below maxAllowed', async () => {
    const gate = new ConcurrencyGate();
    const mockRegistry = {
      getActiveSessions: vi.fn().mockResolvedValue([{ sessionId: '1' } as SessionRecord]),
    } as unknown as SessionRegistry;

    await expect(gate.checkAndAcquire(mockRegistry, 3)).resolves.toBeUndefined();
  });

  it('should throw CONCURRENCY_LIMIT error when active session count meets or exceeds maxAllowed', async () => {
    const gate = new ConcurrencyGate();
    const mockRegistry = {
      getActiveSessions: vi.fn().mockResolvedValue([
        { sessionId: '1' },
        { sessionId: '2' },
        { sessionId: '3' },
      ] as SessionRecord[]),
    } as unknown as SessionRegistry;

    await expect(gate.checkAndAcquire(mockRegistry, 3)).rejects.toThrowError(
      /Concurrency limit reached/
    );
  });
});
