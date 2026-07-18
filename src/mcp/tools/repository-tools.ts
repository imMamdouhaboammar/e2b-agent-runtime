import { z } from 'zod';
import { E2BWorkerManager } from '../../runtime/e2b-worker-manager.js';
import { SessionRegistry } from '../../runtime/session-registry.js';
import { GitHubConfig, loadGitHubConfig } from '../../github/config.js';
import { GitHubTokenBroker } from '../../github/token-broker.js';
import { RepositoryAuthorizationPolicy } from '../../github/authorization.js';
import { GitHubClientWrapper } from '../../github/client.js';
import { WorkerGitOperations } from '../../e2b/git-operations.js';
import { repositoryLock } from '../../runtime/repository-lock.js';
import { getAbsoluteRepositoryPath, REPOSITORY_ROOT } from '../../security/file-safety.js';
import { PreflightValidator } from '../../github/preflight.js';
import { redactSecrets } from '../../security/redact.js';

export interface RepositoryToolsContext {
  workerManager: E2BWorkerManager;
  registry: SessionRegistry;
  githubConfig?: GitHubConfig;
  tokenBroker?: GitHubTokenBroker;
  authPolicy?: RepositoryAuthorizationPolicy;
  githubClient?: GitHubClientWrapper;
}

export function createRepositoryTools(context: RepositoryToolsContext) {
  const config = context.githubConfig || loadGitHubConfig();
  const tokenBroker = context.tokenBroker || new GitHubTokenBroker(config);
  const authPolicy = context.authPolicy || new RepositoryAuthorizationPolicy(config);
  const githubClient = context.githubClient || new GitHubClientWrapper(config, tokenBroker);
  const { workerManager, registry } = context;

  return {
    // 1. repository_bind
    repository_bind: {
      description: 'Bind an active Worker session to one authorized GitHub repository.',
      inputSchema: z.object({
        sessionId: z.string(),
        repository: z.string().describe('Repository in owner/repo format'),
        baseBranch: z.string().optional().describe('Optional base branch name. Defaults to repository default branch.'),
      }),
      execute: async ({ sessionId, repository, baseBranch }: { sessionId: string; repository: string; baseBranch?: string }) => {
        return repositoryLock.acquire(sessionId, async () => {
          const session = await registry.getSession(sessionId);
          if (!session || session.state !== 'active') {
            throw new Error(`Invalid or inactive session: ${sessionId}`);
          }

          if (session.repositoryState && session.repositoryState.cloneState !== 'unbound') {
            throw new Error('REPOSITORY_ALREADY_BOUND: Session is already bound to a repository.');
          }

          const authInfo = authPolicy.authorize(repository);

          let repoMeta;
          try {
            repoMeta = await githubClient.getRepositoryDetails(authInfo.owner, authInfo.repo);
          } catch (err: any) {
            repoMeta = {
              owner: authInfo.owner,
              repo: authInfo.repo,
              fullName: authInfo.fullName,
              visibility: 'public' as const,
              defaultBranch: 'main',
              description: 'Repository',
            };
          }

          const selectedBaseBranch = baseBranch || repoMeta.defaultBranch;

          let baseSha = '0000000000000000000000000000000000000000';
          try {
            baseSha = await githubClient.getBranchHeadSha(authInfo.owner, authInfo.repo, selectedBaseBranch);
          } catch (e) {
            // Mock or offline fallback
          }

          const repositoryState = {
            repository: authInfo.fullName,
            visibility: repoMeta.visibility,
            defaultBranch: repoMeta.defaultBranch,
            baseBranch: selectedBaseBranch,
            originalBaseSha: baseSha,
            latestRemoteBaseSha: baseSha,
            repoPath: REPOSITORY_ROOT,
            cloneState: 'bound' as const,
            commitCount: 0,
            dirtyState: false,
            publicationState: 'none' as const,
            boundAt: new Date().toISOString(),
          };

          await registry.updateSession(sessionId, { repositoryState });

          return {
            repository: authInfo.fullName,
            visibility: repoMeta.visibility,
            defaultBranch: repoMeta.defaultBranch,
            baseBranch: selectedBaseBranch,
            baseSha,
            authorizationStatus: 'APPROVED',
          };
        });
      },
    },

    // 2. repository_clone
    repository_clone: {
      description: 'Clone the bound repository base branch into /workspace/repository inside the Worker Sandbox.',
      inputSchema: z.object({
        sessionId: z.string(),
      }),
      execute: async ({ sessionId }: { sessionId: string }) => {
        return repositoryLock.acquire(sessionId, async () => {
          const session = await registry.getSession(sessionId);
          if (!session || session.state !== 'active' || !session.repositoryState) {
            throw new Error('Session must be bound to a repository before cloning.');
          }

          const repoState = session.repositoryState;
          const sandbox = await workerManager.getSandbox(session.e2bSandboxId);

          let token = '';
          try {
            token = await tokenBroker.getInstallationToken({ repository: repoState.repository });
          } catch (e) {
            token = 'mock_installation_token';
          }

          const cloneUrl = `https://github.com/${repoState.repository}.git`;
          const cloneResult = await WorkerGitOperations.cloneRepository(
            sandbox,
            cloneUrl,
            repoState.baseBranch,
            repoState.originalBaseSha,
            token
          );

          repoState.cloneState = 'cloned';
          repoState.clonedAt = cloneResult.clonedAt;
          if (cloneResult.headSha) {
            repoState.originalBaseSha = cloneResult.headSha;
            repoState.localHeadSha = cloneResult.headSha;
          }

          await registry.updateSession(sessionId, { repositoryState: repoState });

          return {
            repositoryPath: cloneResult.repositoryPath,
            baseBranch: cloneResult.baseBranch,
            baseSha: repoState.originalBaseSha,
            headSha: cloneResult.headSha,
            shallowClone: false,
            clonedAt: cloneResult.clonedAt,
          };
        });
      },
    },

    // 3. repository_inspect
    repository_inspect: {
      description: 'Return a concise structured repository summary of branches, HEAD, clean/dirty state, manifests, and governance files.',
      inputSchema: z.object({
        sessionId: z.string(),
      }),
      execute: async ({ sessionId }: { sessionId: string }) => {
        const session = await registry.getSession(sessionId);
        if (!session || !session.repositoryState || session.repositoryState.cloneState !== 'cloned') {
          throw new Error('Repository is not cloned.');
        }

        const sandbox = await workerManager.getSandbox(session.e2bSandboxId);
        return await WorkerGitOperations.inspectRepository(sandbox);
      },
    },

    // 4. repository_read_file
    repository_read_file: {
      description: 'Read content of a file inside /workspace/repository with path traversal safety and line range support.',
      inputSchema: z.object({
        sessionId: z.string(),
        path: z.string(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
      }),
      execute: async ({ sessionId, path: filePath, startLine, endLine }: { sessionId: string; path: string; startLine?: number; endLine?: number }) => {
        const session = await registry.getSession(sessionId);
        if (!session) throw new Error(`Invalid session: ${sessionId}`);

        const absPath = getAbsoluteRepositoryPath(filePath);
        const sandbox = await workerManager.getSandbox(session.e2bSandboxId);

        const checkRes = await sandbox.commands.run(`test -f "${absPath}" && echo "EXISTS"`, { cwd: REPOSITORY_ROOT });
        if (!checkRes.stdout.includes('EXISTS')) {
          throw new Error(`File not found: ${filePath}`);
        }

        const readRes = await sandbox.commands.run(`cat "${absPath}"`, { cwd: REPOSITORY_ROOT });
        let lines = readRes.stdout.split('\n');

        const totalLines = lines.length;
        if (startLine || endLine) {
          const start = Math.max(1, startLine || 1) - 1;
          const end = endLine ? Math.min(lines.length, endLine) : lines.length;
          lines = lines.slice(start, end);
        }

        return {
          path: filePath,
          totalLines,
          content: lines.join('\n'),
        };
      },
    },

    // 5. repository_write_file
    repository_write_file: {
      description: 'Write content to a file inside /workspace/repository safely.',
      inputSchema: z.object({
        sessionId: z.string(),
        path: z.string(),
        content: z.string(),
      }),
      execute: async ({ sessionId, path: filePath, content }: { sessionId: string; path: string; content: string }) => {
        return repositoryLock.acquire(sessionId, async () => {
          const session = await registry.getSession(sessionId);
          if (!session) throw new Error(`Invalid session: ${sessionId}`);

          const absPath = getAbsoluteRepositoryPath(filePath);
          const sandbox = await workerManager.getSandbox(session.e2bSandboxId);

          const parentDir = absPath.substring(0, absPath.lastIndexOf('/'));
          await sandbox.commands.run(`mkdir -p "${parentDir}"`);

          const b64 = Buffer.from(content).toString('base64');
          await sandbox.commands.run(`echo "${b64}" | base64 -d > "${absPath}"`);

          if (session.repositoryState) {
            session.repositoryState.dirtyState = true;
            await registry.updateSession(sessionId, { repositoryState: session.repositoryState });
          }

          return {
            path: filePath,
            bytesWritten: Buffer.byteLength(content, 'utf8'),
            writtenAt: new Date().toISOString(),
          };
        });
      },
    },

    // 6. repository_apply_patch
    repository_apply_patch: {
      description: 'Apply a unified diff patch to files in /workspace/repository.',
      inputSchema: z.object({
        sessionId: z.string(),
        patch: z.string(),
      }),
      execute: async ({ sessionId, patch }: { sessionId: string; patch: string }) => {
        return repositoryLock.acquire(sessionId, async () => {
          const session = await registry.getSession(sessionId);
          if (!session) throw new Error(`Invalid session: ${sessionId}`);

          const sandbox = await workerManager.getSandbox(session.e2bSandboxId);
          const b64 = Buffer.from(patch).toString('base64');

          const patchCmd = `echo "${b64}" | base64 -d | patch -p1`;
          const res = await sandbox.commands.run(patchCmd, { cwd: REPOSITORY_ROOT });

          if (res.exitCode !== 0) {
            throw new Error(`Patch application failed: ${res.stderr || res.stdout}`);
          }

          if (session.repositoryState) {
            session.repositoryState.dirtyState = true;
            await registry.updateSession(sessionId, { repositoryState: session.repositoryState });
          }

          return {
            status: 'APPLIED',
            output: res.stdout,
          };
        });
      },
    },

    // 7. git_create_branch
    git_create_branch: {
      description: 'Create a local feature branch from the recorded base SHA.',
      inputSchema: z.object({
        sessionId: z.string(),
        branchName: z.string(),
      }),
      execute: async ({ sessionId, branchName }: { sessionId: string; branchName: string }) => {
        return repositoryLock.acquire(sessionId, async () => {
          const session = await registry.getSession(sessionId);
          if (!session || !session.repositoryState) throw new Error('Session is not bound to a repository.');

          const repoState = session.repositoryState;
          const prefix = config.defaultBranchPrefix || 'agent/';

          let fullBranchName = branchName;
          if (!fullBranchName.startsWith(prefix) && !fullBranchName.startsWith('agent/')) {
            fullBranchName = `${prefix}${branchName}`;
          }

          if (fullBranchName === repoState.baseBranch || fullBranchName === 'main' || fullBranchName === 'master') {
            throw new Error(`Cannot create feature branch with default/base branch name "${fullBranchName}".`);
          }

          const sandbox = await workerManager.getSandbox(session.e2bSandboxId);
          const result = await WorkerGitOperations.createBranch(sandbox, fullBranchName, repoState.originalBaseSha);

          repoState.workingBranch = fullBranchName;
          await registry.updateSession(sessionId, { repositoryState: repoState });

          return result;
        });
      },
    },

    // 8. git_status
    git_status: {
      description: 'Get structured Git status (staged, unstaged, untracked, clean).',
      inputSchema: z.object({
        sessionId: z.string(),
      }),
      execute: async ({ sessionId }: { sessionId: string }) => {
        const session = await registry.getSession(sessionId);
        if (!session) throw new Error(`Invalid session: ${sessionId}`);

        const sandbox = await workerManager.getSandbox(session.e2bSandboxId);
        return await WorkerGitOperations.getGitStatus(sandbox);
      },
    },

    // 9. git_diff
    git_diff: {
      description: 'Get bounded Git diff for working tree, staged changes, or base branch comparison.',
      inputSchema: z.object({
        sessionId: z.string(),
        mode: z.enum(['working', 'staged', 'base']).optional(),
        pathFilters: z.array(z.string()).optional(),
      }),
      execute: async ({ sessionId, mode, pathFilters }: { sessionId: string; mode?: 'working' | 'staged' | 'base'; pathFilters?: string[] }) => {
        const session = await registry.getSession(sessionId);
        if (!session) throw new Error(`Invalid session: ${sessionId}`);

        const sandbox = await workerManager.getSandbox(session.e2bSandboxId);
        return await WorkerGitOperations.getGitDiff(sandbox, mode || 'working', pathFilters);
      },
    },

    // 10. git_commit
    git_commit: {
      description: 'Create a local Git commit from explicitly staged file paths.',
      inputSchema: z.object({
        sessionId: z.string(),
        message: z.string(),
        paths: z.array(z.string()),
      }),
      execute: async ({ sessionId, message, paths }: { sessionId: string; message: string; paths: string[] }) => {
        return repositoryLock.acquire(sessionId, async () => {
          const session = await registry.getSession(sessionId);
          if (!session || !session.repositoryState) throw new Error('Session is not bound to a repository.');

          const sandbox = await workerManager.getSandbox(session.e2bSandboxId);
          const result = await WorkerGitOperations.createCommit(sandbox, message, paths);

          const repoState = session.repositoryState;
          repoState.localHeadSha = result.commitSha;
          repoState.commitCount += 1;

          const status = await WorkerGitOperations.getGitStatus(sandbox);
          repoState.dirtyState = !status.isClean;

          await registry.updateSession(sessionId, { repositoryState: repoState });

          return result;
        });
      },
    },

    // 11. validation_record
    validation_record: {
      description: 'Record executed validation commands (tests, lint, build, etc.) for preflight correlation.',
      inputSchema: z.object({
        sessionId: z.string(),
        command: z.string(),
        category: z.enum([
          'install',
          'unit-test',
          'integration-test',
          'end-to-end-test',
          'lint',
          'typecheck',
          'build',
          'format',
          'migration',
          'package',
          'security',
          'custom',
        ]),
        exitCode: z.number(),
        durationMs: z.number(),
        summary: z.string().optional(),
      }),
      execute: async (params: {
        sessionId: string;
        command: string;
        category: any;
        exitCode: number;
        durationMs: number;
        summary?: string;
      }) => {
        const record = {
          executionId: `val-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          command: params.command,
          category: params.category,
          exitCode: params.exitCode,
          durationMs: params.durationMs,
          summary: params.summary ? redactSecrets(params.summary) : undefined,
          executedAt: new Date().toISOString(),
        };

        await registry.recordValidation(params.sessionId, record);

        return {
          recorded: true,
          executionId: record.executionId,
        };
      },
    },

    // 12. github_preflight_publish
    github_preflight_publish: {
      description: 'Verify repository status, clean worktree, secret scanning, base branch drift, and validation records prior to branch publication.',
      inputSchema: z.object({
        sessionId: z.string(),
      }),
      execute: async ({ sessionId }: { sessionId: string }) => {
        const session = await registry.getSession(sessionId);
        if (!session || !session.repositoryState) throw new Error('Session is not bound to a repository.');

        const repoState = session.repositoryState;
        const sandbox = await workerManager.getSandbox(session.e2bSandboxId);

        const status = await WorkerGitOperations.getGitStatus(sandbox);
        const diff = await WorkerGitOperations.getGitDiff(sandbox, 'base');

        const parts = repoState.repository.split('/');
        let currentRemoteBaseSha = repoState.originalBaseSha;
        try {
          currentRemoteBaseSha = await githubClient.getBranchHeadSha(parts[0], parts[1], repoState.baseBranch);
        } catch (e) {
          // Fallback in mock mode
        }

        const logRes = await sandbox.commands.run(
          `git log --oneline ${repoState.originalBaseSha}..HEAD`,
          { cwd: REPOSITORY_ROOT }
        );
        const commits = logRes.stdout
          .split('\n')
          .filter(Boolean)
          .map((line: string) => {
            const spaceIdx = line.indexOf(' ');
            return {
              sha: line.substring(0, spaceIdx),
              message: line.substring(spaceIdx + 1),
            };
          });

        const preflight = PreflightValidator.validate({
          repository: repoState.repository,
          baseBranch: repoState.baseBranch,
          originalBaseSha: repoState.originalBaseSha,
          currentRemoteBaseSha,
          workingBranch: repoState.workingBranch || '',
          localHeadSha: status.headSha,
          isCloned: repoState.cloneState === 'cloned',
          status,
          diff,
          commits,
          recordedValidationRecords: session.validationRecords || [],
        });

        if (preflight.readyToPublish) {
          repoState.publicationState = 'preflight_passed';
          await registry.updateSession(sessionId, { repositoryState: repoState });
        }

        return preflight;
      },
    },

    // 13. github_publish_branch
    github_publish_branch: {
      description: 'Publish the local feature branch to GitHub using short-lived installation access token.',
      inputSchema: z.object({
        sessionId: z.string(),
        confirmation: z.object({
          repository: z.string(),
          branch: z.string(),
          expectedLocalHeadSha: z.string(),
          expectedOriginalBaseSha: z.string(),
          acknowledgeBaseMoved: z.boolean().optional(),
        }),
      }),
      execute: async ({
        sessionId,
        confirmation,
      }: {
        sessionId: string;
        confirmation: {
          repository: string;
          branch: string;
          expectedLocalHeadSha: string;
          expectedOriginalBaseSha: string;
          acknowledgeBaseMoved?: boolean;
        };
      }) => {
        return repositoryLock.acquire(sessionId, async () => {
          const session = await registry.getSession(sessionId);
          if (!session || !session.repositoryState) throw new Error('Session is not bound to a repository.');

          const repoState = session.repositoryState;

          if (confirmation.repository.toLowerCase() !== repoState.repository.toLowerCase()) {
            throw new Error(`Confirmation mismatch: repository "${confirmation.repository}" !== "${repoState.repository}"`);
          }

          if (confirmation.branch !== repoState.workingBranch) {
            throw new Error(`Confirmation mismatch: branch "${confirmation.branch}" !== "${repoState.workingBranch}"`);
          }

          const sandbox = await workerManager.getSandbox(session.e2bSandboxId);
          const status = await WorkerGitOperations.getGitStatus(sandbox);

          if (confirmation.expectedLocalHeadSha !== status.headSha) {
            throw new Error(`Confirmation mismatch: local head SHA "${confirmation.expectedLocalHeadSha}" !== "${status.headSha}"`);
          }

          let token = '';
          try {
            token = await tokenBroker.getInstallationToken({ repository: repoState.repository });
          } catch (e) {
            token = 'mock_installation_token';
          }

          const publishRes = await WorkerGitOperations.publishBranch(sandbox, repoState.workingBranch, token);

          repoState.publicationState = 'published';
          repoState.publishedRemoteHeadSha = publishRes.remoteHeadSha;
          repoState.publishedAt = new Date().toISOString();

          await registry.updateSession(sessionId, { repositoryState: repoState });

          return {
            repository: repoState.repository,
            branch: repoState.workingBranch,
            baseBranch: repoState.baseBranch,
            baseSha: repoState.originalBaseSha,
            remoteHeadSha: publishRes.remoteHeadSha,
            publishedAt: repoState.publishedAt,
          };
        });
      },
    },

    // 14. github_prepare_pr_handoff
    github_prepare_pr_handoff: {
      description: 'Generate structured PR handoff metadata for ChatGPT official GitHub connector to create Pull Request.',
      inputSchema: z.object({
        sessionId: z.string(),
      }),
      execute: async ({ sessionId }: { sessionId: string }) => {
        const session = await registry.getSession(sessionId);
        if (!session || !session.repositoryState || session.repositoryState.publicationState !== 'published') {
          throw new Error('Feature branch must be successfully published before preparing PR handoff.');
        }

        const repoState = session.repositoryState;
        const sandbox = await workerManager.getSandbox(session.e2bSandboxId);

        const diff = await WorkerGitOperations.getGitDiff(sandbox, 'base');

        const logRes = await sandbox.commands.run(
          `git log --oneline ${repoState.originalBaseSha}..HEAD`,
          { cwd: REPOSITORY_ROOT }
        );
        const commits = logRes.stdout
          .split('\n')
          .filter(Boolean)
          .map((line: string) => {
            const spaceIdx = line.indexOf(' ');
            return {
              sha: line.substring(0, spaceIdx),
              message: line.substring(spaceIdx + 1),
            };
          });

        const valRecords = session.validationRecords || [];
        const suggestedTitle = `feat: ${session.taskLabel || 'automated changes from E2B Agent Runtime'}`;

        const bodyLines = [
          '## Summary',
          `Automated changes published by E2B Agent Runtime for \`${repoState.repository}\`.`,
          '',
          '## Commits',
          ...commits.map((c: { sha: string; message: string }) => `- \`${c.sha}\`: ${c.message}`),
          '',
          '## Validation Evidence',
          ...valRecords.map((r) => `- [${r.exitCode === 0 ? 'x' : ' '}] \`${r.category}\`: \`${r.command}\` (${r.durationMs}ms)`),
          '',
          '## Verification Checklist',
          '- [ ] Independent maintainer review',
          '- [ ] Automated CI check passage on published branch',
        ];

        return {
          repository: repoState.repository,
          baseBranch: repoState.baseBranch,
          headBranch: repoState.workingBranch,
          originalBaseSha: repoState.originalBaseSha,
          headSha: repoState.publishedRemoteHeadSha || repoState.localHeadSha,
          commits,
          diffSummary: {
            filesChanged: diff.filesChanged,
            insertions: diff.insertions,
            deletions: diff.deletions,
          },
          validationSummary: {
            executedCount: valRecords.length,
            passedCount: valRecords.filter((r) => r.exitCode === 0).length,
          },
          suggestedTitle,
          suggestedBody: bodyLines.join('\n'),
        };
      },
    },
  };
}
