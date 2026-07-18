export interface AppConfig {
  apiKey: string;
  sandboxTimeoutMs: number;
}

export interface PoCResult {
  status: 'passed' | 'failed';
  sandboxCreated: boolean;
  mcpConnected: boolean;
  toolsDiscovered: number;
  filesystemWriteVerified: boolean;
  filesystemReadVerified: boolean;
  terminalChecksPassed: boolean;
  sandboxDestroyed: boolean;
  error?: string;
}

export interface DiscoveredTool {
  name: string;
  description?: string;
}

export interface TerminalCheckResult {
  success: boolean;
  outputs: Record<string, string>;
  error?: string;
}
