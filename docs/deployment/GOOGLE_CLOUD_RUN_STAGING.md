# Google Cloud Run Staging Deployment

This document details the configuration, architecture, and step-by-step deployment runbook for the **E2B Agent Runtime Controller** to a real, private staging environment on Google Cloud Run.

---

## 1. Staging Architecture

For low-cost, secure, and fast staging validation, the Controller is deployed with a highly optimized, single-instance architecture that bypasses the need for an expensive Cloud SQL PostgreSQL database:

```
[ Remote MCP Clients ] --(Secure Bearer Auth)--> [ Cloud Run Service (Staging) ]
                                                            │
                                                +-----------┴-----------+
                                                │  Controller Container │
                                                │  (USER: node, CPU: 1) │
                                                +-----------┬-----------+
                                                            │
                                             ┌──────────────┴──────────────┐
                                             ▼                             ▼
                                    [ Secret Manager ]             [ E2B Sandbox API ]
                                    • e2b-api-key                  • Spawn isolated
                                    • controller-mcp-access-token    micro-VMs
```

### Resource Configurations
- **Service Name**: `e2b-agent-runtime-staging`
- **Region**: `europe-west1` (Staging Region)
- **CPU**: `1` (Optimal single-core runtime performance)
- **Memory**: `2Gi` (Sufficient for high-concurrency Node processes)
- **Min Instances**: `0` (Scales to zero to eliminate idle CPU charges)
- **Max Instances**: `1` (Strictly limited to 1 instance to enforce consistency in Local State Mode)
- **Concurrency**: `10` (Limits simultaneous requests per container instance)
- **Request Timeout**: `3600s` (Supports long-running task streams)

---

## 2. Environment Configurations & Secrets

All configuration details are retrieved securely at container startup from environment variables or Google Secret Manager.

### Exposed Environment Variables
| Variable Name | Staging Value | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations in Express and dependencies |
| `APP_ENV` | `staging` | Denotes staging environment for logs and analytics |
| `SANDBOX_PROVIDER` | `direct-e2b` | Interacts directly with the E2B Sandbox APIs |
| `E2B_WORKER_TEMPLATE` | `agent-coding-runtime-core:stable` | Default micro-VM worker template for sandbox environments |
| `MCP_PATH` | `/mcp` | Path matching the MCP StreamableHTTP endpoint |
| `E2B_WORKER_SECURE` | `true` | Enforces TLS and strict sandbox authentication boundaries |
| `E2B_WORKER_ON_TIMEOUT` | `kill` | Guarantees unreleased sandboxes are cleaned up on timeout |
| `CONTROLLER_PORT` | `3000` | Port on which the Express controller listens inside the container |

### Google Secret Manager Integration
The Cloud Run service is bound to the following secret resources using the container's runtime identity. Secrets are mounted directly as environment variables:
- **`E2B_API_KEY`** -> Mounted from `e2b-api-key:latest`
- **`MCP_ACCESS_TOKEN`** -> Mounted from `controller-mcp-access-token:latest`

---

## 3. Deployment Runbook

The staging deployment pipeline is fully automated using idempotent shell scripts located in `scripts/gcp/`.

### Prerequisites
1. Ensure the `gcloud` CLI is installed and updated on your machine.
2. Ensure you are authenticated with the authorized Google Account:
   ```bash
   gcloud auth login nightsvo@gmail.com
   ```

### Step-by-Step Deployment
Execute the scripts in order from the repository root:

1. **Preflight Setup**:
   Creates an isolated `gcloud` profile `e2b-agent-runtime-staging` to prevent interference with your other GCP projects:
   ```bash
   ./scripts/gcp/preflight.sh
   ```

2. **Project Provisioning**:
   Idempotently creates the target GCP project `e2b-agent-runtime-bf8e6a` and links it to active billing account `012306-45DC7B-585A76`:
   ```bash
   ./scripts/gcp/create-project.sh
   ```

3. **API Enablement & IAM**:
   Enablesrequired APIs and provisions the least-privilege service account `e2b-controller` and Artifact Registry Docker repository:
   ```bash
   ./scripts/gcp/configure-project.sh
   ```

4. **Secret Upload**:
   Uploads `E2B_API_KEY` and generates/uploads the cryptographically secure staging `MCP_ACCESS_TOKEN`, granting accessor roles to the service account:
   ```bash
   ./scripts/gcp/upload-secrets.sh
   ```

5. **Local Verification**:
   Runs standard linting and Vitest unit checks before submitting to build:
   ```bash
   pnpm check
   ```

6. **Container Build**:
   Submits a fast, containerized build job to Cloud Build, tagging the image with the current git commit SHA:
   ```bash
   ./scripts/gcp/build-controller.sh
   ```

7. **Service Deployment**:
   Deploys the built image to Cloud Run:
   ```bash
   ./scripts/gcp/deploy-controller.sh
   ```

8. **End-to-End Smoke Testing**:
   Validates endpoint liveness, readiness, authentication rejection, and executes a real sandboxed terminal smoke-test:
   ```bash
   ./scripts/gcp/smoke-test.sh
   ```

---

## 4. Monitoring & Logs

To check active service details and review recent logs:
```bash
./scripts/gcp/status.sh
```
This retrieves configuration metadata and prints the last 100 log entries from Google Cloud Logging with sensitive credentials automatically masked.
