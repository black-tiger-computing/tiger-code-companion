# Tiger Code Pilot — Backend Implementation Guide

> This doc answers all your questions and locks every design decision.
> Read this before writing any code.

---

## Your Questions — Answered

### 1. HTTP Mode — Where does it live?

**Answer: `server-daemon.js` handles HTTP. `mcp-server.js` stays stdio-only.**

Split them. Clean separation:

- `mcp-server.js` — stdio mode only, for MCP clients (Claude Desktop, Cursor, Windsurf)
- `server-daemon.js` — HTTP mode, the backbone for VS Code extension, CLI, and your future IDE

The daemon imports the same core engine and tool layer. No duplication.

```
stdio clients → mcp-server.js  → core-engine.js → providers
HTTP clients  → server-daemon.js → core-engine.js → providers
```

### 2. CLI — Auto-start or error?

**Answer: Auto-start the server.**

The CLI should never error with "start the server first." It should:
1. Check `~/.tiger-code-pilot/server.json` for running daemon
2. If running → connect to it
3. If not → spawn `node server-daemon.js` as a detached child process
4. Poll `/health` until alive
5. Proceed

Zero friction. User types a command, it works.

### 3. Autonomy — Replace or wrap the agent?

**Answer: Wrap around it.**

`local-agent.js` already has the step execution loop and `abort()`. Don't touch that. The autonomy system sits *before* each step executes:

```
Agent plans steps → for each step:
  if autonomy === "auto"     → execute immediately
  if autonomy === "ask"      → show plan, wait for "go"
  if autonomy === "confirm"  → ask before each step
  → execute step via local-agent.js
```

`autonomy.js` is a gate, not a replacement. It wraps the agent's `executeStep()` method.

### 4. Session pinning — New method or separate tracker?

**Answer: Separate `session-tracker.js`. Core engine delegates to it.**

Keep `core-engine.js` clean. The session tracker owns:
- `createSession({ provider, model })` → returns `sessionId`
- `getSession(sessionId)` → returns `{ provider, model, messageCount }`
- `listSessions()` → returns array
- `deleteSession(sessionId)` → returns boolean

Core engine's `chat(message, sessionId)` calls `sessionTracker.getSession(sessionId)` to look up the provider/model, then routes accordingly. If no sessionId, uses global default.

### 5. tool_calls in response — Who executes them?

**Answer: The server executes them internally. The client gets final content + a summary of what was done.**

The server has the tools. The server runs them. The client (VS Code extension, IDE, CLI) receives:

```json
{
  "type": "response",
  "content": "I fixed the auth error. Here's what changed...",
  "actions_taken": [
    { "tool": "edit_file", "path": "src/auth.ts", "status": "success" },
    { "tool": "run_command", "command": "npm test", "status": "success", "exit_code": 0 }
  ]
}
```

The extension doesn't need to handle tool execution — it just displays results and action summaries to the user.

---

## Architecture Recap

