# Support Guide

If you experience issues using the E2B Agent Runtime custom ChatGPT app, follow these steps to troubleshoot:

## 1. Common Issues
- **Authentication Failures**: Ensure your Custom GPT/Action is configured with the correct `MCP_ACCESS_TOKEN` Bearer token.
- **Connection Timeout**: Verify that your hosted Remote MCP Controller is healthy and reachable over public HTTPS. Check `/health/ready` on the Controller.
- **Worker Limits Exceeded**: If you see `QuotaError` or `active_workers` rejected logs, look at the `runtime_capacity_status` tool output. Scale down your parallel sessions or adjust `MAX_ACTIVE_WORKERS` in your config.

## 2. Reporting Bugs
Please open an issue on the official repository:
[GitHub Issues](https://github.com/imMamdouhaboammar/e2b-agent-runtime/issues)
Do not post raw logs containing private repositories or potential credential values.
