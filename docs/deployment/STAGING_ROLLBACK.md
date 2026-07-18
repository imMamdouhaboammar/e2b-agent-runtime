# Staging Rollback Runbook

This runbook details how to instantly roll back the staging **E2B Agent Runtime Controller** service to a previous stable revision in case of a critical failure or regression.

---

## 1. Zero-Redeploy Revision Rollback (Recommended)

Google Cloud Run automatically versions every single deployment as a separate **Revision**. Revisions are immutable. To roll back, we do not need to rebuild or redeploy any Docker images; we can simply update the routing configuration to shift 100% of traffic back to an earlier revision instantly.

### Automated Rollback Script
You can use the helper script `rollback.sh` from the repository root:

1. **List all revisions** to identify your target rollback target:
   ```bash
   ./scripts/gcp/rollback.sh
   ```
   This will output a table of historical revisions, their active traffic percentage, creation timestamp, and corresponding image tag.

2. **Shift 100% traffic** to the desired stable revision:
   ```bash
   ./scripts/gcp/rollback.sh [REVISION_NAME]
   ```
   *Example*:
   ```bash
   ./scripts/gcp/rollback.sh e2b-agent-runtime-staging-00002-xyz
   ```

### Manual gcloud Rollback Command
If you prefer running raw `gcloud` commands, you can achieve the same instant traffic shift with:
```bash
gcloud run services update-traffic e2b-agent-runtime-staging \
  --to-revisions="[REVISION_NAME]=100" \
  --region="europe-west1" \
  --project="e2b-agent-runtime-bf8e6a" \
  --account="nightsvo@gmail.com"
```

---

## 2. Rolling Back Secrets & Configurations

If a regression is caused by a newly uploaded secret version (e.g., an invalid E2B API Key or invalid MCP access token) rather than a code change, you can update the secret mapping or destroy the problematic secret version:

### Reverting to a Previous Secret Version
By default, the Cloud Run service mounts secrets using the `:latest` tag. If you need to lock a secret to a specific, verified version (e.g., version 1):

1. Update the Secret Manager mounting parameter on Cloud Run:
   ```bash
   gcloud run services update e2b-agent-runtime-staging \
     --update-secrets="E2B_API_KEY=e2b-api-key:1,MCP_ACCESS_TOKEN=controller-mcp-access-token:latest" \
     --region="europe-west1" \
     --project="e2b-agent-runtime-bf8e6a" \
     --account="nightsvo@gmail.com"
   ```

2. To return to pointing at the latest version once fixed:
   ```bash
   gcloud run services update e2b-agent-runtime-staging \
     --update-secrets="E2B_API_KEY=e2b-api-key:latest,MCP_ACCESS_TOKEN=controller-mcp-access-token:latest" \
     --region="europe-west1" \
     --project="e2b-agent-runtime-bf8e6a" \
     --account="nightsvo@gmail.com"
   ```
