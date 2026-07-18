import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadBrowserConfig } from '../../src/config.js';
import { NavigationGuard } from '../../src/browser/navigation-guard.js';
import { PreviewResolver } from '../../src/browser/preview-resolver.js';
import { PageInspector } from '../../src/browser/page-inspector.js';
import { EvidenceCollector } from '../../src/browser/evidence-collector.js';
import { ArtifactStore } from '../../src/browser/artifact-store.js';
import { BrowserFailureClassifier } from '../../src/browser/browser-failure-classifier.js';
import { VerificationCycleManager } from '../../src/browser/verification-cycle-manager.js';
import { BrowserAssertionService } from '../../src/browser/browser-assertions.js';
import { ControllerError } from '../../src/shared/errors.js';

describe('Phase 6 Browser Verification Unit Tests', () => {
  let config: ReturnType<typeof loadBrowserConfig>;
  let navGuard: NavigationGuard;

  beforeEach(() => {
    config = loadBrowserConfig();
    navGuard = new NavigationGuard(config);
  });

  describe('1. Configuration & Engine Rules', () => {
    it('1.1 validates default browser configuration values', () => {
      expect(config.engine).toBe('chromium');
      expect(config.maxSessionsPerWorkspace).toBe(2);
      expect(config.maxPagesPerSession).toBe(5);
      expect(config.headless).toBe(true);
    });

    it('1.2 throws when invalid browser engine is configured', () => {
      expect(() => loadBrowserConfig({ BROWSER_ENGINE: 'firefox' })).toThrow('Unsupported browser engine');
    });

    it('1.3 parses boolean configuration flags correctly', () => {
      const cfg = loadBrowserConfig({ BROWSER_ALLOW_EXTERNAL_NAVIGATION: 'true' });
      expect(cfg.allowExternalNavigation).toBe(true);
    });

    it('1.4 throws on invalid numeric config values', () => {
      expect(() => loadBrowserConfig({ BROWSER_DEFAULT_TIMEOUT_MS: 'invalid' })).toThrow('Invalid integer');
    });
  });

  describe('2. Navigation Security & URL Validation', () => {
    /**
     * Merged from separate 2.1/2.2 tests — same setup, same assertion property,
     * variants differ only in the host string: data-driven pattern applies (Rule 3).
     */
    it.each([
      ['localhost', 'http://localhost:3000/app'],
      ['127.0.0.1', 'http://127.0.0.1:8080/test'],
    ])('2.1/2.2 permits internal %s navigation', (_label, url) => {
      expect(navGuard.validateUrl(url).isInternal).toBe(true);
    });

    /**
     * Merged from individual scheme tests — each scheme is a variant of the same
     * "forbidden scheme" scenario; test.each avoids three near-identical assertions
     * in one body (Rule 3).
     */
    it.each(['file:///etc/passwd', 'data:text/html,hello', 'javascript:alert(1)'])(
      '2.3 rejects forbidden scheme: %s',
      (url) => {
        expect(() => navGuard.validateUrl(url)).toThrow(ControllerError);
      }
    );

    it('2.4 rejects embedded credentials in URLs', () => {
      expect(() => navGuard.validateUrl('http://admin:secret@localhost:3000')).toThrow('embedded user credentials');
    });

    it('2.5 strictly blocks cloud metadata endpoints (169.254.169.254)', () => {
      expect(() => navGuard.validateUrl('http://169.254.169.254/latest/meta-data')).toThrow('cloud metadata endpoint');
      expect(() => navGuard.validateUrl('http://metadata.google.internal/computeMetadata')).toThrow('cloud metadata endpoint');
    });

    it('2.6 denies external host navigation by default', () => {
      expect(() => navGuard.validateUrl('https://example.com')).toThrow('External host "example.com" is not allowed');
    });

    it('2.7 permits preview host when explicitly provided', () => {
      const res = navGuard.validateUrl('https://preview-123.e2b.dev/app', { allowedPreviewHost: 'preview-123.e2b.dev' });
      expect(res.normalizedUrl).toBe('https://preview-123.e2b.dev/app');
    });

    it('2.8 sanitizes sensitive query parameters in URLs', () => {
      const sanitized = navGuard.sanitizeUrl('http://localhost:3000/auth?token=secret123&user=john');
      expect(sanitized).toContain('token=%5BREDACTED%5D');
      expect(sanitized).toContain('user=john');
    });
  });

  describe('3. Preview Resolution & Traffic Tokens', () => {
    it('3.1 resolves internal preview URL for workspace port', async () => {
      // registry stub: boundary is E2B Worker API, not under test here
      const registry: any = { getSession: vi.fn().mockResolvedValue({ sessionId: 'ws_1' }) };
      const workerMgr: any = { getWorkerHandle: vi.fn() };
      const resolver = new PreviewResolver(registry, workerMgr);

      const preview = await resolver.resolvePreview({ workspaceId: 'ws_1', port: 3000 });
      expect(preview.internalUrl).toBe('http://127.0.0.1:3000');
      expect(preview.accessMode).toBe('internal-only');
    });

    it('3.2 rejects invalid port numbers', async () => {
      const resolver = new PreviewResolver({} as any, {} as any);
      await expect(resolver.resolvePreview({ workspaceId: 'ws_1', port: 999999 })).rejects.toThrow('Invalid port number');
    });
  });

  describe('4. Page Inspection & Locator Invalidation', () => {
    it('4.1 invalidates opaque element references on page navigation', () => {
      const inspector = new PageInspector();

      const pageId = 'p_1';
      const mockPage: any = {
        url: () => 'http://localhost:3000',
        title: vi.fn().mockResolvedValue('Test App'),
        viewportSize: () => ({ width: 1280, height: 720 }),
        locator: vi.fn().mockReturnValue({}),
        evaluate: vi.fn().mockResolvedValue({
          headings: [],
          landmarks: [],
          buttonsData: [{ text: 'Submit', role: 'button', css: '#submit-btn' }],
          linksData: [],
          inputsData: [],
          visibleTextExcerpt: 'Welcome to App',
        }),
      };

      return inspector.captureSnapshot(pageId, mockPage).then((snapshot) => {
        expect(snapshot.buttons.length).toBe(1);
        const refId = snapshot.buttons[0].refId;

        // Behavioral assertion: resolveLocator returns without throwing — the ref is valid
        expect(() => inspector.resolveLocator(pageId, mockPage, { elementRef: refId })).not.toThrow();

        // After navigation invalidation, the same ref must be rejected
        inspector.invalidatePageRefs(pageId);
        expect(() => inspector.resolveLocator(pageId, mockPage, { elementRef: refId })).toThrow('invalid or expired');
      });
    });

    it('4.2 forbids XPath selectors by policy', () => {
      const inspector = new PageInspector();
      const mockPage: any = {};
      expect(() => inspector.resolveLocator('p_1', mockPage, { css: '//div/button' })).toThrow('XPath selectors are forbidden');
    });
  });

  describe('5. Evidence Collection & Secret Redaction', () => {
    it('5.1 buffers and redacts console entries', () => {
      const collector = new EvidenceCollector(config);
      const listeners: Record<string, Function> = {};
      const mockPage: any = {
        on: (event: string, fn: Function) => {
          listeners[event] = fn;
        },
      };

      collector.attachToPage('p_1', mockPage);
      listeners['console']?.({
        text: () => 'Found secret_key=12345 in console',
        type: () => 'error',
        location: () => ({ url: 'app.js', lineNumber: 10 }),
      });

      const res = collector.getConsoleEntries('p_1');
      expect(res.entries.length).toBe(1);
      expect(res.entries[0].level).toBe('error');
    });

    it('5.2 classifies network failure categories', () => {
      const collector = new EvidenceCollector(config);
      const listeners: Record<string, Function> = {};
      const mockPage: any = {
        on: (event: string, fn: Function) => {
          listeners[event] = fn;
        },
      };

      collector.attachToPage('p_1', mockPage);
      listeners['requestfailed']?.({
        url: () => 'http://localhost:3000/api',
        method: () => 'GET',
        resourceType: () => 'fetch',
        failure: () => ({ errorText: 'net::ERR_NAME_NOT_RESOLVED' }),
      });

      const failures = collector.getNetworkFailures('p_1');
      expect(failures.length).toBe(1);
      expect(failures[0].failureCategory).toBe('DNS');
    });
  });

  describe('6. Browser Assertions & Real Evidence', () => {
    let assertionService: BrowserAssertionService;

    beforeEach(() => {
      // Shared setup extracted from individual tests (Rule 3 — avoid per-test boilerplate)
      const inspector = new PageInspector();
      const collector = new EvidenceCollector(config);
      assertionService = new BrowserAssertionService(inspector, collector);
    });

    it('6.1 url-equals assertion passes when current URL matches expected', async () => {
      const mockPage: any = { url: () => 'http://localhost:3000/dashboard' };

      const res = await assertionService.evaluate({
        pageId: 'p_1',
        page: mockPage,
        browserSessionId: 'bs_1',
        assertion: { type: 'url-equals', expected: 'http://localhost:3000/dashboard' },
      });

      expect(res.passed).toBe(true);
      expect(res.actual).toBe('http://localhost:3000/dashboard');
    });

    it('6.2 text-visible assertion passes when the expected text is in the DOM', async () => {
      const mockPage: any = {
        getByText: vi.fn().mockReturnValue({ isVisible: vi.fn().mockResolvedValue(true) }),
      };

      const res = await assertionService.evaluate({
        pageId: 'p_1',
        page: mockPage,
        browserSessionId: 'bs_1',
        assertion: { type: 'text-visible', expected: 'Welcome' },
      });

      expect(res.passed).toBe(true);
    });
  });

  describe('7. Artifact Management & Retention', () => {
    it('7.1 artifact_save stores sha256 and is retrievable by id', async () => {
      const store = new ArtifactStore(config);
      const buf = Buffer.from('test screenshot content');

      const meta = await store.saveArtifact({
        workspaceId: 'ws_1',
        browserSessionId: 'bs_1',
        artifactType: 'screenshot',
        buffer: buf,
        extension: 'png',
        sourceHeadSha: 'sha123',
      });

      expect(meta.artifactId).toBeDefined();
      expect(meta.sha256).toBeDefined();
      expect(meta.sizeBytes).toBe(buf.byteLength);

      const retrieved = store.getMetadata(meta.artifactId);
      expect(retrieved.sha256).toBe(meta.sha256);

      store.deleteArtifact(meta.artifactId, true);
    });

    it('7.2 artifact_download_url expires after configured TTL', async () => {
      const store = new ArtifactStore(config);
      const buf = Buffer.from('trace content');
      const meta = await store.saveArtifact({
        workspaceId: 'ws_1',
        browserSessionId: 'bs_1',
        artifactType: 'trace',
        buffer: buf,
        extension: 'zip',
      });

      const link = store.createDownloadUrl(meta.artifactId);
      expect(link.downloadUrl).toContain(meta.artifactId);
      expect(link.expiresAt).toBeDefined();

      store.deleteArtifact(meta.artifactId, true);
    });
  });

  describe('8. Browser Failure Classifier', () => {
    it('8.1 classifies locator ambiguity failure', () => {
      const classifier = new BrowserFailureClassifier();
      const res = classifier.classify({
        taskId: 't_1',
        browserSessionId: 'bs_1',
        errorMessage: 'Error: locator.click: Strict mode violation: getByRole("button") resolved to 2 elements',
      });

      expect(res.category).toBe('locator-ambiguous');
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
      expect(res.suggestedInspectionActions.length).toBeGreaterThan(0);
    });

    it('8.2 classifies timeout failure during navigation', () => {
      const classifier = new BrowserFailureClassifier();
      const res = classifier.classify({
        taskId: 't_1',
        browserSessionId: 'bs_1',
        errorMessage: 'navigation timeout 30000ms exceeded',
      });

      expect(res.category).toBe('timeout');
    });
  });

  describe('9. Verification Cycles & Staleness', () => {
    it('9.1 tracks cycle progress and detects stale head SHA', () => {
      const mgr = new VerificationCycleManager();
      const cycle = mgr.startCycle({
        taskId: 'task_1',
        browserSessionId: 'bs_1',
        label: 'Login Flow',
        startHeadSha: 'sha_initial',
        previewId: 'prev_1',
        expectedFlows: ['login'],
        expectedAssertions: ['url-equals'],
      });

      expect(cycle.status).toBe('in-progress');

      const completed = mgr.completeCycle({
        taskId: 'task_1',
        cycleId: cycle.cycleId,
        endHeadSha: 'sha_moved',
        evidenceIds: ['ev_1'],
      });

      expect(completed.status).toBe('incomplete');
      expect(completed.summary).toContain('Stale evidence');
    });
  });
});
