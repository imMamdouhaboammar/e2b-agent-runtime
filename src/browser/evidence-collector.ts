import type { Page } from 'playwright';
import crypto from 'node:crypto';
import { redactSecrets } from '../security/redact.js';
import type { ConsoleEntry, NetworkFailureEntry, PageErrorEntry } from './types.js';
import type { BrowserConfig } from '../config.ts';
import { sanitizeUrlTokens } from './url-sanitizer.js';

export class EvidenceCollector {
  private consoleBuffer = new Map<string, ConsoleEntry[]>();
  private pageErrorBuffer = new Map<string, PageErrorEntry[]>();
  private networkFailureBuffer = new Map<string, NetworkFailureEntry[]>();

  constructor(private config: BrowserConfig) {}

  /**
   * Appends `entry` to `map[pageId]`, evicting the oldest item when the ring is
   * full. Centralising this prevents the identical shift/push pattern from drifting
   * independently across three listener sites.
   */
  private pushToRingBuffer<T>(map: Map<string, T[]>, pageId: string, entry: T, limit: number): void {
    const buffer = map.get(pageId) || [];
    if (buffer.length >= limit) {
      buffer.shift();
    }
    buffer.push(entry);
    map.set(pageId, buffer);
  }

  public attachToPage(pageId: string, page: Page): void {
    if (!this.consoleBuffer.has(pageId)) this.consoleBuffer.set(pageId, []);
    if (!this.pageErrorBuffer.has(pageId)) this.pageErrorBuffer.set(pageId, []);
    if (!this.networkFailureBuffer.has(pageId)) this.networkFailureBuffer.set(pageId, []);

    if (this.config.captureConsole) {
      page.on('console', (msg) => {
        const text = redactSecrets(msg.text());
        const level = msg.type() as any;
        const location = msg.location() ? `${msg.location().url}:${msg.location().lineNumber}` : undefined;
        const sanitizedHash = crypto.createHash('sha256').update(`${level}:${text}:${location}`).digest('hex').slice(0, 16);

        const entry: ConsoleEntry = {
          id: `con_${sanitizedHash}_${Date.now()}`,
          pageId,
          level,
          text: text.slice(0, 1000),
          location,
          timestamp: new Date().toISOString(),
          sanitizedHash,
        };

        this.pushToRingBuffer(this.consoleBuffer, pageId, entry, this.config.consoleBufferMaxItems);
      });
    }

    if (this.config.capturePageErrors) {
      page.on('pageerror', (err) => {
        const message = redactSecrets(err.message || String(err));
        const stack = err.stack ? redactSecrets(err.stack).slice(0, 2000) : undefined;

        const entry: PageErrorEntry = {
          id: `perr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          pageId,
          message,
          stack,
          timestamp: new Date().toISOString(),
        };

        this.pushToRingBuffer(this.pageErrorBuffer, pageId, entry, this.config.pageErrorBufferMaxItems);
      });
    }

    if (this.config.captureNetworkFailures) {
      page.on('requestfailed', (req) => {
        const sanitizedUrl = sanitizeUrlTokens(req.url());
        const failureText = req.failure()?.errorText || 'FAILED';

        const entry: NetworkFailureEntry = {
          id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          pageId,
          method: req.method(),
          url: sanitizedUrl,
          resourceType: req.resourceType(),
          failureCategory: this.classifyNetworkFailure(failureText),
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };

        this.pushToRingBuffer(this.networkFailureBuffer, pageId, entry, this.config.networkBufferMaxItems);
      });

      page.on('response', (res) => {
        if (res.status() >= 400) {
          const sanitizedUrl = sanitizeUrlTokens(res.url());
          const category = res.status() >= 500 ? 'HTTP-server-error' : 'HTTP-client-error';

          const entry: NetworkFailureEntry = {
            id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            pageId,
            method: res.request().method(),
            url: sanitizedUrl,
            resourceType: res.request().resourceType(),
            status: res.status(),
            failureCategory: category,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };

          this.pushToRingBuffer(this.networkFailureBuffer, pageId, entry, this.config.networkBufferMaxItems);
        }
      });
    }
  }

  private classifyNetworkFailure(errorText: string): string {
    const txt = errorText.toLowerCase();
    if (txt.includes('net::err_name_not_resolved') || txt.includes('dns')) return 'DNS';
    if (txt.includes('cert') || txt.includes('ssl') || txt.includes('tls')) return 'TLS';
    if (txt.includes('timedout') || txt.includes('timeout')) return 'timeout';
    if (txt.includes('aborted')) return 'aborted';
    if (txt.includes('refused')) return 'connection-refused';
    return 'network-failure';
  }

  public getConsoleEntries(pageId: string, cursor?: number, limit = 100): { entries: ConsoleEntry[]; nextCursor?: number } {
    const list = this.consoleBuffer.get(pageId) || [];
    const startIndex = cursor || 0;
    const slice = list.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + slice.length < list.length ? startIndex + slice.length : undefined;
    return { entries: slice, nextCursor };
  }

  public getConsoleErrors(pageId: string): ConsoleEntry[] {
    return (this.consoleBuffer.get(pageId) || []).filter((e) => e.level === 'error');
  }

  public getPageErrors(pageId: string, cursor?: number, limit = 50): { entries: PageErrorEntry[]; nextCursor?: number } {
    const list = this.pageErrorBuffer.get(pageId) || [];
    const startIndex = cursor || 0;
    const slice = list.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + slice.length < list.length ? startIndex + slice.length : undefined;
    return { entries: slice, nextCursor };
  }

  public getNetworkFailures(pageId: string, cursor?: number, limit = 100): NetworkFailureEntry[] {
    const list = this.networkFailureBuffer.get(pageId) || [];
    const startIndex = cursor || 0;
    return list.slice(startIndex, startIndex + limit);
  }

  public clearPageBuffers(pageId: string): void {
    this.consoleBuffer.delete(pageId);
    this.pageErrorBuffer.delete(pageId);
    this.networkFailureBuffer.delete(pageId);
  }
}
