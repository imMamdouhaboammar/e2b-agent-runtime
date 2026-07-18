import { ControllerError } from '../../shared/errors.js';

export type SandboxErrorCode =
  | 'SANDBOX_PROVIDER_UNAVAILABLE'
  | 'SANDBOX_CAPABILITY_UNSUPPORTED'
  | 'SANDBOX_PROVIDER_VERSION_INCOMPATIBLE'
  | 'SANDBOX_SESSION_RESTORE_FAILED'
  | 'SANDBOX_PROVIDER_FALLBACK_FAILED';

export class SandboxError extends ControllerError {
  constructor(
    code: SandboxErrorCode,
    message: string,
    statusCode = 500,
    details?: unknown
  ) {
    // Redact credentials/secrets from error message before calling super
    const sanitizedMessage = sanitizeErrorString(message);
    super(code, sanitizedMessage, statusCode, details);
    this.name = 'SandboxError';
  }
}

/**
 * Sanitizes potentially sensitive details (like API keys, bearer tokens) from error strings
 */
export function sanitizeErrorString(message: string): string {
  if (!message) return '';
  // Redact E2B API keys, OAuth tokens, authorization headers patterns
  let sanitized = message;
  sanitized = sanitized.replace(/eaac_[a-zA-Z0-9]+/g, '[REDACTED_E2B_KEY]');
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9\-._~/+]+/gi, 'Bearer [REDACTED_TOKEN]');
  sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{36,255}/g, '[REDACTED_GITHUB_TOKEN]');
  return sanitized;
}
