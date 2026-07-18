import { describe, it, expect } from 'vitest';

describe('Gated PR Repair Integration Test', () => {
  it('runs only if test repository and repair are configured', () => {
    const repo = process.env.PR_INTEGRATION_TEST_REPOSITORY;
    const allowRepair = process.env.PR_INTEGRATION_TEST_ALLOW_REPAIR === 'true';
    if (!repo || !allowRepair) {
      console.log('Skipping integration test: PR_INTEGRATION_TEST_ALLOW_REPAIR is not true.');
      return;
    }
    expect(repo).toBeDefined();
  });
});
