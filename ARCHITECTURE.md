# Tiger Code Pilot - System Architecture

## 🏗️ Complete Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tiger Code Pilot Platform                     │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  CLI Tool   │  │ VS Code Ext  │  │   Local Agent        │   │
│  │  (stdio)    │  │  (webview)   │  │   (autonomous)       │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│         └─────────────────┼──────────────────────┘               │
│                           │                                      │
│                  ┌────────▼────────┐                             │
│                  │  Core Engine    │                             │
│                  │  (AI Router)    │                             │
│                  └────────┬────────┘                             │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                  │                   │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼────────┐          │
│  │ HTTP Server │  │ MCP Server  │  │ Plugin System  │          │
│  │  (REST API) │  │  (stdio)    │  │  (extensible)  │          │
│  └──────┬──────┘  └──────┬──────┘  └───────┬────────┘          │
│         │                │                  │                    │
│         └────────────────┼──────────────────┘                    │
│                          │                                       │
│                 ┌────────▼────────┐                             │
│                 │ Provider Layer  │                             │
│                 │  (AI Models)    │                             │
│                 └────────┬────────┘                             │
│                          │                                       │
│         ┌────────────────┼────────────────┐                     │
│         │                │                 │                     │
│  ┌──────▼──────┐  ┌─────▼──────┐  ┌──────▼───────┐            │
│  │ Cloud APIs  │  │ Ollama     │  │ LM Studio    │            │
│  │ (OpenAI,    │  │ (Local)    │  │ (Local)      │            │
│  │  Google,    │  │            │  │              │            │
│  │  etc)       │  │            │  │              │            │
│  └─────────────┘  └────────────┘  └──────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Component Breakdown

### 1. CLI Tool (`src/cli.js`)
**Purpose**: Command-line interface for terminal usage

**Features**:
- Interactive commands (`analyze`, `chat`, `vibecode`)
- Server management (`server`, `daemon`)
- Provider/model configuration
- File system operations

**Communication**:
- Direct API calls to Core Engine
- Can start HTTP server for other components
- Can run as background daemon

**Usage Flow**:
```
User → CLI Command → Core Engine → AI Provider → Response
```

---

### 2. VS Code Extension (`src/extension.ts`)
**Purpose**: IDE integration with rich UI

**Features**:
- Webview-based chat interface
- Code analysis commands
- Context-aware (reads active editor)
- Onboarding flow
- Quick-start templates

**Communication**:
- Uses same Core Engine as CLI
- Can connect to local HTTP server
- Direct AI API calls when standalone

**Usage Flow**:
```
User → VS Code Command → Extension → Core Engine → AI Provider → Webview Response
```

---

### 3. Local Agent (`src/local-agent.js`) - NEW
**Purpose**: Autonomous task execution

**Features**:
- Goal-oriented task execution
- Multi-step planning
- File system operations (read, write, modify)
- Git operations (commit, branch, etc.)
- Terminal command execution (safe mode)
- Self-correction and retry

**Communication**:
- Receives goals from CLI/Extension/MCP
- Uses Core Engine for AI reasoning
- Executes actions autonomously
- Reports progress and results

**Usage Flow**:
```
User → "Create a REST API" → Local Agent → 
  1. Analyze requirements
  2. Create project structure
  3. Generate code files
  4. Write tests
  5. Commit changes
  → Result: Complete REST API
```

**Autonomous Capabilities**:
- Read files and understand codebase
- Generate new code files
- Modify existing code
- Run tests and fix failures
- Create git commits
- Ask user for clarification when needed

---

### 4. Plugin/MCP Server System

#### A. MCP Server (`src/mcp-server.js`)
**Purpose**: Standard protocol for AI tool integration

**Tools Provided**:
- `analyze_code` - Code review
- `generate_code` - Code generation
- `explain_code` - Explanation
- `refactor_code` - Refactoring
- `debug_code` - Bug fixing
- `write_tests` - Test generation
- `chat` - Conversation
- `read_file` - File access
- `list_directory` - Directory listing

**Modes**:
- **stdio mode**: For MCP-compatible clients (Claude Desktop, Cursor)
- **HTTP mode**: REST API for any HTTP client

**Communication**:
```
MCP Client → MCP Protocol → MCP Server → Core Engine → AI Provider
```

#### B. Plugin System (`src/plugin-system.js`) - NEW
**Purpose**: Extensible tool integration

**Built-in Plugins**:
- File System Plugin (read, write, search)
- Git Plugin (status, commit, branch)
- Terminal Plugin (safe commands only)
- Linter Plugin (eslint, etc.)
- Test Plugin (run tests)

**Plugin Architecture**:
```javascript
{
  name: 'plugin-name',
  version: '1.0.0',
  description: 'What it does',
  tools: [
    {
      name: 'tool_name',
      description: 'What it does',
      parameters: { /* JSON Schema */ },
      handler: async (args) => { /* implementation */ }
    }
  ]
}
```

---

### 5. Core Engine (`src/core-engine.js`) - NEW
**Purpose**: Central AI routing and provider management

**Responsibilities**:
- Route requests to correct AI provider
- Manage API keys and configuration
- Handle retries and error recovery
- Maintain conversation history
- Cache responses when appropriate
- Monitor provider health

**Provider Selection Logic**:
```
1. Check if user specified provider
2. Use active provider from config
3. Fallback to OpenAI if configured
4. Try free providers (HuggingFace, Groq)
5. Try local providers (Ollama, LM Studio)
6. Return error if none available
```

