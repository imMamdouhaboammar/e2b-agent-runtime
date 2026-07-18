export function redactSecrets(
  text: string,
  secrets: (string | undefined)[]
): string {
  let redacted = text;

  // Redact explicit secrets passed in array
  for (const secret of secrets) {
    if (secret && secret.trim().length > 0) {
      redacted = redacted.split(secret).join('[REDACTED]');
    }
  }

  // Redact Bearer token headers if matching pattern
  redacted = redacted.replace(
    /Authorization:\s*Bearer\s+[^\s"']+/gi,
    'Authorization: Bearer [REDACTED]'
  );

  // Redact E2B API Key patterns if matching e2b_sec_...
  redacted = redacted.replace(/e2b_sec_[a-zA-Z0-9_-]+/gi, '[REDACTED_API_KEY]');

  return redacted;
}
