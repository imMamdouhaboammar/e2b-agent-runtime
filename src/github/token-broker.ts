import { createAppAuth } from '@octokit/auth-app';
import { GitHubConfig } from './config.js';
import { logger } from '../shared/logger.js';

export interface TokenRequestOptions {
  repository?: string; // e.g. "owner/repo"
  permissions?: Record<string, string>;
}

export interface CachedToken {
  token: string;
  expiresAt: Date;
  repository?: string;
  permissions?: Record<string, string>;
}

export class GitHubTokenBroker {
  private config: GitHubConfig;
  private tokenCache: Map<string, CachedToken> = new Map();
  private pendingRefreshes: Map<string, Promise<CachedToken>> = new Map();

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  public getCacheKey(options?: TokenRequestOptions): string {
    const instId = this.config.installationId;
    const repo = options?.repository?.toLowerCase() ?? 'all';
    const perms = options?.permissions
      ? Object.entries(options.permissions)
          .sort(([k1], [k2]) => k1.localeCompare(k2))
          .map(([k, v]) => `${k}:${v}`)
          .join(',')
      : 'default';
    return `${instId}:${repo}:${perms}`;
  }

  public async getInstallationToken(
    options?: TokenRequestOptions
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('GitHub App publishing is not configured or enabled.');
    }

    const cacheKey = this.getCacheKey(options);
    const existing = this.tokenCache.get(cacheKey);

    const now = new Date();
    const skewMs = (this.config.tokenRefreshSkewSeconds || 300) * 1000;

    if (existing && existing.expiresAt.getTime() - now.getTime() > skewMs) {
      return existing.token;
    }

    // Coalesce concurrent requests for the same token key
    let pending = this.pendingRefreshes.get(cacheKey);
    if (!pending) {
      pending = this.fetchNewToken(options).finally(() => {
        this.pendingRefreshes.delete(cacheKey);
      });
      this.pendingRefreshes.set(cacheKey, pending);
    }

    const cached = await pending;
    this.tokenCache.set(cacheKey, cached);
    return cached.token;
  }

  private async fetchNewToken(options?: TokenRequestOptions): Promise<CachedToken> {
    const auth = createAppAuth({
      appId: this.config.appId,
      privateKey: this.config.privateKey,
      baseUrl: this.config.baseUrl,
    });

    const repoName = options?.repository ? options.repository.split('/')[1] : undefined;

    const requestParams: any = {
      type: 'installation',
      installationId: Number.parseInt(this.config.installationId, 10),
    };

    if (repoName) {
      requestParams.repositoryNames = [repoName];
    }

    if (options?.permissions) {
      requestParams.permissions = options.permissions;
    }

    const authResult = await auth(requestParams);

    if (!authResult || !('token' in authResult)) {
      throw new Error('Failed to obtain installation token from GitHub App auth.');
    }

    const token = authResult.token;
    const expiresAt = authResult.expiresAt
      ? new Date(authResult.expiresAt)
      : new Date(Date.now() + 3600 * 1000);

    // Automatically register secret for redaction
    logger.registerSecret(token);

    return {
      token,
      expiresAt,
      repository: options?.repository,
      permissions: options?.permissions,
    };
  }

  public clearCache(): void {
    this.tokenCache.clear();
    this.pendingRefreshes.clear();
  }

  public dispose(): void {
    this.clearCache();
  }
}
