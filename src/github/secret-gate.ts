export interface SecretFinding {
  category: 'private_key' | 'api_token' | 'credential_file' | 'hardcoded_secret';
  filePath: string;
  line?: number;
  isBlocker: boolean;
}

const FORBIDDEN_FILE_NAMES = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
];

const SECRET_PATTERNS = [
  {
    category: 'private_key' as const,
    pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i,
  },
  {
    category: 'api_token' as const,
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/,
  },
  {
    category: 'api_token' as const,
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    category: 'api_token' as const,
    pattern: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/,
  },
  {
    category: 'hardcoded_secret' as const,
    pattern: /(?:password|secret|api_key|access_token|private_key)\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{16,}["']/i,
  },
];

export class SecretScanningGate {
  public static inspectDiffAndFiles(
    files: Array<{ path: string; content?: string }>
  ): SecretFinding[] {
    const findings: SecretFinding[] = [];

    for (const file of files) {
      const filename = file.path.split('/').pop() || file.path;

      // 1. Check filename
      for (const pattern of FORBIDDEN_FILE_NAMES) {
        if (pattern.test(filename)) {
          findings.push({
            category: 'credential_file',
            filePath: file.path,
            isBlocker: true,
          });
          break;
        }
      }

      // 2. Check content if present
      if (file.content) {
        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          for (const rule of SECRET_PATTERNS) {
            if (rule.pattern.test(lineText)) {
              findings.push({
                category: rule.category,
                filePath: file.path,
                line: i + 1,
                isBlocker: true,
              });
            }
          }
        }
      }
    }

    return findings;
  }
}
