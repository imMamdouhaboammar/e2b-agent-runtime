import type { Page, Locator } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { ControllerError } from '../shared/errors.js';
import type { BoundedSnapshot, OpaqueElementRef, SnapshotMode, TargetInput } from './types.js';

export class PageInspector {
  private elementRefRegistry = new Map<string, Map<string, { ref: OpaqueElementRef; selector: string }>>();

  private getRefMapForPage(pageId: string): Map<string, { ref: OpaqueElementRef; selector: string }> {
    let map = this.elementRefRegistry.get(pageId);
    if (!map) {
      map = new Map();
      this.elementRefRegistry.set(pageId, map);
    }
    return map;
  }

  public invalidatePageRefs(pageId: string): void {
    this.elementRefRegistry.delete(pageId);
  }

  public async captureSnapshot(
    pageId: string,
    page: Page,
    mode: SnapshotMode = 'structure',
    maxBytes = 262144
  ): Promise<BoundedSnapshot> {
    this.invalidatePageRefs(pageId);
    const refMap = this.getRefMapForPage(pageId);

    const url = page.url();
    const title = await page.title();
    const viewportSize = page.viewportSize() || { width: 1280, height: 720 };

    // Evaluate basic structural elements safely
    const rawData = await page.evaluate(() => {
      const headings: { level: number; text: string }[] = [];
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el: Element) => {
        const level = parseInt(el.tagName.replace('H', ''), 10);
        headings.push({ level, text: (el.textContent || '').trim().slice(0, 100) });
      });

      const landmarks: { role: string; name?: string }[] = [];
      document.querySelectorAll('header, nav, main, footer, section, [role]').forEach((el: Element) => {
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        const name = el.getAttribute('aria-label') || undefined;
        if (landmarks.length < 20) {
          landmarks.push({ role, name });
        }
      });

      const buttonsData: { text: string; role?: string; css: string }[] = [];
      document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach((el: Element, idx: number) => {
        if (buttonsData.length < 25) {
          buttonsData.push({
            text: (el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 80),
            role: 'button',
            css: el.id ? `#${el.id}` : `button:nth-of-type(${idx + 1})`,
          });
        }
      });

      const linksData: { href?: string; text: string; css: string }[] = [];
      document.querySelectorAll('a[href]').forEach((el: Element, idx: number) => {
        if (linksData.length < 25) {
          linksData.push({
            href: (el as HTMLAnchorElement).href,
            text: (el.textContent || '').trim().slice(0, 80),
            css: el.id ? `#${el.id}` : `a:nth-of-type(${idx + 1})`,
          });
        }
      });

      const inputsData: { type: string; name?: string; label?: string; value?: string; css: string }[] = [];
      document.querySelectorAll('input, select, textarea').forEach((el: Element, idx: number) => {
        if (inputsData.length < 25) {
          const inputEl = el as HTMLInputElement;
          inputsData.push({
            type: inputEl.type || el.tagName.toLowerCase(),
            name: inputEl.name || undefined,
            value: inputEl.type === 'password' ? '[REDACTED]' : (inputEl.value || '').slice(0, 50),
            css: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${idx + 1})`,
          });
        }
      });

      const visibleTextExcerpt = (document.body ? document.body.innerText || '' : '').slice(0, 2000);

      return { headings, landmarks, buttonsData, linksData, inputsData, visibleTextExcerpt };
    });

    const elementRefs: OpaqueElementRef[] = [];

    const buttons = rawData.buttonsData.map((b) => {
      const refId = `eref_${uuidv4().replace(/-/g, '').slice(0, 8)}`;
      const ref: OpaqueElementRef = {
        refId,
        pageId,
        tagName: 'button',
        role: 'button',
        textExcerpt: b.text,
        selectorFallback: b.css,
      };
      refMap.set(refId, { ref, selector: b.css });
      elementRefs.push(ref);
      return ref;
    });

    const links = rawData.linksData.map((l) => {
      const refId = `eref_${uuidv4().replace(/-/g, '').slice(0, 8)}`;
      const ref: OpaqueElementRef = {
        refId,
        pageId,
        tagName: 'a',
        role: 'link',
        textExcerpt: l.text,
        selectorFallback: l.css,
      };
      refMap.set(refId, { ref, selector: l.css });
      elementRefs.push(ref);
      return { href: l.href, text: l.text, ref };
    });

    const inputs = rawData.inputsData.map((i) => {
      const refId = `eref_${uuidv4().replace(/-/g, '').slice(0, 8)}`;
      const ref: OpaqueElementRef = {
        refId,
        pageId,
        tagName: 'input',
        textExcerpt: i.name || i.label || '',
        selectorFallback: i.css,
      };
      refMap.set(refId, { ref, selector: i.css });
      elementRefs.push(ref);
      return { type: i.type, name: i.name, label: i.label, value: i.value, ref };
    });

    const snapshot: BoundedSnapshot = {
      pageId,
      url,
      title,
      viewport: viewportSize,
      headings: rawData.headings,
      landmarks: rawData.landmarks,
      buttons,
      links,
      forms: [],
      inputs,
      visibleTextExcerpt: rawData.visibleTextExcerpt,
      elementRefs,
      truncated: false,
    };

    // Check size limit
    const jsonStr = JSON.stringify(snapshot);
    if (Buffer.byteLength(jsonStr, 'utf8') > maxBytes) {
      snapshot.visibleTextExcerpt = snapshot.visibleTextExcerpt.slice(0, 500);
      snapshot.elementRefs = snapshot.elementRefs.slice(0, 20);
      snapshot.truncated = true;
    }

    return snapshot;
  }

  public resolveLocator(pageId: string, page: Page, target: TargetInput): { locator: Locator; strategy: string } {
    if (target.elementRef) {
      const refMap = this.elementRefRegistry.get(pageId);
      const entry = refMap?.get(target.elementRef);
      if (!entry) {
        throw new ControllerError(
          'LOCATOR_NOT_FOUND',
          `Element reference "${target.elementRef}" is invalid or expired for page "${pageId}".`,
          400
        );
      }
      return { locator: page.locator(entry.selector), strategy: `elementRef:${target.elementRef}` };
    }

    if (target.role) {
      const locator = page.getByRole(target.role as any, { name: target.name, exact: false });
      return { locator, strategy: `getByRole(${target.role}, ${target.name || ''})` };
    }

    if (target.label) {
      return { locator: page.getByLabel(target.label), strategy: `getByLabel(${target.label})` };
    }

    if (target.placeholder) {
      return { locator: page.getByPlaceholder(target.placeholder), strategy: `getByPlaceholder(${target.placeholder})` };
    }

    if (target.testId) {
      return { locator: page.getByTestId(target.testId), strategy: `getByTestId(${target.testId})` };
    }

    if (target.text) {
      return { locator: page.getByText(target.text, { exact: false }), strategy: `getByText(${target.text})` };
    }

    if (target.css) {
      if (target.css.startsWith('//') || target.css.startsWith('xpath=')) {
        throw new ControllerError('LOCATOR_NOT_FOUND', 'XPath selectors are forbidden. Use accessible locators or CSS selectors.', 400);
      }
      return { locator: page.locator(target.css), strategy: `css(${target.css})` };
    }

    throw new ControllerError('LOCATOR_NOT_FOUND', 'No valid target locator strategy provided.', 400);
  }
}
