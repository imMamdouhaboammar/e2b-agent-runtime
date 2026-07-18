import { loadGitHubConfig } from '../github/config.js';
import { GitHubTokenBroker } from '../github/token-broker.js';
import { Octokit } from '@octokit/rest';

async function main() {
  const repoArg = process.argv[2];
  const refArg = process.argv[3];
  if (!repoArg || !refArg) {
    console.log('Usage: pnpm github:inspect-pr-checks <owner/repo> <ref>');
    process.exit(1);
  }

  try {
    const config = loadGitHubConfig();
    if (!config.enabled) {
      console.log('GitHub publishing is not configured (mock mode).');
      return;
    }

    const broker = new GitHubTokenBroker(config);
    const token = await broker.getInstallationToken({ repository: repoArg });
    const octokit = new Octokit({
      auth: token,
      baseUrl: config.baseUrl,
    });

    const [owner, repo] = repoArg.split('/');

    const checks = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: refArg,
    });

    console.log(`[Checks status for ${refArg}]`);
    for (const run of checks.data.check_runs) {
      console.log(` - ${run.name}: ${run.status} (${run.conclusion || 'pending'})`);
    }
  } catch (error: any) {
    console.error('Failed to inspect PR checks:', error.message);
    process.exit(1);
  }
}

main();
