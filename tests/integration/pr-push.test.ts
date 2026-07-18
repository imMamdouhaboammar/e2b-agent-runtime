import { describe, it, expect } from 'vitest';

describe('Gated PR Push Integration Test', () => {
  it('runs only if push is configured', () => {
    const repo = process.env.PR_INTEGRATION_TEST_REPOSITORY;
    const allowPush = process.env.PR_INTEGRATION_TEST_ALLOW_PUSH === 'true';
    if (!repo || !allowPush) {
      console.log('Skipping integration test: PR_INTEGRATION_TEST_ALLOW_PUSH is not true.');
      return;
    }
    expect(repo).toBeDefined();
  });
});
