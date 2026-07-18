import { Agent, MCPServerStreamableHttp, run } from '@openai/agents';
import dotenv from 'dotenv';

dotenv.config();

async function start() {
  const isReadonly = process.argv.includes('--readonly');
  const isWorkspace = process.argv.includes('--workspace');

  console.log('=== OpenAI Agents MCP Client Example ===');
  console.log(`Mode: ${isReadonly ? 'Read-only' : isWorkspace ? 'Workspace (Write)' : 'Not Specified'}`);

  const mcpUrl = process.env.MCP_REMOTE_URL;
  const token = process.env.MCP_ACCESS_TOKEN;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!mcpUrl || !token || !openaiApiKey) {
    console.error('Error: Please configure MCP_REMOTE_URL, MCP_ACCESS_TOKEN, and OPENAI_API_KEY in .env file.');
    process.exit(1);
  }

  // Define approval handler if state changing or workspace mode is enabled
  const approvalHandler = async (toolCall: any) => {
    console.log(`\n⚠️  Approval Required for Tool Call: ${toolCall.name}`);
    console.log(`Arguments: ${JSON.stringify(toolCall.arguments)}`);
    
    if (isReadonly) {
      console.log('REJECTED: Running in read-only mode.');
      return false;
    }

    console.log('CONFIRMED: Proceeding with tool execution (Auto-approved for demo).');
    return true;
  };

  const server = new MCPServerStreamableHttp({
    name: 'e2b-agent-runtime-controller',
    url: mcpUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await server.connect();
  console.log('Connected to Remote MCP Controller.');

  try {
    const tools = await server.listTools();
    console.log(`Discovered ${tools.length} tools.`);

    const agent = new Agent({
      name: 'McpAssistant',
      instructions: 'Analyze the workspace and report findings. Only read state or execute commands if approved.',
      mcpServers: [server],
    });

    const prompt = isReadonly
      ? 'List available skills inside the runtime'
      : 'Create a temporary testing file named hello.txt in the workspace';

    console.log(`Sending Prompt to Agent: "${prompt}"`);
    const result = await run(agent, prompt, {
      toolCallApproval: approvalHandler,
    });

    console.log('\nAgent Response:');
    console.log(result);
  } finally {
    await server.close();
    console.log('Connection closed.');
  }
}

start().catch((err) => {
  console.error('Example failed:', err);
});
