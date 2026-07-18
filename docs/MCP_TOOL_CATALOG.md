# MCP Tool Catalog Audit

This document presents a comprehensive, multi-dimensional security and operational audit of all public Model Context Protocol (MCP) tools registered on the **E2B Agent Runtime Remote MCP Controller**.

---

## Safety Classifications

Each tool is classified under one of the following safety levels:
1. **`read-only`**: Retrieves status, logs, configurations, or read-only workspace details. Safe to run unconditionally without confirmation.
2. **`state-changing`**: Modifies the state of the active, disposable worker container (e.g. file edits, command execution). Executed only in low-trust, isolated microVMs.
3. **`external-write`**: Commits or pushes code to remote systems, or opens PRs/comments. Requires strict preflight validation and user consent.
4. **`destructive`**: Idempotently destroys sandbox sessions, wanes resources, or revokes keys. Requires explicit confirmation payload flags.

---

## Complete Catalog Index

### 1. Runtime Lifecycle Tools (Read-Only & State-Changing)

| Tool Name | Safety Level | Description | Input Fields | Expected Timeout | Confirmation Required |
|---|---|---|---|---|---|
| `runtime_create_session` | `state-changing`| Starts a disposable E2B Worker sandbox. | `timeoutMs`, `taskLabel`, `metadata` | 30,000 ms | No |
| `runtime_list_sessions` | `read-only` | Lists all active and recent worker sessions. | *None* | 5,000 ms | No |
| `runtime_get_session` | `read-only` | Retrieves state/lifecycle for a session. | `sessionId` | 5,000 ms | No |
| `runtime_run_command` | `state-changing`| Executes terminal command inside sandbox. | `sessionId`, `command`, `cwd` | 120,000 ms | No |
| `runtime_destroy_session` | `destructive` | Terminated and wanes a worker sandbox. | `sessionId` | 15,000 ms | **Yes** (via client) |
| `runtime_destroy_all_sessions`| `destructive` | Emergency wipe of all active worker sessions. | `confirm` | 30,000 ms | **Yes** (must be `true`) |

---

### 2. Repository Management Tools (Read-Only & State-Changing)

| Tool Name | Safety Level | Description | Input Fields | Expected Timeout | Confirmation Required |
|---|---|---|---|---|---|
| `repository_clone` | `state-changing`| Clones authorized repositories into sandbox. | `sessionId`, `repositoryUrl`, `branch` | 90,000 ms | No |
| `repository_read_file` | `read-only` | Reads code files from sandbox safely. | `sessionId`, `filePath` | 5,000 ms | No |
| `repository_write_file`| `state-changing`| Writes/creates code files in sandbox. | `sessionId`, `filePath`, `content`| 5,000 ms | No |
| `repository_apply_patch`| `state-changing`| Applies a unified diff patch onto repository. | `sessionId`, `patch` | 10,000 ms | No |
| `repository_git_commit`| `state-changing`| Commits locally in the worker sandbox. | `sessionId`, `message` | 10,000 ms | No |

---

### 3. Workflow Orchestration & Intelligence Tools (Phase 5)

| Tool Name | Safety Level | Description | Input Fields | Expected Timeout | Confirmation Required |
|---|---|---|---|---|---|
| `workflow_create_task` | `state-changing`| Initializes a structured coding task. | `sessionId`, `mode`, `objective` | 10,000 ms | No |
| `workflow_get_plan` | `read-only` | Reads task, dependency cycle, and versions. | `taskId` | 5,000 ms | No |
| `workflow_record_evidence`| `state-changing`| Appends structured test outcomes to ledger. | `taskId`, `evidence` | 5,000 ms | No |
| `workflow_trigger_validation`| `state-changing`| Evaluates linting, test suite, and builds. | `taskId`, `commands` | 300,000 ms | No |

---

### 4. Browser & UI Verification Tools (Phase 6)

| Tool Name | Safety Level | Description | Input Fields | Expected Timeout | Confirmation Required |
|---|---|---|---|---|---|
| `browser_open_page` | `state-changing`| Starts Playwright page under strict guards. | `sessionId`, `url` | 30,000 ms | No |
| `browser_click` | `state-changing`| Clicks DOM elements using css selector. | `sessionId`, `target` | 10,000 ms | No |
| `browser_fill` | `state-changing`| Fills input fields with secure redactions. | `sessionId`, `target`, `value` | 10,000 ms | No |
| `browser_capture_snapshot`| `read-only` | Retrieves access-safe structural DOM snapshot.| `sessionId` | 10,000 ms | No |
| `browser_accessibility_scan`| `read-only`| Scans page structure with axe-core. | `sessionId` | 30,000 ms | No |

---

### 5. Pull Request Repair & CI Inspection (Phase 8)

| Tool Name | Safety Level | Description | Input Fields | Expected Timeout | Confirmation Required |
|---|---|---|---|---|---|
| `github_inspect_pr` | `read-only` | Collects base/head/commits for open PRs. | `owner`, `repo`, `prNumber` | 15,000 ms | No |
| `github_inspect_pr_checks`| `read-only` | Inspects CI/CD workflow status of exact SHA.| `owner`, `repo`, `sha` | 15,000 ms | No |
| `github_inspect_pr_reviews`| `read-only` | Fetches active PR review comments & threads. | `owner`, `repo`, `prNumber` | 15,000 ms | No |
| `github_repair_push` | `external-write`| Commits & pushes FF updates onto PR branch. | `owner`, `repo`, `branch`, `message`| 45,000 ms | **Yes** (requires consent) |

---

### 6. Production Hardening & Release Status (Phases 9 & 10)

| Tool Name | Safety Level | Description | Input Fields | Expected Timeout | Confirmation Required |
|---|---|---|---|---|---|
| `runtime_system_status`| `read-only` | Controller liveness, DB connection, and job health. | *None* | 5,000 ms | No |
| `runtime_capacity_status`| `read-only` | Exposes quotas, soft limits, and active worker load. | *None* | 5,000 ms | No |
| `runtime_release_readiness`| `read-only` | Displays evaluation of MVP release checklist. | *None* | 10,000 ms | No |

---

## Critical Security Guardrail Standards
1. **Command Redaction**: Direct shell operations executed through `runtime_run_command` are automatically sanitized of bearer tokens, access keys, or API tokens before they return to the client.
2. **Path Traversal Blocker**: All file read/write tools are strictly verified against the workspace sandbox root. Standard path manipulation like `../` are rejected during validation.
3. **No Hidden Merges**: Merge API invocations are **unsupported** by the repository tools. Pull Requests can only be merged via the GitHub UI by designated human administrators.
