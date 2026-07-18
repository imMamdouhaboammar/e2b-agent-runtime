import { describe, it, expect } from 'vitest';
import { ReleaseReadinessEvaluator } from '../../src/security/releaseReadinessEvaluator.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('Phase 10: Release Readiness Evaluator & Metadata Unit Tests', () => {
  it('loads and evaluates all release gates successfully', async () => {
    const evaluator = new ReleaseReadinessEvaluator();
    const result = await evaluator.evaluate();

    expect(result.releaseState).toBeDefined();
    expect(['NOT_EVALUATED', 'BLOCKED', 'CONDITIONALLY_READY', 'MVP_READY', 'STAGING_READY', 'PRODUCTION_NOT_APPROVED']).toContain(
      result.releaseState
    );
    expect(result.versionCandidate).toBe('0.0.1-rc1');
    expect(result.gates.length).toBeGreaterThan(0);

    for (const gate of result.gates) {
      expect(gate.id).toBeDefined();
      expect(gate.name).toBeDefined();
      expect(gate.category).toBeDefined();
      expect(typeof gate.passed).toBe('boolean');
    }
  });

  it('validates physical presence of ChatGPT custom app manifests', () => {
    const appDir = path.join(projectRoot, 'chatgpt-app');
    
    expect(fs.existsSync(path.join(appDir, 'app-metadata.json'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'tool-catalog.json'))).toBe(true);
    expect(fs.existsSync(path.join(appDir, 'approval-policy.json'))).toBe(true);
  });
});
