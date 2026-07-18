import { loadGitHubConfig } from '../github/config.js';
import { GitHubTokenBroker } from '../github/token-broker.js';
import { Octokit } from '@octokit/rest';

async function main() {
  const repoArg = process.argv[2];
  const prArg = process.argv[3];
  if (!repoArg || !prArg) {
    console.log('Usage: pnpm github:inspect-pr <owner/repo> <prNumber>');
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
    const pullNumber = Number.parseInt(prArg, 10);

    const pr = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    console.log(`[PR #${pullNumber} Inspection]`);
    console.log(` - Title: ${pr.data.title}`);
    console.log(` - State: ${pr.data.state}`);
    console.log(` - Base: ${pr.data.base.ref} (${pr.data.base.sha})`);
    console.log(` - Head: ${pr.data.head.ref} (${pr.data.head.sha})`);
    console.log(` - Mergeable: ${pr.data.mergeable}`);
  } catch (error: any) {
    console.error('Failed to inspect PR:', error.message);
    process.exit(1);
  }
}

main();
