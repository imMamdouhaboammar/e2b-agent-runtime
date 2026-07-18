import { Octokit } from '@octokit/rest';
import { loadGitHubConfig } from '../github/config.js';
import { GitHubTokenBroker } from '../github/token-broker.js';
import { logger } from '../shared/logger.js';

async function main() {
  try {
    const config = loadGitHubConfig();
    if (!config.enabled) {
      console.log('GitHub App configuration is disabled.');
      process.exit(0);
    }

    const broker = new GitHubTokenBroker(config);
    const token = await broker.getInstallationToken();
    const octokit = new Octokit({ auth: token, baseUrl: config.baseUrl });

    const res = await octokit.rest.apps.listReposAccessibleToInstallation();
    console.log(`[Accessible Repositories] Total: ${res.data.repositories.length}`);
    for (const repo of res.data.repositories) {
      console.log(` - ${repo.full_name} (${repo.private ? 'private' : 'public'})`);
    }
  } catch (error) {
    logger.error('Failed to list accessible repositories:', { error: String(error) });
    process.exit(1);
  }
}

main();
