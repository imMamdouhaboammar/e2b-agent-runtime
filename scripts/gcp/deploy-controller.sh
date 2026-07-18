#!/usr/bin/env bash
# Cloud Run Deployment Script
# Deploys the E2B Agent Runtime Controller to staging on Google Cloud Run

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
REGION="europe-west1"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations activate "$CONFIG_NAME" &>/dev/null

COMMIT_SHA=$(git rev-parse --short HEAD)
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/e2b-agent-runtime/controller:${COMMIT_SHA}"

echo "=== Deploying image to Cloud Run: ${IMAGE_URI} ==="

gcloud run deploy e2b-agent-runtime-staging \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT" \
  --service-account="e2b-controller@${PROJECT_ID}.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --ingress=all \
  --port=3000 \
  --cpu=1 \
  --memory=2Gi \
  --concurrency=10 \
  --timeout=3600 \
  --min-instances=0 \
  --max-instances=1 \
  --set-env-vars="NODE_ENV=production,APP_ENV=staging,SANDBOX_PROVIDER=direct-e2b,E2B_WORKER_TEMPLATE=agent-coding-runtime-core:stable,MCP_PATH=/mcp,E2B_WORKER_SECURE=true,E2B_WORKER_ON_TIMEOUT=kill,CONTROLLER_PORT=3000" \
  --set-secrets="E2B_API_KEY=e2b-api-key:latest,MCP_ACCESS_TOKEN=controller-mcp-access-token:latest" \
  --labels="app=e2b-agent-runtime,environment=staging" \
  --quiet

echo "=== Deployment Succeeded ==="
gcloud run services describe e2b-agent-runtime-staging \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
