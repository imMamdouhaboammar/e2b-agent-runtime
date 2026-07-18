import { loadGitHubConfig } from '../github/config.js';
import { GitHubTokenBroker } from '../github/token-broker.js';
import { Octokit } from '@octokit/rest';

async function main() {
  const repoArg = process.argv[2];
  const prArg = process.argv[3];
  if (!repoArg || !prArg) {
    console.log('Usage: pnpm github:inspect-pr-reviews <owner/repo> <prNumber>');
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

    const comments = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
    });

    console.log(`[Review comments for PR #${pullNumber}]`);
    for (const c of comments.data) {
      console.log(` - [${c.path} L${c.line || c.original_line}] by ${c.user?.login}: ${c.body.substring(0, 100)}`);
    }
  } catch (error: any) {
    console.error('Failed to inspect PR reviews:', error.message);
    process.exit(1);
  }
}

main();
