import crypto from 'node:crypto';
import { taskStore } from './task-store.js';
import { DiffReviewResult } from './types.js';
import { e2bWorkerManager } from '../runtime/e2b-worker-manager.js';
import { redactSecrets } from '../security/redact.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export class DiffReviewService {
  public async reviewDiff(
    taskId: string,
    includePatch = false,
    maxPatchBytes = 524288
  ): Promise<DiffReviewResult> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    const baseSha = task.baseSha || 'main';

    // 1. Get git diff --stat
    const statCmd = baseSha ? `git diff --stat ${baseSha}...HEAD || git diff --stat ${baseSha}` : 'git diff --stat';
    const statResult = await worker.execOneShot(statCmd, repoDir);

    // 2. Get git name-status
    const nameStatusCmd = baseSha ? `git diff --name-status ${baseSha}...HEAD || git diff --name-status ${baseSha}` : 'git diff --name-status';
    const nameStatusResult = await worker.execOneShot(nameStatusCmd, repoDir);

    // 3. Get git log commits
    const logCmd = baseSha ? `git log ${baseSha}..HEAD --oneline` : 'git log -n 5 --oneline';
    const logResult = await worker.execOneShot(logCmd, repoDir);
    const commits = logResult.stdout.split('\n').filter((l: string) => l.trim().length > 0);

    // 4. Get working tree status for unstaged/staged
    const statusResult = await worker.execOneShot('git status --porcelain', repoDir);
    const dirtyLines = statusResult.stdout.split('\n').filter((l: string) => l.trim().length > 0);

    const filesChanged: string[] = [];
    const lines = nameStatusResult.stdout.split('\n').filter((l: string) => l.trim().length > 0);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        filesChanged.push(parts[1]);
      }
    }

    // Parse stat for insertions / deletions
    let insertions = 0;
    let deletions = 0;
    const statLines = statResult.stdout.split('\n');
    for (const l of statLines) {
      if (l.includes('changed,') || l.includes('insertion') || l.includes('deletion')) {
        const insMatch = l.match(/(\d+)\s+insertion/);
        const delMatch = l.match(/(\d+)\s+deletion/);
        if (insMatch) insertions = Number.parseInt(insMatch[1], 10);
        if (delMatch) deletions = Number.parseInt(delMatch[1], 10);
      }
    }

    // Planned vs Unplanned files
    const plannedFiles: string[] = [];
    for (const step of task.plan.steps) {
      if (step.description) {
        for (const file of filesChanged) {
          if (step.description.includes(file) || step.title.includes(file)) {
            if (!plannedFiles.includes(file)) plannedFiles.push(file);
          }
        }
      }
    }
    const unplannedFiles = filesChanged.filter((f) => !plannedFiles.includes(f));

    // Impact analysis
    const dependencyImpact = filesChanged.filter((f) => f.includes('package') || f.includes('lock') || f.includes('Cargo') || f.includes('go.mod'));
    const architectureImpact = filesChanged.filter((f) => f.includes('ARCHITECTURE') || f.includes('README') || f.includes('DESIGN'));
    const schemaImpact = filesChanged.filter((f) => f.includes('schema') || f.includes('types') || f.includes('migration'));
    const publicApiImpact = filesChanged.filter((f) => f.includes('src/index') || f.includes('src/api') || f.includes('src/mcp'));
    const generatedArtifacts = filesChanged.filter((f) => f.includes('dist/') || f.includes('build/') || f.includes('.data/'));
    const debugArtifacts: string[] = [];

    // Optional full patch for inspection
    let patchExcerpt: string | undefined;
    const securityFindings: string[] = [];
    const scopeWarnings: string[] = [];
    const blockers: string[] = [];

    if (includePatch || filesChanged.length > 0) {
      const diffCmd = baseSha ? `git diff ${baseSha}...HEAD || git diff ${baseSha}` : 'git diff';
      const diffRes = await worker.execOneShot(diffCmd, repoDir);
      const rawPatch = diffRes.stdout;

      if (rawPatch.includes('console.log') || rawPatch.includes('describe.only') || rawPatch.includes('test.only')) {
        debugArtifacts.push('Found console.log or test.only statements in diff');
      }

      // Check secret findings in diff
      const secretMatches = rawPatch.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g);
      if (secretMatches) {
        securityFindings.push('Found JWT or auth token signature in diff');
        blockers.push('Potential secret token found in diff');
      }

      if (rawPatch.length > maxPatchBytes) {
        patchExcerpt = redactSecrets(rawPatch.slice(0, maxPatchBytes)) + '\n... [Patch truncated due to maxPatchBytes]';
      } else {
        patchExcerpt = redactSecrets(rawPatch);
      }
    }

    if (unplannedFiles.length > 5) {
      scopeWarnings.push(`Unplanned scope expansion: ${unplannedFiles.length} files edited outside explicit plan`);
    }

    if (dirtyLines.length > 0) {
      scopeWarnings.push('Working directory has uncommitted staged or unstaged changes');
    }

    const contentHash = crypto
      .createHash('sha256')
      .update(`${filesChanged.join(',')}:${insertions}:${deletions}:${commits.length}`)
      .digest('hex');

    logger.info('diff.review.completed', { taskId, filesCount: filesChanged.length, insertions, deletions });

    return {
      summary: `Diff Review: ${filesChanged.length} files changed (+${insertions}, -${deletions}), ${commits.length} commits beyond ${baseSha}`,
      filesChanged,
      insertions,
      deletions,
      commits,
      plannedFiles,
      unplannedFiles,
      dependencyImpact,
      architectureImpact,
      schemaImpact,
      publicApiImpact,
      securityFindings,
      generatedArtifacts,
      debugArtifacts,
      scopeWarnings,
      blockers,
      patchExcerpt,
      contentHash,
    };
  }
}

export const diffReview = new DiffReviewService();
