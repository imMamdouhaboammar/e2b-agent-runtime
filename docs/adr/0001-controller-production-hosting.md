# ADR 0001: Controller Production Hosting

## Context and Problem Statement
The Remote MCP Controller needs a production-ready, durable hosting environment. We need to evaluate potential hosting options for running the Controller as a containerized service.

## Proposed Options

### 1. Google Cloud Run (Recommended)
- **Endpoint Stability**: High. Provides robust HTTPS endpoints out of the box with automatic TLS.
- **Secrets Management**: Integrated with GCP Secret Manager.
- **Persistence & Connectivity**: Easy connection to Google Cloud SQL (PostgreSQL).
- **Graceful Shutdown & Scaling**: Excellent. Supports autoscaling (including to zero) and standard SIGTERM graceful shutdown hooks.
- **WebSockets / Streamable HTTP**: Supported.

### 2. Long-lived E2B Controller Sandbox
- **Endpoint Stability**: Poor. Sandboxes are ephemeral and not designed for long-lived, high-availability public HTTP endpoints.
- **Secrets Management**: Manual injection, less secure.
- **Persistence**: Temporary disk. Storage is wiped when the sandbox expires.
- **Verdict**: Unsuitable for the durable Controller role.

### 3. Hostinger or Coolify (Self-hosted Docker)
- **Endpoint Stability**: Moderate. Requires manual configuration of reverse proxy/TLS.
- **Verdict**: High operational complexity compared to Google Cloud Run.

## Decision Outcome
We choose **Google Cloud Run** as the staging/production hosting target for the durable Controller, while keeping E2B Sandboxes as the disposable Worker environment.
