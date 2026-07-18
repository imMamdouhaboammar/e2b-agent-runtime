import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CodingTaskState,
  CodingTaskStateSchema,
  TaskMode,
  TaskPlanSchema,
} from './types.js';
import { logger } from '../shared/logger.js';
import { AppError } from '../shared/errors.js';
import * as db from '../persistence/postgres/client.js';

export class TaskStore {
  private storageDir: string;
  private tasksCache: Map<string, CodingTaskState> = new Map();
  private locks: Map<string, Promise<void>> = new Map();
  private useDb = false;

  constructor(storageDir = '.data/tasks') {
    this.storageDir = path.resolve(process.cwd(), storageDir);
    this.useDb = !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
    if (!this.useDb && !fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      return db.withTransaction(async (client) => {
        // Use PostgreSQL advisory lock on a text string
        const lockHash = crypto.createHash('md5').update(key).digest().readInt32BE(0);
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockHash]);
        return await fn();
      }, dbUrl);
    }

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
        checkpointIds: [],
        blockers: [],
        validationSummary: '',
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
      });

      if (this.useDb) {
        const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
        await db.query(
          `INSERT INTO tasks (
            task_id, workspace_id, repository, task_mode, task_label, user_request_summary,
            acceptance_criteria, explicit_out_of_scope, related_issue, related_pull_request,
            task_state, plan, repair_cycle_limit, repair_cycle_count, total_command_limit,
            total_command_count, base_sha, current_head_sha, branch_name, checkpoint_ids,
            blockers, validation_summary, created_at, updated_at, last_activity, version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14, 0, $15, $16, $17, '[]'::jsonb, '[]'::jsonb, '', $18, $19, $20, 1)`,
          [
            state.taskId,
            state.workspaceId,
            state.repository,
            state.taskMode,
            state.taskLabel,
            state.userRequestSummary,
            JSON.stringify(state.acceptanceCriteria),
            JSON.stringify(state.explicitOutOfScope),
            state.relatedIssue || null,
            state.relatedPullRequest || null,
            state.taskState,
            JSON.stringify(state.plan),
            state.repairCycleLimit,
            state.totalCommandLimit,
            state.baseSha,
            state.currentHeadSha,
            state.branchName,
            state.createdAt,
            state.updatedAt,
            state.lastActivity,
          ],
          dbUrl
        );
      } else {
        await this.saveTaskFile(state);
        this.tasksCache.set(taskId, state);
      }

      logger.info(`coding.task.created`, { taskId, workspaceId: params.workspaceId, taskMode: params.taskMode });
      return state;
    });
  }

  public async getTask(taskId: string): Promise<CodingTaskState | null> {
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      const res = await db.query('SELECT * FROM tasks WHERE task_id = $1', [taskId], dbUrl);
      if (res.rowCount === 0) return null;
      const row = res.rows[0];
      return CodingTaskStateSchema.parse({
        schemaVersion: row.version,
        taskId: row.task_id,
        workspaceId: row.workspace_id,
        repository: row.repository,
        taskMode: row.task_mode,
        taskLabel: row.task_label,
        userRequestSummary: row.user_request_summary,
        acceptanceCriteria: row.acceptance_criteria || [],
        explicitOutOfScope: row.explicit_out_of_scope || [],
        relatedIssue: row.related_issue || undefined,
        relatedPullRequest: row.related_pull_request || undefined,
        taskState: row.task_state,
        plan: row.plan || { steps: [] },
        repairCycleLimit: row.repair_cycle_limit,
        repairCycleCount: row.repair_cycle_count || 0,
        totalCommandLimit: row.total_command_limit,
        totalCommandCount: row.total_command_count || 0,
        baseSha: row.base_sha,
        currentHeadSha: row.current_head_sha,
        branchName: row.branch_name,
        checkpointIds: row.checkpoint_ids || [],
        blockers: row.blockers || [],
        validationSummary: row.validation_summary || undefined,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        lastActivity: new Date(row.last_activity).toISOString(),
      });
    }

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

      if (this.useDb) {
        const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
        await db.query(
          `UPDATE tasks SET
            task_state = $2, plan = $3, repair_cycle_count = $4, total_command_count = $5,
            current_head_sha = $6, branch_name = $7, checkpoint_ids = $8, blockers = $9,
            validation_summary = $10, updated_at = $11, last_activity = $12
           WHERE task_id = $1`,
          [
            validated.taskId,
            validated.taskState,
            JSON.stringify(validated.plan),
            validated.repairCycleCount || 0,
            validated.totalCommandCount || 0,
            validated.currentHeadSha,
            validated.branchName,
            JSON.stringify(validated.checkpointIds || []),
            JSON.stringify(validated.blockers || []),
            validated.validationSummary || null,
            validated.updatedAt,
            validated.lastActivity,
          ],
          dbUrl
        );
      } else {
        await this.saveTaskFile(validated);
        this.tasksCache.set(taskId, validated);
      }
      return validated;
    });
  }

  public async listTasks(): Promise<CodingTaskState[]> {
    if (this.useDb) {
      const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
      const res = await db.query('SELECT task_id FROM tasks ORDER BY updated_at DESC', [], dbUrl);
      const list: CodingTaskState[] = [];
      for (const row of res.rows) {
        const t = await this.getTask(row.task_id);
        if (t) list.push(t);
      }
      return list;
    }

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
      if (this.useDb) {
        const dbUrl = process.env.TEST_DB_URL || process.env.DATABASE_URL;
        const res = await db.query('DELETE FROM tasks WHERE task_id = $1', [taskId], dbUrl);
        return (res.rowCount ?? 0) > 0;
      }

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
