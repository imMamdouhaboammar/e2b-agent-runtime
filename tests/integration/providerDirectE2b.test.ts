import { describe, it, expect } from 'vitest';
import { DirectE2bProvider } from '../../src/sandbox/providers/directE2b/provider.js';

describe('Integration: Direct E2B Provider', () => {
  const runTest = process.env.RUN_PROVIDER_DIRECT_E2B_TEST === 'true';

  it('runs only when explicitly gated', async () => {
    if (!runTest) {
      console.log('Skipping integration test: provider-direct-e2b');
      return;
    }

    expect(process.env.E2B_API_KEY).toBeDefined();

    const provider = new DirectE2bProvider();
    const session = await provider.createSession();

    try {
      expect(session.sessionId).toBeDefined();
      expect(await session.isRunning()).toBe(true);

      const res = await session.execCommand('echo "integration-test"');
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe('integration-test');

      await session.writeFile('/workspace/test.txt', 'e2b-direct');
      const content = await session.readFile('/workspace/test.txt');
      expect(content.toString()).toBe('e2b-direct');

      await session.removeFile('/workspace/test.txt');
    } finally {
      await session.destroy();
    }
  });
});
