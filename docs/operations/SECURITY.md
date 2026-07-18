# Security & Hardening Standards

This document describes the security policies enforced by the Remote MCP Controller.

## Security Controls
1. **Durable Secret Management**:
   - Secrets are NEVER stored in the Git repository, Dockerfile, or container image layers.
   - Secrets are injected dynamically at runtime via environment variables (Cloud Run Secrets / Kubernetes Secrets).
2. **Access Controls**:
   - MCP connections are protected by hashed tokens (`SHA-256`).
   - Plaintext tokens are displayed only once upon generation.
3. **E2B Worker isolation**:
   - Workers run in disposable sandboxes with restricted permissions.
   - Workers do not inherit Controller secrets or credentials.
