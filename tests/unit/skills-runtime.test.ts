import { describe, it, expect } from 'vitest';
import { SkillsRuntimeRegistry } from '../../src/runtime/skills-runtime.js';

describe('SkillsRuntimeRegistry Unit Tests', () => {
  const registry = new SkillsRuntimeRegistry();

  it('should return valid runtime info', () => {
    const info = registry.getRuntimeInfo();
    expect(info.runtimeVersion).toBe('0.2.0');
    expect(info.securityMode).toBe('pr-only-no-direct-push');
  });

  it('should list all available skills', () => {
    const skills = registry.listSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.name === 'tool-routing')).toBe(true);
  });

  it('should load a valid skill with content hash', () => {
    const skill = registry.loadSkill('tool-routing');
    expect(skill.name).toBe('tool-routing');
    expect(skill.content).toContain('Tool Routing Skill');
    expect(skill.contentHash).toBeDefined();
  });

  it('should reject path traversal in skill names', () => {
    expect(() => registry.loadSkill('../MANIFEST.json')).toThrow(/INVALID_SKILL_NAME/);
    expect(() => registry.loadSkill('/etc/passwd')).toThrow(/INVALID_SKILL_NAME/);
  });

  it('should load structured workflow definitions', () => {
    const workflow = registry.getWorkflow('feature-to-pr');
    expect(workflow.name).toBe('feature-to-pr');
    expect(workflow.taskModes).toContain('feature');
    expect(workflow.prohibitedActions).toContain('merge');
  });

  it('should create and retrieve session checkpoints', () => {
    const checkpoint = registry.createCheckpoint('ws-test-123', {
      repository: 'owner/repo',
      branch: 'feat/test',
      nextAction: 'verify-pr',
    });
    expect(checkpoint.workspaceId).toBe('ws-test-123');
    expect(checkpoint.repository).toBe('owner/repo');
  });
});
