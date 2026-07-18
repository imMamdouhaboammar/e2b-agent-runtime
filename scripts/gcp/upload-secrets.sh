#!/usr/bin/env bash
# Secret Upload Script
# Uploads configuration secrets to Google Secret Manager and grants Accessor role to the SA

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations select "$CONFIG_NAME" &>/dev/null

# Load environment variables from .env if present
if [ -f .env ]; then
  # Read variables cleanly without exporting them globally to avoid leak risk
  LOCAL_E2B_API_KEY=$(grep "^E2B_API_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  LOCAL_MCP_ACCESS_TOKEN=$(grep "^MCP_ACCESS_TOKEN=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
else
  LOCAL_E2B_API_KEY=""
  LOCAL_MCP_ACCESS_TOKEN=""
fi

# Fallback to current process env if available
E2B_KEY="${LOCAL_E2B_API_KEY:-${E2B_API_KEY:-}}"
MCP_TOKEN="${LOCAL_MCP_ACCESS_TOKEN:-${MCP_ACCESS_TOKEN:-}}"

if [ -z "$E2B_KEY" ]; then
  echo "Error: E2B_API_KEY was not found in .env or your shell environment." >&2
  exit 1
fi

if [ -z "$MCP_TOKEN" ]; then
  echo "MCP_ACCESS_TOKEN not detected. Generating a cryptographically strong staging token..."
  MCP_TOKEN=$(openssl rand -base64 48)
  mkdir -p ~/.config/e2b-agent-runtime
  echo "$MCP_TOKEN" > ~/.config/e2b-agent-runtime/staging-mcp-token
  chmod 600 ~/.config/e2b-agent-runtime/staging-mcp-token
  echo "Staging MCP token saved to: ~/.config/e2b-agent-runtime/staging-mcp-token"
fi

# Helper function to create/update secret via stdin
put_secret() {
  local name="$1"
  local value="$2"

  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Secret '${name}' already exists. Adding new version..."
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --data-file=- \
      --project="$PROJECT_ID" \
      --account="$NIGHTS_ACCOUNT" >/dev/null
  else
    echo "Creating secret '${name}'..."
    printf '%s' "$value" | gcloud secrets create "$name" \
      --replication-policy=automatic \
      --data-file=- \
      --labels="app=e2b-agent-runtime,environment=staging" \
      --project="$PROJECT_ID" \
      --account="$NIGHTS_ACCOUNT" >/dev/null
  fi
}

echo "=== [1/2] Uploading Secrets to Secret Manager ==="
# Disable shell tracing if any was enabled, though we didn't use -x
set +x

put_secret "e2b-api-key" "$E2B_KEY"
put_secret "controller-mcp-access-token" "$MCP_TOKEN"

echo "=== [2/2] Granting Secret Accessor to Service Account ==="
SA_EMAIL="e2b-controller@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud secrets add-iam-policy-binding "e2b-api-key" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT" >/dev/null

gcloud secrets add-iam-policy-binding "controller-mcp-access-token" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID" \
  --account="$NIGHTS_ACCOUNT" >/dev/null

echo "Secret uploads and least-privilege policy bindings completed successfully."
