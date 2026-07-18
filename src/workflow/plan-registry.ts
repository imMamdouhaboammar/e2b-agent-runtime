import { taskStore } from './task-store.js';
import { TaskPlan, PlanStep, StepStatus } from './types.js';
import { loadWorkflowLimitsConfig } from '../config.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export class PlanRegistryService {
  public async setPlan(
    taskId: string,
    confirmedProblem: string,
    intendedChange: string,
    untouchedScope: string,
    verificationMethod: string,
    steps: Array<{
      id: string;
      title: string;
      description?: string;
      expectedEvidence?: string;
      dependencies?: string[];
      status?: StepStatus;
    }>
  ): Promise<TaskPlan> {
    const limits = loadWorkflowLimitsConfig();

    if (steps.length > limits.MAX_PLAN_STEPS) {
      throw new AppError(
        `Plan exceeds maximum allowed steps (${steps.length} > ${limits.MAX_PLAN_STEPS})`,
        'PLAN_INVALID',
        400
      );
    }

    // Validate unique step IDs
    const stepIds = new Set<string>();
    for (const step of steps) {
      if (stepIds.has(step.id)) {
        throw new AppError(`Duplicate step ID in plan: ${step.id}`, 'PLAN_INVALID', 400);
      }
      stepIds.add(step.id);
    }

    // Validate dependencies exist and detect cycles
    const stepMap = new Map<string, typeof steps[0]>();
    for (const step of steps) stepMap.set(step.id, step);

    for (const step of steps) {
      for (const depId of step.dependencies || []) {
        if (!stepMap.has(depId)) {
          throw new AppError(`Step ${step.id} references non-existent dependency ${depId}`, 'PLAN_INVALID', 400);
        }
      }
    }

    this.detectDependencyCycles(steps);

    // Require at least one verification step
    const hasVerification = steps.some(
      (s) =>
        s.title.toLowerCase().includes('verify') ||
        s.title.toLowerCase().includes('test') ||
        s.title.toLowerCase().includes('validation') ||
        s.expectedEvidence?.toLowerCase().includes('test')
    );
    if (!hasVerification && verificationMethod.trim().length === 0) {
      throw new AppError('Plan must include at least one verification step or verification method', 'PLAN_INVALID', 400);
    }

    // Require one final diff-review step
    const hasDiffReview = steps.some(
      (s) => s.title.toLowerCase().includes('diff') || s.title.toLowerCase().includes('review')
    );
    if (!hasDiffReview) {
      steps.push({
        id: `step_${steps.length + 1}_diff_review`,
        title: 'Review Git Diff and Completion Gates',
        description: 'Verify working tree diff, ensure no secrets or unplanned files were introduced.',
        expectedEvidence: 'Clean diff review and completion gate output',
        dependencies: steps.length > 0 ? [steps[steps.length - 1].id] : [],
        status: 'pending',
      });
    }

    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const newVersion = (task.plan?.version || 0) + 1;

    const formattedSteps: PlanStep[] = steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description || '',
      expectedEvidence: s.expectedEvidence || '',
      dependencies: s.dependencies || [],
      status: s.status || 'pending',
      evidenceRefs: [],
    }));

    const newPlan: TaskPlan = {
      version: newVersion,
      confirmedProblem,
      intendedChange,
      untouchedScope,
      verificationMethod,
      steps: formattedSteps,
      updatedAt: new Date().toISOString(),
    };

    await taskStore.updateTask(taskId, (t) => {
      t.plan = newPlan;
      t.taskState = t.taskState === 'DISCOVERING' || t.taskState === 'CREATED' ? 'PLANNING' : t.taskState;
      if (t.taskState === 'PLANNING') {
        t.taskState = 'READY';
      }
      return t;
    });

    logger.info('coding.plan.created', { taskId, planVersion: newVersion, stepCount: formattedSteps.length });
    return newPlan;
  }

  public async updateStep(
    taskId: string,
    stepId: string,
    status: StepStatus,
    evidenceRefs?: string[],
    blocker?: string,
    note?: string
  ): Promise<TaskPlan> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const plan = task.plan;
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) throw new AppError(`Step ${stepId} not found in plan for task ${taskId}`, 'STEP_NOT_FOUND', 404);

    // Rule: Do not mark a validation step completed without execution evidence
    const isValidationStep =
      step.title.toLowerCase().includes('verify') ||
      step.title.toLowerCase().includes('test') ||
      step.title.toLowerCase().includes('validate');

    if (status === 'completed' && isValidationStep) {
      const hasEvidence = (evidenceRefs && evidenceRefs.length > 0) || step.evidenceRefs.length > 0;
      if (!hasEvidence) {
        throw new AppError(
          `Cannot mark validation step ${stepId} completed without execution evidence`,
          'VALIDATION_INCOMPLETE',
          400
        );
      }
    }

    const now = new Date().toISOString();
    step.status = status;
    if (evidenceRefs) {
      step.evidenceRefs = Array.from(new Set([...step.evidenceRefs, ...evidenceRefs]));
    }
    if (blocker !== undefined) step.blocker = blocker;
    if (note !== undefined) step.note = note;
    step.updatedAt = now;
    step.actorType = 'external-mcp-client';

    await taskStore.updateTask(taskId, (t) => {
      t.plan = plan;
      t.currentStepId = stepId;
      if (status === 'in-progress' && ['READY', 'PLANNING'].includes(t.taskState)) {
        t.taskState = 'IMPLEMENTING';
      }
      return t;
    });

    logger.info('coding.plan.updated', { taskId, stepId, status });
    return plan;
  }

  public async getPlan(taskId: string): Promise<TaskPlan> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);
    return task.plan;
  }

  private detectDependencyCycles(
    steps: Array<{ id: string; dependencies?: string[] }>
  ): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (id: string, path: string[]) => {
      visited.add(id);
      inStack.add(id);

      const step = steps.find((s) => s.id === id);
      for (const dep of step?.dependencies || []) {
        if (!visited.has(dep)) {
          dfs(dep, [...path, dep]);
        } else if (inStack.has(dep)) {
          throw new AppError(
            `Dependency cycle detected in plan: ${[...path, dep].join(' -> ')}`,
            'PLAN_DEPENDENCY_CYCLE',
            400
          );
        }
      }

      inStack.delete(id);
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id, [step.id]);
      }
    }
  }
}

export const planRegistry = new PlanRegistryService();
