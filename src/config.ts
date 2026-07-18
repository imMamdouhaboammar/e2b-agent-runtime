import dotenv from 'dotenv';
import { z } from 'zod';
import type { AppConfig } from './types.js';

dotenv.config();

const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes
const MIN_TIMEOUT_MS = 60000; // 1 minute
const MAX_TIMEOUT_MS = 86400000; // 24 hours

const envSchema = z.object({
  E2B_API_KEY: z
    .string({
      required_error: 'E2B_API_KEY environment variable is required.',
    })
    .min(1, 'E2B_API_KEY cannot be empty.'),
  E2B_SANDBOX_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : DEFAULT_TIMEOUT_MS))
    .refine(
      (val) => !Number.isNaN(val) && val >= MIN_TIMEOUT_MS && val <= MAX_TIMEOUT_MS,
      {
        message: `E2B_SANDBOX_TIMEOUT_MS must be a valid integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms.`,
      }
    ),
});

export function loadConfig(
  envOverride?: Record<string, string | undefined>
): AppConfig {
  const envSource = envOverride ?? process.env;
  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => err.message)
      .join(' ');
    throw new Error(`Configuration error: ${formattedErrors}`);
  }

  return {
    apiKey: result.data.E2B_API_KEY,
    sandboxTimeoutMs: result.data.E2B_SANDBOX_TIMEOUT_MS,
  };
}

export function redactSecrets(text: string, secrets: (string | undefined)[]): string {
  let redacted = text;
  for (const secret of secrets) {
    if (secret && secret.trim().length > 0) {
      redacted = redacted.split(secret).join('[REDACTED]');
    }
  }
  return redacted;
}
