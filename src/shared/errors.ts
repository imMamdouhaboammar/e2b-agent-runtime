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
  | 'INTERNAL_ERROR';

export class ControllerError extends Error {
  public readonly code: ControllerErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: ControllerErrorCode,
    message: string,
    statusCode = 500,
    details?: unknown
  ) {
    super(message);
    this.name = 'ControllerError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

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
