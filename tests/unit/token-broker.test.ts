import { describe, expect, it, vi } from 'vitest';
import { GitHubTokenBroker } from '../../src/github/token-broker.js';
import { loadGitHubConfig } from '../../src/github/config.js';

describe('GitHubTokenBroker Unit Tests', () => {
  it('should generate cache keys correctly based on repository and permissions', () => {
    const config = loadGitHubConfig({
      GITHUB_APP_ID: '100',
      GITHUB_APP_INSTALLATION_ID: '200',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
    });
    const broker = new GitHubTokenBroker(config);

    const key1 = broker.getCacheKey({ repository: 'owner/repo' });
    const key2 = broker.getCacheKey({ repository: 'owner/repo' });
    const key3 = broker.getCacheKey({ repository: 'other/repo' });

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('should clear cache on dispose', () => {
    const config = loadGitHubConfig({
      GITHUB_APP_ID: '100',
      GITHUB_APP_INSTALLATION_ID: '200',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
    });
    const broker = new GitHubTokenBroker(config);

    broker.dispose();
    expect(() => broker.dispose()).not.toThrow();
  });
});
