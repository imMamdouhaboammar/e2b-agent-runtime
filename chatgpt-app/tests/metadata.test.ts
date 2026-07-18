import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ChatGPT App Packaging Validation', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('validates app-metadata.json fields', () => {
    const filePath = path.join(rootDir, 'app-metadata.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(data.name).toBe('E2B Agent Runtime Controller');
    expect(data.version).toBeDefined();
    expect(data.description).toBeDefined();
    expect(data.auth.type).toBe('service_http');
    expect(data.auth.authorization_type).toBe('bearer');
    expect(data.endpoints.mcp).toBe('/mcp');
  });

  it('validates tool-catalog.json schema formatting', () => {
    const filePath = path.join(rootDir, 'tool-catalog.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(Array.isArray(data.tools)).toBe(true);
    expect(data.tools.length).toBeGreaterThan(0);

    for (const tool of data.tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(['read-only', 'state-changing', 'external-write', 'destructive']).toContain(
        tool.safety_classification
      );
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('validates approval-policy.json rules mapping', () => {
    const filePath = path.join(rootDir, 'approval-policy.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(data.policies.default_clearance).toBeDefined();
    expect(data.policies.classifications['read-only'].requires_confirmation).toBe(false);
    expect(data.policies.classifications['state-changing'].requires_confirmation).toBe(true);
    expect(data.policies.classifications['destructive'].requires_confirmation).toBe(true);
  });
});
