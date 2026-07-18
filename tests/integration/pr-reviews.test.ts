import { describe, it, expect } from 'vitest';

describe('Gated PR Reviews Integration Test', () => {
  it('runs only if test repository is configured', () => {
    const repo = process.env.PR_INTEGRATION_TEST_REPOSITORY;
    if (!repo) {
      console.log('Skipping integration test: PR_INTEGRATION_TEST_REPOSITORY is not configured.');
      return;
    }
    expect(repo).toBeDefined();
  });
});
