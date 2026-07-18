import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { ControllerError } from '../shared/errors.js';
import type { BrowserConfig } from '../config.ts';
import type { BrowserSessionRecord, BrowserViewport } from './types.js';
import { NavigationGuard } from './navigation-guard.js';
import type { PreviewResolver } from './preview-resolver.js';
import { logger } from '../shared/logger.js';

export interface ActivePageHandle {
  pageId: string;
  page: Page;
  currentUrl: string;
  createdAt: string;
}

export interface ActiveSessionHandle {
  record: BrowserSessionRecord;
  browser?: Browser;
  context: BrowserContext;
  pages: Map<string, ActivePageHandle>;
  lock: Promise<void>;
}

export class BrowserSessionManager {
  private activeSessions = new Map<string, ActiveSessionHandle>();
  private navigationGuard: NavigationGuard;

  constructor(
    private config: BrowserConfig,
    private previewResolver: PreviewResolver
  ) {
    this.navigationGuard = new NavigationGuard(config);
  }

  private async acquireLock<T>(handle: ActiveSessionHandle, fn: () => Promise<T>): Promise<T> {
    let releaseLock: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const currentLock = handle.lock;
    handle.lock = handle.lock.then(() => nextLock);

    await currentLock;
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  }

  public async openSession(params: {
    workspaceId: string;
    taskId?: string;
    previewId?: string;
    viewport?: BrowserViewport;
    locale?: string;
    timezoneId?: string;
    colorScheme?: 'light' | 'dark' | 'no-preference';
    reducedMotion?: 'reduce' | 'no-preference';
    userAgent?: string;
    ignoreHTTPSErrors?: boolean;
    headSha?: string;
  }): Promise<BrowserSessionRecord> {
    const { workspaceId, taskId, previewId, headSha = '' } = params;

    // Check concurrency limit for workspace
    const workspaceSessions = Array.from(this.activeSessions.values()).filter(
      (h) => h.record.workspaceId === workspaceId && h.record.state !== 'CLOSED' && h.record.state !== 'FAILED'
    );

    if (workspaceSessions.length >= this.config.maxSessionsPerWorkspace) {
      throw new ControllerError(
        'BROWSER_SESSION_LIMIT',
        `Maximum browser session limit (${this.config.maxSessionsPerWorkspace}) reached for workspace "${workspaceId}".`,
        429
      );
    }

    const browserSessionId = `bsess_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const contextId = `bctx_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const initialPageId = `bpage_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    const viewport: BrowserViewport = params.viewport || { width: 1280, height: 720 };
    const createdAt = new Date().toISOString();

    const record: BrowserSessionRecord = {
      browserSessionId,
      workspaceId,
      taskId,
      previewId,
      engine: 'chromium',
      engineVersion: '1.61.1',
      state: 'CREATING',
      createdAt,
      updatedAt: createdAt,
      lastActivity: createdAt,
      headSha,
      contextId,
      pageIds: [initialPageId],
      activePageId: initialPageId,
      traceActive: false,
      artifactIds: [],
      consoleCount: 0,
      pageErrorCount: 0,
      networkFailureCount: 0,
      viewport,
      locale: params.locale,
      timezoneId: params.timezoneId,
      colorScheme: params.colorScheme,
      reducedMotion: params.reducedMotion,
      userAgent: params.userAgent,
      ignoreHTTPSErrors: params.ignoreHTTPSErrors || false,
    };

    let browser: Browser | undefined;
    let context: BrowserContext;
    let initialPage: Page;

    try {
      // Launch headless Chromium locally
      browser = await chromium.launch({
        headless: this.config.headless,
        timeout: this.config.defaultTimeoutMs,
      });

      context = await browser.newContext({
        viewport,
        locale: params.locale,
        timezoneId: params.timezoneId,
        colorScheme: params.colorScheme,
        reducedMotion: params.reducedMotion,
        userAgent: params.userAgent,
        ignoreHTTPSErrors: params.ignoreHTTPSErrors || false,
      });

      initialPage = await context.newPage();
    } catch (err) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      throw new ControllerError(
        'BROWSER_CRASHED',
        `Failed to launch Playwright Chromium session: ${err instanceof Error ? err.message : String(err)}`,
        500
      );
    }

    const initialPageHandle: ActivePageHandle = {
      pageId: initialPageId,
      page: initialPage,
      currentUrl: 'about:blank',
      createdAt,
    };

    const pagesMap = new Map<string, ActivePageHandle>();
    pagesMap.set(initialPageId, initialPageHandle);

    record.state = 'READY';
    record.updatedAt = new Date().toISOString();

    const handle: ActiveSessionHandle = {
      record,
      browser,
      context,
      pages: pagesMap,
      lock: Promise.resolve(),
    };

    this.activeSessions.set(browserSessionId, handle);

    logger.info('browser.session.opened', {
      browserSessionId,
      workspaceId,
      taskId,
      previewId,
      engine: 'chromium',
    });

    return record;
  }

  public getSession(browserSessionId: string): BrowserSessionRecord | undefined {
    const handle = this.activeSessions.get(browserSessionId);
    return handle ? { ...handle.record } : undefined;
  }

  public getSessionHandle(browserSessionId: string): ActiveSessionHandle {
    const handle = this.activeSessions.get(browserSessionId);
    if (!handle || handle.record.state === 'CLOSED' || handle.record.state === 'FAILED') {
      throw new ControllerError(
        'BROWSER_SESSION_NOT_FOUND',
        `Active browser session "${browserSessionId}" not found or closed.`,
        404
      );
    }
    return handle;
  }

  public async createPage(browserSessionId: string): Promise<{ pageId: string; record: BrowserSessionRecord }> {
    const handle = this.getSessionHandle(browserSessionId);

    return this.acquireLock(handle, async () => {
      if (handle.pages.size >= this.config.maxPagesPerSession) {
        throw new ControllerError(
          'PAGE_LIMIT',
          `Maximum page limit (${this.config.maxPagesPerSession}) reached for browser session "${browserSessionId}".`,
          429
        );
      }

      const pageId = `bpage_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const page = await handle.context.newPage();
      const createdAt = new Date().toISOString();

      const pageHandle: ActivePageHandle = {
        pageId,
        page,
        currentUrl: 'about:blank',
        createdAt,
      };

      handle.pages.set(pageId, pageHandle);
      handle.record.pageIds.push(pageId);
      handle.record.activePageId = pageId;
      handle.record.lastActivity = createdAt;
      handle.record.updatedAt = createdAt;

      logger.info('browser.page.created', { browserSessionId, pageId });

      return { pageId, record: { ...handle.record } };
    });
  }

  public async closePage(browserSessionId: string, pageId: string): Promise<BrowserSessionRecord> {
    const handle = this.getSessionHandle(browserSessionId);

    return this.acquireLock(handle, async () => {
      const pageHandle = handle.pages.get(pageId);
      if (pageHandle) {
        await pageHandle.page.close().catch(() => {});
        handle.pages.delete(pageId);
        handle.record.pageIds = handle.record.pageIds.filter((id) => id !== pageId);

        if (handle.record.activePageId === pageId) {
          handle.record.activePageId = handle.record.pageIds[handle.record.pageIds.length - 1];
        }
        handle.record.lastActivity = new Date().toISOString();
        handle.record.updatedAt = handle.record.lastActivity;

        logger.info('browser.page.closed', { browserSessionId, pageId });
      }
      return { ...handle.record };
    });
  }

  public async navigate(params: {
    browserSessionId: string;
    pageId: string;
    target: string;
    waitUntil?: 'domcontentloaded' | 'load' | 'networkidle' | 'commit';
    timeoutMs?: number;
  }): Promise<{ url: string; status?: number; title: string; redirectCount: number }> {
    const { browserSessionId, pageId, target, waitUntil = 'load', timeoutMs } = params;
    const handle = this.getSessionHandle(browserSessionId);

    return this.acquireLock(handle, async () => {
      const pageHandle = handle.pages.get(pageId);
      if (!pageHandle) {
        throw new ControllerError('PAGE_NOT_FOUND', `Page "${pageId}" not found in browser session.`, 404);
      }

      // Preview resolution handling if target is relative path or preview reference
      let targetUrl = target;
      let allowedPreviewHost: string | undefined;

      if (handle.record.previewId) {
        const preview = this.previewResolver.getPreview(handle.record.previewId);
        if (preview) {
          allowedPreviewHost = preview.externalHost;
          if (target.startsWith('/')) {
            targetUrl = `${preview.internalUrl}${target}`;
          }
        }
      }

      const { normalizedUrl } = this.navigationGuard.validateUrl(targetUrl, {
        allowedPreviewHost,
      });

      handle.record.state = 'NAVIGATING';
      let redirectCount = 0;

      // Attach redirect validation
      const onResponse = (response: any) => {
        if (response.status() >= 300 && response.status() <= 399) {
          redirectCount++;
          const location = response.headers()['location'];
          if (location) {
            try {
              this.navigationGuard.validateRedirect(normalizedUrl, location, { allowedPreviewHost });
            } catch (err) {
              logger.warn('browser.redirect_blocked', { browserSessionId, location, error: String(err) });
            }
          }
        }
      };

      pageHandle.page.on('response', onResponse);

      try {
        const response = await pageHandle.page.goto(normalizedUrl, {
          waitUntil,
          timeout: timeoutMs || this.config.navigationTimeoutMs,
        });

        const finalUrl = pageHandle.page.url();
        const title = await pageHandle.page.title();
        const status = response ? response.status() : undefined;

        pageHandle.currentUrl = finalUrl;
        handle.record.state = 'READY';
        handle.record.lastActivity = new Date().toISOString();
        handle.record.updatedAt = handle.record.lastActivity;

        logger.info('browser.navigation.completed', {
          browserSessionId,
          pageId,
          url: this.navigationGuard.sanitizeUrl(finalUrl),
          status,
        });

        return { url: finalUrl, status, title, redirectCount };
      } catch (err) {
        handle.record.state = 'FAILED';
        throw new ControllerError(
          'NAVIGATION_FAILED',
          `Navigation to "${this.navigationGuard.sanitizeUrl(normalizedUrl)}" failed: ${err instanceof Error ? err.message : String(err)}`,
          500
        );
      } finally {
        pageHandle.page.off('response', onResponse);
      }
    });
  }

  public async closeSession(browserSessionId: string, force = false): Promise<boolean> {
    const handle = this.activeSessions.get(browserSessionId);
    if (!handle) return true;

    handle.record.state = 'CLOSING';

    try {
      for (const [pageId, pageHandle] of handle.pages.entries()) {
        await pageHandle.page.close().catch(() => {});
      }
      handle.pages.clear();

      await handle.context.close().catch(() => {});
      if (handle.browser) {
        await handle.browser.close().catch(() => {});
      }
    } catch (err) {
      logger.warn('browser.session.close_warning', { browserSessionId, error: String(err) });
    } finally {
      handle.record.state = 'CLOSED';
      handle.record.updatedAt = new Date().toISOString();
      this.activeSessions.delete(browserSessionId);
      logger.info('browser.session.closed', { browserSessionId });
    }

    return true;
  }

  public async closeAllWorkspaceSessions(workspaceId: string): Promise<void> {
    const toClose: string[] = [];
    for (const [id, handle] of this.activeSessions.entries()) {
      if (handle.record.workspaceId === workspaceId) {
        toClose.push(id);
      }
    }

    for (const id of toClose) {
      await this.closeSession(id, true);
    }
  }
}
