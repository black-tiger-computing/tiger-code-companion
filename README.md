# Tiger Code Companion

<p align="center">
  <img src="images/tgclogo.jpg" alt="Tiger Code Pilot" width="220"/>
</p>

<p align="center">
  <strong>AI-Powered Coding Assistant — VS Code Extension · CLI · MCP Server · Autonomous Agent</strong>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/blacktigercomputing" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="36">
  </a>
</p>

<p align="center">
  <a href="#-install-in-60-seconds">Install</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-mcp-tools">MCP</a> ·
  <a href="#-roadmap">Roadmap</a> ·
  <a href="#-contributing">Contributing</a>
</p>

<p align="center">
  <strong>🔥 100% Local-First · 6 AI Providers · 27 Tests Passing · Zero Data Egress · MIT Licensed</strong>
</p>

---

## 🚀 What Is This?

**Tiger Code Companion** is an open-source AI coding assistant that gives developers superpowers without sending their code to the cloud.

Run inference on your own hardware. Choose from 6 AI providers. Chat, analyze, refactor, debug, or let the autonomous agent build entire features from a single prompt. **Your code never leaves your machine unless you want it to.**

```
┌─────────────────────────────────────────────────────┐
│  "Build a REST API in Python with authentication"   │
│                                      [ Enter Goal ] │
└─────────────────────────────────────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │  Autonomous Agent Plans:       │
        │  1. Scaffold project structure │
        │  2. Design data models         │
        │  3. Generate API routes        │
        │  4. Write & run tests          │
        │  5. Fix failures automatically │
        │  6. Commit working code        │
        └───────────────────────────────┘
```

### Three Ways to Use It

| Interface | Best For | Setup Time |
|---|---|---|
| **VS Code Extension** | Daily coding with AI chat panel | 2 minutes |
| **CLI Tool** | Terminal-first workflows & scripts | 30 seconds |
| **MCP Server** | Claude Desktop, Cursor, AI agents | 1 minute |

---

## ⚡ Install in 60 Seconds

**No npm account needed. Clone and run:**

```bash
# 1. Clone the repository
git clone https://github.com/black-tiger-computing/tiger-code-companion.git
cd tiger-code-companion

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run compile

# 4. Run setup wizard (interactive model selection)
node src/cli.js setup

# 5. Start using it!
node src/cli.js chat
```

**Or install globally for CLI access from anywhere:**

```bash
npm install -g .
tiger-code-pilot help
```

### VS Code Extension

1. Open this folder in VS Code
2. Press `F5` (Extension Development Host)
3. Use Command Palette:
   - `Tiger Code Pilot: Open Chat` — Start chatting
   - `Tiger Code Pilot: Analyze Code` — Review active file
   - `Tiger Code Pilot: Quick Start` — Onboarding wizard

---

## 🎯 Quick Actions

### Analyze Code
```bash
tiger-code-pilot analyze src/app.js --mode security
tiger-code-pilot analyze src/app.js --mode performance
tiger-code-pilot analyze src/app.js --mode quality
```

### Vibecode — Natural Language Code Generation
```bash
tiger-code-pilot vibecode generate "a REST API in Python with users and posts"
tiger-code-pilot vibecode refactor --file src/app.js
tiger-code-pilot vibecode debug --file src/app.js --error "TypeError: undefined"
tiger-code-pilot vibecode document --file src/app.js
tiger-code-pilot vibecode test --file src/app.js
```

### Autonomous Agent
```bash
tiger-code-pilot agent
# Then describe your goal in plain English
```

### MCP Server (for Claude Desktop, Cursor, etc.)
```bash
# Stdio mode (for MCP clients)
tiger-code-mcp

# HTTP REST API mode
node src/mcp-server.js --http
# Endpoints: POST /chat, POST /call, GET /tools, GET /health
```

---

## 🧠 AI Providers — Free & Local

Choose what works for you. Mix and match at any time.

