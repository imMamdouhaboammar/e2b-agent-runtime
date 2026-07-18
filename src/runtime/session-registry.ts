import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../shared/logger.js';

export interface SessionRecord {
  sessionId: string;
  e2bSandboxId: string;
  taskLabel?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  state: 'active' | 'expired' | 'destroyed' | 'failed';
  lastCommandStatus?: 'success' | 'failed' | 'timeout';
  failureReason?: string;
}

interface RegistryData {
  sessions: Record<string, SessionRecord>;
}

export class SessionRegistry {
  private filePath: string;
  private cache: Record<string, SessionRecord> = {};
  private isLoaded = false;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  private async ensureDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  public async load(): Promise<void> {
    await this.ensureDir();
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = await fs.promises.readFile(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as RegistryData;
        this.cache = parsed.sessions || {};
      } else {
        this.cache = {};
        await this.persist();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn('Corrupted session registry detected. Resetting cache.', { error: msg });

      // Backup corrupted file if it exists
      if (fs.existsSync(this.filePath)) {
        const backupPath = `${this.filePath}.corrupt.${Date.now()}`;
        await fs.promises.rename(this.filePath, backupPath).catch(() => {});
      }

      this.cache = {};
      await this.persist();
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    await this.ensureDir();
    const data: RegistryData = { sessions: this.cache };
    const tempPath = `${this.filePath}.tmp.${Date.now()}`;

    await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, this.filePath);
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.load();
    }
  }

  public async saveSession(session: SessionRecord): Promise<void> {
    await this.ensureLoaded();
    this.cache[session.sessionId] = session;
    await this.persist();
  }

  public async getSession(sessionId: string): Promise<SessionRecord | null> {
    await this.ensureLoaded();
    return this.cache[sessionId] || null;
  }

  public async listSessions(): Promise<SessionRecord[]> {
    await this.ensureLoaded();
    return Object.values(this.cache);
  }

  public async getActiveSessions(): Promise<SessionRecord[]> {
    await this.ensureLoaded();
    return Object.values(this.cache).filter((s) => s.state === 'active');
  }

  public async updateSession(
    sessionId: string,
    updates: Partial<SessionRecord>
  ): Promise<SessionRecord | null> {
    await this.ensureLoaded();
    const existing = this.cache[sessionId];
    if (!existing) return null;

    const updated: SessionRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.cache[sessionId] = updated;
    await this.persist();
    return updated;
  }
}
