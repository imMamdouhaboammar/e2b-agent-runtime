import { z } from 'zod';

export const TASK_STATES = [
  'CREATED',
  'DISCOVERING',
  'PLANNING',
  'READY',
  'IMPLEMENTING',
  'VALIDATING',
  'REPAIRING',
  'REVIEWING',
  'BLOCKED',
  'READY_TO_PUBLISH',
  'PUBLISHED',
  'COMPLETED',
  'ABANDONED',
  'FAILED',
  'DESTROYED',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TASK_MODES = [
  'bug-fix',
  'feature',
  'refactor',
  'test',
  'documentation',
  'ci',
  'maintenance',
  'pr-repair',
  'repository-audit',
  'daily-improvement',
] as const;

export type TaskMode = (typeof TASK_MODES)[number];

export const STEP_STATUSES = ['pending', 'in-progress', 'completed', 'blocked', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const EVIDENCE_CATEGORIES = [
  'inspection',
  'dependency-install',
  'unit-test',
  'integration-test',
  'end-to-end-test',
  'lint',
  'typecheck',
  'build',
  'format',
  'migration',
  'package',
  'security',
  'git',
  'custom',
  'browser-navigation',
  'browser-assertion',
  'browser-console',
  'browser-page-error',
  'browser-network',
  'browser-screenshot',
  'browser-trace',
  'browser-accessibility',
  'browser-flow',
] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const FAILURE_CATEGORIES = [
  'dependency',
  'compilation',
  'type-check',
  'lint',
  'unit-test',
  'integration-test',
  'end-to-end-test',
  'environment',
  'configuration',
  'network',
  'permission',
  'timeout',
  'resource-limit',
  'flaky-suspected',
  'repository-state',
  'merge-conflict',
  'unknown',
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const DRIFT_CATEGORIES = [
  'no-drift',
  'local-head-moved',
  'worktree-changed',
  'branch-changed',
  'base-moved',
  'worker-recreated',
  'process-state-changed',
  'publication-state-changed',
  'unknown',
] as const;
export type DriftCategory = (typeof DRIFT_CATEGORIES)[number];

export const PlanStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  expectedEvidence: z.string().default(''),
  dependencies: z.array(z.string()).default([]),
  status: z.enum(STEP_STATUSES).default('pending'),
  evidenceRefs: z.array(z.string()).default([]),
  blocker: z.string().optional(),
  note: z.string().optional(),
  updatedAt: z.string().optional(),
  actorType: z.string().optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const TaskPlanSchema = z.object({
  version: z.number().int().min(1).default(1),
  confirmedProblem: z.string().default(''),
  intendedChange: z.string().default(''),
  untouchedScope: z.string().default(''),
  verificationMethod: z.string().default(''),
  steps: z.array(PlanStepSchema).default([]),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type TaskPlan = z.infer<typeof TaskPlanSchema>;

export const ExecutionEvidenceSchema = z.object({
  evidenceId: z.string(),
  taskId: z.string(),
  workspaceId: z.string(),
  executionId: z.string(),
  commandFingerprint: z.string(),
  category: z.enum(EVIDENCE_CATEGORIES),
  purpose: z.string().default(''),
  relatedStepId: z.string().optional(),
  commandSummary: z.string(),
  startHeadSha: z.string(),
  endHeadSha: z.string(),
  dirtyStateBefore: z.boolean(),
  dirtyStateAfter: z.boolean(),
  timestamp: z.string(),
  exitCode: z.number().int(),
  status: z.enum(['passed', 'failed', 'incomplete']),
  durationMs: z.number(),
  truncated: z.boolean(),
  outputExcerpt: z.string().default(''),
  isStale: z.boolean().default(false),
  staleReason: z.string().optional(),
});
export type ExecutionEvidence = z.infer<typeof ExecutionEvidenceSchema>;

export const ValidationCycleSchema = z.object({
  cycleId: z.string(),
  taskId: z.string(),
  cycleNumber: z.number().int(),
  label: z.string().default(''),
  plannedCategories: z.array(z.enum(EVIDENCE_CATEGORIES)),
  startHeadSha: z.string(),
  endHeadSha: z.string().optional(),
  startDirtyState: z.boolean(),
  endDirtyState: z.boolean().optional(),
  evidenceIds: z.array(z.string()).default([]),
  status: z.enum(['in-progress', 'passed', 'failed', 'incomplete', 'blocked']).default('in-progress'),
  failedCategories: z.array(z.enum(EVIDENCE_CATEGORIES)).default([]),
  unavailableCategories: z.array(z.string()).default([]),
  codeChangedDuringCycle: z.boolean().default(false),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  summary: z.string().optional(),
});
export type ValidationCycle = z.infer<typeof ValidationCycleSchema>;

export const RepairAttemptSchema = z.object({
  repairAttemptId: z.string(),
  taskId: z.string(),
  cycleId: z.string(),
  failureEvidenceIds: z.array(z.string()),
  hypothesis: z.string(),
  intendedInspection: z.string().default(''),
  intendedChangeScope: z.string().default(''),
  startHeadSha: z.string(),
  endHeadSha: z.string().optional(),
  startDirtyState: z.boolean(),
  endDirtyState: z.boolean().optional(),
  inspectedPaths: z.array(z.string()).default([]),
  changedPaths: z.array(z.string()).default([]),
  decisionSummary: z.string().optional(),
  result: z.enum(['active', 'changed', 'no-change', 'blocked', 'abandoned']).default('active'),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type RepairAttempt = z.infer<typeof RepairAttemptSchema>;

export const TaskCheckpointSchema = z.object({
  checkpointId: z.string(),
  taskId: z.string(),
  workspaceId: z.string(),
  reason: z.string(),
  createdAt: z.string(),
  contentHash: z.string(),
  repository: z.string(),
  defaultBranch: z.string(),
  originalBaseSha: z.string(),
  currentWorkingBranch: z.string(),
  currentHeadSha: z.string(),
  taskScope: z.string(),
  explicitUntouchedScope: z.string(),
  governanceFilesRead: z.array(z.string()),
  architectureFilesRead: z.array(z.string()),
  importantFilesAndSymbols: z.array(z.string()),
  decisions: z.array(z.string()),
  commits: z.array(z.string()),
  validationSummary: z.string(),
  failures: z.array(z.string()),
  risks: z.array(z.string()),
  exactNextAction: z.string(),
  planVersion: z.number().int(),
  remainingRepairBudget: z.number().int(),
  markdownContent: z.string(),
});
export type TaskCheckpoint = z.infer<typeof TaskCheckpointSchema>;

export const CodingTaskStateSchema = z.object({
  schemaVersion: z.number().int().default(1),
  taskId: z.string(),
  workspaceId: z.string(),
  repository: z.string(),
  taskMode: z.enum(TASK_MODES),
  taskLabel: z.string(),
  userRequestSummary: z.string(),
  acceptanceCriteria: z.array(z.string()).default([]),
  explicitOutOfScope: z.array(z.string()).default([]),
  relatedIssue: z.string().optional(),
  relatedPullRequest: z.string().optional(),
  taskState: z.enum(TASK_STATES).default('CREATED'),
  plan: TaskPlanSchema.default(() => TaskPlanSchema.parse({})),
  currentStepId: z.string().optional(),
  repairCycleCount: z.number().int().default(0),
  repairCycleLimit: z.number().int().default(3),
  repairAttemptLimitPerCycle: z.number().int().default(2),
  totalCommandCount: z.number().int().default(0),
  totalCommandLimit: z.number().int().default(100),
  filesInspected: z.array(z.string()).default([]),
  filesModified: z.array(z.string()).default([]),
  validationSummary: z.string().default('No validation executed'),
  blockers: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  checkpointIds: z.array(z.string()).default([]),
  baseSha: z.string().default(''),
  currentHeadSha: z.string().default(''),
  branchName: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastActivity: z.string(),
  activeRepairAttemptId: z.string().optional(),
  activeValidationCycleId: z.string().optional(),
});
export type CodingTaskState = z.infer<typeof CodingTaskStateSchema>;

export interface DiffReviewResult {
  summary: string;
  filesChanged: string[];
  insertions: number;
  deletions: number;
  commits: string[];
  plannedFiles: string[];
  unplannedFiles: string[];
  dependencyImpact: string[];
  architectureImpact: string[];
  schemaImpact: string[];
  publicApiImpact: string[];
  securityFindings: string[];
  generatedArtifacts: string[];
  debugArtifacts: string[];
  scopeWarnings: string[];
  blockers: string[];
  patchExcerpt?: string;
  contentHash: string;
}

export interface CompletionGateResult {
  ready: boolean;
  taskState: TaskState;
  passedGates: string[];
  failedGates: string[];
  warnings: string[];
  blockers: string[];
  requiredNextActions: string[];
  validationSummary: string;
  diffSummary: string;
  publicationPreflightSummary: string;
}

export interface WorkflowLimitsConfig {
  MAX_PLAN_STEPS: number;
  MAX_REPAIR_CYCLES: number;
  MAX_REPAIR_ATTEMPTS_PER_CYCLE: number;
  MAX_TOTAL_COMMANDS_PER_TASK: number;
  MAX_CHECKPOINTS_PER_TASK: number;
  MAX_CHANGED_FILES_WARNING: number;
  MAX_DIFF_BYTES: number;
  MAX_EVIDENCE_ITEMS: number;
  REPOSITORY_SEARCH_MAX_RESULTS: number;
  REPOSITORY_SEARCH_MAX_BYTES: number;
  REPOSITORY_INTELLIGENCE_MAX_BYTES: number;
  FAILURE_SIGNATURE_REPEAT_WARNING: number;
  FAILURE_SIGNATURE_REPEAT_BLOCK: number;
  CHECKPOINT_MAX_BYTES: number;
  TASK_SUMMARY_MAX_BYTES: number;
}
