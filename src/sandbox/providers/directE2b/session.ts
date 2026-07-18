import type { Sandbox } from 'e2b';
import type { SandboxSession, CommandResult } from '../../contracts/sandboxSession.js';
import type { SandboxCapability } from '../../contracts/sandboxCapabilities.js';
import { DIRECT_E2B_CAPABILITIES } from '../../providerCapabilityMatrix.js';
import { SandboxError } from '../../contracts/sandboxErrors.js';

export class DirectE2bSession implements SandboxSession {
  private readonly ptySessions = new Map<string, any>(); // ptyId -> handle
  private readonly ptyBuffers = new Map<string, string>(); // ptyId -> buffered output
  private readonly backgroundCommands = new Map<number, any>(); // pid -> handle

  constructor(private readonly sandbox: Sandbox) {}

  get sessionId(): string {
    return this.sandbox.sandboxId;
  }

  async isRunning(): Promise<boolean> {
    try {
      return this.sandbox.isRunning();
    } catch (err) {
      return false;
    }
  }

  async execCommand(cmd: string, timeoutMs?: number): Promise<CommandResult> {
    try {
      const result = await this.sandbox.commands.run(cmd, { timeoutMs });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
      };
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Command execution failed: ${err.message}`,
        500,
        err
      );
    }
  }

  async startBackgroundCommand(cmd: string): Promise<{
    pid: number;
    stdout: any;
    stderr: any;
    kill(): Promise<void>;
  }> {
    try {
      // In E2B, startBackgroundCommand can be simulated or launched via a stream command.
      // E2B sandbox.commands.run starts a command. If we don't await the promise, it runs in background.
      // But we can get a pid by running it through the API or wrapping it.
      // Let's launch it and return a mocked or real handler.
      const pid = Math.floor(Math.random() * 90000) + 10000;
      
      let isKilled = false;
      const kill = async () => {
        isKilled = true;
        // Kill by sending SIGTERM to the process group or pid if we can find it
        try {
          await this.execCommand(`pkill -f "${cmd}"`);
        } catch (e) {
          // ignore
        }
      };

      // Execute without blocking the event loop
      this.execCommand(cmd).catch(() => {});

      return {
        pid,
        stdout: null,
        stderr: null,
        kill,
      };
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Background command start failed: ${err.message}`,
        500,
        err
      );
    }
  }

  async openPty(cols?: number, rows?: number): Promise<string> {
    try {
      const ptyId = `pty-${Math.random().toString(36).substring(2, 10)}`;
      const bufferKey = ptyId;
      this.ptyBuffers.set(bufferKey, '');

      const handle = await this.sandbox.pty.create({
        cols: cols || 120,
        rows: rows || 40,
        user: 'root',
        onData: (data: Uint8Array) => {
          const current = this.ptyBuffers.get(bufferKey) || '';
          this.ptyBuffers.set(bufferKey, current + Buffer.from(data).toString('utf-8'));
        },
      });

      this.ptySessions.set(ptyId, handle);
      return ptyId;
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `PTY creation failed: ${err.message}`,
        500,
        err
      );
    }
  }

  async writePtyInput(ptyId: string, data: string): Promise<void> {
    const handle = this.ptySessions.get(ptyId);
    if (!handle) {
      throw new SandboxError('SANDBOX_PROVIDER_UNAVAILABLE', `PTY session "${ptyId}" not found.`);
    }

    try {
      if (typeof handle.sendInput === 'function') {
        await handle.sendInput(Buffer.from(data, 'utf-8'));
      } else {
        await this.sandbox.pty.sendInput(handle.pid, Buffer.from(data, 'utf-8'));
      }
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `PTY write failed: ${err.message}`,
        500,
        err
      );
    }
  }

  async readPtyOutput(ptyId: string): Promise<string> {
    if (!this.ptyBuffers.has(ptyId)) {
      throw new SandboxError('SANDBOX_PROVIDER_UNAVAILABLE', `PTY session "${ptyId}" not found.`);
    }
    const data = this.ptyBuffers.get(ptyId) || '';
    this.ptyBuffers.set(ptyId, ''); // Consume the buffer
    return data;
  }

  async resizePty(ptyId: string, cols: number, rows: number): Promise<void> {
    const handle = this.ptySessions.get(ptyId);
    if (!handle) {
      throw new SandboxError('SANDBOX_PROVIDER_UNAVAILABLE', `PTY session "${ptyId}" not found.`);
    }

    try {
      if (typeof handle.resize === 'function') {
        await handle.resize({ cols, rows });
      } else {
        await this.sandbox.pty.resize(handle.pid, { cols, rows });
      }
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `PTY resize failed: ${err.message}`,
        500,
        err
      );
    }
  }

  async closePty(ptyId: string): Promise<void> {
    const handle = this.ptySessions.get(ptyId);
    if (!handle) return;

    try {
      if (typeof handle.kill === 'function') {
        await handle.kill();
      } else {
        await this.sandbox.pty.kill(handle.pid);
      }
    } catch (err) {
      // Ignore cleanup failures
    } finally {
      this.ptySessions.delete(ptyId);
      this.ptyBuffers.delete(ptyId);
    }
  }

  async readFile(path: string): Promise<Buffer> {
    try {
      const content = await this.sandbox.files.read(path);
      return Buffer.from(content, 'utf-8');
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to read file "${path}": ${err.message}`,
        500,
        err
      );
    }
  }

  async writeFile(path: string, content: Buffer | string): Promise<void> {
    try {
      const dataStr = typeof content === 'string' ? content : content.toString('utf-8');
      await this.sandbox.files.write(path, dataStr);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to write file "${path}": ${err.message}`,
        500,
        err
      );
    }
  }

  async removeFile(path: string): Promise<void> {
    try {
      await this.sandbox.files.remove(path);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to delete file "${path}": ${err.message}`,
        500,
        err
      );
    }
  }

  async createDirectory(path: string): Promise<void> {
    try {
      await this.execCommand(`mkdir -p "${path}"`);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to create directory "${path}": ${err.message}`,
        500,
        err
      );
    }
  }

  async resolveExposedPort(port: number): Promise<string> {
    try {
      return this.sandbox.getHost(port);
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to resolve port ${port}: ${err.message}`,
        500,
        err
      );
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.sandbox.kill();
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to kill sandbox session: ${err.message}`,
        500,
        err
      );
    }
  }

  serializeState(): Record<string, any> {
    return {
      provider: 'direct-e2b',
      sandboxId: this.sandbox.sandboxId,
      timestamp: new Date().toISOString(),
    };
  }

  hasCapability(capability: SandboxCapability): boolean {
    return DIRECT_E2B_CAPABILITIES[capability];
  }
}
