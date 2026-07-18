import { SecretFinding, SecretScanningGate } from './secret-gate.js';
import { GitDiffResult, GitStatusResult } from '../e2b/git-operations.js';

export interface PreflightCheckResult {
  readyToPublish: boolean;
  blockers: string[];
  warnings: string[];
  repository: string;
  baseBranch: string;
  originalBaseSha: string;
  currentRemoteBaseSha: string;
  baseMoved: boolean;
  branch: string;
  localHeadSha: string;
  commits: Array<{ sha: string; message: string }>;
  validationSummary: {
    totalExecuted: number;
    passed: number;
    failed: number;
    executedCategories: string[];
  };
  diffSummary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  secretFindings: SecretFinding[];
}

const FORBIDDEN_PATHS = [
  /^\.env(\..+)?$/i,
  /^\.git\//i,
  /\.data\/sessions\.json/i,
  /\.e2b/i,
];

export class PreflightValidator {
  public static validate(params: {
    repository: string;
    baseBranch: string;
    originalBaseSha: string;
    currentRemoteBaseSha: string;
    workingBranch: string;
    localHeadSha: string;
    isCloned: boolean;
    status: GitStatusResult;
    diff: GitDiffResult;
    commits: Array<{ sha: string; message: string }>;
    diffFilesContent?: Array<{ path: string; content?: string }>;
    recordedValidationRecords?: Array<{ category: string; exitCode: number }>;
  }): PreflightCheckResult {
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Check bound and cloned
    if (!params.isCloned) {
      blockers.push('Repository is not cloned.');
    }

    // 2. Check branch validity
    if (!params.workingBranch || params.workingBranch === params.baseBranch || params.workingBranch === 'main' || params.workingBranch === 'master') {
      blockers.push(`Invalid feature branch "${params.workingBranch}". Cannot publish directly to default/base branch.`);
    }

    // 3. Check commits exist beyond base
    if (!params.commits || params.commits.length === 0 || params.localHeadSha === params.originalBaseSha) {
      blockers.push('NO_COMMITS_TO_PUBLISH: No local commits found beyond the base commit.');
    }

    // 4. Check clean worktree
    if (!params.status.isClean) {
      blockers.push('WORKTREE_DIRTY: Uncommitted changes present in workspace.');
    }

    if (params.status.conflicted && params.status.conflicted.length > 0) {
      blockers.push('MERGE_CONFLICT: Unresolved merge conflicts present.');
    }

    // 5. Base branch drift check
    const baseMoved = Boolean(
      params.currentRemoteBaseSha &&
        params.originalBaseSha &&
        params.currentRemoteBaseSha !== params.originalBaseSha
    );

    if (baseMoved) {
      warnings.push(
        `BASE_BRANCH_MOVED: The remote base branch "${params.baseBranch}" moved from ${params.originalBaseSha.substring(0, 7)} to ${params.currentRemoteBaseSha.substring(0, 7)}.`
      );
    }

    // 6. Forbidden paths check
    if (params.status.staged) {
      for (const p of params.status.staged) {
        for (const forbidden of FORBIDDEN_PATHS) {
          if (forbidden.test(p)) {
            blockers.push(`Forbidden file modification detected: "${p}".`);
          }
        }
      }
    }

    // 7. Secret scanning check
    const secretFindings = SecretScanningGate.inspectDiffAndFiles(params.diffFilesContent || []);
    for (const finding of secretFindings) {
      if (finding.isBlocker) {
        blockers.push(
          `SECRET_DETECTED: Potential ${finding.category} secret detected in "${finding.filePath}"${finding.line ? ` line ${finding.line}` : ''}.`
        );
      }
    }

    // 8. Validation summary
    const valRecords = params.recordedValidationRecords || [];
    const totalExecuted = valRecords.length;
    const passed = valRecords.filter((r) => r.exitCode === 0).length;
    const failed = valRecords.filter((r) => r.exitCode !== 0).length;
    const executedCategories = Array.from(new Set(valRecords.map((r) => r.category)));

    if (failed > 0) {
      blockers.push(`Validation failure recorded: ${failed} validation check(s) failed.`);
    }

    return {
      readyToPublish: blockers.length === 0,
      blockers,
      warnings,
      repository: params.repository,
      baseBranch: params.baseBranch,
      originalBaseSha: params.originalBaseSha,
      currentRemoteBaseSha: params.currentRemoteBaseSha,
      baseMoved,
      branch: params.workingBranch,
      localHeadSha: params.localHeadSha,
      commits: params.commits,
      validationSummary: {
        totalExecuted,
        passed,
        failed,
        executedCategories,
      },
      diffSummary: {
        filesChanged: params.diff.filesChanged,
        insertions: params.diff.insertions,
        deletions: params.diff.deletions,
      },
      secretFindings,
    };
  }
}
