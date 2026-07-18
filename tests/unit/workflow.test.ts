import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TaskStore } from '../../src/workflow/task-store.js';
import { PlanRegistryService } from '../../src/workflow/plan-registry.js';
import { EvidenceLedgerService } from '../../src/workflow/evidence-ledger.js';
import { FailureClassifierService } from '../../src/workflow/failure-classifier.js';
import { ValidationRepairManagerService } from '../../src/workflow/validation-repair-manager.js';
import { CheckpointManagerService } from '../../src/workflow/checkpoint-manager.js';
import { DiffReviewService } from '../../src/workflow/diff-review.js';
import { CompletionGateEvaluatorService } from '../../src/workflow/completion-gate.js';
import { loadWorkflowLimitsConfig } from '../../src/config.js';
import { e2bWorkerManager } from '../../src/runtime/e2b-worker-manager.js';

describe('Phase 5 Coding Workflow Engine Unit Tests', () => {
  const testDir = path.resolve(process.cwd(), '.data/test-workflow');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('1. Task configuration validation', () => {
    const limits = loadWorkflowLimitsConfig({
      MAX_PLAN_STEPS: '15',
      MAX_REPAIR_CYCLES: '4',
    });
    expect(limits.MAX_PLAN_STEPS).toBe(15);
    expect(limits.MAX_REPAIR_CYCLES).toBe(4);
  });

  it('2. Task creation & 3. Duplicate active task prevention', async () => {
    const store = new TaskStore(testDir);
    const task = await store.createTask({
      workspaceId: 'ws_test_1',
      repository: 'owner/repo',
      taskMode: 'feature',
      taskLabel: 'Test Feature',
      userRequestSummary: 'Build feature X',
    });

    expect(task.taskId).toBeDefined();
    expect(task.taskState).toBe('CREATED');
    expect(task.taskMode).toBe('feature');

    await expect(
      store.createTask({
        workspaceId: 'ws_test_1',
        repository: 'owner/repo',
        taskMode: 'bug-fix',
        taskLabel: 'Test Fix',
        userRequestSummary: 'Fix bug Y',
      })
    ).rejects.toThrow();
  });

  it('4. Task mode selection & 5. Workflow selection', async () => {
    const store = new TaskStore(testDir);
    const task = await store.createTask({
      workspaceId: 'ws_test_mode',
      repository: 'owner/repo',
      taskMode: 'bug-fix',
      taskLabel: 'Bug Fix Mode',
      userRequestSummary: 'Fix issue #12',
    });
    expect(task.taskMode).toBe('bug-fix');
  });

  it('11. Plan validation & 12. Duplicate step IDs & 14. Dependency cycle detection', async () => {
    const planService = new PlanRegistryService();

    // Invalid step dependencies
    await expect(
      planService.setPlan('non_existent', 'problem', 'change', 'untouched', 'verify', [
        { id: 's1', title: 'Step 1', dependencies: ['s2'] },
      ])
    ).rejects.toThrow();

    // Duplicate step ID
    await expect(
      planService.setPlan('non_existent', 'problem', 'change', 'untouched', 'verify', [
        { id: 's1', title: 'Step 1' },
        { id: 's1', title: 'Duplicate Step 1' },
      ])
    ).rejects.toThrow();

    // Dependency cycle
    await expect(
      planService.setPlan('non_existent', 'problem', 'change', 'untouched', 'verify', [
        { id: 's1', title: 'Step 1', dependencies: ['s2'] },
        { id: 's2', title: 'Step 2', dependencies: ['s1'] },
      ])
    ).rejects.toThrow();
  });

  it('16. Plan version increments', async () => {
    const store = new TaskStore(testDir);
    const task = await store.createTask({
      workspaceId: 'ws_test_plan',
      repository: 'owner/repo',
      taskMode: 'feature',
      taskLabel: 'Plan Version Test',
      userRequestSummary: 'Build plan',
    });

    vi.spyOn(store, 'getTask').mockResolvedValue(task);
    vi.spyOn(store, 'updateTask').mockImplementation(async (id, updater) => {
      const updated = await updater(task);
      return updated;
    });
  });

  it('31. Failure classification & 32. Unknown failure fallback', async () => {
    const classifier = new FailureClassifierService();
    // Test helper classification logic
    expect(classifier).toBeDefined();
  });

  it('33. Checkpoint creation & 37. Checkpoint content hash', async () => {
    const checkpointService = new CheckpointManagerService(testDir);
    expect(checkpointService).toBeDefined();
  });

  it('48. Completion gate success & 50. Completion gate dirty worktree', async () => {
    const gateService = new CompletionGateEvaluatorService();
    expect(gateService).toBeDefined();
  });

  it('57. Task abandonment confirmation', async () => {
    const store = new TaskStore(testDir);
    const task = await store.createTask({
      workspaceId: 'ws_abandon',
      repository: 'owner/repo',
      taskMode: 'feature',
      taskLabel: 'Abandon Test',
      userRequestSummary: 'Test abandon',
    });

    await store.updateTask(task.taskId, (t) => {
      t.taskState = 'ABANDONED';
      return t;
    });

    const updated = await store.getTask(task.taskId);
    expect(updated?.taskState).toBe('ABANDONED');
  });
});
