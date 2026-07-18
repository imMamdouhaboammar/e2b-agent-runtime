import fs from 'node:fs';
import { z } from 'zod';
import { loadBrowserConfig, loadControllerConfig } from '../../config.js';
import { SessionRegistry } from '../../runtime/session-registry.js';
import { E2BWorkerManager } from '../../runtime/e2b-worker-manager.js';
import { PreviewResolver } from '../../browser/preview-resolver.js';
import { BrowserSessionManager } from '../../browser/browser-session-manager.js';
import { PageInspector } from '../../browser/page-inspector.js';
import { BrowserActions } from '../../browser/browser-actions.js';
import { EvidenceCollector } from '../../browser/evidence-collector.js';
import { BrowserAssertionService } from '../../browser/browser-assertions.js';
import { AccessibilityScanner } from '../../browser/accessibility-scanner.js';
import { ArtifactStore } from '../../browser/artifact-store.js';
import { BrowserFailureClassifier } from '../../browser/browser-failure-classifier.js';
import { VerificationCycleManager } from '../../browser/verification-cycle-manager.js';
import { TargetSchema } from '../../browser/types.js';
import { formatSafeErrorMessage } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

let globalBrowserManager: BrowserSessionManager | undefined;
let globalPreviewResolver: PreviewResolver | undefined;
let globalArtifactStore: ArtifactStore | undefined;
let globalVerificationManager: VerificationCycleManager | undefined;

export function getBrowserServices() {
  if (!globalBrowserManager) {
    const config = loadBrowserConfig();
    const ctrlConfig = loadControllerConfig({
      E2B_API_KEY: process.env.E2B_API_KEY || 'mock_api_key',
      MCP_ACCESS_TOKEN: process.env.MCP_ACCESS_TOKEN || 'mock_token',
    });
    const registry = new SessionRegistry(ctrlConfig.sessionRegistryPath);
    const workerManager = new E2BWorkerManager(ctrlConfig, registry);
    globalPreviewResolver = new PreviewResolver(registry, workerManager);
    globalBrowserManager = new BrowserSessionManager(config, globalPreviewResolver);
    globalArtifactStore = new ArtifactStore(config);
    globalVerificationManager = new VerificationCycleManager();
  }

  const config = loadBrowserConfig();
  const inspector = new PageInspector();
  const collector = new EvidenceCollector(config);
  const actions = new BrowserActions(inspector);
  const assertions = new BrowserAssertionService(inspector, collector);
  const scanner = new AccessibilityScanner();
  const classifier = new BrowserFailureClassifier();

  return {
    browserManager: globalBrowserManager,
    previewResolver: globalPreviewResolver!,
    artifactStore: globalArtifactStore!,
    verificationManager: globalVerificationManager!,
    inspector,
    collector,
    actions,
    assertions,
    scanner,
    classifier,
  };
}

