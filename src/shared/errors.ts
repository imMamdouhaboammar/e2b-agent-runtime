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
  | 'CONFIRMATION_REQUIRED'
  | 'PREVIEW_NOT_FOUND'
  | 'PREVIEW_NOT_READY'
  | 'PREVIEW_PORT_NOT_ALLOWED'
  | 'BROWSER_SESSION_NOT_FOUND'
  | 'BROWSER_SESSION_LIMIT'
  | 'BROWSER_SESSION_CLOSED'
  | 'PAGE_NOT_FOUND'
  | 'PAGE_LIMIT'
  | 'NAVIGATION_DENIED'
  | 'NAVIGATION_FAILED'
  | 'REDIRECT_DENIED'
  | 'LOCATOR_NOT_FOUND'
  | 'LOCATOR_AMBIGUOUS'
  | 'ACTION_TIMEOUT'
  | 'ASSERTION_FAILED'
  | 'PAGE_ERROR_DETECTED'
  | 'CONSOLE_ERROR_DETECTED'
  | 'NETWORK_FAILURE_DETECTED'
  | 'TRACE_ALREADY_ACTIVE'
  | 'TRACE_NOT_ACTIVE'
  | 'ARTIFACT_LIMIT'
  | 'ARTIFACT_NOT_FOUND'
  | 'ARTIFACT_TOO_LARGE'
  | 'ARTIFACT_EXPIRED'
  | 'BROWSER_EVIDENCE_STALE'
  | 'BROWSER_CYCLE_INCOMPLETE'
  | 'ACCESSIBILITY_FINDINGS'
  | 'BROWSER_CRASHED'
  | 'SANDBOX_PROVIDER_UNAVAILABLE'
  | 'SANDBOX_CAPABILITY_UNSUPPORTED'
  | 'SANDBOX_PROVIDER_VERSION_INCOMPATIBLE'
  | 'SANDBOX_SESSION_RESTORE_FAILED'
  | 'SANDBOX_PROVIDER_FALLBACK_FAILED'
  | 'PR_NOT_FOUND'
  | 'PR_NOT_OPEN'
  | 'PR_NOT_AUTHORIZED'
  | 'PR_HEAD_NOT_WRITABLE'
  | 'PR_FROM_FORK_UNSUPPORTED'
  | 'PR_HEAD_SHA_MISMATCH'
  | 'PR_ALREADY_BOUND'
  | 'PR_STATE_CHANGED'
  | 'PR_REMOTE_HEAD_MOVED'
  | 'PR_BASE_MOVED'
  | 'PR_UPDATE_CONFLICT'
  | 'PR_NON_FAST_FORWARD'
  | 'PR_REPAIR_NOT_CURRENT';

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