---

## 🔄 Communication Flows

### Flow 1: CLI Direct Command
```
User Types: "tiger-code-pilot analyze src/app.js"
    ↓
CLI parses command
    ↓
Core Engine loads config
    ↓
Routes to active provider (e.g., OpenAI)
    ↓
AI analyzes code
    ↓
CLI displays response
```

### Flow 2: Autonomous Agent Task
```
User Types: "tiger-code-agent create auth system"
    ↓
Local Agent receives goal
    ↓
Agent breaks into steps:
  1. Read existing codebase structure
  2. Design auth system architecture
  3. Generate User model
  4. Generate auth routes
  5. Generate middleware
  6. Write tests
  7. Run tests and fix issues
  8. Commit changes
    ↓
For each step:
  Agent → Core Engine → AI Provider → Code
  Agent executes (write files, run tests)
  Agent verifies (did it work?)
    ↓
Agent reports completion to user
```

### Flow 3: MCP Client Integration
```
Claude Desktop sends MCP request
    ↓
MCP Server receives (via stdio)
    ↓
Routes tool call to appropriate handler
    ↓
If needs AI: Core Engine → AI Provider
    ↓
If needs files: File System Plugin
    ↓
MCP Server formats response
    ↓
Claude Desktop receives result
```

### Flow 4: VS Code Extension
```
User opens chat panel
    ↓
Extension creates webview
    ↓
User types message
    ↓
Extension → Core Engine → AI Provider
    ↓
Response streamed back
    ↓
Displayed in webview
    ↓
User can:
  - Insert code into editor
  - Apply to file
  - Continue conversation
```

---

## 💾 Data Flow & Storage

```
┌──────────────────────────────────────┐
│         Configuration Layer          │
│                                      │
│  ~/.tiger-code-pilot/                │
│  ├── config.json          (main)    │
│  ├── providers.json       (creds)   │
│  ├── chat-history.json    (memory)  │
│  ├── models/              (local)   │
│  │   ├── llama-3.2-3b.gguf          │
│  │   └── deepseek-coder-6.7b.gguf   │
│  ├── plugins/             (ext)     │
│  └── daemon.pid           (status)  │
└──────────────────────────────────────┘
```

**Configuration (`config.json`)**:
```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "endpointUrl": "https://api.openai.com/v1/chat/completions",
  "apiKeys": {
    "openai": "sk-proj-xxx",
    "anthropic": "sk-ant-xxx"
  },
  "settings": {
    "temperature": 0.7,
    "maxTokens": 4096,
    "autoSaveChat": true
  }
}
```

---

## 🚀 Concept-to-Reality Session

**What it is**: Interactive mode where user describes what they want, and the system builds it autonomously.

**Session Flow**:
```
1. User: "I want a todo app with React"
   ↓
2. System: Asks clarifying questions
   - Features? (add, delete, mark complete)
   - Styling? (Tailwind, CSS, none)
   - Backend? (local storage, API, none)
   ↓
3. User: "All three, simple styling"
   ↓
4. Local Agent takes over:
   - Creates React project
   - Implements features one by one
   - Tests each feature
   - Commits working code
   ↓
5. System: "Done! Here's what I built:"
   - Shows file structure
   - Explains features
   - Provides run instructions
```

**Modes**:
- **Interactive**: Ask questions as needed
- **Autonomous**: Build based on description
- **Collaborative**: User guides each step

---

## 📊 Implementation Priority

### Phase 1: Core Infrastructure ✅ DONE
- [x] CLI tool
- [x] Provider registry
- [x] Model catalog
- [x] HTTP server
- [x] MCP server

### Phase 2: Local Agent ⏳ NOW
- [ ] Task planning system
- [ ] File operations (read/write/modify)
- [ ] Git integration
- [ ] Safe terminal commands
- [ ] Progress reporting
- [ ] Error recovery

### Phase 3: Plugin System ⏳
- [ ] Plugin loader
- [ ] File System Plugin
- [ ] Git Plugin
- [ ] Test Plugin
- [ ] Linter Plugin

### Phase 4: Concept-to-Reality ⏳
- [ ] Session manager
- [ ] Clarifying questions
- [ ] Task decomposition
- [ ] Step-by-step execution
- [ ] User interaction points

### Phase 5: Integration ⏳
- [ ] End-to-end testing
- [ ] Error handling improvements
- [ ] Performance optimization
- [ ] Documentation

---

## 🔐 Security Model

**Local Agent Permissions**:
- ✅ Read any file
- ✅ Write to project directories
- ✅ Run tests and linters
- ✅ Git operations
- ❌ Never delete files without confirmation
- ❌ Never run destructive commands (rm -rf, etc.)
- ❌ Never access ~/.ssh, ~/.env, etc.
- ❌ Never execute sudo/admin commands

**API Key Security**:
- Stored in `~/.tiger-code-pilot/config.json`
- Never logged or displayed in full
- Environment variable support
- Can use secrets manager

---

## 🎯 Next Steps

1. **Build Local Agent** - Autonomous task execution
2. **Create Core Engine** - Central routing/provider management  
3. **Implement Plugin System** - Extensible tool integration
4. **Add Concept-to-Reality Session** - Interactive build mode
5. **End-to-End Testing** - Verify all components work together
