import { loadGitHubConfig } from '../github/config.js';
import { GitHubTokenBroker } from '../github/token-broker.js';
import { logger } from '../shared/logger.js';

async function main() {
  try {
    const config = loadGitHubConfig();
    if (!config.enabled) {
      console.log('GitHub App configuration is disabled or incomplete.');
      process.exit(0);
    }

    const broker = new GitHubTokenBroker(config);
    const token = await broker.getInstallationToken();

    console.log(`[GitHub App Verification] Success!`);
    console.log(`App ID: ${config.appId}`);
    console.log(`Installation ID: ${config.installationId}`);
    console.log(`Installation token successfully acquired (Length: ${token.length} chars, Redacted).`);
  } catch (error) {
    logger.error('GitHub App verification failed:', { error: String(error) });
    process.exit(1);
  }
}

main();
