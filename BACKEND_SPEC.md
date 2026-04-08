# Tiger Code Pilot — Backend Spec

> This document is the source of truth for the backend piece.

---

## What We're Building

A **local MCP server** that acts as the brain of Tiger Code Pilot. It serves multiple clients simultaneously — VS Code extension, CLI, future IDE — all talking to the same process on localhost.

**Design principle:** Local-first, open source, vibe-coded. No cloud dependencies for the server itself. The server routes to whatever AI provider the user configures (OpenAI, Ollama, HuggingFace, etc).

---

## 1. MCP Server — Dual Mode (stdio + HTTP)

### Current State
`src/mcp-server.js` already implements MCP over stdio (JSON-RPC 2.0). It has tools: `analyze_code`, `generate_code`, `explain_code`, `refactor_code`, `debug_code`, `write_tests`, `chat`, `read_file`, `list_directory`.

### What Needs Building

**Add HTTP mode alongside stdio:**

```bash
# stdio mode (default) — for MCP clients like Claude Desktop
tiger-code-mcp

# HTTP mode — for IDE plugins, CLI, browser
tiger-code-mcp --http
tiger-code-mcp --http --port 3097
```

**HTTP API contract:**

```
POST /chat
{
  "message": "add error handling to my auth routes",
  "context": {
    "activeFile": "src/auth.ts",
    "selection": "lines 15-30",
    "projectPath": "/home/user/myapp"
  },
  "session_id": "optional-string"
}
→
{
  "type": "response",
  "content": "Here's what I changed...",
  "tool_calls": [
    { "tool": "edit_file", "args": { "path": "src/auth.ts", "content": "..." } },
    { "tool": "run_command", "args": { "command": "npm test" } }
  ]
}

POST /sessions
{
  "model": "Salesforce/codegen-350M-mono",
  "provider": "huggingface"
}
→
{
  "session_id": "abc-123",
  "model": "Salesforce/codegen-350M-mono",
  "provider": "huggingface",
  "created_at": "2025-04-07T19:00:00Z"
}

GET /sessions
→
[
  { "session_id": "abc-123", "model": "codegen-350M-mono", "provider": "huggingface", "message_count": 12 },
  { "session_id": "def-456", "model": "llama3.2", "provider": "ollama", "message_count": 3 }
]

DELETE /sessions/:id
→ { "ok": true }

POST /tools/call
{
  "name": "analyze_code",
  "arguments": { "code": "...", "language": "typescript", "mode": "security" }
}
→
{ "content": "Analysis results here" }

GET /tools/list
→ [ { "name": "...", "description": "...", "parameters": {} } ]

GET /health
→ { "status": "ok", "port": 3097, "version": "0.4.0" }

GET /config
→ { "provider": "openai", "model": "gpt-4o-mini", "autonomy": "ask" }

POST /config
{ "provider": "ollama", "model": "llama3.2", "autonomy": "auto" }
→ { "ok": true }
```

**Streaming endpoint:**

```
POST /chat/stream
Same body as POST /chat
→ SSE stream:
data: {"type": "chunk", "content": "Here"}
data: {"type": "chunk", "content": "'s"}
data: {"type": "chunk", "content": " what"}
data: {"type": "tool_call", "tool": "edit_file", "args": {...}}
data: {"type": "done"}
```

---

## 2. Port Auto-Discovery with Config Fallback

### Behavior

```
1. Read ~/.tiger-code-pilot/config.json for "port" key
2. If set → try that port
3. If not set or busy → scan 3097, 3098, 3099, 3100... until one is free
4. Bind to first available
5. Write actual port to ~/.tiger-code-pilot/server.json
```

### server.json
```json
{
  "pid": 12345,
  "port": 3097,
  "started_at": "2025-04-07T19:00:00Z",
  "mode": "http"
}
```

### Config file (~/.tiger-code-pilot/config.json)
```json
{
  "port": 3097,
  "provider": "openai",
  "model": "gpt-4o-mini",
  "autonomy": "ask",
  "apiKeys": {
    "openai": "sk-...",
    "huggingface": "hf_..."
  }
}
```

---

## 3. Autonomy Preference System

Three levels, user-controlled:

| Level | Value | Behavior |
|---|---|---|
| Full Auto | `"auto"` | Agent executes file writes, git commits, npm installs without asking |
| Ask | `"ask"` | Agent shows plan, user says "go" before execution |
| Confirm Everything | `"confirm"` | Agent asks before each individual step |

**How it works in practice:**

