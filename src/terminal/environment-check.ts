import type { Sandbox } from 'e2b';
import type { TerminalCheckResult } from '../types.js';

export async function runTerminalChecks(sandbox: Sandbox): Promise<TerminalCheckResult> {
  const outputs: Record<string, string> = {};

  const commands = [
    { key: 'pwd', cmd: 'pwd' },
    { key: 'whoami', cmd: 'whoami' },
    { key: 'gitVersion', cmd: 'git --version' },
    { key: 'nodeVersion', cmd: 'node --version' },
    { key: 'pythonVersion', cmd: 'python3 --version' },
    { key: 'workspaceDirCheck', cmd: 'test -d /workspace && echo "workspace_exists"' },
    { key: 'createGitTestDir', cmd: 'mkdir -p /workspace/git-test-repo' },
    { key: 'gitInit', cmd: 'git -C /workspace/git-test-repo init' },
    { key: 'gitStatus', cmd: 'git -C /workspace/git-test-repo status' },
  ];

  for (const { key, cmd } of commands) {
    const res = await sandbox.commands.run(cmd);
    if (res.exitCode !== 0) {
      return {
        success: false,
        outputs,
        error: `Terminal command "${cmd}" failed with exit code ${res.exitCode}: ${res.stderr}`,
      };
    }
    outputs[key] = (res.stdout || '').trim();
  }

  return {
    success: true,
    outputs,
  };
}
