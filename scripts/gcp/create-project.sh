#!/usr/bin/env bash
# Project Creation and Billing Link Script
# Idempotently provisions the Google Cloud project and associates the billing account

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
BILLING_ACCOUNT_ID="012306-45DC7B-585A76"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations activate "$CONFIG_NAME" &>/dev/null

echo "=== [1/2] Creating GCP Project: ${PROJECT_ID} ==="
if gcloud projects list --format="value(projectId)" | grep -q "^${PROJECT_ID}$"; then
  echo "Project '${PROJECT_ID}' already exists."
else
  echo "Creating new project '${PROJECT_ID}'..."
  gcloud projects create "$PROJECT_ID" \
    --name="E2B Agent Runtime Staging" \
    --labels="app=e2b-agent-runtime,environment=staging" \
    --account="$NIGHTS_ACCOUNT"
fi

echo "=== [2/2] Linking Billing Account ==="
# Link the project to the correct open billing account
MASKED_BILLING="012306-******-585A76"
echo "Linking project '${PROJECT_ID}' to billing account ${MASKED_BILLING}..."
gcloud billing projects link "$PROJECT_ID" \
  --billing-account="$BILLING_ACCOUNT_ID" \
  --account="$NIGHTS_ACCOUNT"

echo "Verifying billing status..."
gcloud billing projects describe "$PROJECT_ID" --account="$NIGHTS_ACCOUNT" | grep -v "billingAccountName" || true

echo "=== Project Setup & Billing Link Completed successfully ==="
