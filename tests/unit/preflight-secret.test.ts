import { describe, expect, it } from 'vitest';
import { SecretScanningGate } from '../../src/github/secret-gate.js';
import { PreflightValidator } from '../../src/github/preflight.js';

describe('Preflight Validator & Secret Gate Unit Tests', () => {
  it('should detect private key header in file content', () => {
    const findings = SecretScanningGate.inspectDiffAndFiles([
      {
        path: 'src/key.txt',
        content: 'const key = "-----BEGIN PRIVATE KEY-----\nMIIE...";',
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('private_key');
    expect(findings[0].isBlocker).toBe(true);
  });

  it('should detect GitHub PAT token format', () => {
    const findings = SecretScanningGate.inspectDiffAndFiles([
      {
        path: 'src/config.ts',
        content: 'const token = "ghp_123456789012345678901234567890123456";',
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('api_token');
  });

  it('should block publication when base branch has moved', () => {
    const res = PreflightValidator.validate({
      repository: 'owner/repo',
      baseBranch: 'main',
      originalBaseSha: '1111111111111111111111111111111111111111',
      currentRemoteBaseSha: '2222222222222222222222222222222222222222',
      workingBranch: 'agent/feature-1',
      localHeadSha: '3333333333333333333333333333333333333333',
      isCloned: true,
      status: {
        branch: 'agent/feature-1',
        headSha: '3333333333333333333333333333333333333333',
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        isClean: true,
      },
      diff: {
        mode: 'base',
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
        diff: 'diff --git...',
        truncated: false,
      },
      commits: [{ sha: '3333333', message: 'feat: add feature' }],
    });

    expect(res.baseMoved).toBe(true);
    expect(res.warnings).toEqual([
      'BASE_BRANCH_MOVED: The remote base branch "main" moved from 1111111 to 2222222.',
    ]);
  });

  it('should block publication when worktree is dirty', () => {
    const res = PreflightValidator.validate({
      repository: 'owner/repo',
      baseBranch: 'main',
      originalBaseSha: '1111111111111111111111111111111111111111',
      currentRemoteBaseSha: '1111111111111111111111111111111111111111',
      workingBranch: 'agent/feature-1',
      localHeadSha: '3333333333333333333333333333333333333333',
      isCloned: true,
      status: {
        branch: 'agent/feature-1',
        headSha: '3333333333333333333333333333333333333333',
        staged: ['dirty.txt'],
        unstaged: [],
        untracked: [],
        conflicted: [],
        isClean: false,
      },
      diff: {
        mode: 'base',
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
        diff: 'diff...',
        truncated: false,
      },
      commits: [{ sha: '3333333', message: 'feat: change' }],
    });

    expect(res.readyToPublish).toBe(false);
    expect(res.blockers).toContain('WORKTREE_DIRTY: Uncommitted changes present in workspace.');
  });
});
