#!/usr/bin/env bash
# Secret Upload Script
# Uploads configuration secrets to Google Secret Manager and grants Accessor role to the SA

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations activate "$CONFIG_NAME" &>/dev/null

# Load environment variables from .env if present
if [ -f .env ]; then
  # Read variables cleanly without exporting them globally to avoid leak risk
  LOCAL_E2B_API_KEY=$(grep "^E2B_API_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  LOCAL_MCP_ACCESS_TOKEN=$(grep "^MCP_ACCESS_TOKEN=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  LOCAL_DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  LOCAL_SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  LOCAL_SUPABASE_PUBLISHABLE_KEY=$(grep "^SUPABASE_PUBLISHABLE_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  LOCAL_SUPABASE_SECRET_KEY=$(grep "^SUPABASE_SECRET_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  LOCAL_SUPABASE_JWKS_URL=$(grep "^SUPABASE_JWKS_URL=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
else
  LOCAL_E2B_API_KEY=""
  LOCAL_MCP_ACCESS_TOKEN=""
  LOCAL_DATABASE_URL=""
  LOCAL_SUPABASE_URL=""
  LOCAL_SUPABASE_PUBLISHABLE_KEY=""
  LOCAL_SUPABASE_SECRET_KEY=""
  LOCAL_SUPABASE_JWKS_URL=""
fi

# Fallback to current process env if available
E2B_KEY="${LOCAL_E2B_API_KEY:-${E2B_API_KEY:-}}"
MCP_TOKEN="${LOCAL_MCP_ACCESS_TOKEN:-${MCP_ACCESS_TOKEN:-}}"
DB_URL="${LOCAL_DATABASE_URL:-${DATABASE_URL:-}}"
SUPABASE_URL_VAL="${LOCAL_SUPABASE_URL:-${SUPABASE_URL:-}}"
SUPABASE_PUB_KEY="${LOCAL_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}"
SUPABASE_SEC_KEY="${LOCAL_SUPABASE_SECRET_KEY:-${SUPABASE_SECRET_KEY:-}}"
SUPABASE_JWKS="${LOCAL_SUPABASE_JWKS_URL:-${SUPABASE_JWKS_URL:-}}"

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

if [ -n "$DB_URL" ]; then
  put_secret "controller-database-url" "$DB_URL"
fi
if [ -n "$SUPABASE_URL_VAL" ]; then
  put_secret "supabase-url" "$SUPABASE_URL_VAL"
fi
if [ -n "$SUPABASE_PUB_KEY" ]; then
  put_secret "supabase-publishable-key" "$SUPABASE_PUB_KEY"
fi
if [ -n "$SUPABASE_SEC_KEY" ]; then
  put_secret "supabase-secret-key" "$SUPABASE_SEC_KEY"
fi
if [ -n "$SUPABASE_JWKS" ]; then
  put_secret "supabase-jwks-url" "$SUPABASE_JWKS"
fi

echo "=== [2/2] Granting Secret Accessor to Service Account ==="
SA_EMAIL="e2b-controller@${PROJECT_ID}.iam.gserviceaccount.com"

grant_accessor() {
  local name="$1"
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" \
    --account="$NIGHTS_ACCOUNT" >/dev/null
}

grant_accessor "e2b-api-key"
grant_accessor "controller-mcp-access-token"

if [ -n "$DB_URL" ]; then grant_accessor "controller-database-url"; fi
if [ -n "$SUPABASE_URL_VAL" ]; then grant_accessor "supabase-url"; fi
if [ -n "$SUPABASE_PUB_KEY" ]; then grant_accessor "supabase-publishable-key"; fi
if [ -n "$SUPABASE_SEC_KEY" ]; then grant_accessor "supabase-secret-key"; fi
if [ -n "$SUPABASE_JWKS" ]; then grant_accessor "supabase-jwks-url"; fi

echo "Secret uploads and least-privilege policy bindings completed successfully."
