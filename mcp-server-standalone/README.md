# Tiger Code MCP Server

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/>
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen" alt="Node.js >= 18"/>
  <img src="https://img.shields.io/badge/MCP-2024--11--05-blue" alt="MCP Protocol"/>
  <img src="https://img.shields.io/badge/AI-Powered-orange" alt="AI Powered"/>
  <img src="https://img.shields.io/badge/Tools-15+-brightgreen" alt="15+ Tools"/>
</p>

<p align="center">
  <strong>🐯 Official Model Context Protocol (MCP) server for Tiger Code Pilot</strong>
</p>

<p align="center">
  <em>AI coding assistant with 15+ tools — compatible with Claude Desktop, Cursor, and any MCP client</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#available-tools">Tools</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#security">Security</a> •
  <a href="#open-source-grants--funding">Grants</a> •
  <a href="#development">Development</a>
</p>

---

## ✨ Features

### 🤖 AI-Powered Tools
| Tool | Description |
|------|-------------|
| **analyze_code** | Find bugs, security issues, and performance problems |
| **generate_code** | Generate complete working code from descriptions |
| **explain_code** | Understand what code does in simple terms |
| **refactor_code** | Improve code quality and maintainability |
| **debug_code** | Find and fix bugs with error context |
| **write_tests** | Write comprehensive unit tests |
| **chat** | Natural language conversation about coding |

### 📁 File & System Tools
| Tool | Description |
|------|-------------|
| **read_file** | Read file contents with encoding detection |
| **write_file** | Write files with auto-directory creation |
| **list_directory** | Browse directory contents with icons |
| **run_command** | Run terminal commands with security allowlist |

### 🔀 Git Integration
| Tool | Description |
|------|-------------|
| **git_status** | Check repository status |
| **git_log** | View commit history |
| **git_diff** | See unstaged changes |
| **git_branch** | List local and remote branches |

---

## 📦 Installation

### Option 1: Install via npm (Recommended)

```bash
npm install -g @tiger-code/mcp-server
```

### Option 2: Clone from GitHub

```bash
git clone https://github.com/tiger-code-pilot/tiger-code-mcp-server.git
cd tiger-code-mcp-server
npm install
npm link
```

### Option 3: Use directly with npx (No install)

```bash
npx @tiger-code/mcp-server
```

---

## 🚀 Usage

### With Claude Desktop

Add to your Claude Desktop MCP configuration:

**Location**: `~/.claude/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "tiger-code": {
      "command": "npx",
      "args": ["@tiger-code/mcp-server"]
    }
  }
}
```

Then restart Claude Desktop. You'll see Tiger Code tools available in the MCP panel.

### With Cursor

Add to Cursor settings → MCP Servers:

```json
{
  "mcpServers": {
    "tiger-code": {
      "command": "node",
      "args": ["/path/to/tiger-code-mcp-server/index.js"]
    }
  }
}
```

### Standalone HTTP Mode

For custom integrations, REST API, or testing:

```bash
# Start HTTP server (default port 3001)
tiger-code-mcp --http

# Custom port
tiger-code-mcp --http 8080

# Test with curl
curl http://localhost:3001/health
curl http://localhost:3001/tools

# Call a tool
curl -X POST http://localhost:3001/tool \
  -H "Content-Type: application/json" \
  -d '{
    "name": "chat",
    "arguments": {
      "message": "How do I write a REST API in Node.js?"
    }
  }'
```

---

## 🛠 Available Tools

### AI Tools

<details>
<summary><strong>analyze_code</strong> — Analyze code for issues</summary>

```json
{
  "name": "analyze_code",
  "arguments": {
    "code": "function add(a, b) { return a - b; }",
    "language": "javascript",
    "mode": "bugs"
  }
}
```

**Modes**: `general`, `security`, `performance`, `bugs`

</details>

<details>
<summary><strong>generate_code</strong> — Generate code from description</summary>

```json
{
  "name": "generate_code",
  "arguments": {
    "description": "A function that validates email addresses using regex",
    "language": "python"
  }
}
```

</details>

