import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionRecord, SessionRegistry } from '../../src/runtime/session-registry.js';

describe('SessionRegistry Persistence', () => {
  const testDir = path.resolve('.data-test-registry');
  const registryPath = path.join(testDir, 'test-sessions.json');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should initialize empty registry when file does not exist', async () => {
    const registry = new SessionRegistry(registryPath);
    await registry.load();

    const sessions = await registry.listSessions();
    expect(sessions).toEqual([]);
    expect(fs.existsSync(registryPath)).toBe(true);
  });

  it('should save and retrieve session record atomically', async () => {
    const registry = new SessionRegistry(registryPath);
    await registry.load();

    const record: SessionRecord = {
      sessionId: 'sess_123',
      e2bSandboxId: 'sbx_abc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      state: 'active',
      taskLabel: 'unit-test',
    };

    await registry.saveSession(record);

    const fetched = await registry.getSession('sess_123');
    expect(fetched).toEqual(record);

    // Verify persisted file content
    const fileContent = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(fileContent.sessions['sess_123']).toEqual(record);
  });

  it('should recover safely when JSON registry file is corrupted', async () => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(registryPath, '{ invalid_json_corrupt', 'utf-8');

    const registry = new SessionRegistry(registryPath);
    await registry.load();

    const sessions = await registry.listSessions();
    expect(sessions).toEqual([]);

    // Check backup file created
    const files = fs.readdirSync(testDir);
    const backup = files.find((f) => f.includes('.corrupt.'));
    expect(backup).toBeDefined();
  });

  it('should update session state and command status', async () => {
    const registry = new SessionRegistry(registryPath);
    await registry.load();

    const record: SessionRecord = {
      sessionId: 'sess_456',
      e2bSandboxId: 'sbx_def',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      state: 'active',
    };

    await registry.saveSession(record);
    const updated = await registry.updateSession('sess_456', {
      lastCommandStatus: 'success',
      state: 'destroyed',
    });

    expect(updated?.state).toBe('destroyed');
    expect(updated?.lastCommandStatus).toBe('success');
  });
});
