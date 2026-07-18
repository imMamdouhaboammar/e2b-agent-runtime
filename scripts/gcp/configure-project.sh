#!/usr/bin/env bash
# Project Configuration Script
# Enables services, provisions Artifact Registry, and creates runtime Service Account

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
REGION="europe-west1"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations activate "$CONFIG_NAME" &>/dev/null

echo "=== [1/3] Enabling Google Cloud APIs ==="
# Enable services idempotently
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT"

echo "Verifying enabled services..."
gcloud services list --enabled --filter="name:(run.googleapis.com OR artifactregistry.googleapis.com OR cloudbuild.googleapis.com OR secretmanager.googleapis.com)" --project="$PROJECT_ID"

echo "=== [2/3] Creating Staging Artifact Registry ==="
if gcloud artifacts repositories list --location="$REGION" --project="$PROJECT_ID" --format="value(name)" | grep -q "e2b-agent-runtime"; then
  echo "Artifact Registry repository 'e2b-agent-runtime' already exists."
else
  echo "Creating Artifact Registry repository..."
  gcloud artifacts repositories create e2b-agent-runtime \
    --repository-format=docker \
    --location="$REGION" \
    --description="E2B Agent Runtime Controller staging images" \
    --labels="app=e2b-agent-runtime,environment=staging" \
    --project="$PROJECT_ID"
fi

echo "=== [3/3] Creating Least-Privilege Runtime Service Account ==="
SA_EMAIL="e2b-controller@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts list --project="$PROJECT_ID" --format="value(email)" | grep -q "^${SA_EMAIL}$"; then
  echo "Service account 'e2b-controller' already exists."
else
  echo "Creating service account 'e2b-controller'..."
  gcloud iam service-accounts create e2b-controller \
    --display-name="E2B Agent Runtime Controller" \
    --description="Least-privilege runtime identity for the staging Cloud Run Controller" \
    --project="$PROJECT_ID"
fi

echo "=== Project Configuration Completed successfully ==="
