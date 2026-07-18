#!/usr/bin/env bash
# End-to-End Staging Smoke Test Script
# Validates liveness, readiness, auth boundary, and runs MCP/E2B sandbox lifecycle test

set -euo pipefail

NIGHTS_ACCOUNT="nightsvo@gmail.com"
PROJECT_ID="e2b-agent-runtime-bf8e6a"
REGION="europe-west1"
CONFIG_NAME="e2b-agent-runtime-staging"

# Select our configuration
gcloud config configurations activate "$CONFIG_NAME" &>/dev/null

echo "=== [1/5] Retrieving Cloud Run Service Details ==="
SERVICE_URL=$(gcloud run services describe e2b-agent-runtime-staging \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)")

echo "Staging Service URL: ${SERVICE_URL}"

# Load MCP Access Token
if [ -f ~/.config/e2b-agent-runtime/staging-mcp-token ]; then
  TOKEN=$(cat ~/.config/e2b-agent-runtime/staging-mcp-token)
elif [ -f .env ]; then
  TOKEN=$(grep "^MCP_ACCESS_TOKEN=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
else
  echo "Error: No staging MCP token found in ~/.config/e2b-agent-runtime/staging-mcp-token or .env" >&2
  exit 1
fi

echo "=== [2/5] Verifying Liveness Health Endpoint ==="
LIVENESS_RES=$(curl -s -w "\nHTTP_STATUS_CODE:%{http_code}\n" --fail-with-body "${SERVICE_URL}/health/live")
echo "Liveness response:"
echo "${LIVENESS_RES}"

echo "=== [3/5] Verifying Readiness Health Endpoint ==="
READINESS_RES=$(curl -s -w "\nHTTP_STATUS_CODE:%{http_code}\n" --fail-with-body "${SERVICE_URL}/health/ready")
echo "Readiness response:"
echo "${READINESS_RES}"

echo "=== [4/5] Verifying Unauthenticated Request Rejection ==="
# Send unauthenticated POST request to /mcp and ensure it is rejected with 401
UNAUTH_RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${SERVICE_URL}/mcp")
echo "Unauthenticated /mcp POST HTTP Status (Expected: 401): ${UNAUTH_RES}"
if [ "${UNAUTH_RES}" != "401" ]; then
  echo "Error: Security boundary failed! Unauthenticated /mcp request was not rejected with HTTP 401. Status: ${UNAUTH_RES}" >&2
  exit 1
fi
echo "Security boundary verified. Unauthenticated requests are rejected successfully."

echo "=== [5/5] Running Authenticated MCP & Sandbox Smoke Test ==="
# Turn off trace during execution if any was on
set +x
# Execute the Node smoke-test-runner
npx tsx scripts/gcp/smokeTestRunner.ts "${SERVICE_URL}" "${TOKEN}"

echo "=== Staging End-to-End Smoke Test Completed Successfully! ==="
