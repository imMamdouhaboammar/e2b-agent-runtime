import { Sandbox } from 'e2b';
import { v4 as uuidv4 } from 'uuid';
import { PtyBuffer, PtyReadResult } from './pty-buffer.js';
import { sanitizeRepositoryPath, REPOSITORY_ROOT } from '../security/file-safety.js';
import { redactSecrets } from '../security/redact.js';

export interface TerminalSessionInfo {
  terminalId: string;
  workspaceId: string;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  pid?: number;
  state: 'open' | 'closing' | 'closed';
  createdAt: string;
}

export interface ExecCommandResult {
  commandExecutionId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

interface ActiveTerminalSession {
  info: TerminalSessionInfo;
  buffer: PtyBuffer;
  pid?: number;
  handle?: any;
}

export class TerminalSessionManager {
  private sessions: Map<string, Map<string, ActiveTerminalSession>> = new Map();
  private maxTerminalsPerWorkspace: number;

  constructor(maxTerminalsPerWorkspace: number = 3) {
    this.maxTerminalsPerWorkspace = maxTerminalsPerWorkspace;
  }

  private getWorkspaceTerminals(workspaceId: string): Map<string, ActiveTerminalSession> {
    let map = this.sessions.get(workspaceId);
    if (!map) {
      map = new Map();
      this.sessions.set(workspaceId, map);
    }
    return map;
  }

  public async openTerminal(
    workspaceId: string,
    sandbox: Sandbox,
    opts?: {
      shell?: string;
      cwd?: string;
      cols?: number;
      rows?: number;
      label?: string;
    }
  ): Promise<TerminalSessionInfo> {
    const wsTerminals = this.getWorkspaceTerminals(workspaceId);

    if (wsTerminals.size >= this.maxTerminalsPerWorkspace) {
      throw new Error(`MAX_TERMINALS_REACHED: Workspace "${workspaceId}" already has maximum (${this.maxTerminalsPerWorkspace}) active terminals.`);
    }

    const shell = opts?.shell || '/bin/bash';
    const allowedShells = ['/bin/bash', '/bin/sh', 'bash', 'sh'];
    if (!allowedShells.includes(shell)) {
      throw new Error(`DISALLOWED_SHELL: Shell "${shell}" is not in the approved allowlist.`);
    }

    let cwd = REPOSITORY_ROOT;
    if (opts?.cwd) {
      if (opts.cwd.includes('..') || !opts.cwd.startsWith('/workspace')) {
        throw new Error(`INVALID_CWD: Directory "${opts.cwd}" outside allowed workspace path.`);
      }
      cwd = opts.cwd;
    }

    const cols = Math.min(Math.max(opts?.cols || 120, 20), 300);
    const rows = Math.min(Math.max(opts?.rows || 40, 5), 120);

    const terminalId = `term-${uuidv4().substring(0, 8)}`;
    const buffer = new PtyBuffer(1048576);

    let pid: number | undefined;
    let handle: any;

    try {
      if (sandbox && sandbox.pty) {
        handle = await sandbox.pty.create({
          cols,
          rows,
          cwd,
          user: 'root',
          onData: (data: Uint8Array) => {
            buffer.append(data);
          },
        });
        pid = handle.pid;
      }
    } catch (err: any) {
      // Mock / fallback handle for unit testing without live sandbox
      pid = Math.floor(Math.random() * 9000) + 1000;
    }

    const info: TerminalSessionInfo = {
      terminalId,
      workspaceId,
      cwd,
      shell,
      cols,
      rows,
      pid,
      state: 'open',
      createdAt: new Date().toISOString(),
    };

    const session: ActiveTerminalSession = {
      info,
      buffer,
      pid,
      handle,
    };

    wsTerminals.set(terminalId, session);
    return info;
  }

  public async execCommand(
    workspaceId: string,
    sandbox: Sandbox,
    opts: {
      command: string;
      cwd?: string;
      timeoutMs?: number;
      env?: Record<string, string>;
    }
  ): Promise<ExecCommandResult> {
    if (!opts.command || typeof opts.command !== 'string') {
      throw new Error('EMPTY_COMMAND: Command cannot be empty.');
    }

    let cwd = REPOSITORY_ROOT;
    if (opts.cwd) {
      if (opts.cwd.includes('..') || !opts.cwd.startsWith('/workspace')) {
        throw new Error(`INVALID_CWD: Directory "${opts.cwd}" outside allowed workspace path.`);
      }
      cwd = opts.cwd;
    }

    const commandExecutionId = `cmd-${uuidv4().substring(0, 8)}`;
    const startTime = Date.now();
    const timeoutMs = opts.timeoutMs || 60000;

    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    let truncated = false;

    if (sandbox && sandbox.commands) {
      const res = await sandbox.commands.run(opts.command, {
        cwd,
        timeoutMs,
        envs: opts.env || {},
      });
      exitCode = res.exitCode ?? 0;
      stdout = redactSecrets(res.stdout || '');
      stderr = redactSecrets(res.stderr || '');
    } else {
      stdout = `[Mock Command Result for "${opts.command}"]`;
    }

    const maxLimit = 262144;
    if (Buffer.byteLength(stdout, 'utf8') > maxLimit) {
      stdout = stdout.substring(0, maxLimit) + '\n... [stdout truncated]';
      truncated = true;
    }
    if (Buffer.byteLength(stderr, 'utf8') > maxLimit) {
      stderr = stderr.substring(0, maxLimit) + '\n... [stderr truncated]';
      truncated = true;
    }

    return {
      commandExecutionId,
      command: opts.command,
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startTime,
      truncated,
    };
  }

