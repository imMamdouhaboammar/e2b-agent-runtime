import { loadGitHubConfig } from '../github/config.js';
import { GitHubTokenBroker } from '../github/token-broker.js';
import { RepositoryAuthorizationPolicy } from '../github/authorization.js';
import { GitHubClientWrapper } from '../github/client.js';
import { logger } from '../shared/logger.js';

async function main() {
  const repoArg = process.argv[2];
  if (!repoArg) {
    console.log('Usage: pnpm github:verify-repository <owner/repo>');
    process.exit(1);
  }

  try {
    const config = loadGitHubConfig();
    const broker = new GitHubTokenBroker(config);
    const policy = new RepositoryAuthorizationPolicy(config);
    const client = new GitHubClientWrapper(config, broker);

    const authInfo = policy.authorize(repoArg);
    console.log(`[Authorization] Repository "${authInfo.fullName}" is ALLOWED.`);

    if (config.enabled) {
      const details = await client.getRepositoryDetails(authInfo.owner, authInfo.repo);
      console.log(`[GitHub API Verification]`);
      console.log(` - Visibility: ${details.visibility}`);
      console.log(` - Default Branch: ${details.defaultBranch}`);
    }
  } catch (error) {
    logger.error('Repository verification failed:', { error: String(error) });
    process.exit(1);
  }
}

main();
