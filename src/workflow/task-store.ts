import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CodingTaskState,
  CodingTaskStateSchema,
  TaskMode,
  TaskState,
  TaskPlanSchema,
} from './types.js';
import { logger } from '../shared/logger.js';
import { AppError } from '../shared/errors.js';

export class TaskStore {
  private storageDir: string;
  private tasksCache: Map<string, CodingTaskState> = new Map();
  private locks: Map<string, Promise<void>> = new Map();

  constructor(storageDir = '.data/tasks') {
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

  public async createTask(params: {
    workspaceId: string;
    repository: string;
    taskMode: TaskMode;
    taskLabel: string;
    userRequestSummary: string;
    acceptanceCriteria?: string[];
    explicitOutOfScope?: string[];
    relatedIssue?: string;
    relatedPullRequest?: string;
    repairCycleLimit?: number;
    totalCommandLimit?: number;
    baseSha?: string;
    currentHeadSha?: string;
    branchName?: string;
  }): Promise<CodingTaskState> {
    return this.withLock(`workspace:${params.workspaceId}`, async () => {
      const activeTask = await this.findActiveTaskByWorkspace(params.workspaceId);
      if (activeTask && !['COMPLETED', 'ABANDONED', 'FAILED', 'DESTROYED'].includes(activeTask.taskState)) {
        throw new AppError(
          `Workspace ${params.workspaceId} already has an active task ${activeTask.taskId} in state ${activeTask.taskState}`,
          'TASK_STATE_CONFLICT',
          409
        );
      }

      const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = new Date().toISOString();

      const state: CodingTaskState = CodingTaskStateSchema.parse({
        schemaVersion: 1,
        taskId,
        workspaceId: params.workspaceId,
        repository: params.repository,
        taskMode: params.taskMode,
        taskLabel: params.taskLabel,
        userRequestSummary: params.userRequestSummary,
        acceptanceCriteria: params.acceptanceCriteria || [],
        explicitOutOfScope: params.explicitOutOfScope || [],
        relatedIssue: params.relatedIssue,
        relatedPullRequest: params.relatedPullRequest,
        taskState: 'CREATED',
        plan: TaskPlanSchema.parse({ steps: [] }),
        repairCycleLimit: params.repairCycleLimit || 3,
        totalCommandLimit: params.totalCommandLimit || 100,
        baseSha: params.baseSha || '',
        currentHeadSha: params.currentHeadSha || '',
        branchName: params.branchName || '',
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
      });

      await this.saveTaskFile(state);
      this.tasksCache.set(taskId, state);
      logger.info(`coding.task.created`, { taskId, workspaceId: params.workspaceId, taskMode: params.taskMode });

      return state;
    });
  }

  public async getTask(taskId: string): Promise<CodingTaskState | null> {
    if (this.tasksCache.has(taskId)) {
      return this.tasksCache.get(taskId)!;
    }

    const filePath = path.join(this.storageDir, `${taskId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const raw = JSON.parse(content);
      const state = CodingTaskStateSchema.parse(raw);
      this.tasksCache.set(taskId, state);
      return state;
    } catch (err: any) {
      logger.error(`Failed to load task ${taskId}`, { error: err.message });
      return null;
    }
  }

  public async findActiveTaskByWorkspace(workspaceId: string): Promise<CodingTaskState | null> {
    const all = await this.listTasks();
    const active = all.find(
      (t) => t.workspaceId === workspaceId && !['COMPLETED', 'ABANDONED', 'FAILED', 'DESTROYED'].includes(t.taskState)
    );
    return active || null;
  }

  public async updateTask(
    taskId: string,
    updater: (state: CodingTaskState) => CodingTaskState | Promise<CodingTaskState>
  ): Promise<CodingTaskState> {
    return this.withLock(`task:${taskId}`, async () => {
      const current = await this.getTask(taskId);
      if (!current) {
        throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);
      }

      const updated = await updater(current);
      updated.updatedAt = new Date().toISOString();
      updated.lastActivity = updated.updatedAt;

      const validated = CodingTaskStateSchema.parse(updated);

      if (current.taskState !== validated.taskState) {
        logger.info('coding.task.state_changed', {
          taskId,
          from: current.taskState,
          to: validated.taskState,
        });
      }

      await this.saveTaskFile(validated);
      this.tasksCache.set(taskId, validated);
      return validated;
    });
  }

  public async listTasks(): Promise<CodingTaskState[]> {
    if (!fs.existsSync(this.storageDir)) {
      return [];
    }

    const files = fs.readdirSync(this.storageDir).filter((f) => f.endsWith('.json'));
    const tasks: CodingTaskState[] = [];

    for (const f of files) {
      const taskId = f.replace('.json', '');
      const t = await this.getTask(taskId);
      if (t) {
        tasks.push(t);
      }
    }

    return tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public async deleteTask(taskId: string): Promise<boolean> {
    return this.withLock(`task:${taskId}`, async () => {
      const filePath = path.join(this.storageDir, `${taskId}.json`);
      this.tasksCache.delete(taskId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    });
  }

  private async saveTaskFile(state: CodingTaskState): Promise<void> {
    const filePath = path.join(this.storageDir, `${state.taskId}.json`);
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  }
}

export const taskStore = new TaskStore();
