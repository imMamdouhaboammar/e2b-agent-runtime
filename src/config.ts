import dotenv from 'dotenv';
import { z } from 'zod';
import { redactSecrets } from './security/redact.js';
import { logger } from './shared/logger.js';

export { redactSecrets };

dotenv.config();

export interface ControllerConfig {
  apiKey: string;
  mcpAccessToken: string;
  controllerPort: number;
  workerDefaultTimeoutMs: number;
  workerMaxTimeoutMs: number;
  maxActiveWorkers: number;
  commandDefaultTimeoutMs: number;
  commandMaxTimeoutMs: number;
  commandOutputLimitBytes: number;
  sessionRegistryPath: string;
  logLevel: string;
  workerTemplate: string;
  maxTerminalsPerWorkspace: number;
  ptyBufferMaxBytes: number;
  ptyReadDefaultBytes: number;
  ptyReadMaxBytes: number;
  ptyInputMaxBytes: number;
  terminalDefaultCols: number;
  terminalDefaultRows: number;
  terminalMinCols: number;
  terminalMaxCols: number;
  terminalMinRows: number;
  terminalMaxRows: number;
  terminalIdleTimeoutMs: number;
  workspaceIdleTimeoutMs: number;
  workspaceMaxLifetimeMs: number;
  databaseUrl?: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  supabaseJwksUrl: string;
  supabaseOAuthIssuer: string;
  authSiteUrl?: string;
  authAllowPublicSignup: boolean;
  authRequireEmailConfirmation: boolean;
  authLoginMagicLinkEnabled: boolean;
  authSignupMagicLinkEnabled: boolean;
  authPasswordResetEnabled: boolean;
  mcpAuthMode: 'jwt' | 'legacy';
  mcpLegacyBearerEnabled: boolean;
}

