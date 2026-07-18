import path from 'path';

export const REPOSITORY_ROOT = '/workspace/repository';

export class FileSafetyError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FileSafetyError';
    this.code = code;
  }
}

const FORBIDDEN_EXACT_FILES = new Set(['.env', '.env.local', '.env.production', '.env.staging', '.env.test']);
const FORBIDDEN_FILE_PATTERNS = [
  /\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
];

/**
 * Validates that a requested file path resolves safely inside /workspace/repository
 * and does not attempt path traversal, .git access, or secret file access.
 */
export function sanitizeRepositoryPath(relativePathStr: string): string {
  if (!relativePathStr || typeof relativePathStr !== 'string') {
    throw new FileSafetyError('INVALID_PATH', 'Path must be a non-empty string.');
  }

  if (relativePathStr.includes('\0')) {
    throw new FileSafetyError('INVALID_PATH', 'Path contains null bytes.');
  }

  // Handle absolute paths if provided under REPOSITORY_ROOT
  let cleaned = relativePathStr.trim();
  if (cleaned.startsWith(REPOSITORY_ROOT)) {
    cleaned = cleaned.substring(REPOSITORY_ROOT.length);
  }

  if (cleaned.startsWith('/') || cleaned.startsWith('\\')) {
    cleaned = cleaned.substring(1);
  }

  const normalized = path.normalize(cleaned).replace(/\\/g, '/');

  if (normalized.startsWith('../') || normalized === '..') {
    throw new FileSafetyError('PATH_TRAVERSAL', `Path traversal detected: "${relativePathStr}".`);
  }

  // Reject .git folder access
  const parts = normalized.split('/');
  if (parts.includes('.git')) {
    throw new FileSafetyError('FORBIDDEN_PATH', 'Access to .git directory or files is forbidden.');
  }

  const filename = parts[parts.length - 1];

  // Secret file checks
  if (FORBIDDEN_EXACT_FILES.has(filename.toLowerCase())) {
    throw new FileSafetyError('SECRET_FILE_BLOCKED', `Access to secret file "${filename}" is blocked.`);
  }

  for (const pattern of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(filename)) {
      throw new FileSafetyError('SECRET_FILE_BLOCKED', `Access to potential credential file "${filename}" is blocked.`);
    }
  }

  return normalized;
}

export function getAbsoluteRepositoryPath(relativePathStr: string): string {
  const sanitized = sanitizeRepositoryPath(relativePathStr);
  return `${REPOSITORY_ROOT}/${sanitized}`.replace(/\/+/g, '/');
}
