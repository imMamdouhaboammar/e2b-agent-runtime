# Release Readiness Verification Checklist

This checklist must be executed and fully marked off before any Release Candidate (RC) can be promoted to Production Staging or Public Release.

## Pre-Release Gates

- [ ] Run `pnpm check` (Typecheck, Lint, and Build).
- [ ] Run full test suites: `pnpm test`.
- [ ] Generate modern API snapshot: `pnpm api:snapshot`.
- [ ] Run backwards compatibility assertion: `pnpm api:breaking-check`.
- [ ] Run security audits: `pnpm security:final-audit`.
- [ ] Evaluate 26 release gates: `pnpm release:evaluate`.

## Manual Verification & Smoke Checks

- [ ] Boot the server locally and verify Remote MCP handshakes.
- [ ] Create a sandbox session manually and check E2B VM provisioning.
- [ ] Verify logs are clean of any unmasked API keys or secrets.
- [ ] Run a test ChatGPT action query to confirm live schema parsing.
