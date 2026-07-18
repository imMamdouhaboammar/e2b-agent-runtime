# E2B Agent Runtime

An architecture and runtime for running a **Remote Model Context Protocol (MCP) Controller** in an isolated cloud computer using [E2B Sandboxes](https://e2b.dev), orchestrating disposable E2B Worker Sandboxes for safe tool execution, persistent PTY terminal sessions, repository intelligence, task planning, evidence tracking, bounded repair cycles, checkpoints, diff review, GitHub branch publication, and **browser + UI verification via Playwright Chromium**.

---

## Phase 6 Architecture: Browser & User-Interface Verification

```mermaid
flowchart TD
    A[ChatGPT Web / Remote MCP Client] -->|HTTPS & Bearer token| B[Remote MCP Controller]
    B --> C[Phase 5 Coding Workflow Engine]
    C --> D[Completion Gate Evaluator]
    D -->|web task?| E[Browser Verification Gate]

    B --> F[Phase 6 Browser Engine]
    F --> G[Browser Session Manager]
    F --> H[Navigation Guard]
    F --> I[Preview Resolver]
    F --> J[Page Inspector]
    F --> K[Evidence Collector]
    F --> L[Browser Actions]
    F --> M[Browser Assertions]
    F --> N[Accessibility Scanner]
    F --> O[Artifact Store]
    F --> P[Browser Failure Classifier]
    F --> Q[Verification Cycle Manager]

    G --> R[Playwright Chromium]
    R --> S[Dev Server in Worker]
    O --> T[/workspace/.agent-artifacts/browser/]
    B --> U[Phase 3 GitHub Publication]
    U --> V[Pull Request]
```

### Phase 6 Trust Boundaries & Navigation Policy

| Component | Policy | Details |
|---|---|---|
| **Navigation Guard** | Allowlist | Only `http:` and `https:` schemes allowed. `file:`, `data:`, `javascript:` are blocked unconditionally. |
| **Metadata Shield** | Hard block | `169.254.169.254`, entire `169.254.0.0/16`, `metadata.google.internal` are unreachable regardless of config. |
| **Embedded Credentials** | Hard block | URLs containing `username:password@` syntax are rejected at guard entry. |
| **External Navigation** | Opt-in | External hosts denied by default. An explicit `allowedPreviewHost` or `allowedDomains` entry is required per request. |
| **Traffic Tokens** | Redacted | E2B sandbox traffic tokens are never returned in MCP responses. Preview resolution returns only the internal `http://127.0.0.1:<port>` URL. |
| **Query Params** | Sanitized | Sensitive parameter names (`token`, `key`, `access_token`, `password`, `secret`, `signature`, `session`, `code`) are replaced with `[REDACTED]` in all evidence, logs, and artifact URLs. |

### Phase 6 Artifact Policy

- **Storage path**: `/workspace/.agent-artifacts/browser/` (outside repository git tree — never committed).
- **Retention**: configurable via `BROWSER_ARTIFACT_RETENTION_MS` (default: 24 hours).
- **Download URLs**: short-lived pre-signed URLs, configurable via `BROWSER_DOWNLOAD_URL_TTL_MS` (default: 10 minutes).
- **Confirmation delete**: `artifact_delete` requires `confirm: true` to prevent accidental loss.
- **Integrity**: every artifact has a SHA-256 hash computed at write time and verified on retrieval.

---

## Phase 5 Architecture: Structured AI-Assisted Coding Workflow Engine

```mermaid
flowchart TD
    A[ChatGPT Web / Remote MCP Client] -->|HTTPS & Bearer token| B[Remote MCP Controller]
    B --> C[Coding Task Orchestrator]
    C --> D[Repository Intelligence]
    C --> E[Plan Registry]
    C --> F[Execution Evidence Ledger]
    C --> G[Validation Cycle Manager]
    C --> H[Bounded Repair Manager]
    C --> I[Checkpoint Manager]
    C --> J[Diff Review Service]
    C --> K[Completion Gate Evaluator]
    B --> L[Phase 4 Coding Workspace]
    L --> M[E2B Worker and PTY]
    M --> N[Repository and Feature Branch]
    K --> O[Phase 3 GitHub Publication]
    O --> P[Official GitHub Connector]
    P --> Q[Pull Request]
```

### Trust Boundaries & Isolation Model

| Component | E2B Lifecycle | Terminal / Filesystem Exposure | Secrets Access |
|---|---|---|---|
| **Controller Sandbox** | `onTimeout: "pause"`, `autoResume: true` | **NEVER** exposed to clients. Runs HTTP server & workflow state. | Holds `E2B_API_KEY`, `MCP_ACCESS_TOKEN`, and `GITHUB_APP_PRIVATE_KEY`. |
| **Worker Sandboxes** | `onTimeout: "kill"`, `autoResume: false` | Restricted to `/workspace`. Executes tool, PTY, & Git commands. | Receives short-lived, repository-scoped installation access tokens inline only. **ZERO** master keys or private keys passed. |
| **MCP Client (ChatGPT)** | Remote MCP Client | Controls workspace via MCP tools. | High-level Remote MCP tool calls. ChatGPT is the reasoning layer. No inner AI coding model is installed. |

- **ChatGPT is the Reasoning Layer**: ChatGPT Web or another Remote MCP client acts as the reasoning coding agent, directly controlling the terminal and workflow via MCP. No nested inner AI CLI (such as OpenCode or Codex CLI) is installed or run by default.
- **Worker Isolation**: Worker Sandboxes are completely disposable. Persistent PTY sessions and command execution are restricted to `/workspace/repository`.
- **Secret Redaction**: All secrets (`E2B_API_KEY`, `MCP_ACCESS_TOKEN`, `GITHUB_APP_PRIVATE_KEY`, installation access tokens) are automatically redacted from logs, error messages, diffs, and checkpoints.

---

## Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Description | Default | Required |
|---|---|---|---|
| `E2B_API_KEY` | E2B Cloud API Key | - | **Yes** |
| `MCP_ACCESS_TOKEN` | Bearer token for MCP authentication | - | **Yes** |
| `CONTROLLER_PORT` | Controller HTTP server port | `3000` | No |
| `E2B_WORKER_TEMPLATE` | Private versioned E2B Worker Template tag | `agent-coding-runtime-core:stable` | No |
| `MAX_ACTIVE_WORKERS` | Maximum concurrent worker sandboxes | `3` | No |
| `MAX_TERMINALS_PER_WORKSPACE` | Maximum active terminals per workspace | `3` | No |
| `MAX_PLAN_STEPS` | Maximum steps per task plan | `20` | No |
| `MAX_REPAIR_CYCLES` | Maximum test/repair cycles per task | `3` | No |
| `MAX_TOTAL_COMMANDS_PER_TASK` | Execution command limit per task | `100` | No |
| `WORKER_DEFAULT_TIMEOUT_MS` | Default worker sandbox timeout | `600000` (10m) | No |
| `GITHUB_APP_ID` | GitHub App ID | - | If GitHub publishing enabled |
| `GITHUB_APP_INSTALLATION_ID` | GitHub App Installation ID | - | If GitHub publishing enabled |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App PEM Private Key | - | If GitHub publishing enabled |
| `BROWSER_ENGINE` | Browser engine (`chromium` only) | `chromium` | No |
| `BROWSER_HEADLESS` | Run browser headless | `true` | No |
| `BROWSER_DEFAULT_TIMEOUT_MS` | Default action/navigation timeout | `30000` | No |
| `BROWSER_MAX_SESSIONS_PER_WORKSPACE` | Max concurrent browser sessions | `2` | No |
| `BROWSER_MAX_PAGES_PER_SESSION` | Max open pages per session | `5` | No |
| `BROWSER_ALLOW_EXTERNAL_NAVIGATION` | Allow navigation to external hosts | `false` | No |
| `BROWSER_ARTIFACT_RETENTION_MS` | Artifact retention window | `86400000` (24h) | No |
| `BROWSER_DOWNLOAD_URL_TTL_MS` | Pre-signed download URL TTL | `600000` (10m) | No |

---

## Phase 6 MCP Tools Reference (26 Browser Tools)

### Browser Session Lifecycle

| Tool | Category | Description |
|---|---|---|
| `browser_session_create` | State-changing | Launches a new Playwright Chromium session with isolated context. |
| `browser_session_close` | State-changing | Closes browser context and all pages; stops trace if recording. |
| `browser_session_list` | Read-only | Lists active sessions for a workspace. |
| `browser_page_open` | State-changing | Opens a new page within a browser session. |
| `browser_page_close` | State-changing | Closes a page and clears its evidence buffers. |

### Navigation & Preview Resolution

| Tool | Category | Description |
|---|---|---|
| `browser_navigate` | State-changing | Navigates a page to a URL after navigation guard validation. |
| `browser_preview_resolve` | Read-only | Resolves the internal `http://127.0.0.1:<port>` URL for a running dev server. |
| `browser_url_validate` | Read-only | Validates and sanitizes a URL against the navigation policy without navigating. |

### Page Inspection

| Tool | Category | Description |
|---|---|---|
| `browser_page_snapshot` | Read-only | Captures a bounded structural snapshot (headings, landmarks, buttons, links, inputs). |
| `browser_page_accessibility_scan` | Read-only | Runs an axe-core accessibility scan on the current page. |
| `browser_screenshot` | Read-only | Takes a screenshot and stores it as an artifact. |

### Actions

| Tool | Category | Description |
|---|---|---|
| `browser_click` | State-changing | Clicks an element by locator strategy (elementRef, role, label, testId, css). |
| `browser_fill` | State-changing | Fills a form field (password fields are redacted from logs). |
| `browser_press` | State-changing | Sends a keyboard key press to a page or element. |
| `browser_select_option` | State-changing | Selects an option in a `<select>` element. |
| `browser_check` | State-changing | Checks or unchecks a checkbox. |
| `browser_wait_for` | Read-only | Waits for a network idle, load, or DOM-content-loaded event. |

### Assertions & Evidence

| Tool | Category | Description |
|---|---|---|
| `browser_assert` | Read-only | Evaluates a structured UI assertion (url-equals, text-visible, element-count, etc.) and returns pass/fail with evidence. |
| `browser_console_get` | Read-only | Returns buffered console entries (errors, warnings) for a page. |
| `browser_network_failures_get` | Read-only | Returns buffered network failure entries for a page. |
| `browser_page_errors_get` | Read-only | Returns buffered uncaught JavaScript errors for a page. |
| `browser_failure_classify` | Read-only | Classifies a browser failure into a category with confidence and suggested inspection actions. |

### Traces & Artifacts

| Tool | Category | Description |
|---|---|---|
| `browser_trace_start` | State-changing | Starts Playwright trace recording for a browser session. |
| `browser_trace_stop` | State-changing | Stops trace recording and saves the trace archive as an artifact. |
| `artifact_list` | Read-only | Lists stored browser artifacts for a workspace or task. |
| `artifact_create_download_url` | Read-only | Issues a short-lived pre-signed URL for downloading an artifact. |
| `artifact_delete` | State-changing | Permanently deletes an artifact (requires `confirm: true`). |

### Verification Cycles

| Tool | Category | Description |
|---|---|---|
| `browser_verification_cycle_start` | State-changing | Opens a browser verification cycle bound to the current task head SHA. |
| `browser_verification_cycle_complete` | State-changing | Closes a cycle; detects stale evidence when the head SHA has moved. |

---

## Phase 5 MCP Tools Reference (60 Total Remote MCP Tools)

### Phase 5 Coding Workflow Engine Tools

| Tool | Category | Input Schema | Description |
|---|---|---|---|
| `coding_task_start` | State-changing | `{ workspaceId, repository, taskMode, taskLabel, userRequest }` | Starts a coding task and selects task workflow. |
| `coding_task_get` | Read-only | `{ taskId }` | Retrieves detailed state and summary of a coding task. |
| `repository_intelligence_scan` | Read-only | `{ taskId, depth?, includeGenerated?, includeWorkflows? }` | Intelligently scans workspace repository structure, manifests, and commands. |
| `repository_intelligence_get` | Read-only | `{ taskId, section? }` | Gets a specific section of the repository intelligence report. |
| `repository_search` | Read-only | `{ taskId, query, paths?, fileGlobs?, maxResults? }` | Searches file content using safe ripgrep within the bound repository. |
| `repository_find_files` | Read-only | `{ taskId, namePattern?, pathPattern?, extensions? }` | Finds files matching patterns within the repository. |
| `repository_symbol_search` | Read-only | `{ taskId, symbol, language?, paths? }` | Searches for code symbols with confidence rating (`high`, `medium`, `low`). |
| `coding_plan_set` | State-changing | `{ taskId, confirmedProblem, intendedChange, untouchedScope, verificationMethod, steps }` | Sets structured plan with dependency cycle validation and verification requirements. |
| `coding_plan_update_step` | State-changing | `{ taskId, stepId, status, evidenceRefs?, blocker?, note? }` | Updates plan step status. Prevents marking validation steps complete without evidence. |
| `coding_plan_get` | Read-only | `{ taskId }` | Gets current plan for a coding task. |
| `execution_record_command` | State-changing | `{ taskId, executionId, category, purpose?, relatedStepId? }` | Associates actual terminal execution with task as official evidence. |
| `execution_list_evidence` | Read-only | `{ taskId, category?, status?, limit? }` | Lists recorded execution evidence for a task. |
| `validation_plan_detect` | Read-only | `{ taskId, targetPaths?, taskMode? }` | Proposes validation commands based on repository intelligence. |
| `validation_cycle_start` | State-changing | `{ taskId, plannedCategories, cycleLabel? }` | Starts a validation cycle. Enforces repair budget. |
| `validation_cycle_complete` | State-changing | `{ taskId, cycleId, evidenceIds, summary? }` | Completes validation cycle using real execution evidence. |
| `validation_get_status` | Read-only | `{ taskId }` | Gets current validation status and remaining repair budget. |
| `failure_classify` | Read-only | `{ taskId, executionId, clientInterpretation? }` | Classifies failure category and repeated failure signatures. |
| `repair_attempt_start` | State-changing | `{ taskId, cycleId, failureEvidenceIds, hypothesis }` | Starts a bounded repair attempt following a failed cycle. |
| `repair_attempt_complete` | State-changing | `{ taskId, repairAttemptId, inspectedPaths, changedPaths, result }` | Completes repair attempt and tracks modified paths. |
| `coding_checkpoint_create` | State-changing | `{ taskId, reason, decisions, inspectedPaths, importantSymbols, blockers, risks, exactNextAction }` | Creates compact, sanitized task checkpoint (`SESSION_CHECKPOINT.md`). |
| `coding_checkpoint_get` | Read-only | `{ taskId, checkpointId }` | Gets details of a task checkpoint. |
| `coding_checkpoint_list` | Read-only | `{ taskId }` | Lists checkpoint metadata for a task. |
| `coding_task_resume` | State-changing | `{ taskId, checkpointId }` | Resumes task from checkpoint with drift detection. |
| `coding_diff_review` | Read-only | `{ taskId, includePatch?, maxPatchBytes? }` | Reviews working tree diff against base SHA, secret findings, and scope expansion. |
| `coding_completion_gate` | Read-only | `{ taskId, acknowledgeUnavailableChecks? }` | Evaluates completion gates before publication preflight. |
| `coding_pr_handoff_prepare` | Read-only | `{ taskId }` | Prepares structured Pull Request handoff markdown using `PR_TEMPLATE.md`. |
| `coding_task_abandon` | State-changing | `{ taskId, confirm: true, reason }` | Abandons coding task with explicit confirmation. |

---

## Development & Testing Commands

```bash
# Full static verification, unit tests, and build
pnpm check

# Run unit tests only
pnpm test

# Run browser integration tests (requires Chromium installed)
pnpm test:integration:browser

# Browser verification scripts
pnpm browser:verify-installation   # Confirms Playwright Chromium is installed
pnpm browser:print-versions        # Prints Playwright and Chromium version info
pnpm browser:validate-policies     # Validates all four runtime policy JSON files

# Workflow policy & list scripts
pnpm workflow:validate
pnpm workflow:list
pnpm runtime:inspect-task-policy

# Gated Integration Tests
pnpm test:integration:workflow
pnpm test:integration:repair-cycle
pnpm test:integration:checkpoint-resume
pnpm test:integration:completion-gate
```