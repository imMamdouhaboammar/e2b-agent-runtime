# Incident Response Plan

This document details critical procedures to resolve service incidents.

## High-Priority Failures
### 1. Database Connection Failures
- **Symptom**: Health checks fail, `/ready` returns 503.
- **Action**: Check PostgreSQL pool saturation and database host availability. Check secrets configurations.

### 2. E2B Sandbox Metric Thresholds Exceeded
- **Symptom**: CPU or memory usage alerts.
- **Action**: Identify offending workspace. Terminate the session using:
  ```bash
  pnpm ops:drain
  ```
