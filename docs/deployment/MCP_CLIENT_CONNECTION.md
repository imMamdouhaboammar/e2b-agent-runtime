# Connecting Remote MCP Clients to Cloud Run Staging

This guide explains how to connect Model Context Protocol (MCP) clients—including CLI tools, custom agent apps, or developer IDEs—to your private deployed staging Controller.

---

## 1. Connection Architecture

The E2B Agent Runtime Controller exposes its MCP server over a **Streamable HTTP (SSE) Transport** at:
`https://[YOUR_CLOUD_RUN_SERVICE_URL]/mcp`

All incoming requests to `/mcp` require a secure Bearer token passed in the standard HTTP `Authorization` header:

```
Authorization: Bearer <MCP_ACCESS_TOKEN>
```

---

## 2. Client Configurations

### TypeScript / Node.js SDK Connection Example

Using the official `@modelcontextprotocol/sdk` package, configure the client with `SSEClientTransport`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const serviceUrl = "https://e2b-agent-runtime-staging-bf8e6a-ew.a.run.app"; // Replace with actual URL
const accessToken = "your_mcp_access_token_here";

const transport = new SSEClientTransport(
  new URL(`${serviceUrl}/mcp`),
  {
    eventSourceInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  }
);

const client = new Client({
  name: "custom-mcp-client",
  version: "1.0.0"
});

await client.connect(transport);
console.log("Connected successfully!");

// Discover tools
const tools = await client.listTools();
console.log(tools);
```

### Python SDK Connection Example

Using the official Python `mcp` library:

```python
import asyncio
from mcp import ClientSession
from mcp.client.sse import sse_client

async def main():
    service_url = "https://e2b-agent-runtime-staging-bf8e6a-ew.a.run.app" # Replace with actual URL
    access_token = "your_mcp_access_token_here"
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    async with sse_client(f"{service_url}/mcp", headers=headers) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            
            # List tools
            tools_result = await session.list_tools()
            print("Available Tools:", tools_result.tools)

asyncio.run(main())
```

---

## 3. Custom Agent / Client Integrations (e.g., n8n, Flowise)

When integrating the MCP Controller into low-code or orchestrator environments:

1. **Transport Type**: Select **Server-Sent Events (SSE)**.
2. **URL**: Set to `https://[YOUR_CLOUD_RUN_SERVICE_URL]/mcp`.
3. **Headers / Authentication**:
   - Add Header Name: `Authorization`
   - Header Value: `Bearer <MCP_ACCESS_TOKEN>`
4. **Method**: Allow both `GET` (for SSE initialization stream) and `POST` (for JSON-RPC tool-call dispatches).
