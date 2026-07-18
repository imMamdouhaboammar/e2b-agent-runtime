# Known Limitations and Workarounds

The following are the known minor limitations in E2B Agent Runtime MVP release candidate (`0.0.1-rc1`) and their recommended workarounds.

## 1. Sandbox Provisioning Latency

- **Issue**: Cold-starting an E2B sandbox micro-VM can sometimes take between 5 to 15 seconds depending on network congestion or E2B region load.
- **Workaround**: External clients should configure client-side request timeouts of at least 30 seconds when calling `runtime_create_session`.

## 2. In-Memory Session Storage Reset

- **Issue**: When `DATABASE_URL` is not supplied, the Session Registry falls back to JSON file storage. If deployed to a serverless platform (like Fly.dev or GCP Cloud Run) with a non-persistent disk, session states will reset on container restart.
- **Workaround**: Deploy with a valid PostgreSQL database connection URL configured in the `DATABASE_URL` environment variable for persistent staging/production.
