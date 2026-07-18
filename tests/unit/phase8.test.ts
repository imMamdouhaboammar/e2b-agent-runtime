import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadGitHubConfig } from '../../src/github/config.js';
import { redactSecrets } from '../../src/security/redact.js';
import { prRepairStore } from '../../src/workflow/pr-repair-store.js';
import { taskStore } from '../../src/workflow/task-store.js';
import { evidenceLedger } from '../../src/workflow/evidence-ledger.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPhase8Tools } from '../../src/mcp/tools/phase8-tools.js';

// Mock GitHubTokenBroker
vi.mock('../../src/github/token-broker.js', () => {
  return {
    GitHubTokenBroker: vi.fn().mockImplementation(() => {
      return {
        getInstallationToken: async () => 'mock_token',
        clearCache: () => {},
        dispose: () => {},
      };
    }),
  };
});

// Mock RepositoryAuthorizationPolicy
vi.mock('../../src/github/authorization.js', () => {
  return {
    RepositoryAuthorizationPolicy: vi.fn().mockImplementation(() => {
      return {
        authorize: (repo: string) => ({
          owner: repo.split('/')[0],
          repo: repo.split('/')[1],
          fullName: repo.toLowerCase(),
          cloneUrl: `https://github.com/${repo}.git`,
        }),
      };
    }),
    validateRepositoryIdentifier: (repo: string) => ({
      owner: repo.split('/')[0],
      repo: repo.split('/')[1],
      fullName: repo.toLowerCase(),
    }),
  };
});


// Mock E2BWorkerManager
vi.mock('../../src/runtime/e2b-worker-manager.js', () => {
  return {
    e2bWorkerManager: {
      getWorker: () => ({
        session: { repoDir: '/workspace/repository' },
        execOneShot: async (cmd: string) => {
          if (cmd.includes('rev-parse')) return { stdout: 'abcdef123456', stderr: '', exitCode: 0 };
          if (cmd.includes('status')) return { stdout: '', stderr: '', exitCode: 0 };
          return { stdout: '', stderr: '', exitCode: 0 };
        },
      }),
      getSandbox: async () => ({
        commands: {
          run: async (cmd: string) => {
            if (cmd.includes('rev-parse')) return { stdout: 'abcdef123456', stderr: '', exitCode: 0 };
            if (cmd.includes('status')) return { stdout: '', stderr: '', exitCode: 0 };
            return { stdout: '', stderr: '', exitCode: 0 };
          },
        },
      }),
    },
  };
});

