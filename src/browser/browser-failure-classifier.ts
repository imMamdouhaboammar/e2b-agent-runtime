import type { BrowserFailureCategory, BrowserFailureClassification } from './types.js';

interface ClassificationRule {
  /** Returns true when this rule applies to the lowercased error message. */
  match: (msg: string) => boolean;
  category: BrowserFailureCategory;
  confidence: number;
  likelySourceArea: string;
  suggestedInspectionActions: string[];
}

/**
 * Priority-ordered classification rules.
 *
 * Why a declarative table instead of if/else: adding a new failure category
 * previously required editing the dispatch function (OCP violation) and pushed
 * cyclomatic complexity above the threshold of 10. New categories are now
 * additions to this array — the classify() function itself never changes.
 */
const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    match: (msg) => (msg.includes('navigation') || msg.includes('goto')) && (msg.includes('dns') || msg.includes('err_name_not_resolved')),
    category: 'DNS',
    confidence: 0.9,
    likelySourceArea: 'Network / DNS Host Resolution',
    suggestedInspectionActions: ['Verify dev server host and preview port binding'],
  },
  {
    match: (msg) => (msg.includes('navigation') || msg.includes('goto')) && (msg.includes('cert') || msg.includes('ssl') || msg.includes('tls')),
    category: 'TLS',
    confidence: 0.9,
    likelySourceArea: 'HTTPS Certificate Configuration',
    suggestedInspectionActions: ['Check HTTPS certificate or configure ignoreHTTPSErrors for test server'],
  },
  {
    match: (msg) => msg.includes('timeout'),
    category: 'timeout',
    confidence: 0.85,
    likelySourceArea: 'Application Server Startup / Port Readiness',
    suggestedInspectionActions: ['Check server logs and verify server is listening on port'],
  },
  {
    match: (msg) => msg.includes('navigation') || msg.includes('goto'),
    category: 'navigation',
    confidence: 0.8,
    likelySourceArea: 'Routing / URL Resolution',
    suggestedInspectionActions: ['Inspect route definition and preview URL resolution'],
  },
  {
    match: (msg) => (msg.includes('locator') || msg.includes('target') || msg.includes('element')) && (msg.includes('strict mode violation') || msg.includes('resolved to 2') || msg.includes('ambiguous')),
    category: 'locator-ambiguous',
    confidence: 0.95,
    likelySourceArea: 'UI Test Locator Selection',
    suggestedInspectionActions: ['Refine target locator to use role, label, or specific testId'],
  },
  {
    match: (msg) => msg.includes('locator') || msg.includes('target') || msg.includes('element'),
    category: 'locator-not-found',
    confidence: 0.9,
    likelySourceArea: 'DOM Component Structure',
    suggestedInspectionActions: ['Inspect DOM snapshot to confirm element text, role, or testId'],
  },
  {
    match: (msg) => msg.includes('assertion') || msg.includes('assert'),
    category: 'assertion',
    confidence: 0.95,
    likelySourceArea: 'Application State / Component Behavior',
    suggestedInspectionActions: ['Compare expected vs actual state excerpt in assertion evidence'],
  },
  {
    match: (msg) => msg.includes('hydration'),
    category: 'hydration',
    confidence: 0.9,
    likelySourceArea: 'SSR / Client Hydration Mismatch',
    suggestedInspectionActions: ['Inspect console error stack trace for server vs client render mismatch'],
  },
  {
    match: (msg) => msg.includes('uncaught') || msg.includes('javascript') || msg.includes('react'),
    category: 'JavaScript',
    confidence: 0.85,
    likelySourceArea: 'Client Runtime JavaScript',
    suggestedInspectionActions: ['Check page error buffer and component event handlers'],
  },
  {
    match: (msg) => msg.includes('accessibility') || msg.includes('wcag') || msg.includes('axe'),
    category: 'accessibility',
    confidence: 0.95,
    likelySourceArea: 'Component Accessibility Attributes (HTML/ARIA)',
    suggestedInspectionActions: ['Review axe-core accessibility findings and fix missing alt text or ARIA roles'],
  },
  {
    match: (msg) => msg.includes('crash') || msg.includes('target closed') || msg.includes('browser'),
    category: 'browser-crash',
    confidence: 0.9,
    likelySourceArea: 'Browser Engine / Worker Memory',
    suggestedInspectionActions: ['Check Worker memory limits and close unused pages/contexts'],
  },
];

const FALLBACK_RULE: Omit<ClassificationRule, 'match'> = {
  category: 'unknown',
  confidence: 0.5,
  likelySourceArea: 'Frontend / Application Code',
  suggestedInspectionActions: ['Inspect console logs, network requests, and page error buffer'],
};

export class BrowserFailureClassifier {
  public classify(params: {
    taskId: string;
    browserSessionId: string;
    errorMessage?: string;
    evidenceIds?: string[];
    affectedUrl?: string;
    remainingRepairBudget?: number;
  }): BrowserFailureClassification {
    const { errorMessage = '', evidenceIds = [], affectedUrl, remainingRepairBudget } = params;
    const msg = errorMessage.toLowerCase();

    const matched = CLASSIFICATION_RULES.find((rule) => rule.match(msg)) ?? FALLBACK_RULE;

    return {
      category: matched.category,
      confidence: matched.confidence,
      evidenceReferences: evidenceIds,
      affectedUrl,
      likelySourceArea: matched.likelySourceArea,
      suggestedInspectionActions: [...matched.suggestedInspectionActions],
      remainingRepairBudget,
    };
  }
}
