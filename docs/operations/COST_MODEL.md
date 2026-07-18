# E2B Agent Runtime Operations Cost Model

This document outlines the operational cost structure, sandboxing resource limits, and telemetry guidelines for hosting E2B Agent Runtime.

## Sandboxing Costs (E2B VM Costs)

- **Compute Runtime**: E2B charges per active sandbox minute (approximately $0.005/min or based on specific micro-VM pricing).
- **Idle Timeout**: Sandbox idle timeouts are set to 5 minutes by default (`max_idle_seconds: 300`) to prevent runaway costs from dangling or orphaned agent sessions.
- **Lease Overrides**: Long-running testing or validation runs can request lease extensions through `runtime_status`, but are capped at a maximum of 30 minutes.

## Database and Session Storage

- **PostgreSQL Persistence**: Storing session metadata and execution results. Average session record is <15KB.
- **Redaction Filters**: Logs are filtered through standard redaction pipelines, minimizing log storage volumes and keeping logs clear of sensitive API key material or secrets.

## Rate Limiting and Token Usage

- External clients making Remote MCP calls are rate-limited on the Controller via `src/security/rate-limit.ts` rules.
- Runaway loops of command execution are automatically cut off by the Workspace Orchestrator when exceeding the max command allowance.
