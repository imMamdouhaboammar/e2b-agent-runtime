# Staging Environment Teardown & Cleanup

This document provides commands to completely delete and clean up all staging resources on Google Cloud Platform to prevent any ongoing billing or resource leakage once testing is complete.

---

## Option 1: Complete Project Teardown (Recommended & Safest)

Deleting the entire GCP project is the safest and most thorough cleanup method. It instantly stops all billing, releases all IP and compute resources, and deletes all container images and Secret Manager secrets in a single command:

```bash
gcloud projects delete e2b-agent-runtime-bf8e6a \
  --account="nightsvo@gmail.com"
```

*Note: Once deleted, the project enters a 30-day "soft-deletion" state, after which it is permanently purged.*

---

## Option 2: Selective Resource Cleanup

If you want to keep the GCP project but remove only the cost-bearing services and artifacts:

### 1. Delete Cloud Run Service
Deletes the running HTTP container instances:
```bash
gcloud run services delete e2b-agent-runtime-staging \
  --region="europe-west1" \
  --project="e2b-agent-runtime-bf8e6a" \
  --account="nightsvo@gmail.com" \
  --quiet
```

### 2. Delete Artifact Registry Images
Deletes all stored Docker image layers to avoid storage charges:
```bash
gcloud artifacts repositories delete e2b-agent-runtime \
  --location="europe-west1" \
  --project="e2b-agent-runtime-bf8e6a" \
  --account="nightsvo@gmail.com" \
  --quiet
fi
```

### 3. Delete Secret Manager Secrets
Removes the API keys and tokens:
```bash
gcloud secrets delete e2b-api-key \
  --project="e2b-agent-runtime-bf8e6a" \
  --account="nightsvo@gmail.com" \
  --quiet

gcloud secrets delete controller-mcp-access-token \
  --project="e2b-agent-runtime-bf8e6a" \
  --account="nightsvo@gmail.com" \
  --quiet
```

### 4. Delete Service Account
```bash
gcloud iam service-accounts delete e2b-controller@e2b-agent-runtime-bf8e6a.iam.gserviceaccount.com \
  --project="e2b-agent-runtime-bf8e6a" \
  --account="nightsvo@gmail.com" \
  --quiet
```
