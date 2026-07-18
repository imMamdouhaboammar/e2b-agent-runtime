import { GitHubConfig } from './config.js';

export interface AuthorizedRepositoryInfo {
  owner: string;
  repo: string;
  fullName: string; // "owner/repo"
  cloneUrl: string; // "https://github.com/owner/repo.git"
}

export class RepositoryAuthorizationError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RepositoryAuthorizationError';
    this.code = code;
  }
}

/**
 * Validates and normalizes a GitHub repository identifier (e.g., "owner/repo").
 * Rejects arbitrary URLs, SSH injection strings, credentials, query parameters, local paths, etc.
 */
export function validateRepositoryIdentifier(repositoryStr: string): {
  owner: string;
  repo: string;
  fullName: string;
} {
  if (!repositoryStr || typeof repositoryStr !== 'string') {
    throw new RepositoryAuthorizationError(
      'INVALID_REPOSITORY',
      'Repository identifier must be a non-empty string in "owner/repo" format.'
    );
  }

  const trimmed = repositoryStr.trim();

  // Reject URLs, SSH strings, fragments, query strings, credentials, local paths
  if (
    trimmed.includes('://') ||
    trimmed.startsWith('git@') ||
    trimmed.includes('?') ||
    trimmed.includes('#') ||
    trimmed.includes('@') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    trimmed.includes('..')
  ) {
    throw new RepositoryAuthorizationError(
      'INVALID_REPOSITORY',
      `Invalid repository format: "${repositoryStr}". Must be plain "owner/repo" format.`
    );
  }

  const parts = trimmed.split('/');
  if (parts.length !== 2) {
    throw new RepositoryAuthorizationError(
      'INVALID_REPOSITORY',
      `Repository must be in "owner/repo" format. Got: "${repositoryStr}".`
    );
  }

  const [rawOwner, rawRepo] = parts;
  const owner = rawOwner.trim().toLowerCase();
  const repo = rawRepo.trim().toLowerCase().replace(/\.git$/, '');

  // GitHub owner and repo naming rules validation regex
  const validSegmentRegex = /^[a-z0-9_.-]+$/;

  if (!owner || !repo || !validSegmentRegex.test(owner) || !validSegmentRegex.test(repo)) {
    throw new RepositoryAuthorizationError(
      'INVALID_REPOSITORY',
      `Repository segments contain invalid characters: owner="${rawOwner}", repo="${rawRepo}".`
    );
  }

  if (owner.startsWith('-') || repo.startsWith('-')) {
    throw new RepositoryAuthorizationError(
      'INVALID_REPOSITORY',
      `Repository owner or name cannot begin with a dash.`
    );
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
  };
}

export class RepositoryAuthorizationPolicy {
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  public authorize(repositoryStr: string): AuthorizedRepositoryInfo {
    const { owner, repo, fullName } = validateRepositoryIdentifier(repositoryStr);

    // If explicit repo allowlist is set, check it first
    const hasRepoAllowlist = this.config.allowedRepositories.length > 0;
    const hasOwnerAllowlist = this.config.allowedOwners.length > 0;

    let isAllowed = false;

    if (hasRepoAllowlist && this.config.allowedRepositories.includes(fullName)) {
      isAllowed = true;
    } else if (hasOwnerAllowlist && this.config.allowedOwners.includes(owner)) {
      isAllowed = true;
    } else if (!hasRepoAllowlist && !hasOwnerAllowlist) {
      // Default allow if no restrictive allowlists are set AND GitHub App configuration is present,
      // but only if GitHub App installation has access (which is verified via Octokit client)
      isAllowed = true;
    }

    if (!isAllowed) {
      throw new RepositoryAuthorizationError(
        'REPOSITORY_NOT_ALLOWED',
        `Repository "${fullName}" is not in the configured authorization allowlist.`
      );
    }

    const cloneUrl = `${this.config.baseUrl.replace(/\/api\/v3\/?$/, '').replace(/\/+$/, '')}/${owner}/${repo}.git`;

    return {
      owner,
      repo,
      fullName,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }
}