| Provider | Cost | Speed | Setup | Best For |
|---|---|---|---|---|
| **Ollama** | Free (Local) | Model-dependent | `ollama pull llama3.2` | 100% offline |
| **LM Studio** | Free (Local) | Model-dependent | Download app | Easy local setup |
| **Qwen (Alibaba)** | Free tier (2K req/day) | Fast | Get API key | Code generation ⭐ |
| **Groq** | Free tier | Very Fast | Get API key | Quick responses |
| **HuggingFace** | Free tier (rate limited) | Moderate | Get token | Model variety |

**Free API Keys:**
- **Qwen** → https://bailian.console.alibabacloud.com/ (2,000 free requests/day)
- **Groq** → https://console.groq.com/ (generous free limits)
- **HuggingFace** → https://huggingface.co/settings/tokens

**100% Local Option:** Install Ollama (`https://ollama.ai`), pull any model, and you're done. No API keys, no internet required.

---

## 🛠️ Features

### Multi-Provider AI Router
Automatic fallback chain: if one provider fails, it tries the next. No single point of failure.

### Vibecode Actions
Natural-language driven code workflows:

`generate` · `explain` · `refactor` · `debug` · `convert` · `document` · `test` · `optimize`

### Autonomous Local Agent
Give the agent a goal and it plans and executes: scaffolding → model design → route generation → test writing → execution → self-correction. All sandboxed to your working directory.

### Model Context Protocol (MCP)
Exposes 15+ tools over stdio or HTTP for AI clients like Claude Desktop, Cursor, or any MCP-compatible agent.

### Concept-to-Reality Sessions
Interactive guided mode: describe what you want to build, the agent asks clarifying questions, then builds step-by-step with your confirmation at each milestone.

### Session Condensation
Long conversation? Automatically condense 100+ message histories into a concise summary. Never lose context.

### Security-First Design
Path traversal protection, config validation, API key encryption, and strict execution sandboxing.

---

## 🏗️ Architecture

```
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│  CLI Tool   │  │ VS Code Ext  │  │   Local Agent    │
│  (stdio)    │  │  (webview)   │  │   (autonomous)   │
└──────┬──────┘  └──────┬───────┘  └────────┬─────────┘
       │                │                    │
       └────────────────┼────────────────────┘
                        │
               ┌────────▼────────┐
               │  Core Engine    │
               │  (AI Router)    │
               └────────┬────────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                 │
┌──────▼──────┐  ┌─────▼──────┐  ┌───────▼────────┐
│ HTTP Server │  │ MCP Server │  │ Plugin System  │
│  (REST API) │  │  (stdio)   │  │  (extensible)  │
└──────┬──────┘  └──────┬─────┘  └───────┬────────┘
       │                │                 │
       └────────────────┼─────────────────┘
                        │
               ┌────────▼────────┐
               │ Provider Layer  │
               │  (AI Models)    │
               └────────┬────────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                 │
┌──────▼──────┐  ┌─────▼──────┐  ┌───────▼────────┐
│  Ollama    │  │  LM Studio │  │  Cloud Providers│
│  (Local)   │  │  (Local)   │  │ (Qwen/Groq/HF) │
└─────────────┘  └────────────┘  └─────────────────┘
```

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for complete system design, data flows, security model, and implementation roadmap.

---

## 🧪 Testing & Quality

**27 integration tests, all passing:**

```
📋 Config              ✅ 6/6 passing
🔧 Core Engine         ✅ 11/11 passing
🗂️  Provider Registry   ✅ 6/6 passing
🔒 Path Traversal      ✅ 4/4 passing
💬 Session Condense     ✅ 1/1 passing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Results: 27 passed, 0 failed ✅
```

Run tests yourself:
```bash
npm test
```

---

## 🔒 Security Model

Your code and data stay yours. Period.

- ✅ Read/write files in working directory only
- ✅ Run tests, linters, safe commands
- ✅ Git operations (status, add, commit)
- ❌ No deletion without confirmation
- ❌ No destructive commands (`rm -rf`, `sudo`)
- ❌ No access to sensitive paths (`~/.ssh`, `~/.env`)
- 🔐 API keys encrypted/hidden in logs
- 🛡️ Path traversal protection blocks `../` attacks

---

## 📊 Stats

