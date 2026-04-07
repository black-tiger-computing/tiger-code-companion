# Tiger Code Pilot — Command Reference

> The core-engine.js stub is a drop-in replacement target.
> When Amazon Q delivers the real core-engine.js, it replaces the stub with zero frontend changes needed.
> All method signatures are locked — see BACKEND_PIECE.md for the contract.

---

## CLI — `tiger-code-pilot`

### Analyze
```bash
tiger-code-pilot analyze <file>
tiger-code-pilot analyze <file> --mode general
tiger-code-pilot analyze <file> --mode security
tiger-code-pilot analyze <file> --mode performance
tiger-code-pilot analyze <file> --mode bugs
```
Runs AI analysis on any code file. Mode defaults to `general`.

---

### Chat
```bash
tiger-code-pilot chat
```
Opens an interactive chat session. Inside chat:
```
condense        Summarise and compress the session history
chunk           Alias for condense
exit / quit     End the session
```

---

### Vibecode
```bash
tiger-code-pilot vibecode generate "a REST API in Express"
tiger-code-pilot vibecode generate "a login form in React" --language javascript
tiger-code-pilot vibecode explain --file src/app.js
tiger-code-pilot vibecode refactor --file src/app.js
tiger-code-pilot vibecode debug --file src/app.js
tiger-code-pilot vibecode test --file src/app.js
tiger-code-pilot vibecode optimize --file src/app.js
tiger-code-pilot vibecode document --file src/app.js
tiger-code-pilot vibecode convert --file src/app.js --language python
```
All vibecode actions accept either `--file <path>` or a description string.

---

### Concept to Reality
```bash
tiger-code-pilot concept
tiger-code-pilot build
tiger-code-pilot create
```
Starts an interactive guided build session. The agent asks clarifying questions,
creates a spec, confirms with you, then builds autonomously.

---

### Tiger Chat Server (standalone backend)
```bash
tiger-code-pilot server
tiger-code-pilot server --port 3000
npm run server
```
Starts the local backend server for the Tiger Chat standalone app.

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/health` | GET | — | `{ status, version, provider }` |
| `/chat` | POST | `{ message, session_id }` | `{ response }` |
| `/analyze` | POST | `{ code, language, mode }` | `{ analysis }` |
| `/vibecode` | POST | `{ action, ...params }` | `{ result }` |
| `/condense` | POST | `{ session_id }` | `{ summary }` |

---

### Config
```bash
tiger-code-pilot config                          # Show current config
tiger-code-pilot config set openai sk-xxx        # Save API key
tiger-code-pilot config set anthropic sk-ant-xxx
tiger-code-pilot config set google AIza-xxx
tiger-code-pilot config set groq gsk-xxx
tiger-code-pilot config provider openai          # Switch active provider
tiger-code-pilot config provider ollama
tiger-code-pilot config provider groq
tiger-code-pilot config model gpt-4o             # Switch active model
tiger-code-pilot config model llama3.2
tiger-code-pilot config repair                   # Reset config to defaults
```

---

### Providers
```bash
tiger-code-pilot providers                       # List all providers with status
tiger-code-pilot provider set ollama             # Set active provider
tiger-code-pilot provider key openai sk-xxx      # Save API key
tiger-code-pilot detect                          # Auto-detect local providers
```

| Provider | Type | Free |
|---|---|---|
| `openai` | Cloud | No |
| `anthropic` | Cloud | No |
| `google` | Cloud | Yes (free tier) |
| `huggingface` | Cloud | Yes |
| `groq` | Cloud | Yes (free tier) |
| `openrouter` | Cloud | Varies |
| `ollama` | Local | Free |
| `lmstudio` | Local | Free |
| `local` | Local | Free |

---

### Models
```bash
tiger-code-pilot models                          # Show full catalog
tiger-code-pilot models code                     # Filter by category
tiger-code-pilot models general
tiger-code-pilot models tiny
tiger-code-pilot model install deepseek-coder-6.7b
tiger-code-pilot model install llama-3.2-3b
tiger-code-pilot model install phi-3-mini
tiger-code-pilot model list                      # List installed models
tiger-code-pilot model remove deepseek-coder-6.7b
```

| Model ID | Size | Category | RAM |
|---|---|---|---|
| `deepseek-coder-6.7b` | 3.8 GB | code | 8 GB |
| `starcoder2-7b` | 4.4 GB | code | 8 GB |
| `codeqwen-7b` | 4.4 GB | code | 8 GB |
| `llama-3.2-3b` | 2.0 GB | general | 4 GB |
| `llama-3.2-8b` | 4.9 GB | general | 8 GB |
| `phi-3-mini` | 2.3 GB | general | 4 GB |
| `qwen-2.5-1.5b` | 1.0 GB | tiny | 2 GB |

---

### Misc
```bash
tiger-code-pilot test-connection                 # Test current provider
tiger-code-pilot version                         # Show version
tiger-code-pilot help                            # Show help
```

---

## Agent CLI — `tiger-agent`

The agent CLI accepts natural language. Anything not matching a known command
is automatically treated as a task and executed autonomously.

```bash
tiger-agent                                      # Interactive REPL
tiger-agent run "create a REST API in Express"   # Single command mode
tiger-agent plan "build a todo app"              # Plan only, no execution
tiger-agent help
```

### Task Commands
```
run <goal>              Execute a goal autonomously — e.g. "run add auth to my Express app"
plan <goal>             Show what the agent would do without executing
stop                    Abort the currently running task immediately
kill                    Alias for stop
status                  Show current task, step count, and running state
```

### File Commands
```
explain <file>          Explain what a file does — e.g. "explain src/app.js"
fix <file>              Find and fix bugs in a file — e.g. "fix src/routes/auth.js"
refactor <file>         Refactor a file for cleanliness — e.g. "refactor src/db.js"
test <file>             Write unit tests for a file — e.g. "test src/utils.js"
review <file>           General code review of a file — e.g. "review src/index.js"
generate <description>  Generate code from a description — e.g. "generate a JWT middleware"
```

### Session / History Commands
```
condense                Summarise and compress the current chat session with AI
chunk                   Alias for condense
context                 Show the working directory file tree and key file contents
```

### Log Commands
```
log                     Show the full task progress log
clear log               Clear the task log file
```

### Chat Commands
```
ask <question>          Ask the agent a question — e.g. "ask how do I paginate in MongoDB"
chat                    Enter interactive chat mode (type "exit" to return to agent)
```

### Navigation
```
help                    Show all commands
exit / quit             Exit the agent CLI
```

### Natural Language Examples
These all work as-is — the agent figures out what to do:
```
add error handling to src/app.js
write a README for this project
set up ESLint for this project
add TypeScript to this project
create a Dockerfile for this Node app
add unit tests for all files in src/utils/
find all TODO comments in the project
refactor all files in src/ to use async/await
```

---

## MCP Server — `tiger-code-mcp`

Runs as a stdio JSON-RPC server for MCP-compatible clients
(Claude Desktop, Cursor, Continue, etc.)

```bash
tiger-code-mcp
npm run mcp
```

### Available MCP Tools

| Tool | Description | Required Args |
|---|---|---|
| `analyze_code` | Analyze code for bugs, security, performance | `code` |
| `generate_code` | Generate code from a description | `description`, `language` |
| `explain_code` | Explain what code does | `code` |
| `refactor_code` | Refactor code for cleanliness | `code` |
| `debug_code` | Find and fix bugs | `code` |
| `write_tests` | Write unit tests | `code` |
| `chat` | Natural language conversation | `message` |
| `read_file` | Read a file from disk | `path` |
| `list_directory` | List files in a directory | `path` |

### Claude Desktop Config
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tiger-code-pilot": {
      "command": "tiger-code-mcp"
    }
  }
}
```

