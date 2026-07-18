import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../shared/logger.js';
import * as db from '../persistence/postgres/client.js';

export interface RepositoryState {
  repository: string;
  visibility: 'public' | 'private' | 'internal';
  defaultBranch: string;
  baseBranch: string;
  originalBaseSha: string;
  latestRemoteBaseSha?: string;
  repoPath: string;
  cloneState: 'unbound' | 'bound' | 'cloned' | 'failed';
  workingBranch?: string;
  localHeadSha?: string;
  publishedRemoteHeadSha?: string;
  commitCount: number;
  dirtyState: boolean;
  publicationState: 'none' | 'preflight_passed' | 'published' | 'failed';
  boundAt?: string;
  clonedAt?: string;
  publishedAt?: string;
}

export interface ValidationRecord {
  executionId: string;
  command: string;
  category: string;
  exitCode: number;
  durationMs: number;
  summary?: string;
  executedAt: string;
}

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
  repositoryState?: RepositoryState;
  validationRecords?: ValidationRecord[];
}

interface RegistryData {
  version?: number;
  sessions: Record<string, SessionRecord>;
}

export class SessionRegistry {
  private filePath: string;
  private cache: Record<string, SessionRecord> = {};
  private isLoaded = false;
  private useDb = false;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    this.useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
  }

  private async ensureDir(): Promise<void> {
    if (this.useDb) return;
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  public async load(): Promise<void> {
    if (this.useDb) {
      this.isLoaded = true;
      return;
    }
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
    if (this.useDb) return;
    await this.ensureDir();
    const data: RegistryData = {
      version: 3,
      sessions: this.cache,
    };
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
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      await db.query(
        `INSERT INTO sessions (
          session_id, e2b_sandbox_id, task_label, metadata, created_at, updated_at, expires_at, state, last_command_status, failure_reason, repository_state, validation_records
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (session_id) DO UPDATE SET
          e2b_sandbox_id = $2, task_label = $3, metadata = $4, updated_at = $6, expires_at = $7, state = $8, last_command_status = $9, failure_reason = $10, repository_state = $11, validation_records = $12`,
        [
          session.sessionId,
          session.e2bSandboxId,
          session.taskLabel || null,
          JSON.stringify(session.metadata || {}),
          session.createdAt,
          session.updatedAt,
          session.expiresAt,
          session.state,
          session.lastCommandStatus || null,
          session.failureReason || null,
          session.repositoryState ? JSON.stringify(session.repositoryState) : null,
          session.validationRecords ? JSON.stringify(session.validationRecords) : null,
        ],
        dbUrl
      );
      return;
    }
    this.cache[session.sessionId] = session;
    await this.persist();
  }

  public async getSession(sessionId: string): Promise<SessionRecord | null> {
    await this.ensureLoaded();
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      const res = await db.query(
        'SELECT * FROM sessions WHERE session_id = $1',
        [sessionId],
        dbUrl
      );
      if (res.rowCount === 0) return null;
      const row = res.rows[0];
      return {
        sessionId: row.session_id,
        e2bSandboxId: row.e2b_sandbox_id,
        taskLabel: row.task_label || undefined,
        metadata: row.metadata || {},
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        state: row.state,
        lastCommandStatus: row.last_command_status || undefined,
        failureReason: row.failure_reason || undefined,
        repositoryState: row.repository_state || undefined,
        validationRecords: row.validation_records || undefined,
      };
    }
    return this.cache[sessionId] || null;
  }

  public async listSessions(): Promise<SessionRecord[]> {
    await this.ensureLoaded();
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      const res = await db.query('SELECT * FROM sessions ORDER BY updated_at DESC', [], dbUrl);
      return res.rows.map((row) => ({
        sessionId: row.session_id,
        e2bSandboxId: row.e2b_sandbox_id,
        taskLabel: row.task_label || undefined,
        metadata: row.metadata || {},
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        state: row.state,
        lastCommandStatus: row.last_command_status || undefined,
        failureReason: row.failure_reason || undefined,
        repositoryState: row.repository_state || undefined,
        validationRecords: row.validation_records || undefined,
      }));
    }
    return Object.values(this.cache);
  }

  public async getActiveSessions(): Promise<SessionRecord[]> {
    await this.ensureLoaded();
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      const res = await db.query("SELECT * FROM sessions WHERE state = 'active'", [], dbUrl);
      return res.rows.map((row) => ({
        sessionId: row.session_id,
        e2bSandboxId: row.e2b_sandbox_id,
        taskLabel: row.task_label || undefined,
        metadata: row.metadata || {},
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        state: row.state,
        lastCommandStatus: row.last_command_status || undefined,
        failureReason: row.failure_reason || undefined,
        repositoryState: row.repository_state || undefined,
        validationRecords: row.validation_records || undefined,
      }));
    }
    return Object.values(this.cache).filter((s) => s.state === 'active');
  }

  public async updateSession(
    sessionId: string,
    updates: Partial<SessionRecord>
  ): Promise<SessionRecord | null> {
    await this.ensureLoaded();
    const existing = await this.getSession(sessionId);
    if (!existing) return null;

    const updated: SessionRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (this.useDb) {
      await this.saveSession(updated);
      return updated;
    }

    this.cache[sessionId] = updated;
    await this.persist();
    return updated;
  }

  public async recordValidation(
    sessionId: string,
    record: ValidationRecord
  ): Promise<SessionRecord | null> {
    await this.ensureLoaded();
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const records = session.validationRecords || [];
    records.push(record);

    return this.updateSession(sessionId, { validationRecords: records });
  }
}
