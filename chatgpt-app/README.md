# ChatGPT Custom App Integration

This directory contains the packaging and metadata required to connect your **E2B Agent Runtime Remote MCP Controller** as a custom ChatGPT app (GPT Action).

## Directory Structure
- `app-metadata.json`: Main manifest for OpenAI Custom App indexing.
- `tool-catalog.json`: Pre-defined list of core public MCP schemas.
- `approval-policy.json`: Clearance mapping and preflight guidelines.
- `privacy.md`, `security.md`, `support.md`: User-facing compliance policies.
- `assets/icon.svg`: App visual icon.
- `tests/`: Structural validation tests ensuring schema compatibility.

## Setup Instructions
Please refer to the root [docs/CHATGPT_CONNECTION.md](../docs/CHATGPT_CONNECTION.md) for step-by-step instructions on provisioning and validating this app in your ChatGPT Workspace.
