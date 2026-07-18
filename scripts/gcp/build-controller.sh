#!/usr/bin/env bash
# Container Image Build Script
# Submits the build job to Google Cloud Build using commit-based tag

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
REGION="europe-west1"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations select "$CONFIG_NAME" &>/dev/null

echo "=== [1/2] Determining Feature Branch SHA ==="
COMMIT_SHA=$(git rev-parse --short HEAD)
echo "Current Commit SHA: ${COMMIT_SHA}"

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/e2b-agent-runtime/controller:${COMMIT_SHA}"
echo "Target Image URI: ${IMAGE_URI}"

echo "=== [2/2] Submitting to Cloud Build ==="
gcloud builds submit \
  --tag="$IMAGE_URI" \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT"

echo "=== Build Succeeded ==="
echo "Image URI: ${IMAGE_URI}"
