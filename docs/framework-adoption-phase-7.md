# Framework Adoption Report (Phase 7)

This report details the audit of existing custom sandbox abstractions in the E2B Agent Runtime project against official framework equivalents in the E2B SDK, OpenAI Agents SDK, and Model Context Protocol (MCP) SDK.

## Audit Table

| Component | Current Implementation Path | Official Framework Equivalent | Classification | Migration Risk | Final Decision & Implementation Notes |
|---|---|---|---|---|---|
| **Sandbox creation** | `src/e2b/create-sandbox.ts` | `E2BSandboxClient.createSession()` | **WRAP** | Low | Implement `SandboxProvider` contract. Wrap both direct E2B creation and OpenAI Agents client creation. |
| **Sandbox connection** | `src/runtime/e2b-worker-manager.ts` | `E2BSandboxClient.connectSession()` | **WRAP** | Low | Same as creation; wrap connection behind provider contract interface. |
| **Sandbox resume** | `src/runtime/lifecycle-reconciler.ts` | `E2BSandboxClient.connectSession()` | **WRAP** | Low | Wrap connection by ID. |
| **Sandbox kill** | `src/e2b/lifecycle.ts` | `session.close()` | **WRAP** | Low | Keep direct `sandbox.kill()` for direct-e2b and `session.close()` for openai-agents-e2b. |
| **Sandbox pause** | None (direct E2B REST) | None / API REST endpoint | **DEFER** | Low | Currently unsupported natively in OpenAI Agents SDK without direct REST. Defer to future phases. |
| **Sandbox lifecycle options** | `src/config.ts` | Constructor configuration | **KEEP / WRAP** | Low | Map configuration options (TTL, template, metadata) in both adapters. |
| **Command execution** | `src/terminal/terminal-manager.ts` | `session.shell.run()` | **WRAP** | Low | Keep direct `sandbox.commands.run()` for direct-e2b, map to `session.shell.run()` for openai-agents-e2b. |
| **Background commands** | `src/terminal/terminal-manager.ts` | `session.shell.run()` background mode | **WRAP** | Medium | Direct E2B runs commands asynchronously. OpenAI Agents SDK `run()` supports streaming output. Wrap carefully. |
| **PTY creation** | `src/terminal/terminal-manager.ts` | `session.pty.create()` | **WRAP** | Medium | Direct E2B creates PTY via `sandbox.pty.create()`. OpenAI Agents E2B uses `session.pty.create()`. |
| **PTY input** | `src/terminal/terminal-manager.ts` | `session.pty.write()` | **WRAP** | Low | Simple string write mapping. |
| **PTY output buffering** | `src/terminal/pty-buffer.ts` | `session.pty.read()` | **KEEP / WRAP** | Medium | Keep local buffering logic in PTY manager, read from provider using either direct PTY events or `pty.read()`. |
| **PTY termination** | `src/terminal/terminal-manager.ts` | `session.pty.close()` / kill pid | **WRAP** | Low | Simple termination wrapper. |
| **Filesystem writes** | `src/workspace/workspace-orchestrator.ts` | `session.filesystem.writeFile()` | **WRAP** | Low | Wrap write file behind contract. |
| **Filesystem reads** | `src/workspace/workspace-orchestrator.ts` | `session.filesystem.readFile()` | **WRAP** | Low | Wrap read file behind contract. |
| **Filesystem deletion** | `src/workspace/workspace-orchestrator.ts` | `session.filesystem.deleteFile()` | **WRAP** | Low | Wrap delete file behind contract. |
| **Workspace path preparation** | `src/workspace/workspace-orchestrator.ts` | `Manifest` workspace directory | **KEEP** | Low | Keep custom orchestrator handling since it handles git operations, stack detection, and security allowlists. |
| **Manifest materialization** | None | `Manifest` class | **DEFER** | High | Defer to Phase 8. Do not replace git cloning/bootstrap logic with `Manifest` as it would bypass security controls in Phase 3. |
| **Git repo materialization** | `src/e2b/git-operations.ts` | `Manifest` GitRepo entry | **KEEP** | High | Keep custom git cloning. OpenAI's `GitRepo` entry does not support GitHub App token brokerage and custom credential mapping securely. |
| **Environment materialization** | `src/terminal/environment-check.ts` | `Manifest` environment configuration | **KEEP** | Low | Keep direct env injection. |
| **Ephemeral env values** | `src/terminal/environment-check.ts` | Manifest environment variables | **KEEP** | Low | Keep custom env handling. |
| **Exposed-port resolution** | `src/browser/preview-resolver.ts` | `session.resolveExposedPort()` | **WRAP** | Low | Map `sandbox.getHost()` vs `session.resolveExposedPort()`. |
| **Snapshots** | None | None | **DEFER** | Low | Currently unsupported in E2B native JS SDK without custom templates. Defer. |
| **Workspace persistence** | `src/runtime/e2b-worker-manager.ts` | Sandbox session state / Resume | **WRAP** | Medium | Wrap session registry serialization. |
| **Archive limits** | `src/config.ts` | Optional package options | **KEEP** | Low | Managed via configuration settings. |
| **Concurrency limits** | `src/runtime/concurrency-gate.ts` | None | **KEEP** | Low | Keep custom concurrency gate as it manages worker pool count correctly. |
| **Session serialization** | `src/runtime/session-registry.ts` | JSON session metadata | **WRAP** | Low | Wrap serialized JSON session state. |
| **Session recovery** | `src/runtime/session-registry.ts` | `connectSession` | **WRAP** | Low | Wrap recovery behind contract. |
| **Provider error normalization**| `src/shared/errors.ts` | Runtime validation & error mapping | **REPLACE** | Low | Centralize under new `sandbox/contracts/sandboxErrors.ts` and sanitize provider logs. |
| **Skills materialization** | `src/runtime/skills-runtime.ts` | OpenAI Agents SDK `skills()` | **KEEP** | Medium | Keep existing skills implementation. OpenAI's `skills()` requires `SandboxAgent` which is not the default default controller. |
| **Memory** | `src/workflow/task-store.ts` | SandboxAgent memory capability | **KEEP** | Low | Keep custom checkpoint/task store persistence. |
| **Compaction** | `src/workflow/checkpoint-manager.ts`| SandboxAgent compaction | **KEEP** | Low | Keep custom state compaction. |
| **MCP transport** | `src/mcp/connect-client.ts` | `MCPServerStreamableHttp` | **KEEP** | Low | Maintain official MCP SDK transport for Remote MCP Controller. |
| **MCP tool registration** | `src/mcp/create-server.ts` | Client tool listing | **KEEP** | Low | Maintain existing Zod-based MCP tool declarations. |
| **Browser lifecycle** | `src/browser/browser-session-manager.ts` | Playwright browser inside VM | **KEEP** | Low | Playwright runs inside the VM (exec commands). Framework is unaffected. |
| **Artifact lifecycle** | `src/browser/artifact-store.ts` | Custom artifact storage | **KEEP** | Low | Keep local artifact store. |
| **GitHub credentials** | `src/github/token-broker.ts` | None | **KEEP** | High | Keep GitHub app token isolation in Controller. |
| **GitHub publication** | `src/e2b/git-operations.ts` | None | **KEEP** | High | Keep custom Git operations. |
| **Validation evidence** | `src/workflow/evidence-ledger.ts` | Execution history | **KEEP** | Low | Keep custom evidence ledger. |
| **Checkpoint storage** | `src/workflow/checkpoint-manager.ts`| `SESSION_CHECKPOINT.md` | **KEEP** | Low | Keep markdown-based task checkpoints. |

## Decided Path for Phase 7

1. **Contracts**: Introduce `src/sandbox/contracts/` to establish a neutral boundary.
2. **Registry**: Provide a configurably selectable registry (`SANDBOX_PROVIDER`) allowing `direct-e2b` or `openai-agents-e2b`.
3. **Parity**: Keep `direct-e2b` as default, map all commands to the contract, and add an optional Node.js 22 gated `openai-agents-e2b` adapter.
4. **Validation**: Test both adapters against a single reusable test suite to prove parity.
