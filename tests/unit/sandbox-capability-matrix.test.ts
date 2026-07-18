import { describe, it, expect } from 'vitest';
import {
  DIRECT_E2B_CAPABILITIES,
  OPENAI_AGENTS_E2B_CAPABILITIES,
} from '../../src/sandbox/providerCapabilityMatrix.js';

describe('Sandbox Capability Matrix', () => {
  it('direct-e2b supports filesystem, commands, pty, ports, but not snapshots/pause', () => {
    expect(DIRECT_E2B_CAPABILITIES.commandExecution).toBe(true);
    expect(DIRECT_E2B_CAPABILITIES.pty).toBe(true);
    expect(DIRECT_E2B_CAPABILITIES.filesystemRead).toBe(true);
    expect(DIRECT_E2B_CAPABILITIES.exposedPorts).toBe(true);
    expect(DIRECT_E2B_CAPABILITIES.snapshots).toBe(false);
    expect(DIRECT_E2B_CAPABILITIES.pause).toBe(false);
  });

  it('openai-agents-e2b supports filesystem, commands, pty, ports, but not snapshots/pause', () => {
    expect(OPENAI_AGENTS_E2B_CAPABILITIES.commandExecution).toBe(true);
    expect(OPENAI_AGENTS_E2B_CAPABILITIES.pty).toBe(true);
    expect(OPENAI_AGENTS_E2B_CAPABILITIES.filesystemRead).toBe(true);
    expect(OPENAI_AGENTS_E2B_CAPABILITIES.exposedPorts).toBe(true);
    expect(OPENAI_AGENTS_E2B_CAPABILITIES.snapshots).toBe(false);
    expect(OPENAI_AGENTS_E2B_CAPABILITIES.pause).toBe(false);
  });
});
