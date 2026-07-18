import { describe, it, expect } from 'vitest';
import { SkillsRuntimeRegistry } from '../../src/runtime/skills-runtime.js';

describe('Gated Template Integration Test', () => {
  it('should verify runtime pack presence and manifests', () => {
    const registry = new SkillsRuntimeRegistry();
    const info = registry.getRuntimeInfo();
    expect(info.templateName).toBe('agent-coding-runtime-core');
    expect(info.runtimeVersion).toBe('0.1.0');
  });
});
