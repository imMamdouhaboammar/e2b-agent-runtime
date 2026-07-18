export type ControllerErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_ACTIVE'
  | 'CONCURRENCY_LIMIT'
  | 'COMMAND_TIMEOUT'
  | 'COMMAND_FAILED'
  | 'OUTPUT_LIMIT_REACHED'
  | 'WORKER_CREATE_FAILED'
  | 'WORKER_DESTROY_FAILED'
  | 'E2B_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'TASK_NOT_FOUND'
  | 'TASK_STATE_CONFLICT'
  | 'TASK_LIMIT_EXCEEDED'
  | 'PLAN_INVALID'
  | 'PLAN_DEPENDENCY_CYCLE'
  | 'STEP_NOT_FOUND'
  | 'EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_WORKSPACE_MISMATCH'
  | 'EVIDENCE_STALE'
  | 'VALIDATION_INCOMPLETE'
  | 'VALIDATION_FAILED'
  | 'REPAIR_BUDGET_EXHAUSTED'
  | 'REPAIR_ALREADY_ACTIVE'
  | 'REPEATED_FAILURE'
  | 'CHECKPOINT_NOT_FOUND'
  | 'CHECKPOINT_DRIFT'
  | 'DIFF_TOO_LARGE'
  | 'UNPLANNED_SCOPE'
  | 'SECRET_FINDING'
  | 'WORKTREE_DIRTY'
  | 'NO_COMMITS'
  | 'BASE_BRANCH_MOVED'
  | 'PUBLICATION_NOT_READY'
  | 'COMPLETION_GATE_FAILED'
  | 'WORKER_NOT_FOUND'
  | 'INVALID_PATH'
  | 'INVALID_HYPOTHESIS'
  | 'REPAIR_NOT_ACTIVE'
  | 'CONFIRMATION_REQUIRED';

export class ControllerError extends Error {
  public readonly code: ControllerErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: ControllerErrorCode | string,
    message: string,
    statusCode = 500,
    details?: unknown
  ) {
    super(message);
    this.name = 'ControllerError';
    this.code = code as ControllerErrorCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export { ControllerError as AppError };


export function formatSafeErrorMessage(error: unknown): {
  code: ControllerErrorCode;
  message: string;
} {
  if (error instanceof ControllerError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'INTERNAL_ERROR',
    message: message || 'An internal server error occurred.',
  };
}
