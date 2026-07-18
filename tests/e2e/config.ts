export const e2eConfig = {
  mcpUrl: process.env.MCP_REMOTE_URL || 'http://127.0.0.1:3000/mcp',
  accessToken: process.env.MCP_ACCESS_TOKEN || 'test-access-token',
  allowExternalWrite: process.env.ALLOW_EXTERNAL_WRITE === 'true', // Safety flag gate
  allowPrCreation: process.env.ALLOW_PR_CREATION === 'true', // Safety flag gate
  timeoutMs: 120000,
  dogfoodRepository: 'imMamdouhaboammar/e2b-agent-runtime-dogfood',
};
