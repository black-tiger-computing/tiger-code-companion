# Tiger Code Pilot — Project Overview

<p align="center">
  <img src="images/logo-vscode.svg" alt="Tiger Code Pilot" width="260"/>
</p>

<p align="center">
  <img src="images/logo-agent-core.svg" width="140"/>
  &nbsp;&nbsp;
  <img src="images/logo-dark-core.svg" width="140"/>
</p>

---

## What It Is

Tiger Code Pilot is an open-source AI coding assistant that runs as a VS Code extension, a CLI tool, and an MCP server — all powered by the same core engine.

---

## Project Structure

```
code-pilot-project/
├── src/
│   ├── extension.ts          VS Code extension entry point
│   ├── core-engine.js        Central AI router (singleton)
│   ├── provider-registry.js  Provider & model manager
│   ├── cli.js                Terminal CLI tool
│   ├── local-agent.js        Autonomous task agent
│   ├── mcp-server.js         MCP / HTTP server
│   ├── concept-to-reality.js Interactive build session
│   └── ui/
│       └── webview.html      Chat panel UI
├── images/
│   ├── logo-vscode.svg       VS Code marketplace banner
│   ├── logo-agent-core.svg   Agent core logo variant
│   ├── logo-dark-core.svg    Dark core logo variant
│   ├── icon-64.svg           64px app icon
│   └── icon.png              Packaged extension icon
├── package.json              Extension manifest & scripts
├── tsconfig.json             TypeScript config
└── ARCHITECTURE.md           Full system architecture
```

---

## Core Components

### `extension.ts` — VS Code Extension
Registers all VS Code commands and opens the webview chat panel. Handles onboarding, provider setup, and code analysis directly from the editor. API keys are stored securely in VS Code's secret storage.

### `core-engine.js` — AI Router
Singleton that routes all AI requests to the correct provider. Manages config, chat history, and supports OpenAI-compatible, Anthropic, and Google API formats.

### `provider-registry.js` — Provider & Model Manager
Defines every supported provider (OpenAI, Anthropic, Google, HuggingFace, Ollama, Groq, OpenRouter, LM Studio, local). Auto-detects local providers and manages a downloadable model catalog for offline use.

### `cli.js` — Terminal CLI
Full-featured command-line tool. Supports `analyze`, `chat`, `vibecode`, `server`, `daemon`, `concept`, and `config` commands. Can run as a background HTTP server or foreground interactive chat.

### `local-agent.js` — Autonomous Agent
Takes a high-level goal, uses the AI to create a step-by-step plan, then executes it — reading files, writing code, running safe commands, and self-correcting on errors. Restricted to the working directory for safety.

### `mcp-server.js` — MCP / HTTP Server
Implements the Model Context Protocol so tools like Claude Desktop and Cursor can call Tiger Code Pilot's tools directly. Also runs as a REST API (`/chat`, `/call`, `/tools`, `/health`).

### `concept-to-reality.js` — Interactive Build Session
Guided session where the user describes what they want to build and the agent builds it step by step, asking clarifying questions as needed.

---

## Supported Providers

| Provider | Type | Free Tier |
|---|---|---|
| OpenAI | Cloud | No |
| Anthropic Claude | Cloud | No |
| Google Gemini | Cloud | Yes |
| HuggingFace | Cloud | Yes |
| Groq | Cloud | Yes |
| OpenRouter | Cloud | Varies |
| Ollama | Local | Free |
| LM Studio | Local | Free |
| Custom HTTP | Local | Free |

---

## Key Commands

| Command | What It Does |
|---|---|
| `Tiger Code Pilot: Open Chat` | Opens the AI chat panel in VS Code |
| `Tiger Code Pilot: Analyze Code` | Runs AI analysis on the active file |
| `Tiger Code Pilot: Quick Start` | Onboarding wizard |
| `Tiger Code Pilot: Test Connection` | Verifies the current provider is reachable |

---

## CLI Quick Reference

```bash
tiger-code-pilot analyze src/app.js --mode security
tiger-code-pilot chat
tiger-code-pilot vibecode generate "a REST API in Python" --language python
tiger-code-pilot vibecode refactor --file src/app.js
tiger-code-pilot server --port 3000
tiger-code-pilot daemon
tiger-code-pilot concept
tiger-code-pilot config set openai sk-xxx
```

---

## Vibecode Actions

`generate` · `explain` · `refactor` · `debug` · `convert` · `document` · `test` · `optimize`

---

## MCP Tools

`analyze_code` · `generate_code` · `explain_code` · `refactor_code` · `debug_code` · `write_tests` · `chat` · `read_file` · `list_directory`

---

## Local Model Catalog

Models can be downloaded and run offline via Ollama or LM Studio:

| Model | Size | Best For |
|---|---|---|
| DeepSeek Coder 6.7B | 3.8 GB | Code generation |
| StarCoder2 7B | 4.4 GB | Code generation |
| Llama 3.2 3B | 2.0 GB | Fast general use |
| Llama 3.2 8B | 4.9 GB | Balanced general use |
| Phi-3 Mini 3.8B | 2.3 GB | Low-resource devices |
| Qwen 2.5 1.5B | 1.0 GB | Ultra-fast / tiny |

---

## Data & Config

All config lives in `~/.tiger-code-pilot/`:

- `config.json` — active provider, model, API keys
- `chat-history.json` — conversation history (last 200 messages)
- `models/` — downloaded GGUF model files
- `agent/task-log.json` — autonomous agent task logs

---

## Quick Start

```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

Or use the CLI directly:
```bash
npm install -g .
tiger-code-pilot help
```

---

## License

MIT — open source, contributions welcome via GitHub issues and PRs.
