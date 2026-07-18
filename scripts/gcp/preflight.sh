#!/usr/bin/env bash
# Preflight setup script for E2B Agent Runtime Staging
# Sets up isolated gcloud configuration and checks credentials

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
REGION="europe-west1"
CONFIG_NAME="e2b-agent-runtime-staging"

echo "=== [1/2] Verifying Google Cloud SDK ==="
if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud CLI is not installed." >&2
  exit 1
fi
gcloud version

echo "=== [2/2] Configuring Isolated gcloud Profile ==="
# Check if configuration exists, create if not
if gcloud config configurations list --format="value(name)" | grep -q "^${CONFIG_NAME}$"; then
  echo "gcloud configuration '${CONFIG_NAME}' already exists. Selecting it..."
  gcloud config configurations select "$CONFIG_NAME"
else
  echo "Creating isolated gcloud configuration '${CONFIG_NAME}'..."
  gcloud config configurations create "$CONFIG_NAME"
fi

# Ensure correct account is active and set properties
echo "Configuring gcloud profile for account '${NIGHTS_ACCOUNT}'..."
gcloud config set account "$NIGHTS_ACCOUNT"
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"

# Verify account is authenticated
if ! gcloud auth list --format="value(account)" | grep -q "^${NIGHTS_ACCOUNT}$"; then
  echo "Error: Account '${NIGHTS_ACCOUNT}' is not authenticated on this machine." >&2
  echo "Please run: gcloud auth login ${NIGHTS_ACCOUNT}" >&2
  exit 1
fi

echo "=== Preflight Complete Successfully ==="
echo "Active Configuration: $(gcloud config configurations list --filter="is_active=true" --format="value(name)")"
echo "Active Account: $(gcloud config get-value account)"
echo "Target Project: $(gcloud config get-value project)"
echo "Target Region: $(gcloud config get-value run/region)"
