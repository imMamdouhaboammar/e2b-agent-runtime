import { z } from 'zod';

export const BROWSER_SESSION_STATES = [
  'CREATING',
  'READY',
  'NAVIGATING',
  'INTERACTING',
  'TRACING',
  'FAILED',
  'CLOSING',
  'CLOSED',
  'EXPIRED',
] as const;

export type BrowserSessionState = (typeof BROWSER_SESSION_STATES)[number];

export interface BrowserViewport {
  width: number;
  height: number;
}

export interface BrowserSessionRecord {
  browserSessionId: string;
  workspaceId: string;
  taskId?: string;
  engine: string;
  engineVersion: string;
  state: BrowserSessionState;
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
  headSha: string;
  processId?: string;
  previewId?: string;
  contextId: string;
  pageIds: string[];
  activePageId?: string;
  traceActive: boolean;
  activeTraceId?: string;
  artifactIds: string[];
  consoleCount: number;
  pageErrorCount: number;
  networkFailureCount: number;
  failureSummary?: string;
  viewport: BrowserViewport;
  locale?: string;
  timezoneId?: string;
  colorScheme?: 'light' | 'dark' | 'no-preference';
  reducedMotion?: 'reduce' | 'no-preference';
  userAgent?: string;
  ignoreHTTPSErrors: boolean;
}

export interface PreviewRecord {
  previewId: string;
  workspaceId: string;
  port: number;
  protocol: string;
  internalUrl: string;
  externalHost?: string;
  externalUrl?: string;
  accessMode: 'internal-only' | 'external-public' | 'external-restricted';
  processId?: string;
  createdAt: string;
}

export interface OpaqueElementRef {
  refId: string;
  pageId: string;
  tagName: string;
  role?: string;
  name?: string;
  textExcerpt?: string;
  selectorFallback: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export const TargetSchema = z.object({
  elementRef: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  testId: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  text: z.string().optional(),
  css: z.string().optional(),
});

export type TargetInput = z.infer<typeof TargetSchema>;

export type SnapshotMode = 'accessibility' | 'visible-text' | 'structure';

export interface BoundedSnapshot {
  pageId: string;
  url: string;
  title: string;
  viewport: BrowserViewport;
  headings: { level: number; text: string }[];
  landmarks: { role: string; name?: string }[];
  buttons: OpaqueElementRef[];
  links: { href?: string; text: string; ref: OpaqueElementRef }[];
  forms: { id?: string; action?: string }[];
  inputs: { type: string; name?: string; label?: string; value?: string; ref: OpaqueElementRef }[];
  visibleTextExcerpt: string;
  elementRefs: OpaqueElementRef[];
  truncated: boolean;
}

export interface ConsoleEntry {
  id: string;
  pageId: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  location?: string;
  timestamp: string;
  sanitizedHash: string;
}

export interface PageErrorEntry {
  id: string;
  pageId: string;
  message: string;
  stack?: string;
  timestamp: string;
}

export interface NetworkFailureEntry {
  id: string;
  pageId: string;
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  failureCategory: string;
  durationMs: number;
  sizeBytes?: number;
  timestamp: string;
}

export interface ArtifactMetadata {
  artifactId: string;
  workspaceId: string;
  taskId?: string;
  browserSessionId: string;
  artifactType: 'screenshot' | 'trace' | 'console-summary' | 'network-summary' | 'accessibility-report' | 'cycle-report';
  filename: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  expiresAt: string;
  sourceHeadSha: string;
  sensitive: boolean;
  retrievalState: 'available' | 'expired' | 'deleted';
}

export const BROWSER_FAILURE_CATEGORIES = [
  'application-start',
  'navigation',
  'redirect',
  'DNS',
  'TLS',
  'timeout',
  'locator-not-found',
  'locator-ambiguous',
  'actionability',
  'assertion',
  'JavaScript',
  'hydration',
  'console',
  'network',
  'HTTP-client-error',
  'HTTP-server-error',
  'accessibility',
  'browser-crash',
  'process-exit',
  'resource-limit',
  'unknown',
] as const;

export type BrowserFailureCategory = (typeof BROWSER_FAILURE_CATEGORIES)[number];

export interface BrowserFailureClassification {
  category: BrowserFailureCategory;
  confidence: number;
  evidenceReferences: string[];
  affectedUrl?: string;
  likelySourceArea?: string;
  suggestedInspectionActions: string[];
  remainingRepairBudget?: number;
}

export interface BrowserVerificationCycleRecord {
  cycleId: string;
  taskId: string;
  browserSessionId: string;
  label: string;
  startHeadSha: string;
  endHeadSha?: string;
  previewId: string;
  processId?: string;
  expectedFlows: string[];
  expectedAssertions: string[];
  evidenceIds: string[];
  status: 'in-progress' | 'passed' | 'failed' | 'incomplete' | 'blocked';
  consoleErrors: number;
  pageErrors: number;
  networkFailures: number;
  accessibilityFindings: number;
  startedAt: string;
  completedAt?: string;
  summary?: string;
}

export const BROWSER_EVIDENCE_CATEGORIES = [
  'browser-navigation',
  'browser-assertion',
  'browser-console',
  'browser-page-error',
  'browser-network',
  'browser-screenshot',
  'browser-trace',
  'browser-accessibility',
  'browser-flow',
] as const;

export type BrowserEvidenceCategory = (typeof BROWSER_EVIDENCE_CATEGORIES)[number];

export interface BrowserEvidencePayload {
  taskId: string;
  workspaceId: string;
  browserSessionId: string;
  cycleId?: string;
  pageId?: string;
  headSha: string;
  processId?: string;
  previewId?: string;
  url: string;
  category: BrowserEvidenceCategory;
  status: 'passed' | 'failed' | 'incomplete';
  artifactRefs?: string[];
  sanitizedSummary: string;
  details?: Record<string, unknown>;
}
