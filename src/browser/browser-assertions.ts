import type { Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { ControllerError } from '../shared/errors.js';
import type { TargetInput } from './types.js';
import type { PageInspector } from './page-inspector.js';
import type { EvidenceCollector } from './evidence-collector.js';

export interface AssertionInput {
  type:
    | 'url-equals'
    | 'url-matches'
    | 'title-equals'
    | 'title-contains'
    | 'text-visible'
    | 'text-absent'
    | 'element-visible'
    | 'element-hidden'
    | 'element-enabled'
    | 'element-disabled'
    | 'element-checked'
    | 'element-count'
    | 'no-console-errors'
    | 'no-page-errors'
    | 'no-failed-requests'
    | 'http-status-below';
  expected?: string | number;
  target?: TargetInput;
  message?: string;
}

export interface AssertionResult {
  assertionId: string;
  type: string;
  passed: boolean;
  actual: string;
  expected: string;
  message?: string;
  evidenceId: string;
  timestamp: string;
}

export class BrowserAssertionService {
  constructor(
    private inspector: PageInspector,
    private collector: EvidenceCollector
  ) {}

  public async evaluate(params: {
    pageId: string;
    page: Page;
    browserSessionId: string;
    taskId?: string;
    assertion: AssertionInput;
  }): Promise<AssertionResult> {
    const { pageId, page, browserSessionId, taskId, assertion } = params;
    const assertionId = `assert_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const evidenceId = `ev_assert_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const timestamp = new Date().toISOString();

    let passed = false;
    let actual = '';
    const expected = String(assertion.expected ?? '');

    switch (assertion.type) {
      case 'url-equals': {
        actual = page.url();
        passed = actual === expected;
        break;
      }
      case 'url-matches': {
        actual = page.url();
        passed = new RegExp(expected).test(actual);
        break;
      }
      case 'title-equals': {
        actual = await page.title();
        passed = actual === expected;
        break;
      }
      case 'title-contains': {
        actual = await page.title();
        passed = actual.includes(expected);
        break;
      }
      case 'text-visible': {
        const textLoc = page.getByText(expected, { exact: false });
        passed = await textLoc.isVisible().catch(() => false);
        actual = passed ? `Text "${expected}" is visible` : `Text "${expected}" not visible`;
        break;
      }
      case 'text-absent': {
        const textLoc = page.getByText(expected, { exact: false });
        const visible = await textLoc.isVisible().catch(() => false);
        passed = !visible;
        actual = passed ? `Text "${expected}" is absent` : `Text "${expected}" is visible`;
        break;
      }
      case 'element-visible': {
        if (!assertion.target) throw new ControllerError('INVALID_INPUT', 'Target required for element assertion.', 400);
        const { locator } = this.inspector.resolveLocator(pageId, page, assertion.target);
        passed = await locator.isVisible().catch(() => false);
        actual = passed ? 'Element is visible' : 'Element not visible';
        break;
      }
      case 'element-hidden': {
        if (!assertion.target) throw new ControllerError('INVALID_INPUT', 'Target required for element assertion.', 400);
        const { locator } = this.inspector.resolveLocator(pageId, page, assertion.target);
        passed = await locator.isHidden().catch(() => false);
        actual = passed ? 'Element is hidden' : 'Element visible';
        break;
      }
      case 'element-enabled': {
        if (!assertion.target) throw new ControllerError('INVALID_INPUT', 'Target required for element assertion.', 400);
        const { locator } = this.inspector.resolveLocator(pageId, page, assertion.target);
        passed = await locator.isEnabled().catch(() => false);
        actual = passed ? 'Element is enabled' : 'Element disabled';
        break;
      }
      case 'element-disabled': {
        if (!assertion.target) throw new ControllerError('INVALID_INPUT', 'Target required for element assertion.', 400);
        const { locator } = this.inspector.resolveLocator(pageId, page, assertion.target);
        passed = await locator.isDisabled().catch(() => false);
        actual = passed ? 'Element is disabled' : 'Element enabled';
        break;
      }
      case 'element-checked': {
        if (!assertion.target) throw new ControllerError('INVALID_INPUT', 'Target required for element assertion.', 400);
        const { locator } = this.inspector.resolveLocator(pageId, page, assertion.target);
        passed = await locator.isChecked().catch(() => false);
        actual = passed ? 'Element is checked' : 'Element unchecked';
        break;
      }
      case 'element-count': {
        if (!assertion.target) throw new ControllerError('INVALID_INPUT', 'Target required for element assertion.', 400);
        const { locator } = this.inspector.resolveLocator(pageId, page, assertion.target);
        const count = await locator.count();
        actual = String(count);
        passed = count === Number(assertion.expected || 0);
        break;
      }
      case 'no-console-errors': {
        const errors = this.collector.getConsoleErrors(pageId);
        passed = errors.length === 0;
        actual = `Found ${errors.length} error-level console entries`;
        break;
      }
      case 'no-page-errors': {
        const errors = this.collector.getPageErrors(pageId).entries;
        passed = errors.length === 0;
        actual = `Found ${errors.length} uncaught page errors`;
        break;
      }
      case 'no-failed-requests': {
        const failures = this.collector.getNetworkFailures(pageId);
        passed = failures.length === 0;
        actual = `Found ${failures.length} failed network requests`;
        break;
      }
      case 'http-status-below': {
        const failures = this.collector.getNetworkFailures(pageId).filter((f) => f.status && f.status >= Number(expected || 400));
        passed = failures.length === 0;
        actual = `Found ${failures.length} requests with status >= ${expected}`;
        break;
      }
    }

    return {
      assertionId,
      type: assertion.type,
      passed,
      actual,
      expected,
      message: assertion.message,
      evidenceId,
      timestamp,
    };
  }
}
