# Deployment Rollback Runbook

This document details the procedure for rolling back the Remote MCP Controller service to a previous stable state.

## Staging Rollback Procedure
1. **Identify Stable Digest**:
   - Locate the previous successful deployment run in GitHub Actions.
   - Retrieve the container image digest from the build metadata.
2. **Re-deploy Prior Container**:
   - Re-deploy the verified stable container image using the previous digest.
   - Do NOT run database down-migrations. Database schemas must remain backward-compatible to avoid downtime or data corruption.
3. **Verify Liveness and Readiness**:
   - Verify that endpoints return 200:
     - `GET /health/live`
     - `GET /health/ready`
