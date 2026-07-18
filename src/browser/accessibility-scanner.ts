import type { Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { v4 as uuidv4 } from 'uuid';
import { ControllerError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export interface AccessibilityFinding {
  ruleId: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  helpSummary: string;
  affectedElementCount: number;
  boundedLocatorExcerpts: string[];
}

export interface AccessibilityScanResult {
  scanId: string;
  evidenceId: string;
  pageId: string;
  url: string;
  timestamp: string;
  passCount: number;
  violationCount: number;
  findings: AccessibilityFinding[];
  truncated: boolean;
  legalDisclaimer: string;
}

export class AccessibilityScanner {
  public async scanPage(params: {
    pageId: string;
    page: Page;
    taskId?: string;
    browserSessionId: string;
    impactLevels?: ('critical' | 'serious' | 'moderate' | 'minor')[];
    maxFindings?: number;
  }): Promise<AccessibilityScanResult> {
    const { pageId, page, taskId, browserSessionId, impactLevels, maxFindings = 100 } = params;
    const scanId = `ascan_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const evidenceId = `ev_a11y_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const timestamp = new Date().toISOString();

    let findings: AccessibilityFinding[] = [];
    let passCount = 0;
    let violationCount = 0;
    let truncated = false;

    try {
      const builder = new AxeBuilder({ page });
      if (impactLevels && impactLevels.length > 0) {
        builder.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
      }

      const results = await builder.analyze();
      passCount = results.passes.length;
      violationCount = results.violations.length;

      for (const v of results.violations) {
        const impact = (v.impact || 'minor') as 'critical' | 'serious' | 'moderate' | 'minor';
        if (impactLevels && !impactLevels.includes(impact)) continue;

        const excerpts = v.nodes.slice(0, 5).map((n) => n.target.join(' '));

        findings.push({
          ruleId: v.id,
          impact,
          description: v.description,
          helpSummary: v.help,
          affectedElementCount: v.nodes.length,
          boundedLocatorExcerpts: excerpts,
        });

        if (findings.length >= maxFindings) {
          truncated = true;
          break;
        }
      }
    } catch (err) {
      logger.warn('browser.accessibility.axe_failed_fallback', { pageId, error: String(err) });
      // Basic structural fallback check for images without alt tags and unlabelled buttons
      const fallbackViolations = await page.evaluate(() => {
        const issues: { ruleId: string; impact: string; description: string; excerpts: string[] }[] = [];
        const imgsWithoutAlt = document.querySelectorAll('img:not([alt])');
        if (imgsWithoutAlt.length > 0) {
          issues.push({
            ruleId: 'image-alt',
            impact: 'critical',
            description: 'Images must have alternate text',
            excerpts: Array.from(imgsWithoutAlt).slice(0, 5).map((i: Element) => i.outerHTML.slice(0, 100)),
          });
        }
        const emptyButtons = document.querySelectorAll('button:empty:not([aria-label])');
        if (emptyButtons.length > 0) {
          issues.push({
            ruleId: 'button-name',
            impact: 'critical',
            description: 'Buttons must have discernible text',
            excerpts: Array.from(emptyButtons).slice(0, 5).map((b: Element) => b.outerHTML.slice(0, 100)),
          });
        }
        return issues;
      });

      for (const f of fallbackViolations) {
        findings.push({
          ruleId: f.ruleId,
          impact: f.impact as any,
          description: f.description,
          helpSummary: f.description,
          affectedElementCount: f.excerpts.length,
          boundedLocatorExcerpts: f.excerpts,
        });
      }
      violationCount = findings.length;
    }

    return {
      scanId,
      evidenceId,
      pageId,
      url: page.url(),
      timestamp,
      passCount,
      violationCount,
      findings,
      truncated,
      legalDisclaimer: 'Automated accessibility scan results indicate potential WCAG violations for technical testing and do not guarantee legal compliance.',
    };
  }
}