// Mock Octokit client
vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn().mockImplementation(() => {
      return {
        rest: {
          pulls: {
            get: async ({ pull_number }: { pull_number: number }) => {
              if (pull_number === 404) throw new Error('Not Found');
              return {
                data: {
                  title: 'Test PR',
                  state: pull_number === 101 ? 'closed' : 'open',
                  draft: false,
                  base: {
                    ref: 'main',
                    sha: 'base_sha',
                    repo: { default_branch: 'main' },
                  },
                  head: {
                    ref: pull_number === 102 ? 'main' : 'feature-branch',
                    sha: 'head_sha',
                    repo: {
                      fork: pull_number === 103,
                      full_name: pull_number === 103 ? 'fork/repo' : 'owner/repo',
                      default_branch: 'main',
                    },
                  },
                },
              };
            },
            listFiles: async () => {
              return {
                data: [
                  { filename: 'src/index.ts', status: 'modified', additions: 10, deletions: 2, patch: '@@ -1,3 +1,3 @@' },
                ],
              };
            },
            listReviewComments: async () => {
              return {
                data: [
                  { id: 1, body: 'Typo here', path: 'src/index.ts', line: 10, created_at: '2026-07-18T00:00:00Z' },
                ],
              };
            },
            createReplyForReviewComment: async () => {
              return {
                data: { id: 2, body: 'Fixed', created_at: '2026-07-18T01:00:00Z' },
              };
            },
          },
          checks: {
            listForRef: async () => {
              return {
                data: {
                  check_runs: [
                    { name: 'build', status: 'completed', conclusion: 'success', app: { name: 'github-actions' } },
                  ],
                },
              };
            },
            listAnnotations: async () => {
              return { data: [] };
            },
          },
          actions: {
            listWorkflowRunsForRepo: async () => {
              return { data: { workflow_runs: [] } };
            },
            downloadJobLogsForWorkflowRun: async () => {
              return { data: 'Sample CI Log output with sensitive SECRET=abc' };
            },
          },
        },
        graphql: async () => {
          return {
            repository: {
              pullRequest: {
                reviewThreads: {
                  nodes: [
                    {
                      id: 'thread_1',
                      isResolved: false,
                      isOutdated: false,
                      path: 'src/index.ts',
                      line: 10,
                      comments: {
                        nodes: [
                          { id: 'comment_1', body: 'Typo here', createdAt: '2026-07-18T00:00:00Z', author: { login: 'reviewer' } },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          };
        },
      };
    }),
  };
});

describe('Phase 8 PR Feedback and CI Repair Unit Tests', () => {
  beforeEach(async () => {
    // Clear stores and registry
    const repairs = await prRepairStore.listPRRepairs();
    for (const r of repairs) {
      await prRepairStore.deletePRRepair(r.prRepairId);
    }
    const tasks = await taskStore.listTasks();
    for (const t of tasks) {
      await taskStore.deleteTask(t.taskId);
    }
  });

  // 1. GitHub configuration validation
  it('should validate GitHub configuration loading', () => {
    const config = loadGitHubConfig({
      GITHUB_APP_ID: '123',
      GITHUB_APP_INSTALLATION_ID: '456',
      GITHUB_APP_PRIVATE_KEY: 'test_key',
    });
    expect(config.enabled).toBe(true);
  });

  // 2. Log Redactors
  describe('CI Log Redaction', () => {
    it('should redact Bearer authorization headers', () => {
      const log = 'Headers: Authorization: Bearer token123';
      const clean = redactSecrets(log);
      expect(clean).toContain('[REDACTED_AUTH]');
      expect(clean).not.toContain('token123');
    });

    it('should redact Basic authorization headers', () => {
      const log = 'Headers: Authorization: Basic dXNlcjpwYXNz';
      const clean = redactSecrets(log);
      expect(clean).toContain('[REDACTED_AUTH]');
    });

    it('should redact private keys', () => {
      const log = `-----BEGIN PRIVATE KEY-----\nMIIEvg...\n-----END PRIVATE KEY-----`;
      const clean = redactSecrets(log);
      expect(clean).toContain('[REDACTED_PRIVATE_KEY]');
    });

    it('should redact signed URLs', () => {
      const log = 'Download URL: https://s3.amazonaws.com/bucket/file?Signature=abc&Expires=123';
      const clean = redactSecrets(log);
      expect(clean).toContain('[REDACTED_SIGNED_URL]');
    });

    it('should redact sensitive environment assignments', () => {
      const log = 'export DATABASE_PASSWORD=supersecurepassword';
      const clean = redactSecrets(log);
      expect(clean).toContain('[REDACTED_ENV_VAR]');
      expect(clean).not.toContain('supersecurepassword');
    });

    it('should redact cookies', () => {
      const log = 'Cookie: sessionid=12345';
      const clean = redactSecrets(log);
      expect(clean).toContain('[REDACTED_COOKIE]');
    });
  });

  // 3. MCP tool functionality tests
  describe('MCP Tools Unit Tests', () => {
    let registeredTools: Map<string, any>;
    let mockServer: any;

    beforeEach(async () => {
      registeredTools = new Map();
      mockServer = {
        tool: (name: string, description: string, schema: any, handler: any) => {
          registeredTools.set(name, { description, schema, handler });
        },
      };

      registerPhase8Tools(mockServer);

      // Create a mock task
      await taskStore.createTask({
        workspaceId: 'ws_test',
        repository: 'owner/repo',
        taskMode: 'pr-repair',
        taskLabel: 'PR Repair Task',
        userRequestSummary: 'Fix review feedback',
      });
    });

    it('should attach PR and enforce branch validation', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];

      const attachTool = registeredTools.get('github_pr_attach');
      expect(attachTool).toBeDefined();

      const result = await attachTool.handler({
        taskId: task.taskId,
        repository: 'owner/repo',
        pullRequestNumber: 1,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.prRepairId).toBeDefined();
      expect(parsed.repository).toBe('owner/repo');
      expect(parsed.baseBranch).toBe('main');
      expect(parsed.headBranch).toBe('feature-branch');
    });

    it('should reject attaching duplicate PR to the same task', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];
      const attachTool = registeredTools.get('github_pr_attach');

      await attachTool.handler({
        taskId: task.taskId,
        repository: 'owner/repo',
        pullRequestNumber: 1,
      });

      await expect(
        attachTool.handler({
          taskId: task.taskId,
          repository: 'owner/repo',
          pullRequestNumber: 2,
        })
      ).rejects.toThrow(/already bound/);
    });

    it('should reject closed PRs', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];
      const attachTool = registeredTools.get('github_pr_attach');

      await expect(
        attachTool.handler({
          taskId: task.taskId,
          repository: 'owner/repo',
          pullRequestNumber: 101, // Mock closed
        })
      ).rejects.toThrow(/is not open/);
    });

    it('should reject PRs where head branch is the default branch', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];
      const attachTool = registeredTools.get('github_pr_attach');

      await expect(
        attachTool.handler({
          taskId: task.taskId,
          repository: 'owner/repo',
          pullRequestNumber: 102, // Mock head == default
        })
      ).rejects.toThrow(/default branch/);
    });

    it('should attach fork PRs but mark writable false', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];
      const attachTool = registeredTools.get('github_pr_attach');

      const res = await attachTool.handler({
        taskId: task.taskId,
        repository: 'owner/repo',
        pullRequestNumber: 103, // Mock fork
      });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.fork).toBe(true);
      expect(parsed.writable).toBe(false);
    });

    it('should fetch review threads and handle GraphQL formatting', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];
      const attachTool = registeredTools.get('github_pr_attach');
      const attachRes = await attachTool.handler({
        taskId: task.taskId,
        repository: 'owner/repo',
        pullRequestNumber: 1,
      });
      const parsedAttach = JSON.parse(attachRes.content[0].text);

      const listThreads = registeredTools.get('github_pr_list_review_threads');
      const threadRes = await listThreads.handler({
        prRepairId: parsedAttach.prRepairId,
      });

      const threads = JSON.parse(threadRes.content[0].text);
      expect(threads.length).toBeGreaterThan(0);
      expect(threads[0].threadId).toBe('thread_1');
      expect(threads[0].path).toBe('src/index.ts');
    });

    it('should fetch check status and workflow runs', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];
      const attachTool = registeredTools.get('github_pr_attach');
      const attachRes = await attachTool.handler({
        taskId: task.taskId,
        repository: 'owner/repo',
        pullRequestNumber: 1,
      });
      const parsedAttach = JSON.parse(attachRes.content[0].text);

      const listChecks = registeredTools.get('github_pr_list_checks');
      const checkRes = await listChecks.handler({
        prRepairId: parsedAttach.prRepairId,
      });

      const checks = JSON.parse(checkRes.content[0].text);
      expect(checks.length).toBe(1);
      expect(checks[0].checkRunName).toBe('build');
    });

    it('should block push if head drift occurs', async () => {
      const tasks = await taskStore.listTasks();
      const task = tasks[0];
      const attachTool = registeredTools.get('github_pr_attach');
      const attachRes = await attachTool.handler({
        taskId: task.taskId,
        repository: 'owner/repo',
        pullRequestNumber: 1,
      });
      const parsedAttach = JSON.parse(attachRes.content[0].text);

      const pushTool = registeredTools.get('github_pr_push_repair');
      await expect(
        pushTool.handler({
          prRepairId: parsedAttach.prRepairId,
          confirmation: {
            repository: 'owner/repo',
            pullRequestNumber: 1,
            headBranch: 'feature-branch',
            expectedRemoteHeadSha: 'drifted_sha_from_remote',
            expectedLocalHeadSha: 'local_sha',
          },
        })
      ).rejects.toThrow(/moved/);
    });
  });
});
