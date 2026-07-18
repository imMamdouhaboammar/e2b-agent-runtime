import { v4 as uuidv4 } from 'uuid';
import { ControllerError } from '../shared/errors.js';
import type { BrowserVerificationCycleRecord } from './types.js';
import { logger } from '../shared/logger.js';

export class VerificationCycleManager {
  private cycles = new Map<string, BrowserVerificationCycleRecord>();

  public startCycle(params: {
    taskId: string;
    browserSessionId: string;
    label: string;
    startHeadSha: string;
    previewId: string;
    processId?: string;
    expectedFlows: string[];
    expectedAssertions: string[];
  }): BrowserVerificationCycleRecord {
    const cycleId = `bcyc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const startedAt = new Date().toISOString();

    const record: BrowserVerificationCycleRecord = {
      cycleId,
      taskId: params.taskId,
      browserSessionId: params.browserSessionId,
      label: params.label,
      startHeadSha: params.startHeadSha,
      previewId: params.previewId,
      processId: params.processId,
      expectedFlows: params.expectedFlows,
      expectedAssertions: params.expectedAssertions,
      evidenceIds: [],
      status: 'in-progress',
      consoleErrors: 0,
      pageErrors: 0,
      networkFailures: 0,
      accessibilityFindings: 0,
      startedAt,
    };

    this.cycles.set(cycleId, record);
    logger.info('browser.verification_cycle.started', { cycleId, taskId: params.taskId, label: params.label });

    return record;
  }

  public completeCycle(params: {
    taskId: string;
    cycleId: string;
    endHeadSha: string;
    evidenceIds: string[];
    consoleErrors?: number;
    pageErrors?: number;
    networkFailures?: number;
    accessibilityFindings?: number;
    summary?: string;
  }): BrowserVerificationCycleRecord {
    const cycle = this.cycles.get(params.cycleId);
    if (!cycle || cycle.taskId !== params.taskId) {
      throw new ControllerError('INVALID_INPUT', `Verification cycle "${params.cycleId}" not found for task "${params.taskId}".`, 404);
    }

    if (cycle.startHeadSha !== params.endHeadSha) {
      cycle.status = 'incomplete';
      cycle.summary = `Stale evidence: Repository head SHA moved from ${cycle.startHeadSha.slice(0, 7)} to ${params.endHeadSha.slice(0, 7)} during cycle.`;
    } else {
      cycle.endHeadSha = params.endHeadSha;
      cycle.evidenceIds = params.evidenceIds;
      cycle.consoleErrors = params.consoleErrors || 0;
      cycle.pageErrors = params.pageErrors || 0;
      cycle.networkFailures = params.networkFailures || 0;
      cycle.accessibilityFindings = params.accessibilityFindings || 0;
      cycle.completedAt = new Date().toISOString();

      const hasFailures = cycle.consoleErrors > 0 || cycle.pageErrors > 0 || cycle.networkFailures > 0;
      cycle.status = hasFailures ? 'failed' : 'passed';
      cycle.summary = params.summary || (hasFailures ? 'Verification cycle completed with detected errors.' : 'Verification cycle passed all assertions.');
    }

    logger.info('browser.verification_cycle.completed', { cycleId: params.cycleId, status: cycle.status });
    return cycle;
  }

  public getCycle(cycleId: string): BrowserVerificationCycleRecord | undefined {
    return this.cycles.get(cycleId);
  }

  public getTaskVerificationState(taskId: string, currentHeadSha?: string): {
    cycles: BrowserVerificationCycleRecord[];
    isStale: boolean;
    hasPassedCycle: boolean;
    staleReason?: string;
  } {
    const taskCycles: BrowserVerificationCycleRecord[] = [];
    for (const c of this.cycles.values()) {
      if (c.taskId === taskId) {
        taskCycles.push({ ...c });
      }
    }

    const latestCycle = taskCycles[taskCycles.length - 1];
    if (!latestCycle) {
      return { cycles: [], isStale: true, hasPassedCycle: false, staleReason: 'No browser verification cycle executed.' };
    }

    let isStale = false;
    let staleReason: string | undefined;

    if (currentHeadSha && latestCycle.startHeadSha !== currentHeadSha) {
      isStale = true;
      staleReason = `Head SHA changed from ${latestCycle.startHeadSha.slice(0, 7)} to ${currentHeadSha.slice(0, 7)}.`;
    }

    const hasPassedCycle = !isStale && latestCycle.status === 'passed';

    return { cycles: taskCycles, isStale, hasPassedCycle, staleReason };
  }
}
