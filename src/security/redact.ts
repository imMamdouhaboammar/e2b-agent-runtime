export function redactSecrets(
  text: string,
  secrets: (string | undefined)[] = []
): string {
  let redacted = text;

  // Redact explicit secrets passed in array
  for (const secret of secrets) {
    if (secret && secret.trim().length > 0) {
      redacted = redacted.split(secret).join('[REDACTED]');
    }
  }

  // Redact Bearer and Basic token headers
  redacted = redacted.replace(
    /Authorization:\s*(Bearer|Basic)\s+[^\s"']+/gi,
    'Authorization: [REDACTED_AUTH]'
  );

  // Redact general authorization/token in URL headers or parameters
  redacted = redacted.replace(
    /(?:access_token|token|api_key|client_secret|password)=\s*[^\s"']+/gi,
    (match) => {
      const parts = match.split('=');
      return `${parts[0]}=[REDACTED_CREDENTIAL]`;
    }
  );

  // Redact cookies
  redacted = redacted.replace(/(?:set-cookie|cookie):\s*[^\r\n]+/gi, '[REDACTED_COOKIE]');

  // Redact private keys
  redacted = redacted.replace(
    /-----BEGIN[A-Z0-9\s_]*PRIVATE KEY-----[^-]*-----END[A-Z0-9\s_]*PRIVATE KEY-----/gims,
    '[REDACTED_PRIVATE_KEY]'
  );

  // Redact signed URLs / URLs with credential query parameters (signature, token, expires)
  redacted = redacted.replace(
    /https?:\/\/[^\s"']*(?:Signature|Expires|AWSAccessKeyId|se=|st=|sr=|sp=|sig=)[^\s"']*/gi,
    '[REDACTED_SIGNED_URL]'
  );

  // Redact environment assignments for sensitive names
  redacted = redacted.replace(
    /(?:SECRET|PASSWORD|TOKEN|KEY|PASS|CREDENTIAL|PRIVATE|AUTH)(?:_[A-Z0-9]+)*\s*=\s*[^\s"'\r\n]+/gi,
    (match) => {
      const parts = match.split('=');
      return `${parts[0]}=[REDACTED_ENV_VAR]`;
    }
  );

  // Redact E2B API Key patterns if matching e2b_sec_...
  redacted = redacted.replace(/e2b_sec_[a-zA-Z0-9_-]+/gi, '[REDACTED_API_KEY]');

  return redacted;
}

