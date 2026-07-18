import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../../src/shared/logger.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

// Determine remote URL and access token
const serviceUrl = process.argv[2];
const token = process.argv[3];

if (!serviceUrl) {
  console.error('Error: Cloud Run service URL must be provided as the first argument.');
  process.exit(1);
}

if (!token) {
  console.error('Error: MCP access token must be provided as the second argument.');
  process.exit(1);
}

const mcpUrl = `${serviceUrl.replace(/\/$/, '')}/mcp`;

async function runSmokeTest() {
  console.log(`=== Starting Remote MCP Staging Smoke Test ===`);
  console.log(`Target URL: ${mcpUrl}`);

  // Setup transport pointing to Cloud Run with Auth Bearer token in headers
  const transport = new SSEClientTransport(new URL(mcpUrl), {
    eventSourceInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const client = new Client(
    {
      name: 'remote-smoke-test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  console.log('Connecting to remote MCP server...');
  await client.connect(transport);
  console.log('Connected successfully!');

  try {
    // 1. Tool Discovery
    console.log('Discovering available tools...');
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools;
    console.log(`Discovered ${tools.length} tools:`);
    for (const tool of tools) {
      console.log(` - ${tool.name}: ${tool.description}`);
    }

    // Verify presence of core runtime tools
    const expectedTools = ['runtime_create_session', 'runtime_run_command', 'runtime_destroy_session'];
    for (const et of expectedTools) {
      if (!tools.some((t) => t.name === et)) {
        throw new Error(`Required core tool '${et}' was not found in the list of discovered tools.`);
      }
    }
    console.log('All expected core tools are present.');

    // 2. Create E2B Session
    console.log('Creating E2B sandbox session...');
    const createRes = await client.callTool({
      name: 'runtime_create_session',
      arguments: {
        taskLabel: 'Staging Smoke Test',
        timeoutMs: 600000,
      },
    });

    if (createRes.isError) {
      throw new Error(`Failed to create session: ${JSON.stringify(createRes.content)}`);
    }

    const sessionInfo = JSON.parse((createRes.content[0] as any).text);
    const sessionId = sessionInfo.sessionId;
    console.log(`Created Session ID: ${sessionId}`);

    try {
      // 3. Run commands inside Sandbox
      const commands = [
        'pwd',
        'git status --short --branch',
        'node --version',
        'pnpm --version',
        'python3 --version || true',
      ];

      for (const cmd of commands) {
        console.log(`Executing inside Sandbox: '${cmd}'`);
        const runRes = await client.callTool({
          name: 'runtime_run_command',
          arguments: {
            sessionId,
            command: cmd,
          },
        });

        if (runRes.isError) {
          throw new Error(`Command failed inside Sandbox: ${JSON.stringify(runRes.content)}`);
        }

        const runResult = JSON.parse((runRes.content[0] as any).text);
        console.log(`Exit code: ${runResult.exitCode}`);
        console.log(`Output:`);
        console.log(runResult.stdout || runResult.stderr);

        // Security Credential Boundary Check:
        // Ensure no sensitive config/secrets are printed or present in output
        const outputText = `${runResult.stdout || ''} ${runResult.stderr || ''}`;
        const forbiddenKeywords = [
          process.env.E2B_API_KEY,
          process.env.MCP_ACCESS_TOKEN,
          process.env.DATABASE_URL,
        ].filter(Boolean) as string[];

        for (const fk of forbiddenKeywords) {
          if (outputText.includes(fk)) {
            throw new Error(`Security violation! Sensitive credential printed in command output.`);
          }
        }
      }
      console.log('Sandbox command executions completed successfully with full credential boundary verification!');

    } finally {
      // 4. Destroy Sandbox
      console.log(`Destroying sandbox session ${sessionId}...`);
      const destroyRes = await client.callTool({
        name: 'runtime_destroy_session',
        arguments: {
          sessionId,
        },
      });
      console.log(`Destroy output:`, (destroyRes.content[0] as any).text);
    }

  } finally {
    await client.close();
    console.log('Client connection closed cleanly.');
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test runner failed:', err);
  process.exit(1);
});
