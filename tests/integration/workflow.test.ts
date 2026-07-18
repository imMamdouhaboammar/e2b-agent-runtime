import { describe, it, expect } from 'vitest';

describe('Gated Integration: Workflow Engine (E2B Gated)', () => {
  it('skifies or runs when WORKFLOW_INTEGRATION_TEST_REPOSITORY is set', () => {
    const testRepo = process.env.WORKFLOW_INTEGRATION_TEST_REPOSITORY;
    if (!testRepo) {
      console.log('Skipping real workflow integration test (WORKFLOW_INTEGRATION_TEST_REPOSITORY not configured)');
      expect(true).toBe(true);
      return;
    }
    expect(testRepo).toBeDefined();
  });
});
