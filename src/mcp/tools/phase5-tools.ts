import { z } from 'zod';
import { taskStore } from '../../workflow/task-store.js';
import { repositoryIntelligence } from '../../workflow/repository-intelligence.js';
import { repositorySearch } from '../../workflow/repository-search.js';
import { planRegistry } from '../../workflow/plan-registry.js';
import { evidenceLedger } from '../../workflow/evidence-ledger.js';
import { failureClassifier } from '../../workflow/failure-classifier.js';
import { validationRepairManager } from '../../workflow/validation-repair-manager.js';
import { checkpointManager } from '../../workflow/checkpoint-manager.js';
import { diffReview } from '../../workflow/diff-review.js';
import { completionGateEvaluator } from '../../workflow/completion-gate.js';
import { TASK_MODES, EVIDENCE_CATEGORIES, STEP_STATUSES } from '../../workflow/types.js';
import { AppError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

export function registerPhase5Tools(server: any) {
  // 1. coding_task_start (State-changing)
  server.tool(
    'coding_task_start',
    'Starts a new coding task in an existing Phase 4 workspace.',
    {
      workspaceId: z.string().describe('ID of existing workspace'),
      repository: z.string().describe('Repository identifier'),
      taskMode: z.enum(TASK_MODES).describe('Task mode classification'),
      taskLabel: z.string().describe('Short task label'),
      userRequest: z.string().describe('User request description'),
      acceptanceCriteria: z.array(z.string()).optional().describe('Acceptance criteria list'),
      explicitOutOfScope: z.array(z.string()).optional().describe('Explicit out-of-scope items'),
      relatedIssue: z.string().optional(),
      relatedPullRequest: z.string().optional(),
      repairCycleLimit: z.number().int().optional(),
      commandLimit: z.number().int().optional(),
    },
    async (params: any) => {
      const task = await taskStore.createTask({
        workspaceId: params.workspaceId,
        repository: params.repository,
        taskMode: params.taskMode,
        taskLabel: params.taskLabel,
        userRequestSummary: params.userRequest,
        acceptanceCriteria: params.acceptanceCriteria,
        explicitOutOfScope: params.explicitOutOfScope,
        relatedIssue: params.relatedIssue,
        relatedPullRequest: params.relatedPullRequest,
        repairCycleLimit: params.repairCycleLimit,
        totalCommandLimit: params.commandLimit,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                taskId: task.taskId,
                workspaceId: task.workspaceId,
                taskMode: task.taskMode,
                taskState: task.taskState,
                repairCycleLimit: task.repairCycleLimit,
                totalCommandLimit: task.totalCommandLimit,
                requiredDiscovery: 'Run repository_intelligence_scan to inspect repo structure',
                nextRecommendedAction: 'Run repository_intelligence_scan',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 2. coding_task_get (Read-only)
  server.tool(
    'coding_task_get',
    'Retrieves detailed state and summary of a coding task.',
    {
      taskId: z.string().describe('Task ID'),
    },
    async (params: any) => {
      const task = await taskStore.getTask(params.taskId);
      if (!task) throw new AppError(`Task ${params.taskId} not found`, 'TASK_NOT_FOUND', 404);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    }
  );

  // 3. repository_intelligence_scan (Read-only with repo process execution)
  server.tool(
    'repository_intelligence_scan',
    'Intelligently scans the workspace repository structure, manifests, and commands.',
    {
      taskId: z.string().describe('Task ID'),
      depth: z.number().int().optional().default(2),
      includeGenerated: z.boolean().optional().default(false),
      includeWorkflows: z.boolean().optional().default(true),
    },
    async (params: any) => {
      const report = await repositoryIntelligence.scan(
        params.taskId,
        params.depth,
        params.includeGenerated,
        params.includeWorkflows
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    }
  );

  // 4. repository_intelligence_get (Read-only)
  server.tool(
    'repository_intelligence_get',
    'Gets a specific section of the repository intelligence report.',
    {
      taskId: z.string().describe('Task ID'),
      section: z.string().optional().describe('Section name (overview, structure, commands, tests, etc.)'),
    },
    async (params: any) => {
      const data = await repositoryIntelligence.getSection(params.taskId, params.section);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // 5. repository_search (Read-only)
  server.tool(
    'repository_search',
    'Searches file content using safe ripgrep within the bound repository.',
    {
      taskId: z.string().describe('Task ID'),
      query: z.string().describe('Search query'),
      paths: z.array(z.string()).optional().default([]),
      fileGlobs: z.array(z.string()).optional().default([]),
      maxResults: z.number().int().optional().default(100),
      contextLines: z.number().int().optional().default(2),
      caseSensitive: z.boolean().optional().default(false),
      literal: z.boolean().optional().default(true),
    },
    async (params: any) => {
      const res = await repositorySearch.search(
        params.taskId,
        params.query,
        params.paths,
        params.fileGlobs,
        params.maxResults,
        params.contextLines,
        params.caseSensitive,
        params.literal
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
  );

  // 6. repository_find_files (Read-only)
  server.tool(
    'repository_find_files',
    'Finds files matching patterns within the repository.',
    {
      taskId: z.string().describe('Task ID'),
      namePattern: z.string().optional(),
      pathPattern: z.string().optional(),
      extensions: z.array(z.string()).optional().default([]),
      maxResults: z.number().int().optional().default(100),
    },
    async (params: any) => {
      const res = await repositorySearch.findFiles(
        params.taskId,
        params.namePattern,
        params.pathPattern,
        params.extensions,
        params.maxResults
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
  );

  // 7. repository_symbol_search (Read-only)
  server.tool(
    'repository_symbol_search',
    'Searches for code symbols (functions, classes, interfaces) with confidence rating.',
    {
      taskId: z.string().describe('Task ID'),
      symbol: z.string().describe('Symbol name to search for'),
      language: z.string().optional(),
      paths: z.array(z.string()).optional().default([]),
      maxResults: z.number().int().optional().default(50),
    },
    async (params: any) => {
      const res = await repositorySearch.symbolSearch(
        params.taskId,
        params.symbol,
        params.language,
        params.paths,
        params.maxResults
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
  );

  // 8. coding_plan_set (State-changing)
  server.tool(
    'coding_plan_set',
    'Sets or updates the structured plan for a coding task.',
    {
      taskId: z.string(),
      confirmedProblem: z.string(),
      intendedChange: z.string(),
      untouchedScope: z.string(),
      verificationMethod: z.string(),
      steps: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
          expectedEvidence: z.string().optional(),
          dependencies: z.array(z.string()).optional(),
          status: z.enum(STEP_STATUSES).optional(),
        })
      ),
    },
    async (params: any) => {
      const plan = await planRegistry.setPlan(
        params.taskId,
        params.confirmedProblem,
        params.intendedChange,
        params.untouchedScope,
        params.verificationMethod,
        params.steps
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(plan, null, 2),
          },
        ],
      };
    }
  );

  // 9. coding_plan_update_step (State-changing)
  server.tool(
    'coding_plan_update_step',
    'Updates the status and evidence references for a step in the task plan.',
    {
      taskId: z.string(),
      stepId: z.string(),
      status: z.enum(STEP_STATUSES),
      evidenceRefs: z.array(z.string()).optional(),
      blocker: z.string().optional(),
      note: z.string().optional(),
    },
    async (params: any) => {
      const plan = await planRegistry.updateStep(
        params.taskId,
        params.stepId,
        params.status,
        params.evidenceRefs,
        params.blocker,
        params.note
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(plan, null, 2),
          },
        ],
      };
    }
  );

  // 10. coding_plan_get (Read-only)
  server.tool(
    'coding_plan_get',
    'Gets the current plan for a coding task.',
    {
      taskId: z.string(),
    },
    async (params: any) => {
      const plan = await planRegistry.getPlan(params.taskId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(plan, null, 2),
          },
        ],
      };
    }
  );

  // 11. execution_record_command (State-changing)
  server.tool(
    'execution_record_command',
    'Associates a terminal execution with a task as official evidence.',
    {
      taskId: z.string(),
      executionId: z.string(),
      category: z.enum(EVIDENCE_CATEGORIES),
      purpose: z.string().optional(),
      relatedStepId: z.string().optional(),
      expectedOutcome: z.string().optional(),
    },
    async (params: any) => {
      const ev = await evidenceLedger.recordCommand(params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(ev, null, 2),
          },
        ],
      };
    }
  );

  // 12. execution_list_evidence (Read-only)
  server.tool(
    'execution_list_evidence',
    'Lists recorded execution evidence for a task.',
    {
      taskId: z.string(),
      category: z.enum(EVIDENCE_CATEGORIES).optional(),
      status: z.string().optional(),
      limit: z.number().int().optional().default(100),
    },
    async (params: any) => {
      const list = await evidenceLedger.listEvidence(params.taskId, params.category, params.status, params.limit);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(list, null, 2),
          },
        ],
      };
    }
  );

  // 13. validation_plan_detect (Read-only)
  server.tool(
    'validation_plan_detect',
    'Proposes validation commands based on repository intelligence and modified paths.',
    {
      taskId: z.string(),
      targetPaths: z.array(z.string()).optional().default([]),
      taskMode: z.enum(TASK_MODES).optional(),
    },
    async (params: any) => {
      const plan = await validationRepairManager.detectValidationPlan(params.taskId, params.targetPaths, params.taskMode);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(plan, null, 2),
          },
        ],
      };
    }
  );

  // 14. validation_cycle_start (State-changing)
  server.tool(
    'validation_cycle_start',
    'Starts a new validation cycle for a task.',
    {
      taskId: z.string(),
      plannedCategories: z.array(z.enum(EVIDENCE_CATEGORIES)),
      cycleLabel: z.string().optional(),
    },
    async (params: any) => {
      const cycle = await validationRepairManager.startValidationCycle(params.taskId, params.plannedCategories, params.cycleLabel);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cycle, null, 2),
          },
        ],
      };
    }
  );

  // 15. validation_cycle_complete (State-changing)
  server.tool(
    'validation_cycle_complete',
    'Completes a validation cycle using recorded execution evidence.',
    {
      taskId: z.string(),
      cycleId: z.string(),
      evidenceIds: z.array(z.string()),
      summary: z.string().optional(),
    },
    async (params: any) => {
      const cycle = await validationRepairManager.completeValidationCycle(
        params.taskId,
        params.cycleId,
        params.evidenceIds,
        params.summary
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cycle, null, 2),
          },
        ],
      };
    }
  );

  // 16. validation_get_status (Read-only)
  server.tool(
    'validation_get_status',
    'Gets the current validation status and repair budget for a task.',
    {
      taskId: z.string(),
    },
    async (params: any) => {
      const status = await validationRepairManager.getValidationStatus(params.taskId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );

  // 17. failure_classify (Read-only with classification state metadata)
  server.tool(
    'failure_classify',
    'Classifies execution failure into stable failure categories and signature.',
    {
      taskId: z.string(),
      executionId: z.string(),
      clientInterpretation: z.string().optional(),
    },
    async (params: any) => {
      const res = await failureClassifier.classify(params.taskId, params.executionId, params.clientInterpretation);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
  );

  // 18. repair_attempt_start (State-changing)
  server.tool(
    'repair_attempt_start',
    'Starts a bounded repair attempt following a failed validation cycle.',
    {
      taskId: z.string(),
      cycleId: z.string(),
      failureEvidenceIds: z.array(z.string()),
      hypothesis: z.string().describe('Non-empty bounded repair hypothesis'),
      intendedInspection: z.string().optional(),
      intendedChangeScope: z.string().optional(),
    },
    async (params: any) => {
      const attempt = await validationRepairManager.startRepairAttempt(
        params.taskId,
        params.cycleId,
        params.failureEvidenceIds,
        params.hypothesis,
        params.intendedInspection,
        params.intendedChangeScope
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(attempt, null, 2),
          },
        ],
      };
    }
  );

  // 19. repair_attempt_complete (State-changing)
  server.tool(
    'repair_attempt_complete',
    'Completes a repair attempt and records changed files.',
    {
      taskId: z.string(),
      repairAttemptId: z.string(),
      inspectedPaths: z.array(z.string()),
      changedPaths: z.array(z.string()),
      result: z.enum(['changed', 'no-change', 'blocked', 'abandoned']),
      decisionSummary: z.string().optional(),
    },
    async (params: any) => {
      const attempt = await validationRepairManager.completeRepairAttempt(
        params.taskId,
        params.repairAttemptId,
        params.inspectedPaths,
        params.changedPaths,
        params.result,
        params.decisionSummary
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(attempt, null, 2),
          },
        ],
      };
    }
  );

  // 20. coding_checkpoint_create (State-changing)
  server.tool(
    'coding_checkpoint_create',
    'Creates a compact, sanitized checkpoint of current task progress.',
    {
      taskId: z.string(),
      reason: z.string(),
      decisions: z.array(z.string()),
      inspectedPaths: z.array(z.string()),
      importantSymbols: z.array(z.string()),
      currentHypotheses: z.array(z.string()),
      blockers: z.array(z.string()),
      risks: z.array(z.string()),
      exactNextAction: z.string(),
    },
    async (params: any) => {
      const cp = await checkpointManager.createCheckpoint(params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cp, null, 2),
          },
        ],
      };
    }
  );

  // 21. coding_checkpoint_get (Read-only)
  server.tool(
    'coding_checkpoint_get',
    'Gets details of a task checkpoint.',
    {
      taskId: z.string(),
      checkpointId: z.string(),
    },
    async (params: any) => {
      const cp = await checkpointManager.getCheckpoint(params.taskId, params.checkpointId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cp, null, 2),
          },
        ],
      };
    }
  );

  // 22. coding_checkpoint_list (Read-only)
  server.tool(
    'coding_checkpoint_list',
    'Lists checkpoint metadata for a task.',
    {
      taskId: z.string(),
    },
    async (params: any) => {
      const list = await checkpointManager.listCheckpoints(params.taskId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(list, null, 2),
          },
        ],
      };
    }
  );

  // 23. coding_task_resume (State-changing)
  server.tool(
    'coding_task_resume',
    'Resumes a task from a checkpoint with drift detection.',
    {
      taskId: z.string(),
      checkpointId: z.string(),
    },
    async (params: any) => {
      const res = await checkpointManager.resumeTask(params.taskId, params.checkpointId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
  );

  // 24. coding_diff_review (Read-only)
  server.tool(
    'coding_diff_review',
    'Reviews working tree git diff, unplanned files, secret findings, and scope expansion.',
    {
      taskId: z.string(),
      includePatch: z.boolean().optional().default(false),
      maxPatchBytes: z.number().int().optional().default(524288),
    },
    async (params: any) => {
      const review = await diffReview.reviewDiff(params.taskId, params.includePatch, params.maxPatchBytes);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(review, null, 2),
          },
        ],
      };
    }
  );

  // 25. coding_completion_gate (Read-only with state transition on success)
  server.tool(
    'coding_completion_gate',
    'Evaluates all completion gates before Phase 3 publication preflight.',
    {
      taskId: z.string(),
      acknowledgeUnavailableChecks: z.boolean().optional().default(false),
      unavailableCheckReasons: z.array(z.string()).optional().default([]),
    },
    async (params: any) => {
      const res = await completionGateEvaluator.evaluate(
        params.taskId,
        params.acknowledgeUnavailableChecks,
        params.unavailableCheckReasons
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }
  );

  // 26. coding_pr_handoff_prepare (Read-only)
  server.tool(
    'coding_pr_handoff_prepare',
    'Prepares a structured Pull Request handoff markdown document.',
    {
      taskId: z.string(),
    },
    async (params: any) => {
      const handoff = await completionGateEvaluator.preparePrHandoff(params.taskId);
      return {
        content: [
          {
            type: 'text',
            text: handoff,
          },
        ],
      };
    }
  );

  // 27. coding_task_abandon (State-changing)
  server.tool(
    'coding_task_abandon',
    'Abandons a coding task with explicit confirmation.',
    {
      taskId: z.string(),
      confirm: z.boolean().describe('Must be true to confirm abandonment'),
      reason: z.string(),
      destroyWorkspace: z.boolean().optional().default(false),
    },
    async (params: any) => {
      if (!params.confirm) {
        throw new AppError('Confirmation required (confirm: true) to abandon task', 'CONFIRMATION_REQUIRED', 400);
      }

      await taskStore.updateTask(params.taskId, (t) => {
        t.taskState = 'ABANDONED';
        t.blockers.push(`Abandoned: ${params.reason}`);
        return t;
      });

      logger.info('coding.task.abandoned', { taskId: params.taskId, reason: params.reason });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ taskId: params.taskId, status: 'ABANDONED', reason: params.reason }, null, 2),
          },
        ],
      };
    }
  );
}
