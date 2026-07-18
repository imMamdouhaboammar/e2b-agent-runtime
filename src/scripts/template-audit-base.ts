import { Sandbox } from 'e2b';
import { loadControllerConfig } from '../config.js';

async function auditBase() {
  console.log('Auditing base E2B sandbox environment...');
  const config = loadControllerConfig({
    E2B_API_KEY: process.env.E2B_API_KEY || 'mock_key',
    MCP_ACCESS_TOKEN: process.env.MCP_ACCESS_TOKEN || 'mock_token',
  });

  if (!process.env.E2B_API_KEY) {
    console.log('E2B_API_KEY not set. Reporting target base requirements:');
    console.log(JSON.stringify({
      targetOS: 'Ubuntu 22.04 LTS x86_64',
      targetTools: ['bash', 'git', 'curl', 'jq', 'ripgrep', 'node 20', 'npm', 'pnpm', 'python3', 'pip', 'uv'],
      runtimePackPath: '/opt/agent',
      workspacePath: '/workspace/repository',
      status: 'AUDIT_SIMULATED_NO_API_KEY',
    }, null, 2));
    return;
  }

  const sb = await Sandbox.create({ apiKey: config.apiKey, timeoutMs: 60000 });
  try {
    const osRes = await sb.commands.run('cat /etc/os-release');
    const nodeRes = await sb.commands.run('node -v');
    const gitRes = await sb.commands.run('git --version');
    const pyRes = await sb.commands.run('python3 --version');

    console.log(JSON.stringify({
      os: osRes.stdout.split('\n')[0],
      node: nodeRes.stdout.trim(),
      git: gitRes.stdout.trim(),
      python: pyRes.stdout.trim(),
      status: 'AUDIT_COMPLETE',
    }, null, 2));
  } finally {
    await sb.kill();
  }
}

auditBase().catch(console.error);
