import crypto from 'node:crypto';
import { evidenceLedger } from './evidence-ledger.js';
import { taskStore } from './task-store.js';
import { FailureCategory, ExecutionEvidence } from './types.js';
import { loadWorkflowLimitsConfig } from '../config.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export interface FailureClassificationResult {
  taskId: string;
  executionId: string;
  category: FailureCategory;
  confidence: number;
  evidenceId: string;
  commandSummary: string;
  likelyAffectedArea: string;
  suggestedInspectionActions: string[];
  repeatedFailureSignature: string;
  repeatCount: number;
  remainingRepairBudget: number;
  isRepeatedBlocker: boolean;
}

export class FailureClassifierService {
  public async classify(
    taskId: string,
    executionId: string,
    clientInterpretation?: string
  ): Promise<FailureClassificationResult> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const evidenceList = await evidenceLedger.listEvidence(taskId);
    const evidence = evidenceList.find((e) => e.executionId === executionId || e.evidenceId === executionId);

    if (!evidence) {
      throw new AppError(`Evidence for execution ${executionId} not found in task ${taskId}`, 'EVIDENCE_NOT_FOUND', 404);
    }

    const category = this.determineCategory(evidence, clientInterpretation);
    const confidence = 0.9;
    const likelyAffectedArea = this.extractAffectedArea(evidence);
    const suggestedInspectionActions = this.suggestActions(category, evidence);

    // Compute failure signature
    const normExcerpt = evidence.outputExcerpt
      .replace(/\d+/g, '0')
      .replace(/\s+/g, ' ')
      .slice(0, 200);

    const repeatedFailureSignature = crypto
      .createHash('sha256')
      .update(`${category}:${evidence.commandSummary}:${evidence.exitCode}:${normExcerpt}`)
      .digest('hex');

    // Count signature occurrences in evidence list
    let repeatCount = 0;
    for (const e of evidenceList) {
      if (e.status === 'failed') {
        const eNorm = e.outputExcerpt.replace(/\d+/g, '0').replace(/\s+/g, ' ').slice(0, 200);
        const sig = crypto
          .createHash('sha256')
          .update(`${this.determineCategory(e)}:${e.commandSummary}:${e.exitCode}:${eNorm}`)
          .digest('hex');
        if (sig === repeatedFailureSignature) {
          repeatCount++;
        }
      }
    }

    const limits = loadWorkflowLimitsConfig();
    const remainingRepairBudget = Math.max(0, task.repairCycleLimit - task.repairCycleCount);
    const isRepeatedBlocker = repeatCount >= limits.FAILURE_SIGNATURE_REPEAT_BLOCK;

    if (repeatCount >= limits.FAILURE_SIGNATURE_REPEAT_WARNING) {
      logger.warn(`repeated.failure_detected`, {
        taskId,
        signature: repeatedFailureSignature,
        repeatCount,
      });
    }

    logger.info('failure.classified', { taskId, category, repeatCount });

    return {
      taskId,
      executionId: evidence.executionId,
      category,
      confidence,
      evidenceId: evidence.evidenceId,
      commandSummary: evidence.commandSummary,
      likelyAffectedArea,
      suggestedInspectionActions,
      repeatedFailureSignature,
      repeatCount,
      remainingRepairBudget,
      isRepeatedBlocker,
    };
  }

  private determineCategory(evidence: ExecutionEvidence, clientInterp?: string): FailureCategory {
    const text = (evidence.outputExcerpt + ' ' + (clientInterp || '')).toLowerCase();

    if (text.includes('ts') && (text.includes('error ts') || text.includes('cannot find name') || text.includes('type'))) {
      return 'type-check';
    }
    if (text.includes('eslint') || text.includes('prettier') || text.includes('lint')) {
      return 'lint';
    }
    if (text.includes('test failed') || text.includes('assertionerror') || text.includes('expect(')) {
      return 'unit-test';
    }
    if (text.includes('module not found') || text.includes('cannot find module') || text.includes('pnpm install')) {
      return 'dependency';
    }
    if (text.includes('syntaxerror') || text.includes('parse error') || text.includes('compilation failed')) {
      return 'compilation';
    }
    if (text.includes('etimedout') || text.includes('timed out') || text.includes('timeout')) {
      return 'timeout';
    }
    if (text.includes('econnrefused') || text.includes('network error') || text.includes('fetch failed')) {
      return 'network';
    }
    if (text.includes('eacces') || text.includes('permission denied')) {
      return 'permission';
    }
    if (text.includes('merge conflict') || text.includes('automatic merge failed')) {
      return 'merge-conflict';
    }

    if (evidence.category === 'unit-test') return 'unit-test';
    if (evidence.category === 'typecheck') return 'type-check';
    if (evidence.category === 'lint') return 'lint';
    if (evidence.category === 'dependency-install') return 'dependency';

    return 'unknown';
  }

  private extractAffectedArea(evidence: ExecutionEvidence): string {
    const lines = evidence.outputExcerpt.split('\n');
    for (const line of lines) {
      if (line.includes('.ts:') || line.includes('.js:') || line.includes('.py:')) {
        return line.trim();
      }
    }
    return evidence.commandSummary;
  }

  private suggestActions(category: FailureCategory, evidence: ExecutionEvidence): string[] {
    switch (category) {
      case 'type-check':
        return ['Run typecheck locally', 'Inspect target interfaces and imports', 'Verify exported types'];
      case 'unit-test':
        return ['Run focused test runner', 'Inspect failing assertion error details', 'Check mock implementations'];
      case 'lint':
        return ['Run linter --fix command if supported', 'Check code formatting rules'];
      case 'dependency':
        return ['Check package.json and lockfile match', 'Verify missing package declaration'];
      default:
        return ['Inspect terminal execution output excerpt', 'Check recent code changes'];
    }
  }
}

export const failureClassifier = new FailureClassifierService();
