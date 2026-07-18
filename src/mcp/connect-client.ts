import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Sandbox } from 'e2b';
import type { DiscoveredTool } from '../types.js';

export interface ConnectedMcpClient {
  client: Client;
  tools: DiscoveredTool[];
  mcpToken?: string;
}

export async function connectMcpClient(sandbox: Sandbox): Promise<ConnectedMcpClient> {
  const mcpUrl = sandbox.getMcpUrl();
  const mcpToken = await sandbox.getMcpToken();

  if (!mcpUrl) {
    throw new Error('E2B Sandbox did not return a valid MCP URL.');
  }

  const client = new Client(
    { name: 'e2b-agent-runtime-poc', version: '0.0.1' },
    { capabilities: {} }
  );

  const headers: Record<string, string> = {};
  if (mcpToken) {
    headers['Authorization'] = `Bearer ${mcpToken}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers,
    },
  });

  await client.connect(transport);

  const toolsResponse = await client.listTools();
  const discoveredTools: DiscoveredTool[] = (toolsResponse.tools || []).map((t) => ({
    name: t.name,
    description: t.description,
  }));

  return {
    client,
    tools: discoveredTools,
    mcpToken,
  };
}
