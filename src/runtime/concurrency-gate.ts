import { ControllerError } from '../shared/errors.js';
import type { SessionRegistry } from './session-registry.js';

export class ConcurrencyGate {
  private isAcquiring = false;

  public async checkAndAcquire(
    registry: SessionRegistry,
    maxAllowed: number
  ): Promise<void> {
    // Prevent race conditions during concurrent acquire calls
    if (this.isAcquiring) {
      await new Promise((r) => setTimeout(r, 50));
    }

    this.isAcquiring = true;
    try {
      const activeSessions = await registry.getActiveSessions();
      if (activeSessions.length >= maxAllowed) {
        throw new ControllerError(
          'CONCURRENCY_LIMIT',
          `Concurrency limit reached: Maximum allowed active workers is ${maxAllowed}. Active sessions: ${activeSessions.length}.`,
          429
        );
      }
    } finally {
      this.isAcquiring = false;
    }
  }
}

export const concurrencyGate = new ConcurrencyGate();
