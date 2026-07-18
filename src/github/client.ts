import { Octokit } from '@octokit/rest';
import { GitHubTokenBroker } from './token-broker.js';
import { RepositoryAuthorizationError } from './authorization.js';
import { GitHubConfig } from './config.js';

export interface RepositoryMetadata {
  owner: string;
  repo: string;
  fullName: string;
  visibility: 'public' | 'private' | 'internal';
  defaultBranch: string;
  description: string | null;
}

export class GitHubClientWrapper {
  private config: GitHubConfig;
  private tokenBroker: GitHubTokenBroker;

  constructor(config: GitHubConfig, tokenBroker: GitHubTokenBroker) {
    this.config = config;
    this.tokenBroker = tokenBroker;
  }

  private async getOctokit(repository?: string): Promise<Octokit> {
    const token = await this.tokenBroker.getInstallationToken({ repository });
    return new Octokit({
      auth: token,
      baseUrl: this.config.baseUrl,
    });
  }

  public async getRepositoryDetails(
    owner: string,
    repo: string
  ): Promise<RepositoryMetadata> {
    const fullName = `${owner}/${repo}`;
    try {
      const octokit = await this.getOctokit(fullName);
      const res = await octokit.rest.repos.get({ owner, repo });
      const data = res.data;

      return {
        owner: data.owner.login.toLowerCase(),
        repo: data.name.toLowerCase(),
        fullName: data.full_name.toLowerCase(),
        visibility: data.private ? 'private' : (data.visibility as any) || 'public',
        defaultBranch: data.default_branch,
        description: data.description,
      };
    } catch (err: any) {
      if (err.status === 404 || err.status === 403) {
        throw new RepositoryAuthorizationError(
          'REPOSITORY_NOT_ACCESSIBLE',
          `Repository "${fullName}" is not accessible by the GitHub App installation (HTTP ${err.status}).`
        );
      }
      throw err;
    }
  }

  public async getBranchHeadSha(
    owner: string,
    repo: string,
    branch: string
  ): Promise<string> {
    const fullName = `${owner}/${repo}`;
    try {
      const octokit = await this.getOctokit(fullName);
      const res = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch,
      });
      return res.data.commit.sha;
    } catch (err: any) {
      if (err.status === 404) {
        throw new RepositoryAuthorizationError(
          'INVALID_REPOSITORY',
          `Branch "${branch}" not found in repository "${fullName}".`
        );
      }
      throw err;
    }
  }
}
