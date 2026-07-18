import crypto from 'node:crypto';
import { taskStore } from './task-store.js';
import { evidenceLedger } from './evidence-ledger.js';
import { repositoryIntelligence } from './repository-intelligence.js';
import {
  ValidationCycle,
  RepairAttempt,
  EvidenceCategory,
  TaskMode,
} from './types.js';
import { loadWorkflowLimitsConfig } from '../config.js';
import { e2bWorkerManager } from '../runtime/e2b-worker-manager.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export class ValidationRepairManagerService {
  public async detectValidationPlan(
    taskId: string,
    targetPaths: string[] = [],
    taskMode?: TaskMode
  ): Promise<Array<{ command: string; category: EvidenceCategory; source: string; required: boolean; confidence: string }>> {
    const intel = await repositoryIntelligence.getSection(taskId, 'commands');
    const commands = intel.commands || {};
    const proposals: Array<{ command: string; category: EvidenceCategory; source: string; required: boolean; confidence: string }> = [];

    if (commands.typecheck) {
      proposals.push({
        command: commands.typecheck,
        category: 'typecheck',
        source: 'repository-manifest',
        required: true,
        confidence: 'high',
      });
    }

    if (commands.lint) {
      proposals.push({
        command: commands.lint,
        category: 'lint',
        source: 'repository-manifest',
        required: true,
        confidence: 'high',
      });
    }

    if (commands.test) {
      proposals.push({
        command: commands.test,
        category: 'unit-test',
        source: 'repository-manifest',
        required: true,
        confidence: 'high',
      });
    }

    if (commands.build) {
      proposals.push({
        command: commands.build,
        category: 'build',
        source: 'repository-manifest',
        required: false,
        confidence: 'medium',
      });
    }

    if (proposals.length === 0) {
      proposals.push({
        command: 'npm test 2>/dev/null || true',
        category: 'unit-test',
        source: 'fallback-detection',
        required: false,
        confidence: 'low',
      });
    }

    return proposals;
  }

  public async startValidationCycle(
    taskId: string,
    plannedCategories: EvidenceCategory[],
    cycleLabel = ''
  ): Promise<ValidationCycle> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const limits = loadWorkflowLimitsConfig();

    if (task.repairCycleCount >= task.repairCycleLimit && task.taskState === 'REPAIRING') {
      await taskStore.updateTask(taskId, (t) => {
        t.taskState = 'BLOCKED';
        t.blockers.push(`Repair budget exhausted (${t.repairCycleCount} >= ${t.repairCycleLimit})`);
        return t;
      });
      throw new AppError(
        `Repair budget exhausted (${task.repairCycleCount} >= ${task.repairCycleLimit})`,
        'REPAIR_BUDGET_EXHAUSTED',
        429
      );
    }

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);

    const startHeadSha = gitShaResult.stdout.trim() || task.currentHeadSha;
    const startDirtyState = gitStatusResult.stdout.trim().length > 0;

    const cycleId = `vc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cycleNumber = (task.activeValidationCycleId ? 1 : 0) + 1;

    const cycle: ValidationCycle = {
      cycleId,
      taskId,
      cycleNumber,
      label: cycleLabel || `Validation Cycle #${cycleNumber}`,
      plannedCategories,
      startHeadSha,
      startDirtyState,
      evidenceIds: [],
      status: 'in-progress',
      failedCategories: [],
      unavailableCategories: [],
      codeChangedDuringCycle: false,
      startedAt: new Date().toISOString(),
    };

    await taskStore.updateTask(taskId, (t) => {
      t.taskState = t.taskState === 'REPAIRING' ? 'REPAIRING' : 'VALIDATING';
      t.activeValidationCycleId = cycleId;
      return t;
    });

    logger.info('validation.cycle_started', { taskId, cycleId, plannedCategories });
    return cycle;
  }

  public async completeValidationCycle(
    taskId: string,
    cycleId: string,
    evidenceIds: string[],
    summary?: string
  ): Promise<ValidationCycle> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);

    const endHeadSha = gitShaResult.stdout.trim() || task.currentHeadSha;
    const endDirtyState = gitStatusResult.stdout.trim().length > 0;

    const allEvidence = await evidenceLedger.listEvidence(taskId);
    const cycleEvidence = allEvidence.filter((e) => evidenceIds.includes(e.evidenceId));

    if (cycleEvidence.length !== evidenceIds.length) {
      throw new AppError('One or more evidence IDs were not found for this task', 'EVIDENCE_NOT_FOUND', 400);
    }

    const failedCategories: EvidenceCategory[] = [];
    let passedAll = true;

    for (const ev of cycleEvidence) {
      if (ev.status !== 'passed') {
        passedAll = false;
        if (!failedCategories.includes(ev.category)) {
          failedCategories.push(ev.category);
        }
      }
    }

    const cycleStatus = passedAll ? 'passed' : 'failed';

    const completedCycle: ValidationCycle = {
      cycleId,
      taskId,
      cycleNumber: 1,
      label: summary || `Validation cycle ${cycleStatus}`,
      plannedCategories: cycleEvidence.map((e) => e.category),
      startHeadSha: task.currentHeadSha,
      endHeadSha,
      startDirtyState: task.filesModified.length > 0,
      endDirtyState,
      evidenceIds,
      status: cycleStatus,
      failedCategories,
      unavailableCategories: [],
      codeChangedDuringCycle: endHeadSha !== task.currentHeadSha,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: summary || `Validation cycle ${cycleStatus} with ${cycleEvidence.length} checks`,
    };

    await taskStore.updateTask(taskId, (t) => {
      t.activeValidationCycleId = undefined;
      t.validationSummary = `Validation cycle ${completedCycle.cycleId}: ${cycleStatus} (${cycleEvidence.length} checks, ${failedCategories.length} failed)`;
      t.currentHeadSha = endHeadSha;
      if (cycleStatus === 'passed') {
        t.taskState = 'REVIEWING';
      } else {
        t.taskState = 'REPAIRING';
      }
      return t;
    });

    logger.info('validation.cycle_completed', { taskId, cycleId, status: cycleStatus, failedCategories });
    return completedCycle;
  }

  public async getValidationStatus(taskId: string) {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const evidenceList = await evidenceLedger.listEvidence(taskId);
    const passedCategories = Array.from(new Set(evidenceList.filter((e) => e.status === 'passed').map((e) => e.category)));
    const failedCategories = Array.from(new Set(evidenceList.filter((e) => e.status === 'failed').map((e) => e.category)));

    const remainingRepairBudget = Math.max(0, task.repairCycleLimit - task.repairCycleCount);

    return {
      taskId,
      taskState: task.taskState,
      repairCycleCount: task.repairCycleCount,
      repairCycleLimit: task.repairCycleLimit,
      remainingRepairBudget,
      validationSummary: task.validationSummary,
      passedCategories,
      failedCategories,
      blockers: task.blockers,
      isPublicationReady: task.taskState === 'READY_TO_PUBLISH',
    };
  }

  public async startRepairAttempt(
    taskId: string,
    cycleId: string,
    failureEvidenceIds: string[],
    hypothesis: string,
    intendedInspection = '',
    intendedChangeScope = ''
  ): Promise<RepairAttempt> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    if (!hypothesis || hypothesis.trim().length === 0) {
      throw new AppError('Hypothesis for repair attempt cannot be empty', 'INVALID_HYPOTHESIS', 400);
    }

    if (task.activeRepairAttemptId) {
      throw new AppError(`A repair attempt is already active: ${task.activeRepairAttemptId}`, 'REPAIR_ALREADY_ACTIVE', 409);
    }

    if (task.repairCycleCount >= task.repairCycleLimit) {
      await taskStore.updateTask(taskId, (t) => {
        t.taskState = 'BLOCKED';
        t.blockers.push(`Repair budget exhausted (${t.repairCycleCount} >= ${t.repairCycleLimit})`);
        return t;
      });
      throw new AppError(`Repair budget exhausted`, 'REPAIR_BUDGET_EXHAUSTED', 429);
    }

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);

    const startHeadSha = gitShaResult.stdout.trim() || task.currentHeadSha;
    const startDirtyState = gitStatusResult.stdout.trim().length > 0;

    const repairAttemptId = `ra_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const repairAttempt: RepairAttempt = {
      repairAttemptId,
      taskId,
      cycleId,
      failureEvidenceIds,
      hypothesis,
      intendedInspection,
      intendedChangeScope,
      startHeadSha,
      startDirtyState,
      inspectedPaths: [],
      changedPaths: [],
      result: 'active',
      startedAt: new Date().toISOString(),
    };

    await taskStore.updateTask(taskId, (t) => {
      t.taskState = 'REPAIRING';
      t.activeRepairAttemptId = repairAttemptId;
      return t;
    });

    logger.info('repair.attempt_started', { taskId, repairAttemptId, hypothesis });
    return repairAttempt;
  }

  public async completeRepairAttempt(
    taskId: string,
    repairAttemptId: string,
    inspectedPaths: string[],
    changedPaths: string[],
    result: 'changed' | 'no-change' | 'blocked' | 'abandoned',
    decisionSummary?: string
  ): Promise<RepairAttempt> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    if (task.activeRepairAttemptId !== repairAttemptId) {
      throw new AppError(`Repair attempt ${repairAttemptId} is not active`, 'REPAIR_NOT_ACTIVE', 400);
    }

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);

    const endHeadSha = gitShaResult.stdout.trim() || task.currentHeadSha;
    const endDirtyState = gitStatusResult.stdout.trim().length > 0;

    const attempt: RepairAttempt = {
      repairAttemptId,
      taskId,
      cycleId: task.activeValidationCycleId || 'previous_cycle',
      failureEvidenceIds: [],
      hypothesis: 'Recorded repair attempt',
      intendedInspection: 'Recorded inspection',
      intendedChangeScope: 'Recorded change scope',
      startHeadSha: task.currentHeadSha,
      endHeadSha,
      startDirtyState: false,
      endDirtyState,
      inspectedPaths,
      changedPaths,
      decisionSummary,
      result,
      startedAt: task.updatedAt,
      completedAt: new Date().toISOString(),
    };

    // Mark prior evidence as stale if code changed
    if (changedPaths.length > 0 || endHeadSha !== task.currentHeadSha) {
      await evidenceLedger.markStaleEvidence(taskId, `Code modified during repair attempt ${repairAttemptId}`);
    }

    await taskStore.updateTask(taskId, (t) => {
      t.activeRepairAttemptId = undefined;
      t.repairCycleCount += 1;
      t.filesInspected = Array.from(new Set([...t.filesInspected, ...inspectedPaths]));
      t.filesModified = Array.from(new Set([...t.filesModified, ...changedPaths]));
      t.currentHeadSha = endHeadSha;
      if (t.repairCycleCount >= t.repairCycleLimit && result !== 'changed') {
        t.taskState = 'BLOCKED';
        t.blockers.push(`Repair budget exhausted after repair attempt ${repairAttemptId}`);
      }
      return t;
    });

    logger.info('repair.attempt_completed', { taskId, repairAttemptId, result, changedPaths });
    return attempt;
  }
}

export const validationRepairManager = new ValidationRepairManagerService();
