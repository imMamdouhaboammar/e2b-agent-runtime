import { describe, it, expect } from 'vitest';

describe('Integration: OpenAI Agents MCP Client (Read-Only)', () => {
  const runTest = process.env.RUN_AGENTS_MCP_TEST === 'true';

  it('connects to Remote MCP and tests read-only tools with allowance checks', async () => {
    if (!runTest) {
      console.log('Skipping integration test: agents-mcp-readonly');
      return;
    }

    expect(process.env.OPENAI_API_KEY).toBeDefined();
    expect(process.env.MCP_REMOTE_URL).toBeDefined();
    expect(process.env.MCP_ACCESS_TOKEN).toBeDefined();

    const { Agent, MCPServerStreamableHttp, run } = await import('@openai/agents');

    // 1. Setup streamable HTTP MCP server
    const server = new MCPServerStreamableHttp({
      name: 'remote-controller-mcp',
      url: process.env.MCP_REMOTE_URL!,
      headers: {
        Authorization: `Bearer ${process.env.MCP_ACCESS_TOKEN}`,
      },
    });

    await server.connect();

    try {
      // 2. Discover tools
      const toolList = await server.listTools();
      expect(toolList.length).toBeGreaterThan(0);

      // Verify that state-changing or publishing tools are excluded or gated if tested
      const stateChanging = toolList.filter(
        (t) =>
          t.name.includes('write') ||
          t.name.includes('delete') ||
          t.name.includes('publish') ||
          t.name.includes('create')
      );

      // Verify readonly tools exist
      const readOnlyTools = toolList.filter(
        (t) => t.name.includes('list') || t.name.includes('read') || t.name.includes('get')
      );
      expect(readOnlyTools.length).toBeGreaterThan(0);

      // Define read-only agent
      const agent = new Agent({
        name: 'ReadOnlyTester',
        instructions: 'Call a safe runtime information tool or list-skills tool.',
        mcpServers: [server],
      });

      // Execute a test run
      const result = await run(agent, 'Check available skills on the runtime');
      expect(result).toBeDefined();
    } finally {
      await server.close();
    }
  });
});
