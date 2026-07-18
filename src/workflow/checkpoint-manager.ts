import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { taskStore } from './task-store.js';
import { evidenceLedger } from './evidence-ledger.js';
import { TaskCheckpoint, DriftCategory } from './types.js';
import { e2bWorkerManager } from '../runtime/e2b-worker-manager.js';
import { redactSecrets } from '../security/redact.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export class CheckpointManagerService {
  private storageDir: string;

  constructor(storageDir = '.data/checkpoints') {
    this.storageDir = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public async createCheckpoint(params: {
    taskId: string;
    reason: string;
    decisions: string[];
    inspectedPaths: string[];
    importantSymbols: string[];
    currentHypotheses: string[];
    blockers: string[];
    risks: string[];
    exactNextAction: string;
  }): Promise<TaskCheckpoint> {
    const task = await taskStore.getTask(params.taskId);
    if (!task) throw new AppError(`Task ${params.taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const gitBranchResult = await worker.execOneShot('git branch --show-current', repoDir);
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);

    const currentBranch = gitBranchResult.stdout.trim() || task.branchName || 'main';
    const currentHeadSha = gitShaResult.stdout.trim() || task.currentHeadSha;

    const checkpointId = `cp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const createdAt = new Date().toISOString();

    const markdownContent = redactSecrets(`
# SESSION CHECKPOINT: ${checkpointId}

- **Task ID**: ${task.taskId}
- **Workspace ID**: ${task.workspaceId}
- **Repository**: ${task.repository}
- **Default Branch**: main
- **Original Base SHA**: ${task.baseSha}
- **Current Working Branch**: ${currentBranch}
- **Current Head SHA**: ${currentHeadSha}
- **Reason**: ${params.reason}
- **Created At**: ${createdAt}

## Scope & Decisions
- **Task Scope**: ${task.userRequestSummary}
- **Explicit Untouched Scope**: ${task.explicitOutOfScope.join(', ') || 'None'}
- **Decisions**: ${params.decisions.map((d) => `\n  - ${d}`).join('') || 'None'}

## Inspection & Symbols
- **Inspected Files**: ${params.inspectedPaths.join(', ') || 'None'}
- **Important Symbols**: ${params.importantSymbols.join(', ') || 'None'}

## Validation & Status
- **Plan Version**: ${task.plan.version}
- **Validation Summary**: ${task.validationSummary}
- **Remaining Repair Budget**: ${Math.max(0, task.repairCycleLimit - task.repairCycleCount)}
- **Blockers**: ${params.blockers.join(', ') || 'None'}
- **Risks**: ${params.risks.join(', ') || 'None'}

## Next Action
- **Exact Next Action**: ${params.exactNextAction}
`);

    const contentHash = crypto.createHash('sha256').update(markdownContent).digest('hex');

    const checkpoint: TaskCheckpoint = {
      checkpointId,
      taskId: task.taskId,
      workspaceId: task.workspaceId,
      reason: params.reason,
      createdAt,
      contentHash,
      repository: task.repository,
      defaultBranch: 'main',
      originalBaseSha: task.baseSha,
      currentWorkingBranch: currentBranch,
      currentHeadSha,
      taskScope: task.userRequestSummary,
      explicitUntouchedScope: task.explicitOutOfScope.join(', '),
      governanceFilesRead: [],
      architectureFilesRead: [],
      importantFilesAndSymbols: params.importantSymbols,
      decisions: params.decisions,
      commits: [],
      validationSummary: task.validationSummary,
      failures: [],
      risks: params.risks,
      exactNextAction: params.exactNextAction,
      planVersion: task.plan.version,
      remainingRepairBudget: Math.max(0, task.repairCycleLimit - task.repairCycleCount),
      markdownContent,
    };

    const taskDir = path.join(this.storageDir, params.taskId);
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }

    fs.writeFileSync(path.join(taskDir, `${checkpointId}.json`), JSON.stringify(checkpoint, null, 2), 'utf-8');

    await taskStore.updateTask(params.taskId, (t) => {
      if (!t.checkpointIds.includes(checkpointId)) {
        t.checkpointIds.push(checkpointId);
      }
      return t;
    });

    logger.info('checkpoint.created', { taskId: params.taskId, checkpointId, contentHash });
    return checkpoint;
  }

  public async getCheckpoint(taskId: string, checkpointId: string): Promise<TaskCheckpoint> {
    const filePath = path.join(this.storageDir, taskId, `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) {
      throw new AppError(`Checkpoint ${checkpointId} not found for task ${taskId}`, 'CHECKPOINT_NOT_FOUND', 404);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  public async listCheckpoints(taskId: string): Promise<Array<{ checkpointId: string; reason: string; createdAt: string; headSha: string; contentHash: string }>> {
    const taskDir = path.join(this.storageDir, taskId);
    if (!fs.existsSync(taskDir)) return [];

    const files = fs.readdirSync(taskDir).filter((f) => f.endsWith('.json'));
    const list = [];

    for (const f of files) {
      const cpId = f.replace('.json', '');
      try {
        const cp = await this.getCheckpoint(taskId, cpId);
        list.push({
          checkpointId: cp.checkpointId,
          reason: cp.reason,
          createdAt: cp.createdAt,
          headSha: cp.currentHeadSha,
          contentHash: cp.contentHash,
        });
      } catch (err: any) {
        // Skip unparseable
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async resumeTask(taskId: string, checkpointId: string) {
    const checkpoint = await this.getCheckpoint(taskId, checkpointId);
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    logger.info('task.resume.started', { taskId, checkpointId });

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) {
      return {
        matchedState: false,
        drift: 'worker-recreated' as DriftCategory,
        invalidatedAssumptions: ['Worker session is no longer active'],
        requiredRefreshActions: ['Re-create worker workspace and re-clone repository'],
        exactNextRecommendedAction: 'Use workspace_orchestrator_create to recreate worker',
      };
    }

    const repoDir = worker.session.repoDir;
    const gitBranchResult = await worker.execOneShot('git branch --show-current', repoDir);
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);

    const currentBranch = gitBranchResult.stdout.trim();
    const currentHeadSha = gitShaResult.stdout.trim();
    const isDirty = gitStatusResult.stdout.trim().length > 0;

    let drift: DriftCategory = 'no-drift';
    const invalidatedAssumptions: string[] = [];

    if (currentHeadSha !== checkpoint.currentHeadSha) {
      drift = 'local-head-moved';
      invalidatedAssumptions.push(`HEAD SHA changed from ${checkpoint.currentHeadSha} to ${currentHeadSha}`);
      await evidenceLedger.markStaleEvidence(taskId, `Resume detected HEAD SHA change (${checkpoint.currentHeadSha} -> ${currentHeadSha})`);
    } else if (isDirty) {
      drift = 'worktree-changed';
      invalidatedAssumptions.push('Working directory has uncommitted changes');
    } else if (currentBranch !== checkpoint.currentWorkingBranch) {
      drift = 'branch-changed';
      invalidatedAssumptions.push(`Active branch changed from ${checkpoint.currentWorkingBranch} to ${currentBranch}`);
    }

    await taskStore.updateTask(taskId, (t) => {
      t.currentHeadSha = currentHeadSha;
      t.branchName = currentBranch;
      return t;
    });

    logger.info('task.resume.completed', { taskId, drift });

    return {
      matchedState: drift === 'no-drift',
      drift,
      invalidatedAssumptions,
      requiredRefreshActions: drift === 'no-drift' ? [] : ['Run repository_intelligence_scan to refresh state'],
      exactNextRecommendedAction: checkpoint.exactNextAction || 'Continue executing next step in plan',
    };
  }
}

export const checkpointManager = new CheckpointManagerService();
