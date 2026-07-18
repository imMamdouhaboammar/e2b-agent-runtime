/**
 * Redacts sensitive query-parameter values from a URL string.
 *
 * Why this exists as a shared helper: both NavigationGuard and EvidenceCollector
 * need identical sanitization semantics. Duplicating the sensitiveKeys list in two
 * places meant they could silently diverge on a key-list update — a security blind spot.
 *
 * Behaviour: credentials (username/password) are stripped; any query parameter whose
 * name contains a known sensitive keyword is replaced with '[REDACTED]'. On parse
 * failure the raw string is returned unchanged (best-effort utility; callers must not
 * rely on this for security enforcement — enforcement is done at validateUrl).
 */
const SENSITIVE_PARAM_KEYWORDS = [
  'token',
  'key',
  'api_key',
  'access_token',
  'authorization',
  'password',
  'secret',
  'signature',
  'session',
  'code',
] as const;

export function sanitizeUrlTokens(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';

    for (const paramKey of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_PARAM_KEYWORDS.some((k) => paramKey.toLowerCase().includes(k))) {
        parsed.searchParams.set(paramKey, '[REDACTED]');
      }
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
