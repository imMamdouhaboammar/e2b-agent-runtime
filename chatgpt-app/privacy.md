# Privacy Policy

**Effective Date: July 18, 2026**

This privacy policy explains how the E2B Agent Runtime custom ChatGPT App handles your data.

## 1. Scope
The App integrates with your authorized Remote MCP Controller. All reasoning occurs in the external LLM client (such as ChatGPT), while execution of terminal commands, files, or browser tasks occurs exclusively within disposable, sandboxed E2B Workers.

## 2. Information Collection and Transmission
- **API Keys & Credentials**: The app does **not** collect or transmit your E2B API Key, GitHub App Private Key, or Database connection strings. These credentials reside entirely within your hosted Controller (e.g., Cloud Run) and are never exposed to the client or workers.
- **Payloads**: Command strings, code diffs, and validation responses are sent to and from your secure Controller via standard HTTPS.
- **Redaction**: The Controller automatically redacts tokens, bearer keys, and environment passwords before returning execution outcomes to ChatGPT.

## 3. Data Retention
Disposable E2B workers are destroyed immediately upon task completion. The Controller retains short-lived browser verification artifacts (screenshots, traces) for a configurable period (default: 24 hours) after which they are deleted.
