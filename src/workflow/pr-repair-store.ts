import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export const PR_REPAIR_STATES = [
  'ATTACHED',
  'INSPECTING',
  'FEEDBACK_READY',
  'REPAIR_PLANNING',
  'REPAIRING',
  'VALIDATING',
  'READY_TO_PUSH',
  'PUSHING',
  'WAITING_FOR_CI',
  'CI_PASSED',
  'CI_FAILED',
  'REVIEW_RESPONSE_READY',
  'BLOCKED',
  'COMPLETED',
  'ABANDONED',
] as const;

export type PullRequestRepairStateName = (typeof PR_REPAIR_STATES)[number];

export const PullRequestRepairStateSchema = z.object({
  schemaVersion: z.number().int().default(1),
  prRepairId: z.string(),
  taskId: z.string(),
  workspaceId: z.string(),
  repository: z.string(),
  pullRequestNumber: z.number().int(),
  baseBranch: z.string(),
  baseSha: z.string(),
  headBranch: z.string(),
  originalHeadSha: z.string(),
  currentHeadSha: z.string(),
  latestRemoteHeadSha: z.string(),
  reviewState: z.enum(PR_REPAIR_STATES).default('ATTACHED'),
  reviewThreadCount: z.number().int().default(0),
  unresolvedThreadCount: z.number().int().default(0),
  outdatedThreadCount: z.number().int().default(0),
  checkRunSummary: z.string().default(''),
  workflowRunSummary: z.string().default(''),
  repairCycleCount: z.number().int().default(0),
  repairCycleLimit: z.number().int().default(3),
  commitsCreated: z.number().int().default(0),
  commitsPublished: z.number().int().default(0),
  CIAttempts: z.number().int().default(0),
  lastCIHeadSha: z.string().default(''),
  blockers: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastActivity: z.string(),
});

export type PullRequestRepairState = z.infer<typeof PullRequestRepairStateSchema>;

export class PullRequestRepairStore {
  private storageDir: string;
  private cache: Map<string, PullRequestRepairState> = new Map();
  private locks: Map<string, Promise<void>> = new Map();

  constructor(storageDir = '.data/pr-repairs') {
    this.storageDir = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    this.locks.set(key, lockPromise);

    try {
      return await fn();
    } finally {
      this.locks.delete(key);
      resolveLock();
    }
  }

  public async createPRRepair(params: {
    taskId: string;
    workspaceId: string;
    repository: string;
    pullRequestNumber: number;
    baseBranch: string;
    baseSha: string;
    headBranch: string;
    originalHeadSha: string;
    repairCycleLimit?: number;
  }): Promise<PullRequestRepairState> {
    const prRepairId = `pr_rep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const state: PullRequestRepairState = PullRequestRepairStateSchema.parse({
      schemaVersion: 1,
      prRepairId,
      taskId: params.taskId,
      workspaceId: params.workspaceId,
      repository: params.repository.toLowerCase(),
      pullRequestNumber: params.pullRequestNumber,
      baseBranch: params.baseBranch,
      baseSha: params.baseSha,
      headBranch: params.headBranch,
      originalHeadSha: params.originalHeadSha,
      currentHeadSha: params.originalHeadSha,
      latestRemoteHeadSha: params.originalHeadSha,
      reviewState: 'ATTACHED',
      repairCycleLimit: params.repairCycleLimit || 3,
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
    });

    await this.savePRRepairFile(state);
    this.cache.set(prRepairId, state);
    logger.info('github.pr.attached', { prRepairId, taskId: params.taskId, repository: params.repository, pullRequestNumber: params.pullRequestNumber });

    return state;
  }

  public async getPRRepair(prRepairId: string): Promise<PullRequestRepairState | null> {
    if (this.cache.has(prRepairId)) {
      return this.cache.get(prRepairId)!;
    }

    const filePath = path.join(this.storageDir, `${prRepairId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const raw = JSON.parse(content);
      const state = PullRequestRepairStateSchema.parse(raw);
      this.cache.set(prRepairId, state);
      return state;
    } catch (err: any) {
      logger.error(`Failed to load PR Repair state ${prRepairId}`, { error: err.message });
      return null;
    }
  }

  public async getPRRepairByTask(taskId: string): Promise<PullRequestRepairState | null> {
    const all = await this.listPRRepairs();
    const bound = all.find((p) => p.taskId === taskId);
    return bound || null;
  }

  public async updatePRRepair(
    prRepairId: string,
    updater: (state: PullRequestRepairState) => PullRequestRepairState | Promise<PullRequestRepairState>
  ): Promise<PullRequestRepairState> {
    return this.withLock(`prRepair:${prRepairId}`, async () => {
      const current = await this.getPRRepair(prRepairId);
      if (!current) {
        throw new AppError(`PR Repair state ${prRepairId} not found`, 'PR_NOT_FOUND', 404);
      }

      const updated = await updater(current);
      updated.updatedAt = new Date().toISOString();
      updated.lastActivity = updated.updatedAt;

      const validated = PullRequestRepairStateSchema.parse(updated);

      if (current.reviewState !== validated.reviewState) {
        logger.info('github.pr.state_changed', {
          prRepairId,
          from: current.reviewState,
          to: validated.reviewState,
        });
      }

      await this.savePRRepairFile(validated);
      this.cache.set(prRepairId, validated);
      return validated;
    });
  }

  public async listPRRepairs(): Promise<PullRequestRepairState[]> {
    if (!fs.existsSync(this.storageDir)) {
      return [];
    }

    const files = fs.readdirSync(this.storageDir).filter((f) => f.endsWith('.json'));
    const prRepairs: PullRequestRepairState[] = [];

    for (const f of files) {
      const prRepairId = f.replace('.json', '');
      const p = await this.getPRRepair(prRepairId);
      if (p) {
        prRepairs.push(p);
      }
    }

    return prRepairs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public async deletePRRepair(prRepairId: string): Promise<boolean> {
    return this.withLock(`prRepair:${prRepairId}`, async () => {
      const filePath = path.join(this.storageDir, `${prRepairId}.json`);
      this.cache.delete(prRepairId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    });
  }

  private async savePRRepairFile(state: PullRequestRepairState): Promise<void> {
    const filePath = path.join(this.storageDir, `${state.prRepairId}.json`);
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  }
}

export const prRepairStore = new PullRequestRepairStore();
