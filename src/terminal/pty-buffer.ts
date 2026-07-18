export interface PtyReadResult {
  content: string;
  nextCursor: number;
  gap: boolean;
  truncated: boolean;
  minCursor: number;
  maxCursor: number;
}

export class PtyBuffer {
  private buffer: Buffer;
  private headCursor: number = 0; // Monotonic offset of total bytes appended
  private minAvailableCursor: number = 0;
  private maxCapacity: number;

  constructor(maxCapacity: number = 1048576) {
    this.maxCapacity = maxCapacity;
    this.buffer = Buffer.alloc(0);
  }

  public append(data: string | Uint8Array): number {
    const chunk = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
    if (chunk.length === 0) return this.headCursor;

    const newBuffer = Buffer.concat([this.buffer, chunk]);
    this.headCursor += chunk.length;

    if (newBuffer.length > this.maxCapacity) {
      const overflow = newBuffer.length - this.maxCapacity;
      this.buffer = newBuffer.subarray(overflow);
      this.minAvailableCursor += overflow;
    } else {
      this.buffer = newBuffer;
    }

    return this.headCursor;
  }

  public read(fromCursor?: number, maxBytes: number = 65536): PtyReadResult {
    const startCursor = fromCursor !== undefined ? Math.max(0, fromCursor) : this.minAvailableCursor;
    let gap = false;
    let actualStartCursor = startCursor;

    if (startCursor < this.minAvailableCursor) {
      gap = true;
      actualStartCursor = this.minAvailableCursor;
    }

    if (actualStartCursor >= this.headCursor) {
      return {
        content: '',
        nextCursor: this.headCursor,
        gap: false,
        truncated: false,
        minCursor: this.minAvailableCursor,
        maxCursor: this.headCursor,
      };
    }

    const bufferOffset = actualStartCursor - this.minAvailableCursor;
    const availableBytes = this.buffer.length - bufferOffset;
    const readLength = Math.min(availableBytes, maxBytes);
    const truncated = availableBytes > maxBytes;

    const slice = this.buffer.subarray(bufferOffset, bufferOffset + readLength);
    const content = slice.toString('utf8');
    const nextCursor = actualStartCursor + Buffer.byteLength(content, 'utf8');

    return {
      content,
      nextCursor,
      gap,
      truncated,
      minCursor: this.minAvailableCursor,
      maxCursor: this.headCursor,
    };
  }

  public clear(): void {
    this.buffer = Buffer.alloc(0);
    this.headCursor = 0;
    this.minAvailableCursor = 0;
  }

  public getCursors() {
    return {
      minCursor: this.minAvailableCursor,
      headCursor: this.headCursor,
      bufferedBytes: this.buffer.length,
    };
  }
}
