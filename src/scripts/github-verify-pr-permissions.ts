import { loadGitHubConfig } from '../github/config.js';
import { GitHubTokenBroker } from '../github/token-broker.js';
import { Octokit } from '@octokit/rest';

async function main() {
  try {
    const config = loadGitHubConfig();
    if (!config.enabled) {
      console.log('GitHub publishing is not configured or enabled (running in mock mode).');
      return;
    }

    const broker = new GitHubTokenBroker(config);
    const token = await broker.getInstallationToken();
    const octokit = new Octokit({
      auth: token,
      baseUrl: config.baseUrl,
    });

    console.log('[GitHub App Permissions Verification]');
    console.log(` - App ID: ${config.appId}`);
    console.log(` - Installation ID: ${config.installationId}`);
    
    // Fetch installation permissions
    const installation = await octokit.rest.apps.getInstallation({
      installation_id: Number.parseInt(config.installationId, 10),
    });
    console.log('Granted Permissions:');
    console.log(JSON.stringify(installation.data.permissions, null, 2));
  } catch (error: any) {
    console.error('Failed to verify GitHub App permissions:', error.message);
    process.exit(1);
  }
}

main();