```
User: "add auth to my app"

Auto mode:
  → Agent plans → executes → reports done

Ask mode:
  → Agent: "I'll create: auth.ts, middleware.ts, routes.ts. OK?"
  → User: "go"
  → Agent executes

Confirm mode:
  → Agent: "Create auth.ts?" → User: "yes"
  → Agent: "Create middleware.ts?" → User: "yes"
  → Agent: "Run tests?" → User: "yes"
```

**Storage:** `~/.tiger-code-pilot/config.json` → `{ "autonomy": "auto" | "ask" | "confirm" }`

**Default:** `"ask"` — safe middle ground.

**API:** `POST /config { "autonomy": "auto" }` — change at runtime.

---

## 4. Natural Language CLI Agent

The CLI should route through the MCP server, not make direct axios calls.

### Behavior

```bash
# Natural language — agent figures out intent
tiger-code-pilot "add error handling to my auth routes"
tiger-code-pilot "why is my app crashing on startup?"
tiger-code-pilot "make me a REST API for a todo app"

# Explicit commands — for scripting/automation
tiger-code-pilot analyze src/auth.js --mode security
tiger-code-pilot generate --lang python --description "web scraper"

# Interactive chat — no args
tiger-code-pilot
> "help me refactor this function"

# Context from stdin
cat error.log | tiger-code-pilot "diagnose this"
```

### Intent Resolution

The CLI agent should classify the user's intent and route to the right tool:

```
"add error handling"     → generate_code / edit_file
"why is my app crashing"  → debug_code + read_file
"make me a REST API"     → generate_code (multi-file)
"analyze this"            → analyze_code
"what does this do"       → explain_code
"fix this bug"            → debug_code
```

This can be done with a simple classifier — either rule-based (keyword matching) or a lightweight LLM call to classify before dispatching.

---

## 5. Tool Layer (The Hands)

The core engine needs a tool layer so the agent can actually DO things, not just talk about code.

### Required Tools

| Tool | Description | Safety |
|---|---|---|
| `read_file` | Read file contents | Always safe |
| `write_file` | Create or overwrite a file | Respects autonomy level |
| `edit_file` | Search/replace in existing file | Respects autonomy level |
| `list_directory` | List files in directory | Always safe |
| `run_command` | Execute shell command | Respects autonomy level, blocks destructive commands |
| `git_status` | Check git status | Always safe |
| `git_commit` | Commit changes | Respects autonomy level |
| `search_files` | Grep/rg across project | Always safe |

### Safety Rules (Hardcoded)

Never execute, regardless of autonomy level:
- `rm -rf /`, `rm -rf ~`, `rm -rf /*`
- `sudo` commands
- Commands that access `~/.ssh`, `~/.env`, `~/.aws`
- `curl` to exfil data
- `chmod 777` on system directories

---

## 6. Auto-Start on IDE/Extension Launch

### Protocol

When the VS Code extension (or future IDE) launches:

```
1. Check if ~/.tiger-code-pilot/server.json exists
2. If yes → check if PID is still running
3. If running → connect to existing server on that port
4. If not running → spawn tiger-code-mcp --http as child process
5. Wait for /health endpoint to respond
6. Update server.json with new PID/port
```

### Extension Code Pattern
```typescript
import { spawn } from 'child_process';

async function ensureServerRunning(): Promise<number> {
  // Check existing server.json
  const serverInfo = readServerInfo();
  if (serverInfo && isProcessRunning(serverInfo.pid)) {
    return serverInfo.port;
  }

  // Spawn new instance
  const child = spawn('npx', ['tiger-code-mcp', '--http'], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  // Wait for health
  await waitForHealth();
  return readServerInfo().port;
}
```

---

## 7. Core Engine — Real Implementation

The current `src/core-engine.js` should be replaced with the real implementation:

### Required Methods (locked signatures)

```javascript
getCoreEngine() → {
  chat(message, sessionId) → Promise<string>
  chatStream(message, sessionId, onChunk) → Promise<void>
  analyze(code, language, mode) → Promise<string>
  vibecode(action, params) → Promise<string>
  switchProvider(name) → void
  getConfig() → object
  setApiKey(key) → void
  setModel(model) → void
  setEndpoint(url) → void
}
```

### Provider Routing Logic

```
1. Check conversation's pinned model (set at chat creation)
2. If conversation has no pinned model → use default from config
3. Default priority:
   a. HuggingFace free tier (Salesforce/codegen-350M-mono) — zero cost, zero setup
   b. Ollama local (llama3.2) — if Ollama is running
   c. OpenAI (gpt-4o-mini) — if API key is configured
4. Return error if no provider is available
```

### Model Pinning Per Conversation

