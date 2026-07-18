import { z } from 'zod';
import { logger } from '../shared/logger.js';

export interface GitHubConfig {
  enabled: boolean;
  appId: string;
  installationId: string;
  privateKey: string;
  allowedRepositories: string[];
  allowedOwners: string[];
  defaultBranchPrefix: string;
  tokenRefreshSkewSeconds: number;
  baseUrl: string;
}

const githubConfigSchema = z
  .object({
    GITHUB_APP_ID: z.string().optional(),
    GITHUB_APP_INSTALLATION_ID: z.string().optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().optional(),
    GITHUB_APP_PRIVATE_KEY_BASE64: z.string().optional(),
    GITHUB_ALLOWED_REPOSITORIES: z.string().optional(),
    GITHUB_ALLOWED_OWNERS: z.string().optional(),
    GITHUB_DEFAULT_BRANCH_PREFIX: z.string().optional().default('agent/'),
    GITHUB_TOKEN_REFRESH_SKEW_SECONDS: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : 300)),
    GITHUB_API_BASE_URL: z.string().optional().default('https://api.github.com'),
  })
  .superRefine((data, ctx) => {
    const hasAnyAppSetting =
      Boolean(data.GITHUB_APP_ID) ||
      Boolean(data.GITHUB_APP_INSTALLATION_ID) ||
      Boolean(data.GITHUB_APP_PRIVATE_KEY) ||
      Boolean(data.GITHUB_APP_PRIVATE_KEY_BASE64);

    if (hasAnyAppSetting) {
      if (!data.GITHUB_APP_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'GITHUB_APP_ID is required when GitHub publishing is enabled.',
          path: ['GITHUB_APP_ID'],
        });
      }
      if (!data.GITHUB_APP_INSTALLATION_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'GITHUB_APP_INSTALLATION_ID is required when GitHub publishing is enabled.',
          path: ['GITHUB_APP_INSTALLATION_ID'],
        });
      }
      if (!data.GITHUB_APP_PRIVATE_KEY && !data.GITHUB_APP_PRIVATE_KEY_BASE64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Either GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_BASE64 must be provided when GitHub publishing is enabled.',
          path: ['GITHUB_APP_PRIVATE_KEY'],
        });
      }
    }
  });

export function parsePrivateKey(rawKey?: string, base64Key?: string): string {
  if (rawKey && rawKey.trim().length > 0) {
    let key = rawKey.trim();
    if (key.includes('\\n')) {
      key = key.replace(/\\n/g, '\n');
    }
    return key;
  }
  if (base64Key && base64Key.trim().length > 0) {
    const decoded = Buffer.from(base64Key.trim(), 'base64').toString('utf8').trim();
    if (decoded.includes('\\n')) {
      return decoded.replace(/\\n/g, '\n');
    }
    return decoded;
  }
  return '';
}

export function loadGitHubConfig(
  envOverride?: Record<string, string | undefined>
): GitHubConfig {
  const envSource = envOverride ?? process.env;
  const result = githubConfigSchema.safeParse(envSource);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => err.message)
      .join(' ');
    throw new Error(`GitHub Configuration error: ${formattedErrors}`);
  }

  const data = result.data;
  const hasAppConfig = Boolean(
    data.GITHUB_APP_ID ||
      data.GITHUB_APP_INSTALLATION_ID ||
      data.GITHUB_APP_PRIVATE_KEY ||
      data.GITHUB_APP_PRIVATE_KEY_BASE64
  );

  const privateKey = parsePrivateKey(
    data.GITHUB_APP_PRIVATE_KEY,
    data.GITHUB_APP_PRIVATE_KEY_BASE64
  );

  if (privateKey) {
    logger.registerSecret(privateKey);
  }

  const allowedRepositories = data.GITHUB_ALLOWED_REPOSITORIES
    ? data.GITHUB_ALLOWED_REPOSITORIES.split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const allowedOwners = data.GITHUB_ALLOWED_OWNERS
    ? data.GITHUB_ALLOWED_OWNERS.split(',')
        .map((o) => o.trim().toLowerCase())
        .filter(Boolean)
    : [];

  return {
    enabled: hasAppConfig,
    appId: data.GITHUB_APP_ID ?? '',
    installationId: data.GITHUB_APP_INSTALLATION_ID ?? '',
    privateKey,
    allowedRepositories,
    allowedOwners,
    defaultBranchPrefix: data.GITHUB_DEFAULT_BRANCH_PREFIX ?? 'agent/',
    tokenRefreshSkewSeconds: data.GITHUB_TOKEN_REFRESH_SKEW_SECONDS,
    baseUrl: data.GITHUB_API_BASE_URL ?? 'https://api.github.com',
  };
}
