# Backup and Restore Runbook

This document details the strategy and procedure for backing up and restoring the PostgreSQL durable Controller state.

## Backup Frequency & Retention
- **Frequency**: Automated daily snapshot backups.
- **Retention**: Keep historical backups for 30 days.

## Restore Drill Procedure
The gated restore verification procedure must be executed on an isolated test database to verify backup integrity:
1. Create an isolated test database (e.g. `test_restore_db`).
2. Restore the latest PostgreSQL snapshot:
   ```bash
   pg_restore -d test_restore_db backup_file.dump
   ```
3. Run migrations to verify schema integrity:
   ```bash
   pnpm db:migrate
   ```
4. Confirm sample counts and foreign keys.
5. Archive/Destroy the test database safely.
