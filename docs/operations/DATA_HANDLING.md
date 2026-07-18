# Privacy and Data Minimization (DATA_HANDLING)

This document establishes the data categories stored in the system, data minimization parameters, and data retention settings.

## Data Minimization Guidelines
1. **No secrets in logs**: Plaintext tokens, headers, and API keys are automatically redacted by the logger.
2. **Minimizing source code storage**: Complete source code contents are never stored in the database.
3. **Audit records metadata limits**: Audit trails store identifiers, hashes, and actions (never raw files or terminal payloads).

## Retention Configs
- **Rate Limit Events**: 1 day
- **Audit Logs**: 90 days
- **Worker Sessions**: 30 days
- **Checkpoints**: 30 days
- **Evidence Records**: 30 days