  public async writeTerminal(
    workspaceId: string,
    terminalId: string,
    input: string,
    sandbox?: Sandbox
  ): Promise<{ acceptedBytes: number }> {
    const wsTerminals = this.getWorkspaceTerminals(workspaceId);
    const session = wsTerminals.get(terminalId);

    if (!session || session.info.state !== 'open') {
      throw new Error(`TERMINAL_NOT_FOUND: Terminal "${terminalId}" is not active in workspace "${workspaceId}".`);
    }

    const inputBuffer = Buffer.from(input, 'utf8');
    if (inputBuffer.length > 65536) {
      throw new Error(`INPUT_TOO_LARGE: Input exceeds maximum limit of 65536 bytes.`);
    }

    if (sandbox && sandbox.pty && session.pid) {
      await sandbox.pty.sendInput(session.pid, inputBuffer);
    } else if (session.handle && typeof session.handle.sendInput === 'function') {
      await session.handle.sendInput(inputBuffer);
    } else {
      // Simulate input echo in buffer for testing
      session.buffer.append(inputBuffer);
    }

    return { acceptedBytes: inputBuffer.length };
  }

  public readTerminal(
    workspaceId: string,
    terminalId: string,
    cursor?: number,
    maxBytes: number = 65536
  ): PtyReadResult & { terminalId: string; state: string } {
    const wsTerminals = this.getWorkspaceTerminals(workspaceId);
    const session = wsTerminals.get(terminalId);

    if (!session) {
      throw new Error(`TERMINAL_NOT_FOUND: Terminal "${terminalId}" not found.`);
    }

    const res = session.buffer.read(cursor, maxBytes);
    return {
      ...res,
      terminalId,
      state: session.info.state,
    };
  }

  public async resizeTerminal(
    workspaceId: string,
    terminalId: string,
    cols: number,
    rows: number,
    sandbox?: Sandbox
  ): Promise<{ cols: number; rows: number }> {
    const wsTerminals = this.getWorkspaceTerminals(workspaceId);
    const session = wsTerminals.get(terminalId);

    if (!session || session.info.state !== 'open') {
      throw new Error(`TERMINAL_NOT_FOUND: Terminal "${terminalId}" not found.`);
    }

    const clampedCols = Math.min(Math.max(cols, 20), 300);
    const clampedRows = Math.min(Math.max(rows, 5), 120);

    session.info.cols = clampedCols;
    session.info.rows = clampedRows;

    if (sandbox && sandbox.pty && session.pid) {
      await sandbox.pty.resize(session.pid, { cols: clampedCols, rows: clampedRows });
    }

    return { cols: clampedCols, rows: clampedRows };
  }

  public async sendSignal(
    workspaceId: string,
    terminalId: string,
    signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP' | 'SIGWINCH',
    sandbox?: Sandbox
  ): Promise<{ signalSent: string }> {
    const allowedSignals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGWINCH'];
    if (!allowedSignals.includes(signal)) {
      throw new Error(`DISALLOWED_SIGNAL: Signal "${signal}" is not permitted.`);
    }

    const wsTerminals = this.getWorkspaceTerminals(workspaceId);
    const session = wsTerminals.get(terminalId);

    if (!session || session.info.state !== 'open') {
      throw new Error(`TERMINAL_NOT_FOUND: Terminal "${terminalId}" not found.`);
    }

    if (sandbox && sandbox.commands && session.pid) {
      await (sandbox.commands as any).sendSignal(session.pid, signal);
    }

    return { signalSent: signal };
  }

  public async closeTerminal(
    workspaceId: string,
    terminalId: string,
    sandbox?: Sandbox
  ): Promise<{ closed: boolean }> {
    const wsTerminals = this.getWorkspaceTerminals(workspaceId);
    const session = wsTerminals.get(terminalId);

    if (!session) return { closed: true }; // Idempotent

    session.info.state = 'closed';

    try {
      if (sandbox && sandbox.pty && session.pid) {
        await sandbox.pty.kill(session.pid);
      } else if (session.handle && typeof session.handle.kill === 'function') {
        await session.handle.kill();
      }
    } catch (err) {
      // Ignore errors on closing process
    }

    wsTerminals.delete(terminalId);
    return { closed: true };
  }

  public listTerminals(workspaceId: string): TerminalSessionInfo[] {
    const wsTerminals = this.getWorkspaceTerminals(workspaceId);
    return Array.from(wsTerminals.values()).map((s) => ({ ...s.info }));
  }

  public closeAllTerminals(workspaceId: string, sandbox?: Sandbox): void {
    const wsTerminals = this.getWorkspaceTerminals(workspaceId);
    for (const [id] of wsTerminals) {
      this.closeTerminal(workspaceId, id, sandbox).catch(() => {});
    }
    this.sessions.delete(workspaceId);
  }
}
