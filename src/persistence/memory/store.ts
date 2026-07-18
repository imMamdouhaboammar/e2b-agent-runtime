import { KeyValueStore } from '../contracts/store.js';
import { LeaseManager } from '../contracts/lease.js';
import { IdempotencyStore, IdempotencyRecord } from '../contracts/idempotency.js';

export class MemoryKeyValueStore implements KeyValueStore {
  private data = new Map<string, string>();

  public async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  public async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  public async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export class MemoryLeaseManager implements LeaseManager {
  private leases = new Map<string, { ownerId: string; expiresAt: number }>();
  private ownerId: string;

  constructor(ownerId: string) {
    this.ownerId = ownerId;
  }

  public async acquireLease(leaseName: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.leases.get(leaseName);

    if (existing && existing.expiresAt > now && existing.ownerId !== this.ownerId) {
      return false;
    }

    this.leases.set(leaseName, {
      ownerId: this.ownerId,
      expiresAt: now + ttlMs,
    });
    return true;
  }

  public async releaseLease(leaseName: string): Promise<void> {
    const existing = this.leases.get(leaseName);
    if (existing && existing.ownerId === this.ownerId) {
      this.leases.delete(leaseName);
    }
  }

  public async isLeaseActive(leaseName: string): Promise<boolean> {
    const now = Date.now();
    const existing = this.leases.get(leaseName);
    return !!existing && existing.expiresAt > now && existing.ownerId === this.ownerId;
  }
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();

  public async getRecord(key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(key) || null;
  }

  public async saveRecord(key: string, responseBody: any): Promise<void> {
    this.records.set(key, {
      key,
      responseBody,
      createdAt: new Date().toISOString(),
    });
  }

  public async deleteRecord(key: string): Promise<void> {
    this.records.delete(key);
  }
}
