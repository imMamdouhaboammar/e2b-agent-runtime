import { Sandbox } from 'e2b';
import { getAbsoluteRepositoryPath, REPOSITORY_ROOT, sanitizeRepositoryPath } from '../security/file-safety.js';
import { redactSecrets } from '../security/redact.js';

export interface GitCloneResult {
  repositoryPath: string;
  baseBranch: string;
  baseSha: string;
  headSha: string;
  clonedAt: string;
}

export interface GitStatusResult {
  branch: string;
  headSha: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicted: string[];
  isClean: boolean;
}

export interface GitDiffResult {
  mode: 'working' | 'staged' | 'base';
  filesChanged: number;
  insertions: number;
  deletions: number;
  diff: string;
  truncated: boolean;
}

export interface GitCommitResult {
  commitSha: string;
  message: string;
  changedFiles: string[];
  parentSha: string;
}

export interface RepositoryInspectionResult {
  repository: string;
  currentBranch: string;
  currentHead: string;
  isClean: boolean;
  manifestFiles: string[];
  lockfiles: string[];
  governanceFiles: string[];
  architectureFiles: string[];
  likelyCommands: {
    test?: string;
    build?: string;
    lint?: string;
    typecheck?: string;
  };
}

export class WorkerGitOperations {

  private static formatAuthHeader(token: string): string {
    const credentials = `x-access-token:${token}`;
    const base64 = Buffer.from(credentials).toString('base64');
    return `AUTHORIZATION: basic ${base64}`;
  }

  public static async cloneRepository(
    sandbox: Sandbox,
    cloneUrl: string,
    baseBranch: string,
    expectedBaseSha: string,
    installationToken: string
  ): Promise<GitCloneResult> {
    const authHeader = this.formatAuthHeader(installationToken);

    // Ensure target directory exists and is empty
    await sandbox.commands.run(`rm -rf ${REPOSITORY_ROOT} && mkdir -p ${REPOSITORY_ROOT}`);

    // Clone using inline http.extraheader configuration
    const cloneCmd = `git -c http.extraheader="${authHeader}" clone --branch "${baseBranch}" "${cloneUrl}" ${REPOSITORY_ROOT}`;
    const result = await sandbox.commands.run(cloneCmd, { timeoutMs: 120000 });

    if (result.exitCode !== 0) {
      throw new Error(`Git clone failed: ${redactSecrets(result.stderr || result.stdout)}`);
    }

    // Configure safe Git ownership and bot committer identity
    await sandbox.commands.run(`git config --global --add safe.directory ${REPOSITORY_ROOT}`);
    await sandbox.commands.run(`git config user.name "E2B Agent Runtime"`, { cwd: REPOSITORY_ROOT });
    await sandbox.commands.run(`git config user.email "agent-runtime@e2b.dev"`, { cwd: REPOSITORY_ROOT });

    // Verify checked-out HEAD matches expected base SHA
    const headResult = await sandbox.commands.run('git rev-parse HEAD', { cwd: REPOSITORY_ROOT });
    const headSha = headResult.stdout.trim();

    if (expectedBaseSha && headSha !== expectedBaseSha) {
      // If expected SHA differs (e.g. branch tip updated), log warning or record
    }

    // Verify .git/config contains no token
    const configResult = await sandbox.commands.run('cat .git/config', { cwd: REPOSITORY_ROOT });
    if (configResult.stdout.includes(installationToken)) {
      throw new Error('Security Error: Token was accidentally persisted to .git/config!');
    }

    return {
      repositoryPath: REPOSITORY_ROOT,
      baseBranch,
      baseSha: expectedBaseSha || headSha,
      headSha,
      clonedAt: new Date().toISOString(),
    };
  }

  public static async createBranch(
    sandbox: Sandbox,
    branchName: string,
    baseSha: string
  ): Promise<{ branch: string; baseSha: string; headSha: string }> {
    // Check clean working tree
    const status = await this.getGitStatus(sandbox);
    if (!status.isClean) {
      throw new Error('WORKTREE_DIRTY: Cannot create branch with uncommitted changes.');
    }

    const createCmd = `git checkout -b "${branchName}"`;
    const res = await sandbox.commands.run(createCmd, { cwd: REPOSITORY_ROOT });

    if (res.exitCode !== 0) {
      throw new Error(`Failed to create Git branch "${branchName}": ${res.stderr}`);
    }

    const headRes = await sandbox.commands.run('git rev-parse HEAD', { cwd: REPOSITORY_ROOT });
    const headSha = headRes.stdout.trim();

    return {
      branch: branchName,
      baseSha,
      headSha,
    };
  }

