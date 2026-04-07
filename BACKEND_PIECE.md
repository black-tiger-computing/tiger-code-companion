# Tiger Code Pilot — Backend Piece

> This document covers the backend half of the project.
> Amazon Q is responsible for this piece.
> Qwen Code Copilot is responsible for the Frontend/Extension piece (see FRONTEND_PIECE.md).

---

## Scope

Everything that runs in Node.js with no VS Code dependency:

| File | Responsibility |
|---|---|
| `src/core-engine.js` | Singleton AI router — all providers go through here |
| `src/provider-registry.js` | Provider definitions, model catalog, local detection |
| `src/local-agent.js` | Autonomous task agent — plans, executes, self-corrects |
| `src/mcp-server.js` | MCP protocol server + REST HTTP API |
| `src/concept-to-reality.js` | Interactive guided build session (CLI) |
| `src/cli.js` | Full CLI tool — analyze, chat, vibecode, server, daemon |

---

## Current Status

### Working
- CLI commands: `analyze`, `chat`, `vibecode`, `config`, `test-connection`, `version`
- HTTP server mode (`server --port 3000`) with `/health`, `/chat`, `/analyze`
- MCP server in both stdio and HTTP modes
- Provider registry with all 9 providers defined
- Model catalog with 7 downloadable GGUF models
- Core engine with OpenAI-compatible, Anthropic, and Google API formats
- Concept-to-reality session flow (clarify → spec → build)
- Local agent skeleton (plan → execute → verify loop)

### Needs Work
- `local-agent.js` — `gatherContext()` uses `ls -la` which breaks on Windows, needs `fs.readdir` instead
- `local-agent.js` — `runCommand()` allowed list is Linux-biased, needs Windows `cmd` equivalents
- `core-engine.js` — no retry logic on rate limit / 429 errors
- `provider-registry.js` — `downloadModel()` doesn't follow HTTP redirects properly (HuggingFace uses redirects)
- `cli.js` — `startDaemon()` references `fsSync` which is never imported (bug)
- `mcp-server.js` — chat history grows unbounded in memory between requests
- No streaming support — all responses wait for full completion before returning

---

## What Needs Building

### 1. Fix Windows Compatibility (`local-agent.js`)
Replace `ls -la` shell command in `gatherContext()` with a pure Node.js `fs.readdir` call so it works on Windows.

### 2. Fix `fsSync` Bug (`cli.js`)
`startDaemon()` uses `fsSync` but only `fs` is imported at the top. Add `const fsSync = require('fs');`.

### 3. Add Retry Logic (`core-engine.js`)
Wrap `callAI()` with exponential backoff for 429 (rate limit) and 503 (service unavailable) responses. Max 3 retries.

### 4. Fix Model Download Redirects (`provider-registry.js`)
HuggingFace download URLs redirect. The current `downloadModel()` calls itself recursively on redirect but passes the original URL again instead of the redirect location. Fix to follow the `Location` header.

### 5. Add Streaming Support (`core-engine.js` + `mcp-server.js`)
Add an optional `stream: true` path to `callAI()` that uses chunked responses and emits via a callback. The MCP HTTP server `/chat` endpoint should support SSE (Server-Sent Events) for streaming.

### 6. Provider Health Check (`core-engine.js`)
Add a `checkProviderHealth()` method that pings each configured provider and caches the result for 60 seconds. Used by CLI `test-connection` and MCP `/health`.

### 7. Improve Agent Context (`local-agent.js`)
`gatherContext()` only reads 4 files. Improve it to:
- Walk the directory tree up to 2 levels deep
- Read `package.json`, `tsconfig.json`, `README.md` fully
- Detect language from file extensions
- Return a structured summary instead of a raw string

---

## API Contract (Backend → Frontend)

The VS Code extension (`extension.ts`) calls the backend via these interfaces.
Do not change these signatures — Qwen's frontend depends on them.

### HTTP Server Endpoints
```
GET  /health                          → { status, version }
POST /chat    { message, session_id } → { response }
POST /analyze { code, language, mode} → { analysis }
GET  /tools                           → { tools[] }
POST /call    { name, args }          → { result }
```

### Core Engine Methods (used by extension.ts directly)
```js
const { getCoreEngine } = require('./core-engine');
const engine = getCoreEngine();

engine.chat(userMessage, sessionId)         // → Promise<string>
engine.analyze(code, language, mode)        // → Promise<string>
engine.vibecode(action, params)             // → Promise<string>
engine.switchProvider(providerName)         // → void
engine.getConfig()                          // → config object
```

### Config File Location
```
~/.tiger-code-pilot/config.json
~/.tiger-code-pilot/chat-history.json
~/.tiger-code-pilot/models/
```

---

## Provider List

| ID | Name | Type | Free |
|---|---|---|---|
| `openai` | OpenAI | Cloud | No |
| `anthropic` | Anthropic Claude | Cloud | No |
| `google` | Google Gemini | Cloud | Yes |
| `huggingface` | HuggingFace | Cloud | Yes |
| `groq` | Groq | Cloud | Yes |
| `openrouter` | OpenRouter | Cloud | Varies |
| `ollama` | Ollama | Local | Free |
| `lmstudio` | LM Studio | Local | Free |
| `local` | Custom HTTP | Local | Free |

---

## Test Commands

```bash
# Install deps
npm install

# Test CLI
node src/cli.js help
node src/cli.js test-connection
node src/cli.js chat

# Test HTTP server
node src/cli.js server --port 3000
curl http://localhost:3000/health
curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d "{\"message\":\"hello\"}"

# Test MCP server
node src/mcp-server.js --http --port=3001
curl http://localhost:3001/tools

# Test provider registry
node src/provider-registry.js detect
node src/provider-registry.js providers
```

---

## Dependencies

```json
"dependencies": {
  "axios": "^1.6.0"
}
```

No other runtime dependencies needed for the backend. All Node.js built-ins (`fs`, `path`, `http`, `https`, `readline`, `child_process`).
