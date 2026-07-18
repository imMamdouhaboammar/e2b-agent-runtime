import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { DiscoveredTool } from '../types.js';

export interface FilesystemProofResult {
  writeVerified: boolean;
  readVerified: boolean;
  targetPath: string;
  expectedContent: string;
}

export async function executeFilesystemProof(
  client: Client,
  tools: DiscoveredTool[]
): Promise<FilesystemProofResult> {
  const toolNames = tools.map((t) => t.name);

  // Find write tool
  const writeToolName =
    toolNames.find((name) => name === 'write_file' || name === 'write-file') ||
    toolNames.find((name) => name.toLowerCase().includes('write')) ||
    'write_file';

  // Find read tool
  const readToolName =
    toolNames.find((name) => name === 'read_file' || name === 'read-file') ||
    toolNames.find((name) => name.toLowerCase().includes('read')) ||
    'read_file';

  const targetPath = '/workspace/poc-marker.txt';
  const expectedContent = 'E2B MCP Phase 1 verified';

  // 1. Write file through MCP tool
  await client.callTool({
    name: writeToolName,
    arguments: {
      path: targetPath,
      content: expectedContent,
    },
  });

  const writeVerified = true;

  // 2. Read file through MCP tool
  const readResult = (await client.callTool({
    name: readToolName,
    arguments: {
      path: targetPath,
    },
  })) as { content?: Array<{ type: string; text?: string }> };

  let readText = '';
  if (readResult && Array.isArray(readResult.content)) {
    for (const item of readResult.content) {
      if (item.type === 'text' && typeof item.text === 'string') {
        readText += item.text;
      }
    }
  } else {
    readText = String(readResult);
  }

  const readVerified = readText.trim() === expectedContent.trim() || readText.includes(expectedContent);

  if (!readVerified) {
    throw new Error(
      `MCP Filesystem Read Verification Failed. Expected content "${expectedContent}", received "${readText.trim()}".`
    );
  }

  return {
    writeVerified,
    readVerified,
    targetPath,
    expectedContent,
  };
}
