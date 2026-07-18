import { redactSecrets } from '../security/redact.js';

export interface LogRecord {
  event: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  requestId?: string;
  sessionId?: string;
  sandboxId?: string;
  port?: number;
  taskLabel?: string;
  mcpEndpoint?: string;
  durationMs?: number;
  result?: string;
  details?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

class Logger {
  private activeSecrets: (string | undefined)[] = [];

  public registerSecret(secret: string | undefined): void {
    if (secret && secret.trim().length > 0) {
      this.activeSecrets.push(secret);
    }
  }

  private formatOutput(record: LogRecord): string {
    const jsonString = JSON.stringify(record);
    return redactSecrets(jsonString, this.activeSecrets);
  }

  public info(event: string, meta: Partial<LogRecord> = {}): void {
    const record: LogRecord = {
      event,
      timestamp: new Date().toISOString(),
      level: 'info',
      ...meta,
    };
    console.log(this.formatOutput(record));
  }

  public warn(event: string, meta: Partial<LogRecord> = {}): void {
    const record: LogRecord = {
      event,
      timestamp: new Date().toISOString(),
      level: 'warn',
      ...meta,
    };
    console.warn(this.formatOutput(record));
  }

  public error(event: string, meta: Partial<LogRecord> = {}): void {
    const record: LogRecord = {
      event,
      timestamp: new Date().toISOString(),
      level: 'error',
      ...meta,
    };
    console.error(this.formatOutput(record));
  }

  public debug(event: string, meta: Partial<LogRecord> = {}): void {
    const record: LogRecord = {
      event,
      timestamp: new Date().toISOString(),
      level: 'debug',
      ...meta,
    };
    console.debug(this.formatOutput(record));
  }
}

export const logger = new Logger();
