import path from 'node:path';

const WORKSPACE_BASE = '/workspace';

export function validateWorkspaceCwd(requestedCwd?: string): string {
  if (!requestedCwd || requestedCwd.trim().length === 0) {
    return WORKSPACE_BASE;
  }

  const rawPath = requestedCwd.trim();

  // Reject null bytes
  if (rawPath.includes('\0')) {
    throw new Error('Invalid working directory: Path contains null bytes.');
  }

  // Normalize POSIX path
  const normalized = path.posix.normalize(rawPath);

  // Check if normalized path starts with /workspace
  if (normalized !== WORKSPACE_BASE && !normalized.startsWith(`${WORKSPACE_BASE}/`)) {
    throw new Error(
      `Working directory restriction: "${requestedCwd}" escapes allowed root "${WORKSPACE_BASE}".`
    );
  }

  return normalized;
}