const controllerConfigSchema = z.object({
  E2B_API_KEY: z
    .string({
      required_error: 'E2B_API_KEY environment variable is required.',
    })
    .min(1, 'E2B_API_KEY cannot be empty.'),
  MCP_ACCESS_TOKEN: z
    .string({
      required_error: 'MCP_ACCESS_TOKEN environment variable is required.',
    })
    .min(1, 'MCP_ACCESS_TOKEN cannot be empty.'),
  CONTROLLER_PORT: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 3000))
    .refine((val) => !Number.isNaN(val) && val > 0 && val < 65536, {
      message: 'CONTROLLER_PORT must be a valid port number (1-65535).',
    }),
  WORKER_DEFAULT_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 600000))
    .refine((val) => !Number.isNaN(val) && val >= 60000 && val <= 86400000, {
      message: 'E2B_SANDBOX_TIMEOUT_MS must be a valid integer between 60000 and 86400000 ms.',
    }),
  WORKER_MAX_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 3600000))
    .refine((val) => !Number.isNaN(val) && val >= 60000 && val <= 86400000, {
      message: 'WORKER_MAX_TIMEOUT_MS must be between 60,000 and 86,400,000 ms.',
    }),
  MAX_ACTIVE_WORKERS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 3))
    .refine((val) => !Number.isNaN(val) && val >= 1 && val <= 50, {
      message: 'MAX_ACTIVE_WORKERS must be an integer between 1 and 50.',
    }),
  COMMAND_DEFAULT_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 60000))
    .refine((val) => !Number.isNaN(val) && val >= 1000 && val <= 600000, {
      message: 'COMMAND_DEFAULT_TIMEOUT_MS must be between 1,000 and 600,000 ms.',
    }),
  COMMAND_MAX_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 300000))
    .refine((val) => !Number.isNaN(val) && val >= 1000 && val <= 600000, {
      message: 'COMMAND_MAX_TIMEOUT_MS must be between 1,000 and 600,000 ms.',
    }),
  COMMAND_OUTPUT_LIMIT_BYTES: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 131072))
    .refine((val) => !Number.isNaN(val) && val >= 1024 && val <= 10485760, {
      message: 'COMMAND_OUTPUT_LIMIT_BYTES must be between 1 KB and 10 MB.',
    }),
  SESSION_REGISTRY_PATH: z
    .string()
    .optional()
    .transform((val) => val || '.data/sessions.json'),
  LOG_LEVEL: z
    .string()
    .optional()
    .transform((val) => val || 'info'),
  E2B_WORKER_TEMPLATE: z
    .string()
    .optional()
    .transform((val) => val || 'agent-coding-runtime-core:stable'),
  DATABASE_URL: z
    .string()
    .optional(),
  MAX_TERMINALS_PER_WORKSPACE: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 3))
    .refine((val) => !Number.isNaN(val) && val >= 1 && val <= 10, {
      message: 'MAX_TERMINALS_PER_WORKSPACE must be between 1 and 10.',
    }),
  PTY_BUFFER_MAX_BYTES: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1048576))
    .refine((val) => !Number.isNaN(val) && val >= 65536 && val <= 10485760, {
      message: 'PTY_BUFFER_MAX_BYTES must be between 64 KB and 10 MB.',
    }),
  PTY_READ_DEFAULT_BYTES: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 65536))
    .refine((val) => !Number.isNaN(val) && val >= 1024 && val <= 1048576, {
      message: 'PTY_READ_DEFAULT_BYTES must be between 1 KB and 1 MB.',
    }),
  PTY_READ_MAX_BYTES: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 262144))
    .refine((val) => !Number.isNaN(val) && val >= 1024 && val <= 1048576, {
      message: 'PTY_READ_MAX_BYTES must be between 1 KB and 1 MB.',
    }),
  PTY_INPUT_MAX_BYTES: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 65536))
    .refine((val) => !Number.isNaN(val) && val >= 128 && val <= 1048576, {
      message: 'PTY_INPUT_MAX_BYTES must be between 128 bytes and 1 MB.',
    }),
  TERMINAL_DEFAULT_COLS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 120))
    .refine((val) => !Number.isNaN(val) && val >= 20 && val <= 300, {
      message: 'TERMINAL_DEFAULT_COLS must be between 20 and 300.',
    }),
  TERMINAL_DEFAULT_ROWS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 40))
    .refine((val) => !Number.isNaN(val) && val >= 5 && val <= 120, {
      message: 'TERMINAL_DEFAULT_ROWS must be between 5 and 120.',
    }),
  TERMINAL_MIN_COLS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 20)),
  TERMINAL_MAX_COLS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 300)),
  TERMINAL_MIN_ROWS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 5)),
  TERMINAL_MAX_ROWS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 120)),
  TERMINAL_IDLE_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1800000)),
  WORKSPACE_IDLE_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 3600000)),
  WORKSPACE_MAX_LIFETIME_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 3600000)),
  SUPABASE_URL: z
    .string({
      required_error: 'SUPABASE_URL environment variable is required.',
    })
    .url('SUPABASE_URL must be a valid URL.'),
  SUPABASE_PUBLISHABLE_KEY: z
    .string({
      required_error: 'SUPABASE_PUBLISHABLE_KEY environment variable is required.',
    })
    .min(1, 'SUPABASE_PUBLISHABLE_KEY cannot be empty.'),
  SUPABASE_SECRET_KEY: z
    .string({
      required_error: 'SUPABASE_SECRET_KEY environment variable is required.',
    })
    .min(1, 'SUPABASE_SECRET_KEY cannot be empty.'),
  SUPABASE_JWKS_URL: z
    .string()
    .optional()
    .transform((val) => val || ''),
  SUPABASE_OAUTH_ISSUER: z
    .string()
    .optional()
    .transform((val) => val || ''),
  AUTH_SITE_URL: z
    .string()
    .optional()
    .transform((val) => val || ''),
  AUTH_ALLOW_PUBLIC_SIGNUP: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'),
  AUTH_REQUIRE_EMAIL_CONFIRMATION: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'),
  AUTH_LOGIN_MAGIC_LINK_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'),
  AUTH_SIGNUP_MAGIC_LINK_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'),
  AUTH_PASSWORD_RESET_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'),
  MCP_AUTH_MODE: z
    .enum(['jwt', 'legacy'])
    .optional()
    .default('jwt'),
  MCP_LEGACY_BEARER_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val.toLowerCase() === 'true'),
});

