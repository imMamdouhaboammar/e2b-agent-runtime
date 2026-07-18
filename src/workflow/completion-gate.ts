import { taskStore } from './task-store.js';
import { evidenceLedger } from './evidence-ledger.js';
import { diffReview } from './diff-review.js';
import { repositoryIntelligence } from './repository-intelligence.js';
import { CompletionGateResult } from './types.js';
import { e2bWorkerManager } from '../runtime/e2b-worker-manager.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export class CompletionGateEvaluatorService {
  public async evaluate(
    taskId: string,
    acknowledgeUnavailableChecks = false,
    unavailableCheckReasons: string[] = []
  ): Promise<CompletionGateResult> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const passedGates: string[] = [];
    const failedGates: string[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];
    const requiredNextActions: string[] = [];

    // 1. Branch Safety Check
    const gitBranchResult = await worker.execOneShot('git branch --show-current', repoDir);
    const branchName = gitBranchResult.stdout.trim();
    if (['main', 'master', 'HEAD'].includes(branchName)) {
      failedGates.push('branch_safety');
      blockers.push(`Cannot publish directly from default branch ${branchName}. Create a feature branch.`);
      requiredNextActions.push('Switch to a dedicated feature branch using git checkout -b feat/...');
    } else {
      passedGates.push('branch_safety');
    }

    // 2. Worktree Clean Check
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);
    const isDirty = gitStatusResult.stdout.trim().length > 0;
    if (isDirty) {
      failedGates.push('worktree_clean');
      blockers.push('Working tree contains uncommitted changes.');
      requiredNextActions.push('Commit or stash working tree changes before publication.');
    } else {
      passedGates.push('worktree_clean');
    }

    // 3. Commits Present Check
    const baseSha = task.baseSha || 'main';
    const logResult = await worker.execOneShot(`git log ${baseSha}..HEAD --oneline`, repoDir);
    const commitCount = logResult.stdout.split('\n').filter((l: string) => l.trim().length > 0).length;
    if (commitCount === 0) {
      failedGates.push('commits_present');
      blockers.push(`No commits exist on ${branchName} beyond base ${baseSha}.`);
      requiredNextActions.push('Commit changes to the feature branch.');
    } else {
      passedGates.push('commits_present');
    }

    // 4. Plan Completion Check
    const uncompletedSteps = task.plan.steps.filter((s) => !['completed', 'skipped'].includes(s.status));
    if (uncompletedSteps.length > 0) {
      failedGates.push('plan_completed');
      blockers.push(`Plan has ${uncompletedSteps.length} uncompleted steps: ${uncompletedSteps.map((s) => s.title).join(', ')}`);
      requiredNextActions.push('Complete or skip remaining plan steps');
    } else {
      passedGates.push('plan_completed');
    }

    // 5. Validation Evidence Check
    const evidenceList = await evidenceLedger.listEvidence(taskId);
    const passedEv = evidenceList.filter((e) => e.status === 'passed' && !e.isStale);
    const failedEv = evidenceList.filter((e) => e.status === 'failed' && !e.isStale);

    if (failedEv.length > 0) {
      failedGates.push('no_failed_checks');
      blockers.push(`Active validation has ${failedEv.length} failed execution records.`);
      requiredNextActions.push('Repair failed checks and rerun validation cycle');
    } else {
      passedGates.push('no_failed_checks');
    }

    if (passedEv.length === 0 && !acknowledgeUnavailableChecks) {
      failedGates.push('validation_passed');
      blockers.push('No fresh passing validation evidence recorded for this task.');
      requiredNextActions.push('Run validation cycle and record passing execution evidence');
    } else {
      passedGates.push('validation_passed');
    }

    // 5b. Browser UI Verification Check (for web UI tasks)
    const isWebTask = ['feature', 'bug-fix'].includes(task.taskMode);
    const browserEv = evidenceList.filter((e) => e.category.startsWith('browser-') && e.status === 'passed' && !e.isStale);
    if (isWebTask && browserEv.length === 0 && !acknowledgeUnavailableChecks) {
      warnings.push('Task affects web behavior but no fresh passing browser UI evidence recorded.');
    } else if (browserEv.length > 0) {
      passedGates.push('browser_verification_passed');
    }

    // 6. Diff Review & Secret Scan Check
    const review = await diffReview.reviewDiff(taskId, true);
    if (review.blockers.length > 0) {
      failedGates.push('secret_scan_clean');
      blockers.push(...review.blockers);
      requiredNextActions.push('Remove sensitive tokens or secrets from code diff');
    } else {
      passedGates.push('secret_scan_clean');
    }

    if (review.unplannedFiles.length > 5) {
      warnings.push(`Unplanned file edits detected: ${review.unplannedFiles.join(', ')}`);
    }

    const ready = failedGates.length === 0;

    if (ready) {
      await taskStore.updateTask(taskId, (t) => {
        t.taskState = 'READY_TO_PUBLISH';
        return t;
      });
    }

    logger.info('completion.gate.completed', { taskId, ready, passedCount: passedGates.length, failedCount: failedGates.length });

    return {
      ready,
      taskState: ready ? 'READY_TO_PUBLISH' : task.taskState,
      passedGates,
      failedGates,
      warnings,
      blockers,
      requiredNextActions,
      validationSummary: task.validationSummary,
      diffSummary: review.summary,
      publicationPreflightSummary: ready
        ? 'All completion gates passed. Workspace is ready for Phase 3 feature branch publication.'
        : `Completion gate failed: ${blockers.join('; ')}`,
    };
  }

  public async preparePrHandoff(taskId: string): Promise<string> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const gitBranchResult = await worker.execOneShot('git branch --show-current', repoDir);
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const logResult = await worker.execOneShot(`git log ${task.baseSha || 'main'}..HEAD --oneline`, repoDir);

    const currentBranch = gitBranchResult.stdout.trim();
    const currentHeadSha = gitShaResult.stdout.trim();
    const commits = logResult.stdout.split('\n').filter((l: string) => l.trim().length > 0);

    const review = await diffReview.reviewDiff(taskId);
    const evidenceList = await evidenceLedger.listEvidence(taskId);
    const passedEv = evidenceList.filter((e) => e.status === 'passed');

    const prBody = `
# Task Pull Request Handoff

## Objective
${task.userRequestSummary}

## Task Mode & Context
- **Task Mode**: ${task.taskMode}
- **Task Label**: ${task.taskLabel}
- **Task ID**: ${task.taskId}
- **Branch**: \`${currentBranch}\`
- **Base SHA**: \`${task.baseSha}\`
- **Head SHA**: \`${currentHeadSha}\`

## File-level Changes & Diff Summary
${review.summary}
- **Changed Files**: ${review.filesChanged.map((f) => `\`${f}\``).join(', ')}
- **Commits**:
${commits.map((c: string) => `  - ${c}`).join('\n')}

## Validation Evidence
- **Validation Summary**: ${task.validationSummary}
- **Executed Checks**:
${passedEv.map((e) => `  - \`${e.category}\`: \`${e.commandSummary}\` (Exit Code: ${e.exitCode})`).join('\n') || '  - None'}

## Risks & Verification
- **Risks**: ${task.risks.join(', ') || 'None identified'}
- **Independent Verification Steps**:
  1. \`git checkout ${currentBranch}\`
  2. \`pnpm typecheck\`
  3. \`pnpm test\`
`;

    logger.info('pr.handoff.prepared', { taskId, branch: currentBranch, headSha: currentHeadSha });
    return prBody;
  }
}

export const completionGateEvaluator = new CompletionGateEvaluatorService();
