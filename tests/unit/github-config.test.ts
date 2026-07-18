import { describe, expect, it } from 'vitest';
import { loadGitHubConfig, parsePrivateKey } from '../../src/github/config.js';

describe('GitHub Configuration Unit Tests', () => {
  it('should load default disabled configuration when no GitHub App settings provided', () => {
    const config = loadGitHubConfig({});
    expect(config.enabled).toBe(false);
    expect(config.defaultBranchPrefix).toBe('agent/');
    expect(config.baseUrl).toBe('https://api.github.com');
  });

  it('should parse valid GitHub App configuration', () => {
    const config = loadGitHubConfig({
      GITHUB_APP_ID: '123456',
      GITHUB_APP_INSTALLATION_ID: '789012',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIEvg...\n-----END PRIVATE KEY-----',
      GITHUB_ALLOWED_REPOSITORIES: 'owner/repo1, owner/repo2',
      GITHUB_ALLOWED_OWNERS: 'owner1, owner2',
    });

    expect(config.enabled).toBe(true);
    expect(config.appId).toBe('123456');
    expect(config.installationId).toBe('789012');
    expect(config.allowedRepositories).toEqual(['owner/repo1', 'owner/repo2']);
    expect(config.allowedOwners).toEqual(['owner1', 'owner2']);
  });

  it('should parse Base64 encoded private key correctly', () => {
    const keyPEM = '-----BEGIN PRIVATE KEY-----\ntest_key\n-----END PRIVATE KEY-----';
    const b64 = Buffer.from(keyPEM).toString('base64');

    const parsed = parsePrivateKey(undefined, b64);
    expect(parsed).toBe(keyPEM);
  });

  it('should fail validation when GITHUB_APP_ID is missing but private key provided', () => {
    expect(() =>
      loadGitHubConfig({
        GITHUB_APP_INSTALLATION_ID: '789012',
        GITHUB_APP_PRIVATE_KEY: 'somekey',
      })
    ).toThrow(/GITHUB_APP_ID is required/);
  });

  it('should fail validation when GITHUB_APP_INSTALLATION_ID is missing', () => {
    expect(() =>
      loadGitHubConfig({
        GITHUB_APP_ID: '123456',
        GITHUB_APP_PRIVATE_KEY: 'somekey',
      })
    ).toThrow(/GITHUB_APP_INSTALLATION_ID is required/);
  });
});
