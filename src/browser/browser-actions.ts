import type { Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { ControllerError } from '../shared/errors.js';
import type { TargetInput } from './types.js';
import type { PageInspector } from './page-inspector.js';

export class BrowserActions {
  constructor(private inspector: PageInspector) {}

  public async click(params: {
    pageId: string;
    page: Page;
    target: TargetInput;
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    timeoutMs?: number;
  }): Promise<{ url: string; strategyUsed: string }> {
    const { pageId, page, target, button = 'left', clickCount = 1, timeoutMs = 30000 } = params;
    const { locator, strategy } = this.inspector.resolveLocator(pageId, page, target);

    try {
      await locator.click({ button, clickCount, timeout: timeoutMs });
      return { url: page.url(), strategyUsed: strategy };
    } catch (err) {
      throw new ControllerError(
        'ACTION_TIMEOUT',
        `Click action on target (${strategy}) failed or timed out: ${err instanceof Error ? err.message : String(err)}`,
        500
      );
    }
  }

  public async fill(params: {
    pageId: string;
    page: Page;
    target: TargetInput;
    value: string;
    sensitive?: boolean;
    timeoutMs?: number;
  }): Promise<{ fieldState: string; strategyUsed: string; isRedacted: boolean }> {
    const { pageId, page, target, value, sensitive = false, timeoutMs = 30000 } = params;
    const { locator, strategy } = this.inspector.resolveLocator(pageId, page, target);

    const isPassword = (target.name && target.name.toLowerCase().includes('password')) || sensitive;

    try {
      await locator.fill(value, { timeout: timeoutMs });
      return {
        fieldState: isPassword ? '[REDACTED]' : value.slice(0, 50),
        strategyUsed: strategy,
        isRedacted: isPassword,
      };
    } catch (err) {
      throw new ControllerError(
        'ACTION_TIMEOUT',
        `Fill action on target (${strategy}) failed or timed out: ${err instanceof Error ? err.message : String(err)}`,
        500
      );
    }
  }

  public async press(params: {
    pageId: string;
    page: Page;
    target?: TargetInput;
    key: string;
    timeoutMs?: number;
  }): Promise<{ url: string; key: string }> {
    const { pageId, page, target, key, timeoutMs = 30000 } = params;

    if (target) {
      const { locator, strategy } = this.inspector.resolveLocator(pageId, page, target);
      await locator.press(key, { timeout: timeoutMs }).catch((err) => {
        throw new ControllerError('ACTION_TIMEOUT', `Press key "${key}" on target (${strategy}) failed: ${err.message}`, 500);
      });
    } else {
      await page.keyboard.press(key).catch((err) => {
        throw new ControllerError('ACTION_TIMEOUT', `Keyboard press key "${key}" failed: ${err.message}`, 500);
      });
    }

    return { url: page.url(), key };
  }

  public async selectOption(params: {
    pageId: string;
    page: Page;
    target: TargetInput;
    values: string[];
    timeoutMs?: number;
  }): Promise<{ selected: string[]; strategyUsed: string }> {
    const { pageId, page, target, values, timeoutMs = 30000 } = params;
    const { locator, strategy } = this.inspector.resolveLocator(pageId, page, target);

    try {
      const selected = await locator.selectOption(values, { timeout: timeoutMs });
      return { selected, strategyUsed: strategy };
    } catch (err) {
      throw new ControllerError('ACTION_TIMEOUT', `Select option on target (${strategy}) failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  }

  public async check(params: {
    pageId: string;
    page: Page;
    target: TargetInput;
    checked: boolean;
    timeoutMs?: number;
  }): Promise<{ checked: boolean; strategyUsed: string }> {
    const { pageId, page, target, checked, timeoutMs = 30000 } = params;
    const { locator, strategy } = this.inspector.resolveLocator(pageId, page, target);

    try {
      if (checked) {
        await locator.check({ timeout: timeoutMs });
      } else {
        await locator.uncheck({ timeout: timeoutMs });
      }
      return { checked, strategyUsed: strategy };
    } catch (err) {
      throw new ControllerError('ACTION_TIMEOUT', `Check/uncheck on target (${strategy}) failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  }

  public async uploadFile(params: {
    pageId: string;
    page: Page;
    target: TargetInput;
    workspacePaths: string[];
    workspaceRoot?: string;
    timeoutMs?: number;
  }): Promise<{ filesUploaded: { name: string; size: number }[]; strategyUsed: string }> {
    const { pageId, page, target, workspacePaths, workspaceRoot = '/workspace', timeoutMs = 30000 } = params;
    const { locator, strategy } = this.inspector.resolveLocator(pageId, page, target);

    const validatedPaths: string[] = [];
    const filesUploaded: { name: string; size: number }[] = [];

    for (const relPath of workspacePaths) {
      const absPath = path.resolve(workspaceRoot, relPath.replace(/^\//, ''));

      if (!absPath.startsWith(workspaceRoot)) {
        throw new ControllerError('INVALID_PATH', `File upload denied: Path "${relPath}" escapes workspace directory.`, 403);
      }

      if (absPath.includes('.git') || absPath.includes('.env') || absPath.includes('id_rsa')) {
        throw new ControllerError('INVALID_PATH', `File upload denied: Path "${relPath}" is a restricted secret or git file.`, 403);
      }

      try {
        const stats = fs.statSync(absPath);
        validatedPaths.push(absPath);
        filesUploaded.push({ name: path.basename(absPath), size: stats.size });
      } catch {
        throw new ControllerError('INVALID_PATH', `File upload failed: File "${relPath}" does not exist in workspace.`, 404);
      }
    }

    try {
      await locator.setInputFiles(validatedPaths, { timeout: timeoutMs });
      return { filesUploaded, strategyUsed: strategy };
    } catch (err) {
      throw new ControllerError('ACTION_TIMEOUT', `Upload file on target (${strategy}) failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  }

  public async waitFor(params: {
    pageId: string;
    page: Page;
    condition: {
      type: 'text-visible' | 'text-hidden' | 'locator-visible' | 'locator-hidden' | 'url-match' | 'title-match' | 'network-idle' | 'timeout';
      value?: string;
      target?: TargetInput;
    };
    timeoutMs?: number;
  }): Promise<{ matched: boolean; durationMs: number }> {
    const { pageId, page, condition, timeoutMs = 30000 } = params;
    const startTime = Date.now();

    try {
      switch (condition.type) {
        case 'text-visible':
          await page.getByText(condition.value || '', { exact: false }).waitFor({ state: 'visible', timeout: timeoutMs });
          break;
        case 'text-hidden':
          await page.getByText(condition.value || '', { exact: false }).waitFor({ state: 'hidden', timeout: timeoutMs });
          break;
        case 'locator-visible':
          if (condition.target) {
            const { locator } = this.inspector.resolveLocator(pageId, page, condition.target);
            await locator.waitFor({ state: 'visible', timeout: timeoutMs });
          }
          break;
        case 'locator-hidden':
          if (condition.target) {
            const { locator } = this.inspector.resolveLocator(pageId, page, condition.target);
            await locator.waitFor({ state: 'hidden', timeout: timeoutMs });
          }
          break;
        case 'url-match':
          await page.waitForURL(condition.value || '**', { timeout: timeoutMs });
          break;
        case 'title-match':
          await page.waitForFunction((expectedTitle) => document.title.includes(expectedTitle), condition.value || '', { timeout: timeoutMs });
          break;
        case 'network-idle':
          await page.waitForLoadState('networkidle', { timeout: timeoutMs });
          break;
        case 'timeout':
          const delay = Math.min(Number(condition.value) || 1000, 10000);
          await page.waitForTimeout(delay);
          break;
      }

      return { matched: true, durationMs: Date.now() - startTime };
    } catch (err) {
      throw new ControllerError('ACTION_TIMEOUT', `Wait condition "${condition.type}" failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  }
}
