# On-Call Engineer Guide

Guide for resolving critical alerts and issues on the Remote MCP Controller.

## Escalation Path
1. **Developer Support**: On-call engineer responds to initial alerts.
2. **Platform Ops Support**: Escalate to cloud platform/database admin if database host is unresponsive.

## Debugging Commands
- Inspect current system health status:
  ```bash
  pnpm ops:status
  ```
- Reconcile active workers manually:
  ```bash
  pnpm ops:reconcile
  ```
- Inspect recent incidents:
  ```bash
  # Via administrative MCP tool
  runtime_incident_snapshot
  ```
- Force drain worker sessions gracefully:
  ```bash
  pnpm ops:drain
  ```
