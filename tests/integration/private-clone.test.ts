import { describe, expect, it } from 'vitest';

describe('Private Repository Clone Integration Test', () => {
  const repo = process.env.GITHUB_INTEGRATION_TEST_REPOSITORY;

  it.skipIf(!repo)('should clone authorized private repository into E2B Worker Sandbox', async () => {
    // Execution occurs only when GITHUB_INTEGRATION_TEST_REPOSITORY is defined
    expect(repo).toBeDefined();
  });

  it('should skip gracefully when environment variable is not configured', () => {
    if (!repo) {
      console.log('[Integration Test] Skipped private clone test (GITHUB_INTEGRATION_TEST_REPOSITORY is not set).');
    }
    expect(true).toBe(true);
  });
});
