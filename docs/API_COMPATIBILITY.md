# API Compatibility Log

This document ensures that updates to the Remote MCP Controller do not break backwards compatibility for active clients.

## MCP Tool API Contracts
1. **Tool Schema Modifications**: All tool schema modifications must be additive (optional parameters only).
2. **Prior Version Client Integration**: Prior version clients using basic connection parameters remain compatible.
3. **Internal Data Formats**: Database-specific, deployment-specific, or ORM-specific details are NEVER returned in public responses.
4. **Error Codes**: Error payloads use stable codes:
   - `UNAUTHORIZED`
   - `SESSION_NOT_FOUND`
   - `QUOTA_EXCEEDED`
   - `INVALID_INPUT`