---

## Core Engine API (for extension.ts / Qwen)

All backend calls go through `getCoreEngine()` — no direct axios anywhere.

```js
const { getCoreEngine } = require('./core-engine');
const engine = getCoreEngine();

// Chat with session history
engine.chat(message, sessionId)                          // → Promise<string>

// Streaming chat — chunks arrive via callback, falls back if unsupported
engine.chatStream(message, sessionId, onChunk)           // → Promise<void>

// Code analysis
engine.analyze(code, language, mode)                     // → Promise<string>

// Vibecode actions
engine.vibecode(action, params)                          // → Promise<string>

// Condense session history with AI summary
engine.condenseSession(sessionId)                        // → Promise<string>

// Provider health check (cached 60s)
engine.checkHealth(provider)                             // → Promise<boolean>

// Config management
engine.switchProvider(name)                              // → void
engine.setApiKey(provider, key)                          // → void
engine.setModel(model)                                   // → void
engine.getConfig()                                       // → config object
engine.repairConfig()                                    // → void
engine.reload()                                          // → CoreEngine (hot reload config)

// Low-level direct call — used by local-agent and mcp-server
engine.callAI(messages, options)                         // → Promise<string>
```

---

## Config File

Location: `~/.tiger-code-pilot/config.json`

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "endpointUrl": "https://api.openai.com/v1/chat/completions",
  "apiKeys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "groq": "gsk-..."
  },
  "settings": {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

If this file is missing or corrupted, the engine auto-repairs it to defaults.
Manual repair: `tiger-code-pilot config repair`

---

## Data Files

| File | Purpose |
|---|---|
| `~/.tiger-code-pilot/config.json` | Provider, model, API keys, settings |
| `~/.tiger-code-pilot/chat-history.json` | All chat sessions (capped at 200 messages) |
| `~/.tiger-code-pilot/models/` | Downloaded GGUF model files |
| `~/.tiger-code-pilot/agent/task-log.json` | Agent task progress log |

---

## npm Scripts

```bash
npm run compile     # TypeScript → dist/ (VS Code extension)
npm run watch       # Watch mode compile
npm run server      # Start Tiger Chat standalone server
npm run mcp         # Start MCP stdio server
npm run agent       # Start Tiger Agent interactive REPL
npm run lint        # ESLint
npm run test        # Run extension tests
```

## Bin Commands (after npm install -g .)

```bash
tiger-code-pilot    # Main CLI
tiger-code-mcp      # MCP server
tiger-agent         # Agent REPL
```