Each conversation/session has a model pinned at creation time:

```
User creates chat → selects "HuggingFace: codegen-350M-mono"
  → That model is locked to this conversation for its lifetime
User creates another chat → selects "Ollama: llama3.2"
  → That model is locked to that conversation
```

This means the core engine needs to track sessions:

```javascript
// When creating a new chat
engine.createSession({ model: 'codegen-350M-mono', provider: 'huggingface' })
  → returns sessionId: 'abc-123'

// Every message uses the pinned model
engine.chat('explain this code', 'abc-123')
  → routes to HuggingFace codegen, regardless of global config
```

Session storage: `~/.tiger-code-pilot/sessions.json`
```json
{
  "abc-123": {
    "provider": "huggingface",
    "model": "Salesforce/codegen-350M-mono",
    "created_at": "2025-04-07T19:00:00Z",
    "message_count": 0
  }
}
```

### Default Model Strategy

**HuggingFace first** — aligns with the project ecosystem of model storage and prompt generation using HF tokens.

Default free stack:
```
Priority 1: HuggingFace free tier (Salesforce/codegen-350M-mono)
Priority 2: Ollama local (llama3.2) — if detected
Priority 3: OpenAI (gpt-4o-mini) — if API key configured
```

### Streaming

For providers that support streaming (OpenAI, Ollama), stream the response chunk by chunk. For providers that don't (HuggingFace inference), fall back to full response.

---

## 8. File Structure (What Q Builds)

```
src/
├── core-engine.js          # REAL implementation (replaces stub)
├── mcp-server.js           # Dual mode: stdio + HTTP
├── server-daemon.js        # Auto-start, port discovery, PID management
├── session-tracker.js      # Session creation, model pinning, storage
├── tools/
│   ├── file-tools.js       # read_file, write_file, edit_file, list_directory
│   ├── git-tools.js        # git_status, git_commit
│   ├── terminal-tools.js   # run_command (with safety filters)
│   └── search-tools.js     # search_files (grep/rg)
├── autonomy.js             # Autonomy level enforcement
├── intent-classifier.js    # Natural language → tool routing
├── provider-registry.js    # Provider routing, health checks
└── models/
    └── huggingface.js      # HF inference API client
```

### What Already Exists (Don't Touch)
- `src/extension.ts` — VS Code extension
- `src/ui/*` — UI files
- `src/cli.js` — CLI
- `images/*` — Logo assets

---

## 9. Build & Test

```bash
# Install deps
npm install

# Start MCP server in HTTP mode
node src/mcp-server.js --http

# Test it
curl http://localhost:3097/health
curl -X POST http://localhost:3097/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello, what can you do?"}'
```

---

## 10. Success Criteria

The backend is "done" when:

1. ✅ MCP server runs in both stdio and HTTP modes
2. ✅ Port auto-discovery works, config override respected
3. ✅ `POST /chat` returns AI responses via core engine
4. ✅ `POST /chat/stream` streams responses via SSE
5. ✅ Tool layer can read/write files, run safe commands
6. ✅ Autonomy levels enforced (auto/ask/confirm)
7. ✅ Natural language CLI routes through MCP server (with graceful fallback)
8. ✅ VS Code extension connects to server instead of direct axios
9. ✅ Multiple clients can connect simultaneously
10. ✅ Session-pinned model routing works (per-conversation model locking)
11. ✅ Streaming graceful degradation (tries all providers before non-streaming fallback)
12. ✅ Path resolution works for both dev (`src/`) and compiled (`dist/`) layouts

---

## 11. Hardening Notes (Post-Implementation)

- `_callAIStream()` now tries the full FALLBACK_CHAIN before falling back to non-streaming `_callAI()`
- `ensureServerRunning()` handles spawn failures, orphaned processes, missing files with clear errors
- `autonomy.check()` safely handles callback failures (defaults to deny on error)
- CLI config path bug fixed: was `.tiger-code-pilot/.tiger-code-pilot/config.json` (double nested)
- Extension auto-start resolves both `dist/mcp-server.js` and `../src/mcp-server.js`
- Local agent resolves both `dist/local-agent.js` and `../src/local-agent.js`

---

## Notes

If anything here is unclear or you need more context:

1. The frontend piece is documented in `FRONTEND_PIECE.md` — read it for the API contract
2. The full architecture is in `ARCHITECTURE.md`
3. The current MCP server at `src/mcp-server.js` already has the tool definitions and JSON-RPC handler — extend it, don't rewrite it
4. The core engine stub at `src/core-engine.js` has the method signatures locked — match those exactly
