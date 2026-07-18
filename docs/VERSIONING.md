# Versioning and Backward Compatibility Policy

This document defines the semantic versioning rules, protocol contracts, and API snapshot deprecation policies for the E2B Agent Runtime.

## SemVer 2.0 Compliance

We strictly follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** version increments: Breaking protocol changes or incompatible schema edits.
- **MINOR** version increments: Backward-compatible feature additions (e.g., adding a new non-required field to an existing tool, registering a new tool).
- **PATCH** version increments: Backward-compatible bug fixes and internal optimizations.

## Protocol Contracts & Snapshot Sweeping

To ensure external clients (like ChatGPT Custom Apps or other MCP clients) do not break:

1. **Snapshot Generation**:
   - Run `pnpm api:snapshot` to capture a baseline snapshot of all registered tools and parameter shapes.
2. **Compatibility Gate**:
   - Continuous Integration runs `pnpm api:breaking-check` on every commit. If any required argument is added, or an existing type contract is altered, the gate will fail.
3. **Deprecation Path**:
   - To sunset an older version, declare the deprecation timeline in `docs/adr/0002-chatgpt-app-packaging.md` and provide a fallback handler.
