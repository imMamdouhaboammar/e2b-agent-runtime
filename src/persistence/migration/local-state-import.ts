import fs from 'node:fs';
import path from 'node:path';
import * as db from '../postgres/client.js';
import { logger } from '../../shared/logger.js';

export interface ImportOptions {
  dryRun: boolean;
  sessionsPath: string;
  tasksDir: string;
  checkpointsDir: string;
  evidenceDir: string;
}

export async function importLocalState(
  options: ImportOptions,
  databaseUrl?: string
): Promise<{
  sessionsImported: number;
  tasksImported: number;
  checkpointsImported: number;
  evidenceImported: number;
  errors: string[];
}> {
  const summary = {
    sessionsImported: 0,
    tasksImported: 0,
    checkpointsImported: 0,
    evidenceImported: 0,
    errors: [] as string[],
  };

  const pool = db.getDbPool(databaseUrl);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    logger.info('Starting local state migration...', { dryRun: options.dryRun });

    // 1. Migrate Sessions
    if (fs.existsSync(options.sessionsPath)) {
      try {
        const raw = fs.readFileSync(options.sessionsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const sessions = parsed.sessions || {};
        for (const [id, session] of Object.entries(sessions)) {
          const s = session as any;
          await client.query(
            `INSERT INTO sessions (
              session_id, e2b_sandbox_id, task_label, metadata, created_at, updated_at, expires_at, state, last_command_status, failure_reason, repository_state, validation_records
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (session_id) DO NOTHING`,
            [
              id,
              s.e2bSandboxId,
              s.taskLabel || null,
              JSON.stringify(s.metadata || {}),
              s.createdAt,
              s.updatedAt,
              s.expiresAt,
              s.state,
              s.lastCommandStatus || null,
              s.failureReason || null,
              s.repositoryState ? JSON.stringify(s.repositoryState) : null,
              s.validationRecords ? JSON.stringify(s.validationRecords) : null,
            ]
          );
          summary.sessionsImported++;
        }
      } catch (err: any) {
        summary.errors.push(`Sessions migration error: ${err.message}`);
      }
    }

    // 2. Migrate Tasks
    if (fs.existsSync(options.tasksDir)) {
      try {
        const files = fs.readdirSync(options.tasksDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const filePath = path.join(options.tasksDir, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const t = JSON.parse(raw);
          await client.query(
            `INSERT INTO tasks (
              task_id, workspace_id, repository, task_mode, task_label, user_request_summary,
              acceptance_criteria, explicit_out_of_scope, related_issue, related_pull_request,
              task_state, plan, repair_cycle_limit, repair_cycle_count, total_command_limit,
              total_command_count, base_sha, current_head_sha, branch_name, checkpoint_ids,
              blockers, validation_summary, created_at, updated_at, last_activity, version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 1)
             ON CONFLICT (task_id) DO NOTHING`,
            [
              t.taskId,
              t.workspaceId,
              t.repository,
              t.taskMode,
              t.taskLabel,
              t.userRequestSummary,
              JSON.stringify(t.acceptanceCriteria || []),
              JSON.stringify(t.explicitOutOfScope || []),
              t.relatedIssue || null,
              t.relatedPullRequest || null,
              t.taskState,
              JSON.stringify(t.plan || {}),
              t.repairCycleLimit || 3,
              t.repairCycleCount || 0,
              t.totalCommandLimit || 100,
              t.totalCommandCount || 0,
              t.baseSha || '',
              t.currentHeadSha || '',
              t.branchName || '',
              JSON.stringify(t.checkpointIds || []),
              JSON.stringify(t.blockers || []),
              t.validationSummary || null,
              t.createdAt,
              t.updatedAt,
              t.lastActivity,
            ]
          );
          summary.tasksImported++;
        }
      } catch (err: any) {
        summary.errors.push(`Tasks migration error: ${err.message}`);
      }
    }

    // 3. Migrate Checkpoints
    if (fs.existsSync(options.checkpointsDir)) {
      try {
        const taskDirs = fs
          .readdirSync(options.checkpointsDir)
          .filter((d) => fs.statSync(path.join(options.checkpointsDir, d)).isDirectory());
        for (const dir of taskDirs) {
          const checkpointFiles = fs
            .readdirSync(path.join(options.checkpointsDir, dir))
            .filter((f) => f.endsWith('.json'));
          for (const file of checkpointFiles) {
            const filePath = path.join(options.checkpointsDir, dir, file);
            const raw = fs.readFileSync(filePath, 'utf-8');
            const cp = JSON.parse(raw);
            await client.query(
              `INSERT INTO checkpoints (
                checkpoint_id, task_id, workspace_id, reason, created_at, content_hash,
                repository, default_branch, original_base_sha, current_working_branch, current_head_sha,
                task_scope, explicit_untouched_scope, governance_files_read, architecture_files_read,
                important_files_and_symbols, decisions, commits, validation_summary, failures,
                risks, exact_next_action, plan_version, remaining_repair_budget, markdown_content
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
               ON CONFLICT (checkpoint_id) DO NOTHING`,
              [
                cp.checkpointId,
                cp.taskId,
                cp.workspaceId,
                cp.reason,
                cp.createdAt,
                cp.contentHash,
                cp.repository,
                cp.defaultBranch,
                cp.originalBaseSha,
                cp.currentWorkingBranch,
                cp.currentHeadSha,
                cp.taskScope,
                cp.explicitUntouchedScope,
                JSON.stringify(cp.governanceFilesRead || []),
                JSON.stringify(cp.architectureFilesRead || []),
                JSON.stringify(cp.importantFilesAndSymbols || []),
                JSON.stringify(cp.decisions || []),
                JSON.stringify(cp.commits || []),
                cp.validationSummary || null,
                JSON.stringify(cp.failures || []),
                JSON.stringify(cp.risks || []),
                cp.exactNextAction,
                cp.planVersion,
                cp.remainingRepairBudget,
                cp.markdownContent,
              ]
            );
            summary.checkpointsImported++;
          }
        }
      } catch (err: any) {
        summary.errors.push(`Checkpoints migration error: ${err.message}`);
      }
    }

    // 4. Migrate Evidence
    if (fs.existsSync(options.evidenceDir)) {
      try {
        const files = fs.readdirSync(options.evidenceDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const filePath = path.join(options.evidenceDir, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const evidenceList = JSON.parse(raw);
          if (Array.isArray(evidenceList)) {
            for (const ev of evidenceList) {
              await client.query(
                `INSERT INTO evidence (
                  evidence_id, task_id, workspace_id, execution_id, command_fingerprint, category,
                  purpose, related_step_id, command_summary, start_head_sha, end_head_sha,
                  dirty_state_before, dirty_state_after, timestamp, exit_code, status,
                  duration_ms, truncated, output_excerpt, is_stale, stale_reason
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                 ON CONFLICT (evidence_id) DO NOTHING`,
                [
                  ev.evidenceId,
                  ev.taskId,
                  ev.workspaceId,
                  ev.executionId,
                  ev.commandFingerprint,
                  ev.category,
                  ev.purpose,
                  ev.relatedStepId || null,
                  ev.commandSummary,
                  ev.startHeadSha,
                  ev.endHeadSha,
                  ev.dirtyStateBefore,
                  ev.dirtyStateAfter,
                  ev.timestamp,
                  ev.exitCode,
                  ev.status,
                  ev.durationMs,
                  ev.truncated,
                  ev.outputExcerpt,
                  ev.isStale,
                  ev.staleReason || null,
                ]
              );
              summary.evidenceImported++;
            }
          }
        }
      } catch (err: any) {
        summary.errors.push(`Evidence migration error: ${err.message}`);
      }
    }

    if (options.dryRun) {
      logger.info('Dry run active. Rolling back state import transaction...');
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      logger.info('State import committed successfully.');
    }
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to import local state. Transaction rolled back.', { error: err.message });
    throw err;
  } finally {
    client.release();
  }

  return summary;
}
