-- Phase 9 Initial Schema Migration

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  e2b_sandbox_id VARCHAR(128) NOT NULL,
  task_label VARCHAR(256),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  state VARCHAR(32) NOT NULL,
  last_command_status VARCHAR(32),
  failure_reason TEXT,
  repository_state JSONB,
  validation_records JSONB
);

CREATE TABLE IF NOT EXISTS leases (
  lease_name VARCHAR(128) PRIMARY KEY,
  owner_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  key VARCHAR(256) PRIMARY KEY,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(128) UNIQUE NOT NULL,
  token_identifier VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at TIMESTAMPTZ,
  rate_limit_quota JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event VARCHAR(128) NOT NULL,
  actor_id VARCHAR(128),
  request_id VARCHAR(128),
  trace_id VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotas (
  token_id VARCHAR(128) NOT NULL,
  resource VARCHAR(64) NOT NULL,
  current_count INT NOT NULL DEFAULT 0,
  max_limit INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (token_id, resource)
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id VARCHAR(128) PRIMARY KEY,
  workspace_id VARCHAR(128) NOT NULL,
  repository VARCHAR(256) NOT NULL,
  task_mode VARCHAR(32) NOT NULL,
  task_label VARCHAR(256) NOT NULL,
  user_request_summary TEXT NOT NULL,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  explicit_out_of_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_issue VARCHAR(256),
  related_pull_request VARCHAR(256),
  task_state VARCHAR(32) NOT NULL,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  repair_cycle_limit INT NOT NULL DEFAULT 3,
  repair_cycle_count INT NOT NULL DEFAULT 0,
  total_command_limit INT NOT NULL DEFAULT 100,
  total_command_count INT NOT NULL DEFAULT 0,
  base_sha VARCHAR(128) NOT NULL,
  current_head_sha VARCHAR(128) NOT NULL,
  branch_name VARCHAR(128) NOT NULL,
  checkpoint_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_activity TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id VARCHAR(128) PRIMARY KEY,
  task_id VARCHAR(128) NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  workspace_id VARCHAR(128) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  repository VARCHAR(256) NOT NULL,
  default_branch VARCHAR(128) NOT NULL DEFAULT 'main',
  original_base_sha VARCHAR(128) NOT NULL,
  current_working_branch VARCHAR(128) NOT NULL,
  current_head_sha VARCHAR(128) NOT NULL,
  task_scope TEXT NOT NULL,
  explicit_untouched_scope TEXT NOT NULL,
  governance_files_read JSONB NOT NULL DEFAULT '[]'::jsonb,
  architecture_files_read JSONB NOT NULL DEFAULT '[]'::jsonb,
  important_files_and_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  commits JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_summary TEXT,
  failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  exact_next_action TEXT NOT NULL,
  plan_version INT NOT NULL,
  remaining_repair_budget INT NOT NULL,
  markdown_content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  evidence_id VARCHAR(128) PRIMARY KEY,
  task_id VARCHAR(128) NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  workspace_id VARCHAR(128) NOT NULL,
  execution_id VARCHAR(128) NOT NULL,
  command_fingerprint VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  purpose TEXT NOT NULL,
  related_step_id VARCHAR(128),
  command_summary TEXT NOT NULL,
  start_head_sha VARCHAR(128) NOT NULL,
  end_head_sha VARCHAR(128) NOT NULL,
  dirty_state_before BOOLEAN NOT NULL,
  dirty_state_after BOOLEAN NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  exit_code INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  duration_ms INT NOT NULL,
  truncated BOOLEAN NOT NULL,
  output_excerpt TEXT NOT NULL,
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  stale_reason TEXT
);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  identifier VARCHAR(256) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_timestamp ON rate_limit_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_identifier ON rate_limit_events (identifier);

-- Unique constraints index for active task per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_task_per_workspace 
ON tasks (workspace_id) 
WHERE task_state NOT IN ('COMPLETED', 'ABANDONED', 'FAILED', 'DESTROYED');

-- Unique constraint index for active Pull Request repair task per repository
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_pr_repair 
ON tasks (repository, related_pull_request) 
WHERE task_state NOT IN ('COMPLETED', 'ABANDONED', 'FAILED', 'DESTROYED') AND related_pull_request IS NOT NULL;
