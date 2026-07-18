import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import http from 'node:http';
import { loadBrowserConfig } from '../../src/config.js';
import { PageInspector } from '../../src/browser/page-inspector.js';
import { BrowserActions } from '../../src/browser/browser-actions.js';

describe('Phase 6 Gated Browser Integration Tests', () => {
  let server: http.Server;
  let serverPort: number;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // Start local test HTTP server
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Phase 6 Test App</title></head>
              <body>
                <h1>Welcome to E2B Agent Runtime Verification</h1>
                <button id="test-btn">Click Me</button>
                <input id="username-input" type="text" placeholder="Enter username" />
              </body>
            </html>
          `);
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise<void>((res) => server.close(() => res()));
  });

  it('navigates to local test server and captures snapshot', async () => {
    const targetUrl = `http://127.0.0.1:${serverPort}/`;
    await page.goto(targetUrl);

    expect(page.url()).toBe(targetUrl);
    expect(await page.title()).toBe('Phase 6 Test App');

    const inspector = new PageInspector();
    const snapshot = await inspector.captureSnapshot('p_test', page);

    expect(snapshot.title).toBe('Phase 6 Test App');
    expect(snapshot.buttons.length).toBeGreaterThan(0);
  });

  it('interacts with test elements using structured actions', async () => {
    const inspector = new PageInspector();
    const actions = new BrowserActions(inspector);

    const fillRes = await actions.fill({
      pageId: 'p_test',
      page,
      target: { css: '#username-input' },
      value: 'testuser',
    });

    expect(fillRes.fieldState).toBe('testuser');

    const clickRes = await actions.click({
      pageId: 'p_test',
      page,
      target: { css: '#test-btn' },
    });

    expect(clickRes.strategyUsed).toBeDefined();
  });
});
