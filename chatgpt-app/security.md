# Security Policy

## 1. Trust Boundaries
The E2B Agent Runtime implements rigid trust boundaries:
- **Client Reasoning Layer**: ChatGPT remains the reasoning engine.
- **Worker Execution Layer (Low Trust)**: E2B Sandbox Workers operate in an isolated Linux microVM. They have zero access to the Controller's secrets, local filesystem, or DB connection pools.
- **Controller Operations Layer (High Trust)**: Hosts the PostgreSQL persistence, OpenTelemetry tracing, and GitHub authentication.

## 2. Mitigations & Protections
- **SSRF Shielding**: Direct E2B/Playwright navigation guards unconditionally block local/private network subnets (`127.0.0.0/8`, `10.0.0.0/8`, `192.168.0.0/16`) and Google Cloud metadata endpoints (`169.254.169.254`).
- **Path Traversal Guard**: Prevents reads/writes out of `/workspace/repository`.
- **Merge Block**: GitHub integrations support pushing feature branches and creating Pull Requests but lack permission to merge code. Merges must be triggered manually by authorized reviewers.
- **Token Protection**: Temporary GitHub installation tokens expire within 1 hour. No master private keys ever reach the workers.
