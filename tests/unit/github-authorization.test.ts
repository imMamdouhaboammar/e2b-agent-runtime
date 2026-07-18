import { describe, expect, it } from 'vitest';
import {
  RepositoryAuthorizationError,
  RepositoryAuthorizationPolicy,
  validateRepositoryIdentifier,
} from '../../src/github/authorization.js';
import { loadGitHubConfig } from '../../src/github/config.js';

describe('Repository Authorization Policy Unit Tests', () => {
  it('should validate valid owner/repo strings', () => {
    const valid = validateRepositoryIdentifier('immamdouhaboammar/e2b-agent-runtime');
    expect(valid.owner).toBe('immamdouhaboammar');
    expect(valid.repo).toBe('e2b-agent-runtime');
    expect(valid.fullName).toBe('immamdouhaboammar/e2b-agent-runtime');
  });

  it('should reject malformed repository strings, URLs, and SSH injections', () => {
    try {
      validateRepositoryIdentifier('https://github.com/owner/repo');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RepositoryAuthorizationError);
      expect(err.code).toBe('INVALID_REPOSITORY');
    }
  });

  it('should enforce explicit repository allowlist', () => {
    const config = loadGitHubConfig({
      GITHUB_ALLOWED_REPOSITORIES: 'owner/allowed-repo',
    });
    const policy = new RepositoryAuthorizationPolicy(config);

    const allowed = policy.authorize('owner/allowed-repo');
    expect(allowed.fullName).toBe('owner/allowed-repo');

    try {
      policy.authorize('owner/other-repo');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RepositoryAuthorizationError);
      expect(err.code).toBe('REPOSITORY_NOT_ALLOWED');
    }
  });

  it('should enforce explicit owner allowlist', () => {
    const config = loadGitHubConfig({
      GITHUB_ALLOWED_OWNERS: 'allowed-owner',
    });
    const policy = new RepositoryAuthorizationPolicy(config);

    const allowed = policy.authorize('allowed-owner/any-repo');
    expect(allowed.fullName).toBe('allowed-owner/any-repo');

    try {
      policy.authorize('blocked-owner/any-repo');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RepositoryAuthorizationError);
      expect(err.code).toBe('REPOSITORY_NOT_ALLOWED');
    }
  });
});
