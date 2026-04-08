# Tiger Code MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-blue)](https://modelcontextprotocol.io/)
[![npm downloads](https://img.shields.io/npm/dm/tiger-code-mcp-server)](https://www.npmjs.com/package/tiger-code-mcp-server)

**Official Model Context Protocol (MCP) server for Tiger Code Pilot** — an AI-powered coding assistant with 15+ tools for code analysis, generation, debugging, git operations, and file management.

Compatible with [Claude Desktop](https://claude.ai/download), [Cursor](https://cursor.sh/), and any MCP-compatible client.

---

## Features

### AI-Powered Tools
- **Code Analysis** — Find bugs, security issues, and performance problems
- **Code Generation** — Generate complete working code from descriptions
- **Code Explanation** — Understand what code does in simple terms
- **Refactoring** — Improve code quality and maintainability
- **Debugging** — Find and fix bugs with error context
- **Test Generation** — Write comprehensive unit tests
- **Chat** — Natural language conversation about coding

### File & System Tools
- **Read/Write Files** — Read and write files with auto-directory creation
- **Directory Listing** — Browse directory contents
- **Safe Commands** — Run terminal commands with security allowlist

### Git Integration
- **Status** — Check git repository status
- **Log** — View commit history
- **Diff** — See unstaged changes
- **Branch** — List local and remote branches

---

## Installation

### Option 1: Install via npm (Recommended)

```bash
npm install -g tiger-code-mcp-server
```

### Option 2: Clone from GitHub

```bash
git clone https://github.com/tiger-code-pilot/tiger-code-mcp-server.git
cd tiger-code-mcp-server
npm install
npm link
```

---

## Usage

### With Claude Desktop

Add to your Claude Desktop MCP configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tiger-code": {
      "command": "npx",
      "args": ["tiger-code-mcp-server"]
    }
  }
}
```

### With Cursor

Add to Cursor MCP settings:

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

```bash
# Start HTTP server (default port 3001)
tiger-code-mcp-server --http

# Custom port
tiger-code-mcp-server --http 8080

# Test with curl
curl http://localhost:3001/health
curl http://localhost:3001/tools
curl -X POST http://localhost:3001/tool \
  -H "Content-Type: application/json" \
  -d '{"name": "chat", "arguments": {"message": "How do I write a REST API in Node.js?"}}'
```

---

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `analyze_code` | Analyze code for issues | `code`, `language`, `mode` |
| `generate_code` | Generate code from description | `description`, `language` |
| `explain_code` | Explain what code does | `code` |
| `refactor_code` | Refactor code | `code` |
| `debug_code` | Find and fix bugs | `code`, `error_message` |
| `write_tests` | Generate unit tests | `code`, `framework` |
| `chat` | Coding conversation | `message`, `session_id` |
| `read_file` | Read file contents | `path` |
| `write_file` | Write to file | `path`, `content` |
| `list_directory` | List directory | `path` |
| `run_command` | Run safe command | `command`, `cwd` |
| `git_status` | Git status | `cwd` |
| `git_log` | Git commit log | `cwd`, `count` |
| `git_diff` | Git diff | `cwd`, `file` |
| `git_branch` | List branches | `cwd`, `remote` |

---

## Configuration

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

| Provider | Setup | Endpoint |
|----------|-------|----------|
| **Ollama** (Default) | `ollama pull llama3.2` | `http://localhost:11434/api/chat` |
| **LM Studio** | Start local server | `http://localhost:1234/v1/chat/completions` |
| **Custom OpenAI** | Any OpenAI-compatible | `http://localhost:8080/v1/chat/completions` |
| **OpenAI** | API key required | `https://api.openai.com/v1/chat/completions` |
| **Anthropic** | API key required | `https://api.anthropic.com/v1/messages` |

---

## Security Model

### Command Allowlist
Only safe commands are allowed: `ls`, `cat`, `echo`, `npm`, `node`, `git`, `python`, `grep`, `find`, `jest`, etc.

### Blocked Patterns
Dangerous patterns are blocked:
- `rm -rf /` or `rm -rf $HOME`
- `del /s /f` (Windows destructive)
- `sudo` (privilege escalation)
- `mkfs` (filesystem destruction)
- `format C:` (Windows format)

### File Safety
- Read-only by default
- Write operations require explicit action
- No automatic file deletion

---

## Open Source Grants & Funding

This project is eligible for several open source grant programs:

### GitHub Open Source Programs

1. **GitHub Alpha-Omega Partnership**
   - Security-focused funding for maintainers
   - Supply chain security improvements
   - Apply via: GitHub Security Lab

2. **GitHub Sponsorships**
   - Monthly recurring sponsorships
   - Enable via: Repository Settings → Sponsorship

3. **Google Season of Docs**
   - Documentation funding
   - Annual application cycle

4. **Open Source Security Foundation (OpenSSF)**
   - Security audits and hardening
   - Best practices badge program

### How to Apply

1. **GitHub Sponsors**: Enable in repository settings
2. **OpenSSF Best Practices**: Complete the [Self-Certification](https://bestpractices.coreinfrastructure.org/)
3. **Alpha-Omega**: Submit security project proposal
4. **Google Grants**: Apply during open application windows

---

## Development

### Running from Source

```bash
git clone https://github.com/tiger-code-pilot/tiger-code-mcp-server.git
cd tiger-code-mcp-server
npm install
npm start                  # stdio mode
npm run start:http         # HTTP mode
```

### Adding New Tools

1. Add tool definition to `TOOLS` array:
```javascript
{
  name: 'my_tool',
  description: 'What it does',
  parameters: {
    type: 'object',
    properties: { /* JSON Schema */ },
    required: ['param1']
  }
}
```

2. Add handler to `TOOL_HANDLERS`:
```javascript
my_tool: async (args) => {
  // Implementation
  return 'Result';
}
```

### Testing

```bash
npm test
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│         MCP Client (Claude/Cursor)      │
└────────────────┬────────────────────────┘
                 │ MCP Protocol (stdio/HTTP)
                 ↓
┌─────────────────────────────────────────┐
│        Tiger Code MCP Server            │
│                                         │
│  ┌───────────┬──────────┬──────────┐   │
│  │ AI Tools  │ File     │ Git      │   │
│  │           │ Tools    │ Tools    │   │
│  └─────┬─────┴────┬─────┴────┬─────┘   │
│        │          │          │          │
│        ↓          ↓          ↓          │
│  ┌──────────────────────────────────┐   │
│  │      AI Provider Layer           │   │
│  │  (Ollama / LM Studio / OpenAI)   │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## License

MIT License — see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

- **Issues**: [GitHub Issues](https://github.com/tiger-code-pilot/tiger-code-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/tiger-code-pilot/tiger-code-mcp-server/discussions)
- **Email**: support@tigercodepilot.dev (future)

---

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Ollama](https://ollama.ai/) for local AI inference
- [Axios](https://axios-http.com/) for HTTP client
- Open source contributors and maintainers

---

**Made with 🐯 by the Tiger Code Pilot community**
