# Staging Deployment Runbook

This document details the deployment process for the hardened Remote MCP Controller service to the staging environment.

## Staging Deployment Flow
1. **GitHub Environment**: All staging deployments are promoted via the `staging` environment in GitHub Actions.
2. **Environment Protection**: Staging deployments require approvals and bypass controls if configured.
3. **Database Migrations**:
   - Migrations are run automatically at container startup using an advisory transaction lock.
   - Run a migration dry-run status check using:
     ```bash
     pnpm db:migrate:status
     ```

## Local Verification (Docker)
To build and run the hardened container locally:
```bash
# Build the image
docker build -t e2b-agent-runtime-controller:local .

# Run the container (injecting DATABASE_URL and E2B_API_KEY)
docker run -d \
  -p 3000:3000 \
  --name controller-run \
  -e DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
  -e E2B_API_KEY="e2b_api_key" \
  -e MCP_ACCESS_TOKEN="mcp_token" \
  e2b-agent-runtime-controller:local
```
