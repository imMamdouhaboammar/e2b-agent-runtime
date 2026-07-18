import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import crypto from 'crypto';

async function run() {
  const app = express();
  
  const server = new McpServer({ name: 'test-mcp', version: '0.0.1' });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  
  transport.onerror = (err: any) => {
    console.error('[Transport Error] Captured:', err);
  };
  
  await server.connect(transport);
  
  app.all('/mcp', async (req: any, res: any) => {
    try {
      console.log(`[Server] Received ${req.method} request to /mcp`);
      await transport.handleRequest(req, res);
      console.log(`[Server] Completed handling ${req.method} request`);
    } catch (err: any) {
      console.error('[Server Error] catch block:', err);
      if (!res.headersSent) {
        res.status(500).send(err.message);
      }
    }
  });
  
  const port = 4444;
  app.listen(port, () => {
    console.log(`[Server] Local Express server running at http://localhost:${port}/mcp`);
  });
}

run().catch(console.error);