<details>
<summary><strong>explain_code</strong> — Explain what code does</summary>

```json
{
  "name": "explain_code",
  "arguments": {
    "code": "const result = arr.reduce((acc, val) => ({ ...acc, [val]: true }), {});"
  }
}
```

</details>

<details>
<summary><strong>refactor_code</strong> — Refactor for cleanliness</summary>

```json
{
  "name": "refactor_code",
  "arguments": {
    "code": "var x = 1; if (x == 1) { console.log('yes'); } else { console.log('no'); }"
  }
}
```

</details>

<details>
<summary><strong>debug_code</strong> — Find and fix bugs</summary>

```json
{
  "name": "debug_code",
  "arguments": {
    "code": "for (var i = 0; i < arr.length; i++) { setTimeout(() => console.log(arr[i]), 100); }",
    "error_message": "undefined values printed"
  }
}
```

</details>

<details>
<summary><strong>write_tests</strong> — Generate unit tests</summary>

```json
{
  "name": "write_tests",
  "arguments": {
    "code": "function fibonacci(n) { return n <= 1 ? n : fibonacci(n-1) + fibonacci(n-2); }",
    "framework": "jest"
  }
}
```

</details>

<details>
<summary><strong>chat</strong> — Coding conversation</summary>

```json
{
  "name": "chat",
  "arguments": {
    "message": "What's the difference between let, const, and var?",
    "session_id": "optional-session-id"
  }
}
```

</details>

### File Tools

```json
{ "name": "read_file", "arguments": { "path": "./src/index.js" } }
{ "name": "write_file", "arguments": { "path": "./output.txt", "content": "Hello!" } }
{ "name": "list_directory", "arguments": { "path": "./src" } }
```

### Git Tools

```json
{ "name": "git_status", "arguments": { "cwd": "/path/to/repo" } }
{ "name": "git_log", "arguments": { "cwd": "/path/to/repo", "count": 5 } }
{ "name": "git_diff", "arguments": { "cwd": "/path/to/repo", "file": "src/app.js" } }
{ "name": "git_branch", "arguments": { "cwd": "/path/to/repo", "remote": true } }
```

---

## ⚙️ Configuration

Configuration is stored in `~/.tiger-code-pilot/config.json`:

```json
{
  "provider": "ollama",
  "model": "llama3.2",
  "endpointUrl": "http://localhost:11434/api/chat",
  "settings": {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

### Supported AI Providers

| Provider | Setup | Default Endpoint |
|----------|-------|-----------------|
| **Ollama** (Default) | `ollama pull llama3.2` | `http://localhost:11434/api/chat` |
| **LM Studio** | Start local server | `http://localhost:1234/v1/chat/completions` |
| **Custom OpenAI** | Any OpenAI-compatible | `http://localhost:8080/v1/chat/completions` |
| **OpenAI** | Set API key in config | `https://api.openai.com/v1/chat/completions` |
| **Anthropic** | Set API key in config | `https://api.anthropic.com/v1/messages` |

---

## 🔒 Security

### Command Allowlist

Only safe commands are permitted:

```
ls, cat, echo, pwd, npm, npx, node, git, pip, python,
grep, find, head, tail, wc, sort, jest, mocha, vitest,
tsc, eslint, cargo, go, rustc, javac, java, curl, wget,
ps, kill, mkdir, cp, mv
```

### Blocked Patterns

| Pattern | Risk |
|---------|------|
| `rm -rf /` | System destruction |
| `rm -rf $HOME` | User data deletion |
| `del /s /f` | Windows destructive delete |
| `sudo` | Privilege escalation |
| `mkfs` | Filesystem destruction |
| `format C:` | Windows format |

### File Safety

- ✅ Read operations always allowed
- ✅ Write operations create directories automatically
- ✅ No automatic file deletion
- ✅ Commands run with 2-minute timeout
- ✅ 10MB output buffer limit

---

## 🎓 Open Source Grants & Funding

This project is designed to be eligible for several open source funding programs:

### GitHub Programs

