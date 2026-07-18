import { SandboxError, SandboxErrorCode, sanitizeErrorString } from './contracts/sandboxErrors.js';
import { logger } from '../shared/logger.js';

export function createSandboxError(
  code: SandboxErrorCode,
  message: string,
  statusCode = 500,
  details?: unknown
): SandboxError {
  const sanitized = sanitizeErrorString(message);
  
  // Log sanitized error
  logger.error(`[SandboxError] Code: ${code}, Message: ${sanitized}`, {
    code,
    statusCode,
    details: details ? redactDetails(details) : undefined,
  });

  return new SandboxError(code, sanitized, statusCode, details);
}

/**
 * Recursively redacts sensitive info from error details/objects
 */
function redactDetails(details: any): any {
  if (!details) return details;
  if (typeof details !== 'object') {
    if (typeof details === 'string') {
      return sanitizeErrorString(details);
    }
    return details;
  }

  if (Array.isArray(details)) {
    return details.map(redactDetails);
  }

  const redacted: Record<string, any> = {};
  for (const [key, val] of Object.entries(details)) {
    // Redact key matching api keys or tokens
    if (
      key.toLowerCase().includes('key') ||
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('auth') ||
      key.toLowerCase().includes('secret')
    ) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactDetails(val);
    }
  }
  return redacted;
}
