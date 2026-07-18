import { SessionRegistry, type SessionRecord } from '../runtime/session-registry.js';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  console.log('=== Running Security Cleanup & Resource Verification ===');

  const testFile = path.resolve('/tmp/session-registry-test.json');
  const registry = new SessionRegistry(testFile);
  await registry.load();
  
  // Register a dummy active session
  const dummySession: SessionRecord = {
    sessionId: 'verify-sess-1',
    e2bSandboxId: 'mock-sandbox-id-123',
    state: 'active',
    taskLabel: 'Security Cleanup Verification Run',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 100000).toISOString(),
    metadata: {},
  };

  await registry.saveSession(dummySession);

  const activeBefore = await registry.getActiveSessions();
  console.log(`Active sessions before cleanup: ${activeBefore.length}`);
  if (activeBefore.length !== 1 || activeBefore[0].sessionId !== 'verify-sess-1') {
    console.error('FAIL: Session failed to register correctly.');
    process.exit(1);
  }

  // Perform cleanup (mark as destroyed)
  await registry.updateSession('verify-sess-1', { state: 'destroyed' });

  const activeAfter = await registry.getActiveSessions();
  console.log(`Active sessions after cleanup: ${activeAfter.length}`);

  if (activeAfter.length !== 0) {
    console.error('FAIL: Active session was not cleaned up successfully.');
    process.exit(1);
  }

  // Cleanup temp file
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }

  console.log('SUCCESS: Resource cleanups and registry sweeping verified.');
  process.exit(0);
}

main();
