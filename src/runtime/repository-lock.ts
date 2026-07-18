export class AsyncLockManager {
  private locks: Map<string, Promise<void>> = new Map();

  public async acquire<T>(key: string, task: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    this.locks.set(key, lockPromise);

    try {
      return await task();
    } finally {
      this.locks.delete(key);
      resolveLock();
    }
  }
}

export const repositoryLock = new AsyncLockManager();
