# E2B Agent Runtime Threat Model

This document outlines the security architecture, trust boundaries, threat scenarios, and mitigation controls for the **E2B Agent Runtime**.

---

## 1. Security Architecture & Trust Boundaries

The runtime is divided into three distinct zones, each with separate privilege levels:

```mermaid
graph TD
    Client[External AI Client - e.g. ChatGPT]
    subgraph Trust Boundary 1: Controller Zone (High Trust)
        Controller[Remote MCP Controller]
        Database[(PostgreSQL State)]
    end
    subgraph Trust Boundary 2: Isolated Execution Zone (Zero Trust)
        Worker[E2B Worker MicroVM Sandbox]
        Browser[Playwright Browser Process]
    end
    subgraph External Systems
        GitHub[GitHub API]
    end

    Client -- HTTPS + Bearer --> Controller
    Controller -- SQL --> Database
    Controller -- Create/Destroy/Run --> Worker
    Worker -- Local PTY --> Browser
    Controller -- Installation Tokens --> GitHub
    Worker -- Read-Only Private Clone --> GitHub
```

1. **Controller Zone (High Trust)**: Holds long-lived configuration, Master API Keys (E2B, GitHub App secrets), and coordinates database-driven persistence and rate limits.
2. **Worker Sandbox Zone (Zero Trust)**: Isolated E2B microVM. Safe to run untrusted CLI commands, test suites, and third-party code. Has zero knowledge of master private keys or persistence databases.
3. **External Zone**: The GitHub API and external client ecosystem.

---

## 2. Threat Analysis (STRIDE)

### A. Information Disclosure (Credential Leakage)
- **Threat**: Untrusted user commands (e.g. `env`, `printenv`) inside the Worker sandbox read and leak master environment keys or tokens.
- **Mitigation**: Rigid boundary separation. The E2B sandbox environment is injected with a **short-lived installation token** (1-hour lifespan) representing the scoped repository. Master E2B API keys, Google Cloud secrets, and PostgreSQL connection URIs are **never** passed to the worker container.
- **Verification**: Redaction filters dynamically scrub keys from stdout logs. Verified by `pnpm security:credential-boundary`.

### B. Elevation of Privilege (Sandbox Escape)
- **Threat**: Malicious code uses kernel exploits to break out of the E2B microVM and access the underlying runner host.
- **Mitigation**: Hardware-accelerated isolation. E2B uses Firecracker microVMs. Each worker runs in an independent, hardware-isolated Linux kernel instance with its own root filesystem.

### C. Tampering & Elevation (Path Traversal)
- **Threat**: Malicious commands write to or read files outside the approved `/workspace` or `/workspace/repository` roots (e.g. reading `/etc/shadow` or copying system config files).
- **Mitigation**: Absolute path validation guards in file read/write endpoints. Path structures matching `../` or pointing outside the workspace directory are rejected by the Controller.

### D. Spoofing & Tampering (SSRF & Metadata Theft)
- **Threat**: Playwright browser pages or Curl commands run inside the sandbox make Server-Side Request Forgery (SSRF) requests to the cloud provider's metadata service (`http://169.254.169.254`) to steal high-privilege IAM roles or billing tokens.
- **Mitigation**: Strict Playwright navigation intercepts and sandbox-level firewall policies. Intercepts block loops to loopback addresses, local subnets, and cloud-provider link-local metadata ranges unconditionally.

---

## 3. Threat-Mitigation Control Mapping

| STRIDE Threat Category | Specific Threat Vector | Mitigating Control Module | Verification Test script |
|---|---|---|---|
| **Information Disclosure**| Sandbox stdout logs leak bearer tokens | `src/security/redact.ts` | `pnpm security:credential-boundary` |
| **Elevation of Privilege**| Escape from Worker VM to Controller | E2B Firecracker Hypervisor | `pnpm test:integration:e2b` |
| **Tampering** | Directory traversal to write outside workspace | `src/security/paths.ts` | `pnpm test:integration:workspace` |
| **Spoofing / Tampering** | SSRF to GCloud Metadata `169.254.169.254` | `src/browser/page-inspector.ts` | `pnpm security:abuse-tests` |
| **Denial of Service** | Session/process exhausting resource quotas | `src/persistence/postgres/quotaManager.ts` | `pnpm test:integration:ports` |