export function loadControllerConfig(
  envOverride?: Record<string, string | undefined>
): ControllerConfig {
  const envSource = envOverride ?? process.env;
  const result = controllerConfigSchema.safeParse(envSource);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => err.message)
      .join(' ');
    throw new Error(`Configuration error: ${formattedErrors}`);
  }

  const config: ControllerConfig = {
    apiKey: result.data.E2B_API_KEY,
    mcpAccessToken: result.data.MCP_ACCESS_TOKEN,
    controllerPort: result.data.CONTROLLER_PORT,
    workerDefaultTimeoutMs: result.data.WORKER_DEFAULT_TIMEOUT_MS,
    workerMaxTimeoutMs: result.data.WORKER_MAX_TIMEOUT_MS,
    maxActiveWorkers: result.data.MAX_ACTIVE_WORKERS,
    commandDefaultTimeoutMs: result.data.COMMAND_DEFAULT_TIMEOUT_MS,
    commandMaxTimeoutMs: result.data.COMMAND_MAX_TIMEOUT_MS,
    commandOutputLimitBytes: result.data.COMMAND_OUTPUT_LIMIT_BYTES,
    sessionRegistryPath: result.data.SESSION_REGISTRY_PATH,
    logLevel: result.data.LOG_LEVEL,
    workerTemplate: result.data.E2B_WORKER_TEMPLATE,
    maxTerminalsPerWorkspace: result.data.MAX_TERMINALS_PER_WORKSPACE,
    ptyBufferMaxBytes: result.data.PTY_BUFFER_MAX_BYTES,
    ptyReadDefaultBytes: result.data.PTY_READ_DEFAULT_BYTES,
    ptyReadMaxBytes: result.data.PTY_READ_MAX_BYTES,
    ptyInputMaxBytes: result.data.PTY_INPUT_MAX_BYTES,
    terminalDefaultCols: result.data.TERMINAL_DEFAULT_COLS,
    terminalDefaultRows: result.data.TERMINAL_DEFAULT_ROWS,
    terminalMinCols: result.data.TERMINAL_MIN_COLS,
    terminalMaxCols: result.data.TERMINAL_MAX_COLS,
    terminalMinRows: result.data.TERMINAL_MIN_ROWS,
    terminalMaxRows: result.data.TERMINAL_MAX_ROWS,
    terminalIdleTimeoutMs: result.data.TERMINAL_IDLE_TIMEOUT_MS,
    workspaceIdleTimeoutMs: result.data.WORKSPACE_IDLE_TIMEOUT_MS,
    workspaceMaxLifetimeMs: result.data.WORKSPACE_MAX_LIFETIME_MS,
    databaseUrl: result.data.DATABASE_URL,
    supabaseUrl: result.data.SUPABASE_URL,
    supabasePublishableKey: result.data.SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: result.data.SUPABASE_SECRET_KEY,
    supabaseJwksUrl: result.data.SUPABASE_JWKS_URL || `${result.data.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
    supabaseOAuthIssuer: result.data.SUPABASE_OAUTH_ISSUER || `${result.data.SUPABASE_URL}/auth/v1`,
    authSiteUrl: result.data.AUTH_SITE_URL || undefined,
    authAllowPublicSignup: result.data.AUTH_ALLOW_PUBLIC_SIGNUP,
    authRequireEmailConfirmation: result.data.AUTH_REQUIRE_EMAIL_CONFIRMATION,
    authLoginMagicLinkEnabled: result.data.AUTH_LOGIN_MAGIC_LINK_ENABLED,
    authSignupMagicLinkEnabled: result.data.AUTH_SIGNUP_MAGIC_LINK_ENABLED,
    authPasswordResetEnabled: result.data.AUTH_PASSWORD_RESET_ENABLED,
    mcpAuthMode: result.data.MCP_AUTH_MODE,
    mcpLegacyBearerEnabled: result.data.MCP_LEGACY_BEARER_ENABLED,
  };

  logger.registerSecret(config.apiKey);
  logger.registerSecret(config.mcpAccessToken);
  logger.registerSecret(config.supabaseSecretKey);
  if (config.databaseUrl) {
    logger.registerSecret(config.databaseUrl);
  }

  return config;
}

// Phase 1 loadConfig function compatibility
export function loadConfig(
  envOverride?: Record<string, string | undefined>
) {
  const envWithFallback: Record<string, string | undefined> = {
    MCP_ACCESS_TOKEN: 'phase1_fallback_mcp_access_token',
    ...(envOverride || {}),
  };

  if (envOverride?.E2B_SANDBOX_TIMEOUT_MS && !envWithFallback.WORKER_DEFAULT_TIMEOUT_MS) {
    envWithFallback.WORKER_DEFAULT_TIMEOUT_MS = envOverride.E2B_SANDBOX_TIMEOUT_MS;
  }

  const controllerConf = loadControllerConfig(envWithFallback);
  return {
    apiKey: controllerConf.apiKey,
    sandboxTimeoutMs: controllerConf.workerDefaultTimeoutMs,
  };
}

export function loadWorkflowLimitsConfig(
  envOverride?: Record<string, string | undefined>
) {
  const env = envOverride ?? process.env;
  return {
    MAX_PLAN_STEPS: Number.parseInt(env.MAX_PLAN_STEPS || '20', 10),
    MAX_REPAIR_CYCLES: Number.parseInt(env.MAX_REPAIR_CYCLES || '3', 10),
    MAX_REPAIR_ATTEMPTS_PER_CYCLE: Number.parseInt(env.MAX_REPAIR_ATTEMPTS_PER_CYCLE || '2', 10),
    MAX_TOTAL_COMMANDS_PER_TASK: Number.parseInt(env.MAX_TOTAL_COMMANDS_PER_TASK || '100', 10),
    MAX_CHECKPOINTS_PER_TASK: Number.parseInt(env.MAX_CHECKPOINTS_PER_TASK || '20', 10),
    MAX_CHANGED_FILES_WARNING: Number.parseInt(env.MAX_CHANGED_FILES_WARNING || '50', 10),
    MAX_DIFF_BYTES: Number.parseInt(env.MAX_DIFF_BYTES || '524288', 10),
    MAX_EVIDENCE_ITEMS: Number.parseInt(env.MAX_EVIDENCE_ITEMS || '250', 10),
    REPOSITORY_SEARCH_MAX_RESULTS: Number.parseInt(env.REPOSITORY_SEARCH_MAX_RESULTS || '100', 10),
    REPOSITORY_SEARCH_MAX_BYTES: Number.parseInt(env.REPOSITORY_SEARCH_MAX_BYTES || '262144', 10),
    REPOSITORY_INTELLIGENCE_MAX_BYTES: Number.parseInt(env.REPOSITORY_INTELLIGENCE_MAX_BYTES || '524288', 10),
    FAILURE_SIGNATURE_REPEAT_WARNING: Number.parseInt(env.FAILURE_SIGNATURE_REPEAT_WARNING || '2', 10),
    FAILURE_SIGNATURE_REPEAT_BLOCK: Number.parseInt(env.FAILURE_SIGNATURE_REPEAT_BLOCK || '4', 10),
    CHECKPOINT_MAX_BYTES: Number.parseInt(env.CHECKPOINT_MAX_BYTES || '131072', 10),
    TASK_SUMMARY_MAX_BYTES: Number.parseInt(env.TASK_SUMMARY_MAX_BYTES || '65536', 10),
  };
}

export interface BrowserConfig {
  engine: string;
  maxSessionsPerWorkspace: number;
  maxPagesPerSession: number;
  defaultTimeoutMs: number;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  sessionIdleTimeoutMs: number;
  consoleBufferMaxItems: number;
  networkBufferMaxItems: number;
  pageErrorBufferMaxItems: number;
  snapshotMaxBytes: number;
  screenshotMaxBytes: number;
  traceMaxBytes: number;
  artifactTotalMaxBytes: number;
  allowedSchemes: string[];
  allowExternalNavigation: boolean;
  allowFileUrls: boolean;
  allowDataUrls: boolean;
  allowJavascriptUrls: boolean;
  captureConsole: boolean;
  captureNetworkFailures: boolean;
  capturePageErrors: boolean;
  headless: boolean;
  artifactRetentionMs: number;
  downloadUrlTtlMs: number;
  maxScreenshotsPerCycle: number;
  maxTracesPerTask: number;
  maxArtifactsPerTask: number;
}

export function loadBrowserConfig(
  envOverride?: Record<string, string | undefined>
): BrowserConfig {
  const env = envOverride ?? process.env;
  
  const parseBool = (val: string | undefined, defaultVal: boolean): boolean => {
    if (val === undefined || val === '') return defaultVal;
    if (val.toLowerCase() === 'true' || val === '1') return true;
    if (val.toLowerCase() === 'false' || val === '0') return false;
    throw new Error(`Invalid boolean config value: ${val}`);
  };

  const parseNum = (val: string | undefined, defaultVal: number, min?: number, max?: number): number => {
    if (val === undefined || val === '') return defaultVal;
    const n = Number.parseInt(val, 10);
    if (Number.isNaN(n)) throw new Error(`Invalid integer config value: ${val}`);
    if (min !== undefined && n < min) throw new Error(`Config value ${n} below minimum ${min}`);
    if (max !== undefined && n > max) throw new Error(`Config value ${n} above maximum ${max}`);
    return n;
  };

  const engine = (env.BROWSER_ENGINE || 'chromium').toLowerCase();
  if (engine !== 'chromium') {
    throw new Error(`Unsupported browser engine: "${engine}". Only "chromium" is supported in Phase 6.`);
  }

  const allowedSchemes = (env.BROWSER_ALLOWED_SCHEMES || 'http,https')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    engine,
    maxSessionsPerWorkspace: parseNum(env.MAX_BROWSER_SESSIONS_PER_WORKSPACE, 2, 1, 10),
    maxPagesPerSession: parseNum(env.MAX_PAGES_PER_BROWSER_SESSION, 5, 1, 20),
    defaultTimeoutMs: parseNum(env.BROWSER_DEFAULT_TIMEOUT_MS, 30000, 1000, 300000),
    navigationTimeoutMs: parseNum(env.BROWSER_NAVIGATION_TIMEOUT_MS, 60000, 1000, 300000),
    actionTimeoutMs: parseNum(env.BROWSER_ACTION_TIMEOUT_MS, 30000, 1000, 300000),
    sessionIdleTimeoutMs: parseNum(env.BROWSER_SESSION_IDLE_TIMEOUT_MS, 1800000, 60000, 86400000),
    consoleBufferMaxItems: parseNum(env.BROWSER_CONSOLE_BUFFER_MAX_ITEMS, 1000, 10, 10000),
    networkBufferMaxItems: parseNum(env.BROWSER_NETWORK_BUFFER_MAX_ITEMS, 2000, 10, 10000),
    pageErrorBufferMaxItems: parseNum(env.BROWSER_PAGE_ERROR_BUFFER_MAX_ITEMS, 250, 5, 1000),
    snapshotMaxBytes: parseNum(env.BROWSER_SNAPSHOT_MAX_BYTES, 262144, 1024, 5242880),
    screenshotMaxBytes: parseNum(env.BROWSER_SCREENSHOT_MAX_BYTES, 5242880, 1024, 20971520),
    traceMaxBytes: parseNum(env.BROWSER_TRACE_MAX_BYTES, 52428800, 1024, 209715200),
    artifactTotalMaxBytes: parseNum(env.BROWSER_ARTIFACT_TOTAL_MAX_BYTES, 104857600, 1048576, 1073741824),
    allowedSchemes,
    allowExternalNavigation: parseBool(env.BROWSER_ALLOW_EXTERNAL_NAVIGATION, false),
    allowFileUrls: parseBool(env.BROWSER_ALLOW_FILE_URLS, false),
    allowDataUrls: parseBool(env.BROWSER_ALLOW_DATA_URLS, false),
    allowJavascriptUrls: parseBool(env.BROWSER_ALLOW_JAVASCRIPT_URLS, false),
    captureConsole: parseBool(env.BROWSER_CAPTURE_CONSOLE, true),
    captureNetworkFailures: parseBool(env.BROWSER_CAPTURE_NETWORK_FAILURES, true),
    capturePageErrors: parseBool(env.BROWSER_CAPTURE_PAGE_ERRORS, true),
    headless: parseBool(env.BROWSER_HEADLESS, true),
    artifactRetentionMs: parseNum(env.BROWSER_ARTIFACT_RETENTION_MS, 86400000, 60000, 604800000),
    downloadUrlTtlMs: parseNum(env.BROWSER_ARTIFACT_DOWNLOAD_URL_TTL_MS, 600000, 10000, 3600000),
    maxScreenshotsPerCycle: parseNum(env.BROWSER_MAX_SCREENSHOTS_PER_CYCLE, 20, 1, 100),
    maxTracesPerTask: parseNum(env.BROWSER_MAX_TRACES_PER_TASK, 5, 1, 50),
    maxArtifactsPerTask: parseNum(env.BROWSER_MAX_ARTIFACTS_PER_TASK, 100, 1, 1000),
  };
}


