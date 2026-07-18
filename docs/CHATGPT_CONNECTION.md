# Connecting ChatGPT to the Remote MCP Server

This guide explains how to package and configure the E2B Agent Runtime Remote MCP Server as a **Custom ChatGPT App (GPT)**.

## Setup Overview

Custom GPTs allow ChatGPT Plus, Team, and Enterprise users to connect external API services via OpenAPI schemas. We expose the Remote MCP Server as a secure standard Web Action with Bearer Token authentication.

### 1. Requirements

- A deployed instance of the **E2B Agent Runtime Controller**.
- A secure domain with HTTPS enabled (e.g., `https://your-runtime.fly.dev`).
- A secure **Access Token** configured in the `MCP_ACCESS_TOKEN` environment variable on the server.

### 2. Configure ChatGPT Action

1. Navigate to [ChatGPT](https://chat.openai.com) and click **Explore GPTs** -> **Create**.
2. Go to the **Configure** tab.
3. Under **Actions**, click **Create new action**.
4. Set **Authentication** to **API Key**:
   - **Key Type**: `Bearer`
   - **Token**: Enter your configured `MCP_ACCESS_TOKEN`
5. Paste the contents of `chatgpt-app/tool-catalog.json` into the **Schema** input field.
6. Set the **Import from URL** or input the base server endpoint: `https://your-runtime.fly.dev`.

### 3. Verify Connection

1. In the Preview pane of the GPT Builder, run a test prompt:
   > "Verify the connection status of the E2B Agent Runtime."
2. Accept the preflight confirmation dialog if prompted.
3. ChatGPT should successfully invoke `runtime_status` or `runtime_release_readiness` and display the live health metrics.
