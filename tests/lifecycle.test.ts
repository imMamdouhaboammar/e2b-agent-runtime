import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Sandbox } from 'e2b';
import { describe, expect, it, vi } from 'vitest';
import { safelyCloseClient, safelyKillSandbox } from '../src/e2b/lifecycle.js';

describe('Lifecycle Management', () => {
  describe('safelyCloseClient', () => {
    it('should return false if client is null or undefined', async () => {
      expect(await safelyCloseClient(null)).toBe(false);
      expect(await safelyCloseClient(undefined)).toBe(false);
    });

    it('should close client and return true on success', async () => {
      const mockClient = {
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as Client;

      const result = await safelyCloseClient(mockClient);
      expect(mockClient.close).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });

    it('should catch error and return false if client.close fails', async () => {
      const mockClient = {
        close: vi.fn().mockRejectedValue(new Error('Network error on close')),
      } as unknown as Client;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await safelyCloseClient(mockClient);

      expect(mockClient.close).toHaveBeenCalledOnce();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to close MCP client cleanly')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('safelyKillSandbox', () => {
    it('should return false if sandbox is null or undefined', async () => {
      expect(await safelyKillSandbox(null)).toBe(false);
      expect(await safelyKillSandbox(undefined)).toBe(false);
    });

    it('should kill sandbox and return true on success', async () => {
      const mockSandbox = {
        kill: vi.fn().mockResolvedValue(undefined),
      } as unknown as Sandbox;

      const result = await safelyKillSandbox(mockSandbox);
      expect(mockSandbox.kill).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });

    it('should catch error and return false if sandbox.kill fails', async () => {
      const mockSandbox = {
        kill: vi.fn().mockRejectedValue(new Error('API connection lost during kill')),
      } as unknown as Sandbox;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await safelyKillSandbox(mockSandbox);

      expect(mockSandbox.kill).toHaveBeenCalledOnce();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to kill Sandbox cleanly')
      );
      consoleSpy.mockRestore();
    });
  });
});
