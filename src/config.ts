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
  };

  logger.registerSecret(config.apiKey);
  logger.registerSecret(config.mcpAccessToken);

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
