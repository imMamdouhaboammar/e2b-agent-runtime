#!/usr/bin/env bash
# Staging Service Status and Logs Script
# Retrieves running configuration, revision metadata, and sanitized Cloud Run logs

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
REGION="europe-west1"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations select "$CONFIG_NAME" &>/dev/null

echo "=== [1/2] Retrieving Staging Service Details ==="
gcloud run services describe e2b-agent-runtime-staging \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT" \
  --format="yaml(metadata.name,status.url,status.conditions,status.traffic)"

echo "=== [2/2] Retrieving Recent Sanitized Service Logs ==="
echo "Fetching last 100 entries from Cloud Logging (masked)..."

# Filter logs for our service and format nicely, avoiding secrets printing
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=e2b-agent-runtime-staging" \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT" \
  --limit=100 \
  --format="table(timestamp,textPayload)" | grep -E -v "E2B_API_KEY|MCP_ACCESS_TOKEN" || true
