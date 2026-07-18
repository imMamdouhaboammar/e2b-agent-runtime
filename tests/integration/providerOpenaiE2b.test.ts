import { describe, it, expect } from 'vitest';
import { OpenAIE2bProvider } from '../../src/sandbox/providers/openaiAgentsE2b/provider.js';

describe('Integration: OpenAI Agents E2B Provider', () => {
  const runTest = process.env.RUN_PROVIDER_OPENAI_E2B_TEST === 'true';

  it('runs only when explicitly gated', async () => {
    if (!runTest) {
      console.log('Skipping integration test: provider-openai-e2b');
      return;
    }

    expect(process.env.E2B_API_KEY).toBeDefined();

    const provider = new OpenAIE2bProvider();
    const session = await provider.createSession();

    try {
      expect(session.sessionId).toBeDefined();
      expect(await session.isRunning()).toBe(true);

      const res = await session.execCommand('echo "integration-test-openai"');
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe('integration-test-openai');

      await session.writeFile('/workspace/test.txt', 'openai-e2b');
      const content = await session.readFile('/workspace/test.txt');
      expect(content.toString()).toBe('openai-e2b');

      await session.removeFile('/workspace/test.txt');
    } finally {
      await session.destroy();
    }
  });
});
