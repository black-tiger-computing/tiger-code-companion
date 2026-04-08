# Tiger Code Pilot — Backend Piece

> This document covers the backend half of the project.

---

## Scope

Everything that runs in Node.js with no VS Code dependency:

| File | Responsibility |
|---|---|
| `src/core-engine.js` | Singleton AI router — all providers, retry, streaming, health, session condense |
| `src/provider-registry.js` | Provider definitions, model catalog, local detection, model download |
| `src/local-agent.js` | Autonomous agent — natural language REPL, abort, plan, execute, verify |
| `src/mcp-server.js` | MCP protocol server (stdio JSON-RPC only) |
| `src/concept-to-reality.js` | Interactive guided build session — clarify → spec → confirm → build |
| `src/cli.js` | Full CLI — analyze, chat, vibecode, server, concept, config, providers, models |

---

## Current Status

### Completed
- `core-engine.js` — single AI router for all providers, exponential backoff retry (429/503/502), real SSE streaming with fallback, `condenseSession()`, `checkProviderHealth()` with 60s cache, config auto-repair on corrupt JSON, `reload()` for hot config refresh
- `local-agent.js` — pure Node.js `gatherContext()` (no shell, Windows safe), `safePath()` path traversal block, `abort()` / kill command, full natural language REPL with 15+ commands
- `cli.js` — all AI calls through `getCoreEngine()`, all `require()` at top, config deserialization hardened, `config repair` command, `server` command for standalone Tiger Chat backend
- `concept-to-reality.js` — Ctrl+C abort wired to agent, hardened JSON parsing, uses core-engine throughout
- `provider-registry.js` — `loadProviders()` hardened with try/catch auto-repair, `downloadModel()` redirect bug fixed (follows `Location` header correctly)
- `mcp-server.js` — all duplicate AI logic removed, delegates entirely to `getCoreEngine()`

### Remaining
- `provider-registry.js` — `listProviders()` reads from its own `providers.json` instead of core-engine `config.json` — these two config stores should be unified into one
- Streaming not yet tested end-to-end with a live provider
- No integration tests across the full stack

---

## What Still Needs Building

### 1. Unify Config Stores (`provider-registry.js`)
`provider-registry.js` maintains its own `~/.tiger-code-pilot/providers.json` separately from `core-engine.js` which uses `config.json`. Refactor `loadProviders()` and `saveProviders()` to read/write from `config.json` via the core-engine `loadConfig()` / `saveConfig()` exports so there is one single source of truth.

### 2. End-to-End Streaming Test
Verify `chatStream()` in `core-engine.js` works correctly with OpenAI and Groq. Confirm the SSE chunk parsing handles edge cases (empty chunks, `[DONE]`, malformed JSON lines).

### 3. Integration Tests
Add a `src/test/` suite that:
- Mocks axios and verifies `core-engine.js` routes correctly per provider
- Verifies `safePath()` blocks traversal attempts
- Verifies `condenseSession()` replaces history correctly
- Verifies `downloadModel()` follows redirects

---

## API Contract (Backend → Frontend)

The VS Code extension (`extension.ts`) calls the backend via direct Node.js `require()` — no HTTP, no sockets.
Do not change these signatures — the frontend depends on them.

### Core Engine Methods
```js
const { getCoreEngine } = require('./core-engine');
const engine = getCoreEngine();

engine.chat(message, sessionId)                    // → Promise<string>
engine.chatStream(message, sessionId, onChunk)     // → Promise<void>
engine.analyze(code, language, mode)               // → Promise<string>
engine.vibecode(action, params)                    // → Promise<string>
engine.condenseSession(sessionId)                  // → Promise<string>
engine.checkHealth(provider)                       // → Promise<boolean>
engine.switchProvider(name)                        // → void
engine.setApiKey(provider, key)                    // → void
engine.setModel(model)                             // → void
engine.getConfig()                                 // → config object
engine.repairConfig()                              // → void
engine.reload()                                    // → CoreEngine
engine.callAI(messages, options)                   // → Promise<string>
```

### Config File Location
```
~/.tiger-code-pilot/config.json        — provider, model, API keys, settings
~/.tiger-code-pilot/chat-history.json  — all sessions, capped at 200 messages
~/.tiger-code-pilot/models/            — downloaded GGUF model files
~/.tiger-code-pilot/agent/task-log.json — agent task progress log
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
npm install

# CLI
node src/cli.js help
node src/cli.js config
node src/cli.js config repair
node src/cli.js test-connection
node src/cli.js chat
node src/cli.js analyze src/core-engine.js --mode general
node src/cli.js vibecode generate "a fibonacci function" --language javascript
node src/cli.js server --port 3000

# Agent REPL
node src/local-agent.js
node src/local-agent.js help
node src/local-agent.js plan "build a todo app"

# MCP server (stdio)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node src/mcp-server.js
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node src/mcp-server.js

# Provider registry
node src/provider-registry.js detect
node src/provider-registry.js providers
node src/provider-registry.js models

# Concept to reality
node src/concept-to-reality.js
```

---

## Dependencies

```json
"dependencies": {
  "axios": "^1.6.0"
}
```

All other modules are Node.js built-ins: `fs`, `path`, `os`, `http`, `https`, `readline`, `child_process`, `url`, `util`.
