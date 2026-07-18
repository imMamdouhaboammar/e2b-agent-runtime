import { describe, it, expect } from 'vitest';
import { PtyBuffer } from '../../src/terminal/pty-buffer.js';

describe('PtyBuffer Unit Tests', () => {
  it('should initialize with 0 cursors', () => {
    const buf = new PtyBuffer(1024);
    const cursors = buf.getCursors();
    expect(cursors.headCursor).toBe(0);
    expect(cursors.minCursor).toBe(0);
    expect(cursors.bufferedBytes).toBe(0);
  });

  it('should append data and advance head cursor monotonically', () => {
    const buf = new PtyBuffer(1024);
    buf.append('hello');
    expect(buf.getCursors().headCursor).toBe(5);
    buf.append(' world');
    expect(buf.getCursors().headCursor).toBe(11);
  });

  it('should read incremental output using cursors', () => {
    const buf = new PtyBuffer(1024);
    buf.append('line 1\n');
    const read1 = buf.read(0);
    expect(read1.content).toBe('line 1\n');
    expect(read1.nextCursor).toBe(7);
    expect(read1.gap).toBe(false);

    buf.append('line 2\n');
    const read2 = buf.read(read1.nextCursor);
    expect(read2.content).toBe('line 2\n');
    expect(read2.nextCursor).toBe(14);
  });

  it('should detect output gap when requesting discarded historical offset', () => {
    const buf = new PtyBuffer(10); // Small buffer
    buf.append('12345');
    buf.append('67890abcde'); // Evicts initial 5 bytes

    const read = buf.read(0);
    expect(read.gap).toBe(true);
    expect(read.minCursor).toBe(5);
    expect(read.content).toBe('67890abcde');
  });

  it('should handle unicode characters safely', () => {
    const buf = new PtyBuffer(1024);
    buf.append('🚀 Hello World 🌍');
    const read = buf.read(0);
    expect(read.content).toBe('🚀 Hello World 🌍');
  });

  it('should handle duplicate cursor requests without duplication', () => {
    const buf = new PtyBuffer(1024);
    buf.append('test data');
    const res1 = buf.read(0);
    const res2 = buf.read(0);
    expect(res1.content).toBe(res2.content);
    expect(res1.nextCursor).toBe(res2.nextCursor);
  });
});
