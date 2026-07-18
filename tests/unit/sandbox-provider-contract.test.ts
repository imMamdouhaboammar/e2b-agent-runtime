import { describe, it, expect, vi } from 'vitest';
import { DirectE2bSession } from '../../src/sandbox/providers/directE2b/session.js';
import { OpenAIE2bSession } from '../../src/sandbox/providers/openaiAgentsE2b/session.js';

describe('Sandbox Provider Contract Mock Tests', () => {
  it('DirectE2bSession wraps and calls commands.run correctly', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
    });

    const mockSandbox = {
      sandboxId: 'sb-test-123',
      isRunning: vi.fn().mockResolvedValue(true),
      commands: {
        run: mockRun,
      },
      files: {
        read: vi.fn().mockResolvedValue('file content'),
        write: vi.fn(),
        delete: vi.fn(),
      },
      pty: {
        create: vi.fn().mockResolvedValue({ pid: 123 }),
      },
      kill: vi.fn(),
    } as any;

    const session = new DirectE2bSession(mockSandbox);
    expect(session.sessionId).toBe('sb-test-123');

    const runRes = await session.execCommand('echo hello');
    expect(mockRun).toHaveBeenCalledWith('echo hello', { timeoutMs: undefined });
    expect(runRes.stdout).toBe('hello');
    expect(runRes.exitCode).toBe(0);

    const fileContent = await session.readFile('/workspace/file.txt');
    expect(mockSandbox.files.read).toHaveBeenCalledWith('/workspace/file.txt');
    expect(fileContent.toString()).toBe('file content');
  });

  it('OpenAIE2bSession wraps and calls shell.run correctly', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      stdout: 'hello from openai',
      stderr: '',
      exitCode: 0,
    });

    const mockSdkSession = {
      sandbox: {
        sandboxId: 'sb-test-openai',
        isRunning: vi.fn().mockResolvedValue(true),
        commands: {
          run: mockRun,
        },
      },
      shell: {
        run: mockRun,
      },
      readFile: vi.fn().mockResolvedValue(Buffer.from('openai file content')),
      createEditor: vi.fn().mockReturnValue({
        createFile: vi.fn(),
        deleteFile: vi.fn(),
      }),
      pty: {
        create: vi.fn().mockResolvedValue({ pid: 456 }),
      },
      close: vi.fn(),
    } as any;

    const session = new OpenAIE2bSession(mockSdkSession);
    expect(session.sessionId).toBe('sb-test-openai');

    const runRes = await session.execCommand('echo hello');
    expect(mockRun).toHaveBeenCalledWith('echo hello', { timeoutMs: undefined });
    expect(runRes.stdout).toBe('hello from openai');

    const fileContent = await session.readFile('/workspace/file.txt');
    expect(mockSdkSession.readFile).toHaveBeenCalledWith({ path: '/workspace/file.txt' });
    expect(fileContent.toString()).toBe('openai file content');
  });
});