  public static async getGitStatus(sandbox: Sandbox): Promise<GitStatusResult> {
    const branchRes = await sandbox.commands.run('git branch --show-current', { cwd: REPOSITORY_ROOT });
    const branch = branchRes.stdout.trim() || 'HEAD';

    const headRes = await sandbox.commands.run('git rev-parse HEAD', { cwd: REPOSITORY_ROOT });
    const headSha = headRes.stdout.trim();

    const statusRes = await sandbox.commands.run('git status --porcelain', { cwd: REPOSITORY_ROOT });

    const lines = statusRes.stdout.split('\n').filter(Boolean);

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];
    const conflicted: string[] = [];

    for (const line of lines) {
      const x = line[0];
      const y = line[1];
      const file = line.substring(3).trim();

      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
        conflicted.push(file);
      } else {
        if (x !== ' ' && x !== '?') staged.push(file);
        if (y !== ' ' && y !== '?') unstaged.push(file);
        if (x === '?' && y === '?') untracked.push(file);
      }
    }

    return {
      branch,
      headSha,
      staged,
      unstaged,
      untracked,
      conflicted,
      isClean: lines.length === 0,
    };
  }

  public static async getGitDiff(
    sandbox: Sandbox,
    mode: 'working' | 'staged' | 'base' = 'working',
    pathFilters?: string[]
  ): Promise<GitDiffResult> {
    let cmd = 'git diff';
    if (mode === 'staged') {
      cmd = 'git diff --cached';
    } else if (mode === 'base') {
      // compare against origin base branch or initial base commit
      cmd = 'git diff origin/HEAD...HEAD';
    }

    if (pathFilters && pathFilters.length > 0) {
      const sanitizedPaths = pathFilters.map(sanitizeRepositoryPath);
      cmd += ` -- ${sanitizedPaths.join(' ')}`;
    }

    const res = await sandbox.commands.run(cmd, { cwd: REPOSITORY_ROOT, timeoutMs: 30000 });
    const rawDiff = res.stdout;

    // Stat summary
    const statRes = await sandbox.commands.run(`${cmd} --stat`, { cwd: REPOSITORY_ROOT });
    const statLines = statRes.stdout.trim().split('\n');
    const summaryLine = statLines[statLines.length - 1] || '';

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    const filesMatch = summaryLine.match(/(\d+) file/);
    const insMatch = summaryLine.match(/(\d+) insertion/);
    const delMatch = summaryLine.match(/(\d+) deletion/);

    if (filesMatch) filesChanged = Number.parseInt(filesMatch[1], 10);
    if (insMatch) insertions = Number.parseInt(insMatch[1], 10);
    if (delMatch) deletions = Number.parseInt(delMatch[1], 10);

    const maxBytes = 64 * 1024; // 64 KB limit for diff output
    let diffStr = redactSecrets(rawDiff);
    let truncated = false;

    if (Buffer.byteLength(diffStr, 'utf8') > maxBytes) {
      diffStr = diffStr.substring(0, maxBytes) + '\n... [Diff truncated at 64 KB]';
      truncated = true;
    }

    return {
      mode,
      filesChanged,
      insertions,
      deletions,
      diff: diffStr,
      truncated,
    };
  }

  public static async createCommit(
    sandbox: Sandbox,
    message: string,
    paths: string[]
  ): Promise<GitCommitResult> {
    if (!paths || paths.length === 0) {
      throw new Error('EMPTY_PATHS: Must explicitly specify paths to stage for commit.');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('EMPTY_COMMIT_MESSAGE: Commit message cannot be empty.');
    }

    const sanitizedPaths = paths.map((p) => {
      const clean = sanitizeRepositoryPath(p);
      return `"${clean}"`;
    });

    // Stage specified paths only (NEVER git add .)
    const addCmd = `git add ${sanitizedPaths.join(' ')}`;
    const addRes = await sandbox.commands.run(addCmd, { cwd: REPOSITORY_ROOT });
    if (addRes.exitCode !== 0) {
      throw new Error(`Git add failed: ${addRes.stderr}`);
    }

    // Get parent SHA before commit
    const parentRes = await sandbox.commands.run('git rev-parse HEAD', { cwd: REPOSITORY_ROOT });
    const parentSha = parentRes.stdout.trim();

    // Commit
    const commitCmd = `git commit -m "${message.replace(/"/g, '\\"')}"`;
    const commitRes = await sandbox.commands.run(commitCmd, { cwd: REPOSITORY_ROOT });
    if (commitRes.exitCode !== 0) {
      throw new Error(`Git commit failed: ${commitRes.stderr || commitRes.stdout}`);
    }

    const newHeadRes = await sandbox.commands.run('git rev-parse HEAD', { cwd: REPOSITORY_ROOT });
    const commitSha = newHeadRes.stdout.trim();

    return {
      commitSha,
      message,
      changedFiles: paths,
      parentSha,
    };
  }

  public static async publishBranch(
    sandbox: Sandbox,
    branchName: string,
    installationToken: string
  ): Promise<{ remoteHeadSha: string }> {
    const authHeader = this.formatAuthHeader(installationToken);

    // Push feature branch using inline Authorization header
    const pushCmd = `git -c http.extraheader="${authHeader}" push -u origin "${branchName}"`;
    const res = await sandbox.commands.run(pushCmd, { cwd: REPOSITORY_ROOT, timeoutMs: 60000 });

    if (res.exitCode !== 0) {
      throw new Error(`Git push failed: ${redactSecrets(res.stderr || res.stdout)}`);
    }

    const headRes = await sandbox.commands.run('git rev-parse HEAD', { cwd: REPOSITORY_ROOT });
    const remoteHeadSha = headRes.stdout.trim();

    return { remoteHeadSha };
  }

  public static async inspectRepository(
    sandbox: Sandbox
  ): Promise<RepositoryInspectionResult> {
    const status = await this.getGitStatus(sandbox);

    // Find manifest and governance files
    const findRes = await sandbox.commands.run(
      'find . -maxdepth 2 -not -path "*/.*" -type f',
      { cwd: REPOSITORY_ROOT }
    );
    const files = findRes.stdout.split('\n').map((f) => f.replace(/^\.\//, '').trim()).filter(Boolean);

    const manifests: string[] = [];
    const lockfiles: string[] = [];
    const governance: string[] = [];
    const architecture: string[] = [];

    const govNames = ['agents.md', 'claude.md', 'contributing.md', 'code_of_conduct.md', 'security.md', 'readme.md'];

    for (const f of files) {
      const lower = f.toLowerCase();
      if (lower === 'package.json' || lower === 'cargo.toml' || lower === 'go.mod' || lower === 'pyproject.toml') {
        manifests.push(f);
      }
      if (lower.includes('lock') || lower === 'pnpm-lock.yaml') {
        lockfiles.push(f);
      }
      if (govNames.includes(lower)) {
        governance.push(f);
      }
      if (lower.includes('arch') || lower.includes('design') || lower.includes('spec')) {
        architecture.push(f);
      }
    }

    const repoNameRes = await sandbox.commands.run('git remote get-url origin', { cwd: REPOSITORY_ROOT });
    const rawUrl = repoNameRes.stdout.trim();
    const repoMatch = rawUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    const repository = repoMatch ? repoMatch[1].toLowerCase() : 'unknown';

    // Guess commands if package.json exists
    const likelyCommands: { test?: string; build?: string; lint?: string; typecheck?: string } = {};
    if (manifests.includes('package.json')) {
      likelyCommands.test = 'pnpm test';
      likelyCommands.build = 'pnpm build';
      likelyCommands.lint = 'pnpm lint';
      likelyCommands.typecheck = 'pnpm typecheck';
    }

    return {
      repository,
      currentBranch: status.branch,
      currentHead: status.headSha,
      isClean: status.isClean,
      manifestFiles: manifests,
      lockfiles,
      governanceFiles: governance,
      architectureFiles: architecture,
      likelyCommands,
    };
  }
}