| Metric | Value |
|---|---|
| **Lines of Code** | ~15,000+ |
| **Test Coverage** | 27 integration tests |
| **AI Providers** | 6 (3 cloud + 3 local) |
| **MCP Tools** | 15+ |
| **TypeScript** | Strict mode, zero errors |
| **License** | MIT |
| **Data Egress** | Zero (local-first) |

---

## 🗺️ Roadmap

| Phase | Status | Deliverables |
|---|---|---|
| **v0.1 — Core Infrastructure** | ✅ Shipped | CLI, provider registry, model catalog, HTTP/MCP servers |
| **v0.2 — Provider Integration** | ✅ Shipped | Qwen, Groq, HuggingFace, Ollama, LM Studio support |
| **v0.3 — Agent Foundation** | ✅ Shipped | Intent classifier, session condensation, autonomous planning |
| **v0.4 — Production Ready** | ✅ Shipped | 27 tests, security hardening, zero compilation errors |
| **v0.5 — Plugin System** | 🚧 In Progress | File System, Git, Terminal, Linter, Test plugins |
| **v0.6 — Concept-to-Reality** | ⏳ Planned | Interactive guided build sessions |
| **v0.7 — Multi-Agent** | ⏳ Planned | Coordinated autonomous teams |
| **v1.0 — Release Candidate** | ⏳ Planned | Performance optimization, full documentation |

---

## 🤝 Contributing

This is an open-source project under the MIT License. We welcome:

- 🐛 Bug reports
- 💡 Feature suggestions
- 🔧 Pull requests
- 📖 Documentation improvements

**Getting started:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-idea`
3. Make your changes
4. Run tests: `npm test`
5. Push and open a PR

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** and **[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)** for full guidelines.

---

## 📁 Project Structure

```
tiger-code-companion/
├── src/
│   ├── extension.ts              # VS Code extension entry
│   ├── core-engine.js            # Central AI router (singleton)
│   ├── provider-registry.js      # Provider & model manager
│   ├── cli.js                    # Terminal CLI
│   ├── local-agent.js            # Autonomous task agent
│   ├── mcp-server.js             # MCP / HTTP server
│   ├── model-setup.js            # Interactive onboarding
│   ├── intent-classifier.js      # Automatic tool selection
│   ├── autonomy.js               # Agent decision engine
│   ├── server-daemon.js          # Background server process
│   ├── plugin-system.js          # Extensible plugin loader
│   ├── tools/                    # MCP tool implementations
│   │   ├── file-tools.js
│   │   ├── git-tools.js
│   │   ├── search-tools.js
│   │   └── terminal-tools.js
│   └── providers/                # AI provider integrations
│       ├── ollama.js
│       ├── lmstudio.js
│       ├── local.js
│       ├── qwen.js
│       ├── groq.js
│       └── huggingface.js
├── mcp-server-standalone/        # Standalone MCP server package
├── images/                       # Brand assets
├── package.json                  # Project manifest
├── tsconfig.json                 # TypeScript config
└── docs/                         # Full documentation
    ├── ARCHITECTURE.md
    ├── BACKEND_SPEC.md
    ├── COMMANDS.md
    └── CONTRIBUTING.md
```

---

## ☕ Support This Project

Tiger Code Companion is **free and open-source** — built by developers who believe your code should stay yours.

If this project helps you, consider supporting its development:

<p align="center">
  <a href="https://www.buymeacoffee.com/blacktigercomputing" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="48">
  </a>
</p>

**Other ways to help:**
- ⭐ Star this repo (it's free and helps others find it)
- 🐛 Report bugs via [GitHub Issues](https://github.com/black-tiger-computing/tiger-code-companion/issues)
- 🔧 Submit a pull request
- 📖 Improve the documentation
- 📣 Share it with a friend

---

## 📜 License

MIT License — use it however you want. See [LICENSE](./LICENSE) for details.

---

## 🐯 Built By

**Black Tiger Computing** — Building developer tools that respect your privacy and your intelligence.

**Repository:** https://github.com/black-tiger-computing/tiger-code-companion
**Issues:** https://github.com/black-tiger-computing/tiger-code-companion/issues
**Tag:** v0.4.0

---

<p align="center">
  <strong>🔥 Code with confidence. Keep your code yours.</strong>
</p>
