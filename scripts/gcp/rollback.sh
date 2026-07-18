#!/usr/bin/env bash
# Cloud Run Service Rollback Script
# Lists active revisions and updates traffic allocation to roll back instantly

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
REGION="europe-west1"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations activate "$CONFIG_NAME" &>/dev/null

TARGET_REVISION="${1:-}"

if [ -z "$TARGET_REVISION" ]; then
  echo "=== Staging Service Revisions ==="
  gcloud run revisions list \
    --service=e2b-agent-runtime-staging \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --account="$NIGHTS_ACCOUNT" \
    --format="table(name,active,created,image)"
  echo ""
  echo "Usage: $0 [REVISION_NAME]"
  echo "Example: $0 e2b-agent-runtime-staging-00001-abc"
  exit 0
fi

echo "=== Rolling Back Traffic to Revision: ${TARGET_REVISION} ==="
gcloud run services update-traffic e2b-agent-runtime-staging \
  --to-revisions="${TARGET_REVISION}=100" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT"

echo "=== Rollback Succeeded ==="
gcloud run services describe e2b-agent-runtime-staging \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