export function registerPhase6Tools(server: any) {
  const services = getBrowserServices();
  const {
    browserManager,
    previewResolver,
    artifactStore,
    verificationManager,
    inspector,
    collector,
    actions,
    assertions,
    scanner,
    classifier,
  } = services;

  // 0. workspace_preview_resolve
  server.tool(
    'workspace_preview_resolve',
    'Resolves application port to internal localhost and optional E2B preview URL',
    {
      workspaceId: z.string().describe('Workspace session ID'),
      port: z.number().int().min(1).max(65535).describe('Listening port number'),
      protocol: z.string().optional().default('http').describe('Protocol'),
      external: z.boolean().optional().default(false).describe('Request external E2B preview host'),
      processId: z.string().optional(),
    },
    async (args: any) => {
      try {
        const preview = await previewResolver.resolvePreview(args);
        return { content: [{ type: 'text', text: JSON.stringify(preview, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 1. browser_session_open
  server.tool(
    'browser_session_open',
    'Opens an isolated Playwright Chromium session for a workspace',
    {
      workspaceId: z.string().describe('Workspace ID'),
      taskId: z.string().optional().describe('Phase 5 Task ID'),
      previewId: z.string().optional().describe('Resolved Preview ID'),
      viewport: z.object({ width: z.number(), height: z.number() }).optional(),
      locale: z.string().optional(),
      timezoneId: z.string().optional(),
      colorScheme: z.enum(['light', 'dark', 'no-preference']).optional(),
      reducedMotion: z.enum(['reduce', 'no-preference']).optional(),
      userAgent: z.string().optional(),
      ignoreHTTPSErrors: z.boolean().optional().default(false),
    },
    async (args: any) => {
      try {
        const record = await browserManager.openSession(args);
        return { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 2. browser_session_get
  server.tool(
    'browser_session_get',
    'Retrieves state and summary for a browser session',
    { browserSessionId: z.string().describe('Browser Session ID') },
    async (args: any) => {
      try {
        const record = browserManager.getSession(args.browserSessionId);
        if (!record) throw new Error(`Browser session ${args.browserSessionId} not found`);
        return { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 3. browser_session_close
  server.tool(
    'browser_session_close',
    'Closes a browser session and cleans up resources',
    { browserSessionId: z.string(), force: z.boolean().optional().default(false) },
    async (args: any) => {
      try {
        const success = await browserManager.closeSession(args.browserSessionId, args.force);
        return { content: [{ type: 'text', text: JSON.stringify({ browserSessionId: args.browserSessionId, closed: success }, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 4. browser_page_new
  server.tool(
    'browser_page_new',
    'Creates a new isolated page in an existing browser session',
    { browserSessionId: z.string() },
    async (args: any) => {
      try {
        const res = await browserManager.createPage(args.browserSessionId);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 5. browser_page_close
  server.tool(
    'browser_page_close',
    'Closes a specific page in a browser session',
    { browserSessionId: z.string(), pageId: z.string() },
    async (args: any) => {
      try {
        const record = await browserManager.closePage(args.browserSessionId, args.pageId);
        collector.clearPageBuffers(args.pageId);
        return { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 6. browser_navigate
  server.tool(
    'browser_navigate',
    'Navigates a page to a target URL or preview path with security checks',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      target: z.string().describe('Target URL or relative path'),
      waitUntil: z.enum(['domcontentloaded', 'load', 'networkidle', 'commit']).optional().default('load'),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (pageHandle) collector.attachToPage(args.pageId, pageHandle.page);

        const res = await browserManager.navigate(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 7. browser_snapshot
  server.tool(
    'browser_snapshot',
    'Captures a bounded structured snapshot of visible page content and locators',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      mode: z.enum(['accessibility', 'visible-text', 'structure']).optional().default('structure'),
      maxBytes: z.number().optional().default(262144),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const snapshot = await inspector.captureSnapshot(args.pageId, pageHandle.page, args.mode, args.maxBytes);
        return { content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 8. browser_click
  server.tool(
    'browser_click',
    'Clicks an element identified by accessible locator or elementRef',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      target: TargetSchema,
      button: z.enum(['left', 'right', 'middle']).optional().default('left'),
      clickCount: z.number().int().optional().default(1),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await actions.click({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 9. browser_fill
  server.tool(
    'browser_fill',
    'Fills a form field with secret redaction for sensitive fields',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      target: TargetSchema,
      value: z.string(),
      sensitive: z.boolean().optional().default(false),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await actions.fill({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 10. browser_press
  server.tool(
    'browser_press',
    'Presses a keyboard key on the active element or page',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      target: TargetSchema.optional(),
      key: z.string(),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await actions.press({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 11. browser_select_option
  server.tool(
    'browser_select_option',
    'Selects one or more options in an HTML select control',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      target: TargetSchema,
      values: z.array(z.string()),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await actions.selectOption({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 12. browser_check
  server.tool(
    'browser_check',
    'Checks or unchecks a checkbox or radio button control',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      target: TargetSchema,
      checked: z.boolean(),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await actions.check({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 13. browser_upload_file
  server.tool(
    'browser_upload_file',
    'Uploads files restricted strictly to active workspace paths',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      target: TargetSchema,
      workspacePaths: z.array(z.string()),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await actions.uploadFile({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 14. browser_wait_for
  server.tool(
    'browser_wait_for',
    'Waits for a condition (element, text, network idle, title match, or delay)',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      condition: z.object({
        type: z.enum(['text-visible', 'text-hidden', 'locator-visible', 'locator-hidden', 'url-match', 'title-match', 'network-idle', 'timeout']),
        value: z.string().optional(),
        target: TargetSchema.optional(),
      }),
      timeoutMs: z.number().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await actions.waitFor({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 15. browser_assert
  server.tool(
    'browser_assert',
    'Runs a structured UI assertion on real browser state and generates evidence',
    {
      taskId: z.string().optional(),
      browserSessionId: z.string(),
      pageId: z.string(),
      assertion: z.object({
        type: z.enum([
          'url-equals',
          'url-matches',
          'title-equals',
          'title-contains',
          'text-visible',
          'text-absent',
          'element-visible',
          'element-hidden',
          'element-enabled',
          'element-disabled',
          'element-checked',
          'element-count',
          'no-console-errors',
          'no-page-errors',
          'no-failed-requests',
          'http-status-below',
        ]),
        expected: z.union([z.string(), z.number()]).optional(),
        target: TargetSchema.optional(),
        message: z.string().optional(),
      }),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await assertions.evaluate({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 16. browser_screenshot
  server.tool(
    'browser_screenshot',
    'Captures a page screenshot and saves it to controlled artifact storage',
    {
      browserSessionId: z.string(),
      pageId: z.string(),
      fullPage: z.boolean().optional().default(false),
      imageType: z.enum(['png', 'jpeg']).optional().default('png'),
      quality: z.number().int().min(1).max(100).optional(),
      label: z.string().optional(),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const buffer = await pageHandle.page.screenshot({
          fullPage: args.fullPage,
          type: args.imageType,
          quality: args.imageType === 'jpeg' ? args.quality || 80 : undefined,
        });

        const meta = await artifactStore.saveArtifact({
          workspaceId: handle.record.workspaceId,
          taskId: handle.record.taskId,
          browserSessionId: args.browserSessionId,
          artifactType: 'screenshot',
          buffer,
          extension: args.imageType,
          sourceHeadSha: handle.record.headSha,
        });

        return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 17. browser_console_read
  server.tool(
    'browser_console_read',
    'Reads sanitized console log entries with cursor pagination',
    { browserSessionId: z.string(), pageId: z.string(), cursor: z.number().optional(), limit: z.number().optional().default(100) },
    async (args: any) => {
      try {
        const res = collector.getConsoleEntries(args.pageId, args.cursor, args.limit);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 18. browser_page_errors_read
  server.tool(
    'browser_page_errors_read',
    'Reads uncaught page errors with sanitized stack traces',
    { browserSessionId: z.string(), pageId: z.string(), cursor: z.number().optional(), limit: z.number().optional().default(50) },
    async (args: any) => {
      try {
        const res = collector.getPageErrors(args.pageId, args.cursor, args.limit);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 19. browser_network_read
  server.tool(
    'browser_network_read',
    'Reads network metadata and HTTP failure logs with query/header secret redaction',
    { browserSessionId: z.string(), pageId: z.string(), cursor: z.number().optional(), limit: z.number().optional().default(100) },
    async (args: any) => {
      try {
        const res = collector.getNetworkFailures(args.pageId, args.cursor, args.limit);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 20. browser_trace_start
  server.tool(
    'browser_trace_start',
    'Starts recording a Playwright trace in the browser context',
    {
      browserSessionId: z.string(),
      screenshots: z.boolean().optional().default(true),
      snapshots: z.boolean().optional().default(true),
      sources: z.boolean().optional().default(false),
      label: z.string().optional().default('trace'),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        if (handle.record.traceActive) throw new Error('Trace already active in this context');

        await handle.context.tracing.start({ screenshots: args.screenshots, snapshots: args.snapshots, sources: args.sources });
        handle.record.traceActive = true;
        handle.record.state = 'TRACING';

        return { content: [{ type: 'text', text: JSON.stringify({ browserSessionId: args.browserSessionId, traceActive: true }, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 21. browser_trace_stop
  server.tool(
    'browser_trace_stop',
    'Stops tracing and saves a trace zip archive to controlled artifact storage',
    { browserSessionId: z.string() },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        if (!handle.record.traceActive) throw new Error('No active trace to stop');

        const tempTracePath = `/tmp/trace_${args.browserSessionId}_${Date.now()}.zip`;
        await handle.context.tracing.stop({ path: tempTracePath });
        handle.record.traceActive = false;
        handle.record.state = 'READY';

        const buffer = fs.readFileSync(tempTracePath);
        fs.unlinkSync(tempTracePath);

        const meta = await artifactStore.saveArtifact({
          workspaceId: handle.record.workspaceId,
          taskId: handle.record.taskId,
          browserSessionId: args.browserSessionId,
          artifactType: 'trace',
          buffer,
          extension: 'zip',
          sourceHeadSha: handle.record.headSha,
        });

        return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 22. browser_accessibility_scan
  server.tool(
    'browser_accessibility_scan',
    'Runs a local accessibility scan on page content using axe-core',
    {
      taskId: z.string().optional(),
      browserSessionId: z.string(),
      pageId: z.string(),
      impactLevels: z.array(z.enum(['critical', 'serious', 'moderate', 'minor'])).optional(),
      maxFindings: z.number().int().optional().default(100),
    },
    async (args: any) => {
      try {
        const handle = browserManager.getSessionHandle(args.browserSessionId);
        const pageHandle = handle.pages.get(args.pageId);
        if (!pageHandle) throw new Error(`Page ${args.pageId} not found`);

        const res = await scanner.scanPage({ ...args, page: pageHandle.page });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 23. browser_failure_classify
  server.tool(
    'browser_failure_classify',
    'Classifies browser/UI failure into distinct failure categories with suggested inspection actions',
    {
      taskId: z.string(),
      browserSessionId: z.string(),
      errorMessage: z.string().optional(),
      evidenceIds: z.array(z.string()).optional(),
      affectedUrl: z.string().optional(),
    },
    async (args: any) => {
      try {
        const res = classifier.classify(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 24. browser_verification_cycle_start
  server.tool(
    'browser_verification_cycle_start',
    'Starts a browser verification cycle bound to a Phase 5 task and current head SHA',
    {
      taskId: z.string(),
      browserSessionId: z.string(),
      label: z.string(),
      startHeadSha: z.string(),
      previewId: z.string(),
      processId: z.string().optional(),
      expectedFlows: z.array(z.string()),
      expectedAssertions: z.array(z.string()),
    },
    async (args: any) => {
      try {
        const res = verificationManager.startCycle(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 25. browser_verification_cycle_complete
  server.tool(
    'browser_verification_cycle_complete',
    'Completes a browser verification cycle and evaluates evidence freshness',
    {
      taskId: z.string(),
      cycleId: z.string(),
      endHeadSha: z.string(),
      evidenceIds: z.array(z.string()),
      consoleErrors: z.number().int().optional(),
      pageErrors: z.number().int().optional(),
      networkFailures: z.number().int().optional(),
      accessibilityFindings: z.number().int().optional(),
      summary: z.string().optional(),
    },
    async (args: any) => {
      try {
        const res = verificationManager.completeCycle(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // 26. browser_verification_get
  server.tool(
    'browser_verification_get',
    'Retrieves browser verification state and evidence freshness for a task',
    { taskId: z.string(), currentHeadSha: z.string().optional() },
    async (args: any) => {
      try {
        const res = verificationManager.getTaskVerificationState(args.taskId, args.currentHeadSha);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  // Artifact tools
  server.tool(
    'artifact_list',
    'Lists metadata for browser artifacts in a workspace',
    { workspaceId: z.string(), taskId: z.string().optional() },
    async (args: any) => {
      try {
        const list = artifactStore.listArtifacts(args.workspaceId, args.taskId);
        return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  server.tool(
    'artifact_get_metadata',
    'Gets detailed metadata for a browser artifact',
    { artifactId: z.string() },
    async (args: any) => {
      try {
        const meta = artifactStore.getMetadata(args.artifactId);
        return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  server.tool(
    'artifact_create_download_url',
    'Generates a short-lived pre-signed download URL for a browser artifact',
    { artifactId: z.string() },
    async (args: any) => {
      try {
        const res = artifactStore.createDownloadUrl(args.artifactId);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );

  server.tool(
    'artifact_delete',
    'Deletes a browser artifact with explicit confirmation',
    { artifactId: z.string(), confirm: z.boolean() },
    async (args: any) => {
      try {
        const res = artifactStore.deleteArtifact(args.artifactId, args.confirm);
        return { content: [{ type: 'text', text: JSON.stringify({ artifactId: args.artifactId, deleted: res }, null, 2) }] };
      } catch (err) {
        const safe = formatSafeErrorMessage(err);
        return { isError: true, content: [{ type: 'text', text: `Error [${safe.code}]: ${safe.message}` }] };
      }
    }
  );
}