| Program | Description | How to Apply |
|---------|-------------|--------------|
| **GitHub Sponsors** | Monthly recurring sponsorships | Enable in repo settings |
| **Alpha-Omega** | Security-focused funding (with Microsoft) | Submit via [OpenSSF](https://alpha-omega.dev/) |
| **GitHub Security Lab** | Security project support | [github.com/securitylab](https://securitylab.github.com/) |

### Other Programs

| Program | Deadline | Description |
|---------|----------|-------------|
| **Google Season of Docs** | Annual | Documentation funding |
| **OpenSSF Best Practices** | Ongoing | Self-certification for security |
| **NLNet** | Quarterly | EU open source innovation grants |
| **Ford Foundation** | Varies | Open source for social impact |

### Quick Start for Funding

1. **Enable GitHub Sponsors**: Repository → Settings → Sponsorship
2. **Complete OpenSSF Badge**: [bestpractices.coreinfrastructure.org](https://bestpractices.coreinfrastructure.org/)
3. **Submit to MCP Registry**: Add to official MCP server catalog
4. **Apply for Alpha-Omega**: Focus on security hardening proposal

---

## 💻 Development

### Running from Source

```bash
git clone https://github.com/tiger-code-pilot/tiger-code-mcp-server.git
cd tiger-code-mcp-server
npm install

# Run in stdio mode (for MCP clients)
npm start

# Run in HTTP mode
npm run start:http

# Run tests
npm test

# Lint code
npm run lint
npm run lint:fix
```

### Adding New Tools

1. Add tool definition to `TOOLS` array in `index.js`:

```javascript
{
  name: 'my_new_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description' }
    },
    required: ['param1']
  }
}
```

2. Add handler to `TOOL_HANDLERS`:

```javascript
my_new_tool: async (args) => {
  // Implementation
  return 'Result';
}
```

3. Add tests to `test.js`
4. Run `npm test && npm run lint`

### Project Structure

```
tiger-code-mcp-server/
├── index.js          # Main server implementation
├── package.json      # Package manifest
├── test.js           # Test suite
├── .eslintrc.js      # ESLint configuration
├── README.md         # This file
└── LICENSE           # MIT License
```

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────┐
│      MCP Client (Claude Desktop, Cursor)    │
└────────────────┬────────────────────────────┘
                 │ MCP Protocol (stdio/HTTP)
                 ▼
┌─────────────────────────────────────────────┐
│         Tiger Code MCP Server               │
│                                             │
│  ┌──────────┬───────────┬──────────────┐    │
│  │ AI Tools │ File Tools│ Git Tools    │    │
│  │          │           │              │    │
│  │ analyze  │ read_file │ git_status   │    │
│  │ generate │ write_file│ git_log      │    │
│  │ explain  │ list_dir  │ git_diff     │    │
│  │ refactor │ run_cmd   │ git_branch   │    │
│  │ debug    │           │              │    │
│  │ tests    │           │              │    │
│  │ chat     │           │              │    │
│  └────┬─────┴─────┬─────┴──────┬───────┘    │
│       │           │            │            │
│       ▼           ▼            ▼            │
│  ┌─────────────────────────────────────┐    │
│  │      AI Provider Layer              │    │
│  │  (Ollama / LM Studio / OpenAI)      │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please:

1. **Fork** the repository
2. Create a **feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. Open a **Pull Request**

Please ensure your PR:
- Passes all tests (`npm test`)
- Passes linting (`npm run lint`)
- Includes tests for new functionality
- Updates documentation

---

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Ollama](https://ollama.ai/) for local AI inference
- [Axios](https://axios-http.com/) for HTTP client support
- All open source contributors and maintainers

---

<p align="center">
  <strong>Made with 🐯 by the Tiger Code Pilot community</strong>
</p>

<p align="center">
  <a href="https://github.com/tiger-code-pilot/tiger-code-mcp-server">GitHub</a> •
  <a href="https://github.com/tiger-code-pilot/tiger-code-mcp-server/issues">Issues</a> •
  <a href="https://github.com/tiger-code-pilot/tiger-code-mcp-server/discussions">Discussions</a>
</p>
