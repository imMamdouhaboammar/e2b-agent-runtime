import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { taskStore } from './task-store.js';
import { ExecutionEvidence, EvidenceCategory } from './types.js';
import { e2bWorkerManager } from '../runtime/e2b-worker-manager.js';
import { redactSecrets } from '../security/redact.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export class EvidenceLedgerService {
  private storageDir: string;

  constructor(storageDir = '.data/evidence') {
    this.storageDir = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public async recordCommand(params: {
    taskId: string;
    executionId: string;
    category: EvidenceCategory;
    purpose?: string;
    relatedStepId?: string;
    expectedOutcome?: string;
    // Real command execution details supplied from Controller terminal manager or worker exec
    realExecution?: {
      command: string;
      exitCode: number;
      durationMs: number;
      stdout: string;
      stderr: string;
      startHeadSha?: string;
      endHeadSha?: string;
      dirtyStateBefore?: boolean;
      dirtyStateAfter?: boolean;
    };
  }): Promise<ExecutionEvidence> {
    const task = await taskStore.getTask(params.taskId);
    if (!task) throw new AppError(`Task ${params.taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;

    // Check command limit
    if (task.totalCommandCount >= task.totalCommandLimit) {
      await taskStore.updateTask(params.taskId, (t) => {
        t.taskState = 'BLOCKED';
        t.blockers.push(`Total command limit exceeded (${task.totalCommandCount} >= ${task.totalCommandLimit})`);
        return t;
      });
      throw new AppError(
        `Task total command limit exceeded (${task.totalCommandCount} >= ${task.totalCommandLimit})`,
        'TASK_LIMIT_EXCEEDED',
        429
      );
    }

    let commandSummary = params.realExecution?.command || `execution_${params.executionId}`;
    let exitCode = params.realExecution?.exitCode ?? 0;
    let durationMs = params.realExecution?.durationMs ?? 100;
    let rawOutput = (params.realExecution?.stdout || '') + '\n' + (params.realExecution?.stderr || '');

    // Get live git state if not provided
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);

    const currentHeadSha = gitShaResult.stdout.trim() || task.currentHeadSha || 'unknown';
    const isDirty = gitStatusResult.stdout.trim().length > 0;

    const startHeadSha = params.realExecution?.startHeadSha || currentHeadSha;
    const endHeadSha = params.realExecution?.endHeadSha || currentHeadSha;
    const dirtyStateBefore = params.realExecution?.dirtyStateBefore ?? isDirty;
    const dirtyStateAfter = params.realExecution?.dirtyStateAfter ?? isDirty;

    const evidenceId = `ev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const truncated = rawOutput.length > 4096;
    const outputExcerpt = redactSecrets(rawOutput.slice(0, 4096));

    const evidence: ExecutionEvidence = {
      evidenceId,
      taskId: params.taskId,
      workspaceId: task.workspaceId,
      executionId: params.executionId,
      commandFingerprint: crypto.createHash('sha256').update(`${commandSummary}:${exitCode}`).digest('hex'),
      category: params.category,
      purpose: params.purpose || '',
      relatedStepId: params.relatedStepId,
      commandSummary,
      startHeadSha,
      endHeadSha,
      dirtyStateBefore,
      dirtyStateAfter,
      timestamp: new Date().toISOString(),
      exitCode,
      status: exitCode === 0 ? 'passed' : 'failed',
      durationMs,
      truncated,
      outputExcerpt,
      isStale: false,
    };

    const taskEvList = await this.listEvidence(params.taskId);
    taskEvList.push(evidence);
    this.saveEvidenceFile(params.taskId, taskEvList);

    await taskStore.updateTask(params.taskId, (t) => {
      t.totalCommandCount += 1;
      t.currentHeadSha = endHeadSha;
      if (params.relatedStepId) {
        const step = t.plan.steps.find((s) => s.id === params.relatedStepId);
        if (step && !step.evidenceRefs.includes(evidenceId)) {
          step.evidenceRefs.push(evidenceId);
        }
      }
      return t;
    });

    logger.info('execution.evidence_recorded', {
      taskId: params.taskId,
      evidenceId,
      category: params.category,
      exitCode,
    });

    return evidence;
  }

  public async listEvidence(
    taskId: string,
    category?: EvidenceCategory,
    status?: string,
    limit = 100
  ): Promise<ExecutionEvidence[]> {
    const filePath = path.join(this.storageDir, `${taskId}.json`);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      let list: ExecutionEvidence[] = JSON.parse(content);

      if (category) {
        list = list.filter((e) => e.category === category);
      }
      if (status) {
        list = list.filter((e) => e.status === status);
      }

      return list.slice(0, limit);
    } catch (err: any) {
      logger.error(`Failed to read evidence file for task ${taskId}`, { error: err.message });
      return [];
    }
  }

  public async markStaleEvidence(taskId: string, reason: string): Promise<void> {
    const list = await this.listEvidence(taskId);
    let updated = false;

    for (const ev of list) {
      if (!ev.isStale) {
        ev.isStale = true;
        ev.staleReason = reason;
        updated = true;
      }
    }

    if (updated) {
      this.saveEvidenceFile(taskId, list);
      logger.info('validation.evidence_marked_stale', { taskId, reason });
    }
  }

  private saveEvidenceFile(taskId: string, evidenceList: ExecutionEvidence[]): void {
    const filePath = path.join(this.storageDir, `${taskId}.json`);
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(evidenceList, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  }
}

export const evidenceLedger = new EvidenceLedgerService();
