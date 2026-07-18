import { ControllerError } from '../shared/errors.js';
import type { BrowserConfig } from '../config.ts';
import { sanitizeUrlTokens } from './url-sanitizer.js';

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.google.internal.',
  '169.254.169.254.nip.io',
  'instance-data',
  '0.0.0.0', // when requested as external host or forbidden IP
]);

const INTERNAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '127.0.0.1.nip.io',
]);

const METADATA_IPS = [
  '169.254.169.254',
  '::ffff:a9fe:a9fe',
  '0000:0000:0000:0000:0000:ffff:a9fe:a9fe',
];

export interface NavigationPolicyCheckOptions {
  allowedPreviewHost?: string;
  allowedDomains?: string[];
}

export class NavigationGuard {
  constructor(private config: BrowserConfig) {}

  public validateUrl(rawUrl: string, options: NavigationPolicyCheckOptions = {}): { normalizedUrl: string; isInternal: boolean } {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new ControllerError('NAVIGATION_DENIED', 'Invalid URL: empty or non-string input.', 400);
    }

    const trimmed = rawUrl.trim();

    if (trimmed === 'about:blank') {
      return { normalizedUrl: 'about:blank', isInternal: true };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ControllerError('NAVIGATION_DENIED', `Invalid URL format: "${trimmed}".`, 400);
    }

    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (!this.config.allowedSchemes.includes(scheme)) {
      throw new ControllerError(
        'NAVIGATION_DENIED',
        `Navigation denied: Scheme "${scheme}:" is not permitted. Allowed schemes: ${this.config.allowedSchemes.join(', ')}.`,
        403
      );
    }

    if (parsed.username || parsed.password) {
      throw new ControllerError(
        'NAVIGATION_DENIED',
        'Navigation denied: URLs containing embedded user credentials (username/password) are forbidden.',
        403
      );
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (BLOCKED_HOSTS.has(hostname) || METADATA_IPS.includes(hostname)) {
      throw new ControllerError(
        'NAVIGATION_DENIED',
        `Navigation denied: Access to cloud metadata endpoint or restricted IP "${hostname}" is strictly forbidden.`,
        403
      );
    }

    // Block all link-local addresses — the metadata subnet is 169.254.169.254 but the
    // entire /16 is reserved for link-local use and must never be reachable from the Worker.
    if (hostname.startsWith('169.254.')) {
      throw new ControllerError(
        'NAVIGATION_DENIED',
        `Navigation denied: Access to link-local metadata address "${hostname}" is forbidden.`,
        403
      );
    }

    const isInternalHost = INTERNAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
    const isPreviewHost = Boolean(options.allowedPreviewHost && hostname === options.allowedPreviewHost.toLowerCase());
    const isExplicitDomain = Boolean(
      options.allowedDomains?.some((d) => hostname === d.toLowerCase() || hostname.endsWith('.' + d.toLowerCase()))
    );

    if (isInternalHost || isPreviewHost || isExplicitDomain) {
      return { normalizedUrl: parsed.toString(), isInternal: isInternalHost };
    }

    if (!this.config.allowExternalNavigation) {
      throw new ControllerError(
        'NAVIGATION_DENIED',
        `Navigation denied: External host "${hostname}" is not allowed under current navigation policy. Allowed internal targets: localhost/preview host.`,
        403
      );
    }

    return { normalizedUrl: parsed.toString(), isInternal: false };
  }

  public validateRedirect(originalUrl: string, targetUrl: string, options: NavigationPolicyCheckOptions = {}): string {
    const { normalizedUrl } = this.validateUrl(targetUrl, options);
    return normalizedUrl;
  }

  public sanitizeUrl(rawUrl: string): string {
    return sanitizeUrlTokens(rawUrl);
  }
}
