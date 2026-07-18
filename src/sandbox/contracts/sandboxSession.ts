import type { SandboxCapability } from './sandboxCapabilities.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SandboxSession {
  /**
   * Unique identifier for this session/sandbox
   */
  readonly sessionId: string;

  /**
   * Checks if the sandbox session is still running
   */
  isRunning(): Promise<boolean>;

  /**
   * Executes a shell command and waits for completion
   */
  execCommand(cmd: string, timeoutMs?: number): Promise<CommandResult>;

  /**
   * Starts a background process and returns its handle (PID, etc.)
   */
  startBackgroundCommand(cmd: string): Promise<{
    pid: number;
    stdout: any; // stream or observer
    stderr: any;
    kill(): Promise<void>;
  }>;

  /**
   * Opens an interactive PTY session
   */
  openPty(cols?: number, rows?: number): Promise<string>; // returns ptyId

  /**
   * Writes input to a PTY session
   */
  writePtyInput(ptyId: string, data: string): Promise<void>;

  /**
   * Reads accumulated output from a PTY session
   */
  readPtyOutput(ptyId: string): Promise<string>;

  /**
   * Resizes a PTY terminal dimensions
   */
  resizePty(ptyId: string, cols: number, rows: number): Promise<void>;

  /**
   * Closes a PTY session
   */
  closePty(ptyId: string): Promise<void>;

  /**
   * Reads file contents as a Buffer
   */
  readFile(path: string): Promise<Buffer>;

  /**
   * Writes content to a file
   */
  writeFile(path: string, content: Buffer | string): Promise<void>;

  /**
   * Deletes a file from the sandbox
   */
  removeFile(path: string): Promise<void>;

  /**
   * Creates a directory path
   */
  createDirectory(path: string): Promise<void>;

  /**
   * Resolves a port exposed inside the sandbox to a public URL
   */
  resolveExposedPort(port: number): Promise<string>;

  /**
   * Terminates this session immediately
   */
  destroy(): Promise<void>;

  /**
   * Serializes session recovery metadata (with no credentials)
   */
  serializeState(): Record<string, any>;

  /**
   * Checks capability support for this session specifically
   */
  hasCapability(capability: SandboxCapability): boolean;
}
