import { describe, expect, it } from 'vitest';
import { validateWorkspaceCwd } from '../../src/security/paths.js';

describe('Path Security Module', () => {
  it('should default to /workspace when undefined or empty string', () => {
    expect(validateWorkspaceCwd()).toBe('/workspace');
    expect(validateWorkspaceCwd('')).toBe('/workspace');
    expect(validateWorkspaceCwd('   ')).toBe('/workspace');
  });

  it('should allow valid subdirectories under /workspace', () => {
    expect(validateWorkspaceCwd('/workspace')).toBe('/workspace');
    expect(validateWorkspaceCwd('/workspace/src')).toBe('/workspace/src');
    expect(validateWorkspaceCwd('/workspace/sub/dir')).toBe('/workspace/sub/dir');
  });

  it('should normalize paths containing dot components within /workspace', () => {
    expect(validateWorkspaceCwd('/workspace/./src/../sub')).toBe('/workspace/sub');
  });

  it('should reject paths escaping /workspace', () => {
    expect(() => validateWorkspaceCwd('/workspace/..')).toThrowError(/escapes allowed root/);
    expect(() => validateWorkspaceCwd('/workspace/../root')).toThrowError(/escapes allowed root/);
    expect(() => validateWorkspaceCwd('/root')).toThrowError(/escapes allowed root/);
    expect(() => validateWorkspaceCwd('/etc/passwd')).toThrowError(/escapes allowed root/);
    expect(() => validateWorkspaceCwd('/tmp')).toThrowError(/escapes allowed root/);
  });

  it('should reject null bytes in path', () => {
    expect(() => validateWorkspaceCwd('/workspace/test\0file')).toThrowError(/null bytes/);
  });
});
