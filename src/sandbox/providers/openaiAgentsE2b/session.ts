import type { SandboxSession, CommandResult } from '../../contracts/sandboxSession.js';
import type { SandboxCapability } from '../../contracts/sandboxCapabilities.js';
import { OPENAI_AGENTS_E2B_CAPABILITIES } from '../../providerCapabilityMatrix.js';
import { SandboxError } from '../../contracts/sandboxErrors.js';

export class OpenAIE2bSession implements SandboxSession {
  private readonly ptySessions = new Map<string, any>(); // ptyId -> handle
  private readonly ptyBuffers = new Map<string, string>(); // ptyId -> buffered output

  constructor(private readonly sdkSession: any) {}

  get sessionId(): string {
    return this.sdkSession.state?.sandboxId || this.sdkSession.sandbox?.sandboxId || 'openai-session';
  }

  private get innerSandbox(): any {
    return this.sdkSession.sandbox;
  }

  async isRunning(): Promise<boolean> {
    try {
      if (this.innerSandbox) {
        return this.innerSandbox.isRunning();
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  async execCommand(cmd: string, timeoutMs?: number): Promise<CommandResult> {
    try {
      if (this.innerSandbox && this.innerSandbox.commands) {
        const result = await this.innerSandbox.commands.run(cmd, { timeoutMs });
        return {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode ?? 0,
        };
      }

      // E2BSandboxSession has execCommand({ cmd }) which returns a string output.
      // E2BSandboxSession's execCommand internally throws if exitCode !== 0.
      const output = await this.sdkSession.execCommand({ cmd });

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
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
      const pid = Math.floor(Math.random() * 90000) + 10000;
      const kill = async () => {
        try {
          await this.execCommand(`pkill -f "${cmd}"`);
        } catch (e) {
          // ignore
        }
      };

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

      if (!this.innerSandbox || !this.innerSandbox.pty) {
        throw new Error('Inner E2B Sandbox PTY interface is not available.');
      }

      const handle = await this.innerSandbox.pty.create({
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
      if (this.innerSandbox && this.innerSandbox.pty) {
        await this.innerSandbox.pty.sendInput(handle.pid, Buffer.from(data, 'utf-8'));
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
    this.ptyBuffers.set(ptyId, '');
    return data;
  }

  async resizePty(ptyId: string, cols: number, rows: number): Promise<void> {
    const handle = this.ptySessions.get(ptyId);
    if (!handle) {
      throw new SandboxError('SANDBOX_PROVIDER_UNAVAILABLE', `PTY session "${ptyId}" not found.`);
    }

    try {
      if (this.innerSandbox && this.innerSandbox.pty) {
        await this.innerSandbox.pty.resize(handle.pid, { cols, rows });
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
      if (this.innerSandbox && this.innerSandbox.pty) {
        await this.innerSandbox.pty.kill(handle.pid);
      }
    } catch (err) {
      // Ignore
    } finally {
      this.ptySessions.delete(ptyId);
      this.ptyBuffers.delete(ptyId);
    }
  }

  async readFile(path: string): Promise<Buffer> {
    try {
      const content = await this.sdkSession.readFile({ path });
      return Buffer.isBuffer(content) ? content : Buffer.from(content);
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
      const editor = this.sdkSession.createEditor();
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      try {
        await editor.createFile({
          type: 'create_file',
          path,
          content: contentStr,
        });
      } catch (err) {
        // Fallback to update if it already exists
        await editor.updateFile({
          type: 'update_file',
          path,
          content: contentStr,
        });
      }
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
      const editor = this.sdkSession.createEditor();
      await editor.deleteFile({
        type: 'delete_file',
        path,
      });
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
      const res = await this.sdkSession.resolveExposedPort(port);
      return typeof res === 'string' ? res : res.endpoint || '';
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
      await this.sdkSession.close();
    } catch (err: any) {
      throw new SandboxError(
        'SANDBOX_PROVIDER_UNAVAILABLE',
        `Failed to close session: ${err.message}`,
        500,
        err
      );
    }
  }

  serializeState(): Record<string, any> {
    return {
      provider: 'openai-agents-e2b',
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
    };
  }

  hasCapability(capability: SandboxCapability): boolean {
    return OPENAI_AGENTS_E2B_CAPABILITIES[capability];
  }
}