```
┌─────────────────────────────────────────────────────────────┐
│                    Tiger Code Pilot Server                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ mcp-server.js│  │server-daemon.js│ │  session-tracker  │ │
│  │  (stdio)     │  │   (HTTP)      │  │  (model pinning)  │ │
│  └──────┬───────┘  └──────┬────────┘  └────────┬──────────┘ │
│         │                  │                     │            │
│         └──────────────────┼─────────────────────┘            │
│                            │                                  │
│                   ┌────────▼────────┐                        │
│                   │  core-engine.js  │                        │
│                   │  (AI routing)    │                        │
│                   └────────┬────────┘                        │
│                            │                                  │
│              ┌─────────────┼─────────────┐                   │
│              │             │              │                    │
│     ┌────────▼───┐  ┌─────▼─────┐  ┌─────▼─────┐            │
│     │autonomy.js │  │ tools/    │  │ providers/ │            │
│     │(gatekeeper)│  │ (hands)   │  │ (routing)  │            │
│     └────────────┘  └───────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Q Builds

### `server-daemon.js`
- Express/Koa HTTP server
- Port auto-discovery: scan 3097→3100, bind first available
- Config override: `~/.tiger-code-pilot/config.json` → `{ "port": 4000 }`
- Writes `~/.tiger-code-pilot/server.json` → `{ pid, port, started_at, mode: "http" }`
- Routes:
  - `GET /health` → `{ status, port, version }`
  - `GET /config` → current config
  - `POST /config` → update config
  - `POST /sessions` → create session with model pinning
  - `GET /sessions` → list sessions
  - `DELETE /sessions/:id` → delete session
  - `POST /chat` → chat (uses session's pinned model)
  - `POST /chat/stream` → SSE streaming
  - `POST /tools/call` → direct tool invocation
  - `GET /tools/list` → tool definitions
- Auto-starts core engine on launch

### `session-tracker.js`
- `createSession({ provider, model })` → `{ session_id, provider, model, created_at }`
- `getSession(sessionId)` → session object or null
- `listSessions()` → array
- `deleteSession(sessionId)` → boolean
- Persists to `~/.tiger-code-pilot/sessions.json`
- Thread-safe (use a lock or atomic writes)

### `autonomy.js`
- Three levels: `"auto"`, `"ask"`, `"confirm"`
- Default: `"ask"`
- Exports: `checkAutonomy(action, details)` → returns `{ allowed: boolean, reason?: string }`
- Wraps tool execution:
  ```javascript
  async function executeWithAutonomy(toolName, args, executor) {
    const level = getConfig().autonomy;
    if (level === 'auto') return await executor(args);
    if (level === 'ask') { /* show plan, wait */ }
    if (level === 'confirm') { /* ask per step */ }
  }
  ```

### `intent-classifier.js`
- Routes natural language to the right tool
- Start rule-based (keyword matching), upgrade to LLM later:
  ```javascript
  const INTENT_RULES = [
    { pattern: /fix|bug|error|crash|broken/, tool: 'debug_code' },
    { pattern: /explain|what does|how does/, tool: 'explain_code' },
    { pattern: /test|unit|spec/, tool: 'write_tests' },
    { pattern: /refactor|clean|improve/, tool: 'refactor_code' },
    { pattern: /analyze|review|audit/, tool: 'analyze_code' },
    { pattern: /create|make|build|generate/, tool: 'generate_code' },
    { default: 'chat' }
  ];
  ```
- Exports: `classifyIntent(text)` → `{ tool, confidence, extractedParams }`

### `tools/file-tools.js`
- `read_file({ path })` → string
- `write_file({ path, content })` → success/error
- `edit_file({ path, search, replace })` → success/error (search/replace)
- `list_directory({ path })` → formatted string

### `tools/git-tools.js`
- `git_status()` → string
- `git_commit({ message, files })` → success/error
- Safety: never commits without autonomy check

### `tools/terminal-tools.js`
- `run_command({ command, cwd })` → { stdout, stderr, exit_code }
- Safety filters (hardcoded, never bypassed):
  - Block `rm -rf /`, `rm -rf ~`, `rm -rf /*`
  - Block `sudo`
  - Block access to `~/.ssh`, `~/.env`, `~/.aws`
  - Block `curl` to unknown hosts
  - Block `chmod 777` on system dirs

### `tools/search-tools.js`
- `search_files({ pattern, path })` → grep/rg results

### `core-engine.js` (replace stub)
- Real implementation with provider routing
- Methods (locked signatures):
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
- Delegates to `session-tracker.js` for session lookups
- Routes to providers based on session's pinned model

### `providers/huggingface.js`
- HuggingFace Inference API client
- Uses HF token from config
- Default model: `Salesforce/codegen-350M-mono`
- Handles rate limiting, retries

### `providers/ollama.js`
- Local Ollama client at `http://localhost:11434`
- Default model: `llama3.2`
- Health check: `GET /api/tags`

### `providers/openai.js`
- OpenAI API client
- Uses API key from config
- Default model: `gpt-4o-mini`
- Supports streaming

---

## Provider Priority

```
1. HuggingFace free tier (Salesforce/codegen-350M-mono) — default, zero cost
2. Ollama local (llama3.2) — if Ollama detected on localhost:11434
3. OpenAI (gpt-4o-mini) — if API key configured
```

Model is pinned per conversation at creation. Session never changes model.

---

## Autonomy Enforcement

Every tool call passes through `autonomy.js` before execution:

```
Tool call received → autonomy.check(toolName, args, currentLevel)
  → auto: execute immediately
  → ask: add to pending actions, return plan to client
  → confirm: pause, wait for user approval per step
```

The server's `/chat` response includes `actions_taken` so the client knows what happened.

---

## Response Shape

```json
{
  "type": "response",
  "content": "Natural language explanation of what was done",
  "actions_taken": [
    { "tool": "edit_file", "path": "src/auth.ts", "status": "success", "lines_changed": [15, 30] },
    { "tool": "run_command", "command": "npm test", "status": "success", "exit_code": 0 }
  ]
}
```

Error response:
```json
{
  "type": "error",
  "content": "What went wrong",
  "actions_taken": [
    { "tool": "edit_file", "path": "src/auth.ts", "status": "error", "error": "Permission denied" }
  ]
}
```

---

## Config File (~/.tiger-code-pilot/config.json)

```json
{
  "port": 3097,
  "provider": "huggingface",
  "model": "Salesforce/codegen-350M-mono",
  "autonomy": "ask",
  "apiKeys": {
    "huggingface": "hf_...",
    "openai": "sk-..."
  }
}
```

---

## Build Order

1. `providers/huggingface.js` — the default, needs to work first
2. `session-tracker.js` — sessions are the foundation
3. `autonomy.js` — safety gate
4. `tools/*` — the hands (file, git, terminal, search)
5. `core-engine.js` — real implementation (replaces stub)
6. `intent-classifier.js` — natural language routing
7. `server-daemon.js` — HTTP server tying it all together

---

## What NOT to Touch

- `src/extension.ts` — VS Code extension
- `src/ui/*` — UI files
- `src/cli.js` — CLI
- `images/*` — Logo assets
- `FRONTEND_PIECE.md` — API contract

---

## Success Criteria

1. ✅ `node server-daemon.js` starts on port 3097 (or next available)
2. ✅ `GET /health` returns `{ status: "ok", port: 3097 }`
3. ✅ `POST /sessions` creates a session with pinned model
4. ✅ `POST /chat` routes to the correct provider based on session
5. ✅ Tools execute with autonomy enforcement
6. ✅ Response includes `content` + `actions_taken`
7. ✅ Multiple clients can connect simultaneously
8. ✅ Server survives client disconnects (daemon mode)

---

## Questions?

- `FRONTEND_PIECE.md` — API contract
- `ARCHITECTURE.md` — Full system architecture
- `BACKEND_SPEC.md` — High-level backend spec
- Current `src/core-engine.js` — stub with locked method signatures
- Current `src/mcp-server.js` — stdio mode, already working
