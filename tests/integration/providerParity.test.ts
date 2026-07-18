import { describe, it, expect } from 'vitest';
import { DirectE2bProvider } from '../../src/sandbox/providers/directE2b/provider.js';
import { OpenAIE2bProvider } from '../../src/sandbox/providers/openaiAgentsE2b/provider.js';

describe('Integration: Sandbox Provider Parity', () => {
  const runTest = process.env.RUN_PROVIDER_PARITY_TEST === 'true';

  it('verifies parity between direct-e2b and openai-agents-e2b', async () => {
    if (!runTest) {
      console.log('Skipping integration test: provider-parity');
      return;
    }

    const directProvider = new DirectE2bProvider();
    const openaiProvider = new OpenAIE2bProvider();

    const directSession = await directProvider.createSession();
    const openaiSession = await openaiProvider.createSession();

    try {
      // 1. Check command execution output
      const cmd = 'echo "parity-check" && pwd';
      const r1 = await directSession.execCommand(cmd);
      const r2 = await openaiSession.execCommand(cmd);

      expect(r1.exitCode).toBe(r2.exitCode);
      expect(r1.stdout.trim()).toBe(r2.stdout.trim());

      // 2. Check file operations
      const testPath = '/workspace/parity-file.txt';
      await directSession.writeFile(testPath, 'hello-parity');
      await openaiSession.writeFile(testPath, 'hello-parity');

      const f1 = await directSession.readFile(testPath);
      const f2 = await openaiSession.readFile(testPath);
      expect(f1.toString()).toBe(f2.toString());

      await directSession.removeFile(testPath);
      await openaiSession.removeFile(testPath);

      // 3. Port resolution check
      const port = 8080;
      const host1 = await directSession.resolveExposedPort(port);
      const host2 = await openaiSession.resolveExposedPort(port);
      expect(host1).toBeDefined();
      expect(host2).toBeDefined();
    } finally {
      await directSession.destroy();
      await openaiSession.destroy();
    }
  });
});
