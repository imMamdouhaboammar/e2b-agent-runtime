# ADR 0002: ChatGPT App Packaging

## Context and Problem Statement
The Remote MCP Controller must connect securely to external AI reasoning clients, specifically ChatGPT. We need to evaluate the optimal packaging strategy for exposing our robust tool catalog to ChatGPT users/workspaces while maintaining extreme security, minimizing maintenance overhead, and ensuring compliance with the Model Context Protocol (MCP).

---

## Proposed Options

### Option 1: Pure Remote MCP Server
- **Description**: Exposing a standard streamable HTTP Remote MCP server directly to clients.
- **Pros**: Zero ChatGPT-specific packaging, works with any MCP-compliant client.
- **Cons**: Tool discovery requires manual configuration. Lacks custom metadata, privacy policies, or developer branding needed for corporate workspaces.

### Option 2: Remote MCP Server packaged as a custom ChatGPT App (Recommended)
- **Description**: Delivering the Remote MCP server bundled with a dedicated `app-metadata.json`, namespaced tool schemas (`tool-catalog.json`), and approval policies.
- **Pros**: Full compatibility with ChatGPT Actions/GPT manifests. Facilitates simple tool discovery, custom icons, privacy policy linkages, and standardized pre-flight approvals.
- **Cons**: Requires keeping the `app-metadata.json` updated with the latest API versions.

### Option 3: OpenAI Apps SDK Package without custom widget
- **Description**: Packaging the server using the official `@openai/agents` Apps SDK format without rendering interactive widgets.
- **Pros**: Direct integration with the OpenAI Developer ecosystem, structured manifest verification.
- **Cons**: Extra dependency footprint without immediate UI benefits if no widget is rendered.

### Option 4: OpenAI Apps SDK Package with minimal operational widget
- **Description**: Packaging using the `@openai/agents` SDK, rendering a frontend widget in the ChatGPT side-panel to display active terminal statuses and worker cleanups.
- **Pros**: High visual value, real-time feedback on validation progress and worker lifecycle.
- **Cons**: High UI development and maintenance costs; widgets are not yet universally supported in all enterprise workspaces.

### Option 5: Secure MCP Tunnel for private staging access
- **Description**: Running a local secure tunnel (e.g. Cloudflare Tunnels or ngrok) to bridge local/staging controllers to ChatGPT.
- **Pros**: High security for local development without exposing open ports.
- **Cons**: Introduces external proxy dependencies and potential latency bottlenecks.

### Option 6: Public HTTPS staging endpoint with strong authentication
- **Description**: Exposing the Controller on an authorized staging host (such as Google Cloud Run) guarded by `MCP_ACCESS_TOKEN` Bearer auth.
- **Pros**: Standard OAuth/Bearer compatibility, easy integration with ChatGPT Custom Actions.
- **Cons**: Endpoint is public, requiring strict rate-limiting and authorization guards.

---

## Comparative Matrix

| Evaluation Vector | Option 1 | Option 2 | Option 3 | Option 4 | Option 5 | Option 6 |
|---|---|---|---|---|---|---|
| **User Experience** | Good | **Excellent** | Good | Superior | Poor | Good |
| **Deployment Complexity**| Low | **Low** | Medium | High | High | Low |
| **Tool Discovery** | Manual | **Automatic** | Automatic | Automatic | Manual | Automatic |
| **Authentication** | Bearer | **Bearer/OAuth**| OAuth | OAuth | Tunnel-based| **Bearer** |
| **Security Risk** | Low | **Low** | Low | Low | Low | Low |
| **Maintenance Cost** | Low | **Low** | Medium | High | High | Low |

---

## Decision Outcome
We choose **Option 2 (Remote MCP server packaged as a custom ChatGPT App with standard Bearer Token auth)**, deployed on **Option 6 (Public HTTPS staging endpoint with strong authentication)**. 

### Rationale
A custom UI widget (Option 4) is **not justified** at this stage because our workflow is highly command-line and terminal-oriented; our execution logs and evidence ledger are already cleanly streamed as text and structured JSON in standard chat responses. A pure MCP-packaged custom app delivers maximum security, 100% compliance with current OpenAI GPT Actions specifications, and zero unnecessary frontend overhead.

---

## Verification Date
*Verified on:* July 18, 2026.
