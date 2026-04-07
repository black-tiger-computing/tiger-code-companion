#!/usr/bin/env node

/**
 * Tiger Code Pilot MCP Server
 * 
 * Implements Model Context Protocol server so other AI tools can use Tiger Code Pilot.
 * Provides tools for code analysis, generation, review, and file operations.
 * 
 * Usage:
 *   tiger-code-mcp-server          # Run MCP server on stdio
 *   tiger-code-mcp-server --port 3000  # Run with HTTP transport
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');

const VERSION = '0.3.0';
const CONFIG_DIR = path.join(require('os').homedir(), '.tiger-code-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CHAT_HISTORY_FILE = path.join(CONFIG_DIR, 'chat-history.json');

// Load configuration
function loadConfig() {
  if (fsSync.existsSync(CONFIG_FILE)) {
    return JSON.parse(fsSync.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeys: {}
  };
}

function getApiKey(config, provider) {
  return config.apiKeys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`];
}

// Chat history management
async function loadChatHistory() {
  try {
    if (fsSync.existsSync(CHAT_HISTORY_FILE)) {
      return JSON.parse(await fs.readFile(CHAT_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return [];
}

async function saveChatHistory(history) {
  try {
    await fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    // Ignore errors
  }
}

async function addMessageToHistory(role, content, sessionId = 'default') {
  const history = await loadChatHistory();
  history.push({
    role,
    content,
    sessionId,
    timestamp: new Date().toISOString()
  });
  // Keep last 100 messages
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }
  await saveChatHistory(history);
  return history;
}

// AI API call
async function callAI(messages, options = {}) {
  const config = loadConfig();
  const apiKey = getApiKey(config, config.provider);
  
  if (!apiKey) {
    throw new Error(`No API key configured for ${config.provider}. Run: tiger-code-pilot config set ${config.provider} <key>`);
  }

  const response = await axios.post(config.endpointUrl, {
    model: options.model || config.model,
    messages: messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 4096
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    timeout: 60000
  });

  return response.data.choices?.[0]?.message?.content || 'No response received.';
}

// Vibecoding functions
const VIBECODING_PROMPTS = {
  'generate': `Generate code based on this description. Provide complete, working code with comments.

Description: {description}
Language: {language}

Provide the complete code:`,

  'explain': `Explain this code in simple terms:

{code}`,

  'refactor': `Refactor this code to be cleaner and more maintainable:

{code}

Provide the refactored code with explanations of changes:`,

  'debug': `Find and fix bugs in this code:

{code}

Explain what was wrong and provide the fixed code:`,

  'convert': `Convert this code from {fromLang} to {toLang}:

{code}

Provide the complete converted code:`,

  'document': `Add comprehensive documentation to this code:

{code}

Add JSDoc/docstrings, inline comments, and a README section:`,

  'test': `Write comprehensive unit tests for this code:

{code}

Language/Framework: {testFramework}

Provide complete test file with edge cases:`,

  'optimize': `Optimize this code for performance:

{code}

Explain the optimizations made:`
};

async function vibecode(action, params) {
  const prompt = VIBECODING_PROMPTS[action];
  if (!prompt) {
    throw new Error(`Unknown vibecode action: ${action}. Available: ${Object.keys(VIBECODING_PROMPTS).join(', ')}`);
  }

  let message = prompt;
  for (const [key, value] of Object.entries(params)) {
    message = message.replace(`{${key}}`, value);
  }

  return await callAI([{ role: 'user', content: message }], { temperature: 0.3 });
}

async function naturalChat(userMessage, sessionId = 'default') {
  const history = await loadChatHistory();
  const sessionHistory = history.filter(m => m.sessionId === sessionId).slice(-20);
  
  const messages = [
    {
      role: 'system',
      content: `You are Tiger Code Pilot, an expert AI coding assistant. You help with:
- Writing code in any language
- Explaining complex code concepts simply
- Debugging and fixing issues
- Refactoring and optimizing code
- Architecture and design advice
- Writing tests and documentation

Be helpful, provide complete code examples, and explain your reasoning.`
    },
    ...sessionHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const response = await callAI(messages, { temperature: 0.7 });
  await addMessageToHistory('user', userMessage, sessionId);
  await addMessageToHistory('assistant', response, sessionId);

  return response;
}

// MCP Tool definitions
const MCP_TOOLS = [
  {
    name: 'analyze_code',
    description: 'Analyze code for bugs, security issues, performance problems, or general quality',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to analyze' },
        language: { type: 'string', description: 'Programming language' },
        mode: { type: 'string', enum: ['general', 'security', 'performance', 'bugs'], description: 'Analysis type' }
      },
      required: ['code']
    }
  },
  {
    name: 'generate_code',
    description: 'Generate code from a natural language description',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Description of what to build' },
        language: { type: 'string', description: 'Target programming language' }
      },
      required: ['description', 'language']
    }
  },
  {
    name: 'explain_code',
    description: 'Explain what code does in simple terms',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to explain' },
        language: { type: 'string', description: 'Programming language' }
      },
      required: ['code']
    }
  },
  {
    name: 'refactor_code',
    description: 'Refactor code to be cleaner and more maintainable',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to refactor' },
        language: { type: 'string', description: 'Programming language' }
      },
      required: ['code']
    }
  },
  {
    name: 'debug_code',
    description: 'Find and fix bugs in code',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code with bugs' },
        error_message: { type: 'string', description: 'Error message if any' }
      },
      required: ['code']
    }
  },
  {
    name: 'write_tests',
    description: 'Generate unit tests for code',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to test' },
        language: { type: 'string', description: 'Programming language' },
        framework: { type: 'string', description: 'Test framework (jest, pytest, etc.)' }
      },
      required: ['code']
    }
  },
  {
    name: 'chat',
    description: 'Natural language conversation about coding',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to send' },
        session_id: { type: 'string', description: 'Conversation session ID' }
      },
      required: ['message']
    }
  },
  {
    name: 'read_file',
    description: 'Read contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'List files in a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' }
      },
      required: ['path']
    }
  }
];

// MCP Tool handlers
const TOOL_HANDLERS = {
  analyze_code: async (args) => {
    const modePrompts = {
      general: 'Analyze this code for quality, bugs, and improvements:',
      security: 'Perform a security audit of this code:',
      performance: 'Analyze this code for performance issues:',
      bugs: 'Find bugs and issues in this code:'
    };

    const prompt = `${modePrompts[args.mode || 'general']}

${args.language?.toUpperCase() || 'CODE'}:
\`\`\`${args.language || ''}
${args.code}
\`\`\``;

    return await callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },

  generate_code: async (args) => {
    return await vibecode('generate', { description: args.description, language: args.language });
  },

  explain_code: async (args) => {
    return await vibecode('explain', { code: args.code });
  },

  refactor_code: async (args) => {
    return await vibecode('refactor', { code: args.code });
  },

  debug_code: async (args) => {
    const code = args.error_message 
      ? `${args.code}\n\nError: ${args.error_message}`
      : args.code;
    return await vibecode('debug', { code });
  },

  write_tests: async (args) => {
    return await vibecode('test', { code: args.code, testFramework: args.framework || 'default' });
  },

  chat: async (args) => {
    return await naturalChat(args.message, args.session_id);
  },

  read_file: async (args) => {
    try {
      const content = await fs.readFile(args.path, 'utf8');
      return content;
    } catch (error) {
      return `Error reading file: ${error.message}`;
    }
  },

  list_directory: async (args) => {
    try {
      const files = await fs.readdir(args.path, { withFileTypes: true });
      return files.map(f => `${f.isDirectory() ? '📁' : '📄'} ${f.name}`).join('\n');
    } catch (error) {
      return `Error listing directory: ${error.message}`;
    }
  }
};

// MCP Server implementation
class MCPServer {
  constructor() {
    this.tools = MCP_TOOLS;
    this.handlers = TOOL_HANDLERS;
  }

  async handleToolCall(name, args) {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await handler(args);
  }

  getToolsList() {
    return this.tools;
  }
}

// HTTP Server for REST API
function createHTTPServer(mcpServer, port = 3000) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // GET /tools - List available tools
    if (req.method === 'GET' && req.url === '/tools') {
      res.writeHead(200);
      res.end(JSON.stringify({ tools: mcpServer.getToolsList() }, null, 2));
      return;
    }

    // POST /call - Call a tool
    if (req.method === 'POST' && req.url === '/call') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { name, args } = JSON.parse(body);
          const result = await mcpServer.handleToolCall(name, args);
          res.writeHead(200);
          res.end(JSON.stringify({ result }, null, 2));
        } catch (error) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: error.message }, null, 2));
        }
      });
      return;
    }

    // POST /chat - Natural language chat
    if (req.method === 'POST' && req.url === '/chat') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { message, session_id } = JSON.parse(body);
          const result = await naturalChat(message, session_id);
          res.writeHead(200);
          res.end(JSON.stringify({ response: result }, null, 2));
        } catch (error) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: error.message }, null, 2));
        }
      });
      return;
    }

    // GET /health - Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', version: VERSION }));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);
  const port = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '3000');
  const mode = args.includes('--http') ? 'http' : 'stdio';

  const mcpServer = new MCPServer();

  console.error(`🐯 Tiger Code Pilot MCP Server v${VERSION}`);
  console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (mode === 'http') {
    // Run as HTTP server
    const server = createHTTPServer(mcpServer, port);
    server.listen(port, () => {
      console.error(`✅ Server running on http://localhost:${port}`);
      console.error(`📋 Available tools: ${mcpServer.getToolsList().map(t => t.name).join(', ')}`);
      console.error(`💬 Chat endpoint: POST http://localhost:${port}/chat`);
      console.error(`🔧 Tool endpoint: POST http://localhost:${port}/call`);
      console.error(``);
      console.error(`Example:`);
      console.error(`  curl http://localhost:${port}/health`);
      console.error(`  curl -X POST http://localhost:${port}/chat -H 'Content-Type: application/json' -d '{"message":"write a fibonacci function in python"}'`);
    });
  } else {
    // Run as stdio MCP server (JSON-RPC)
    console.error(`🔌 Running in stdio mode (JSON-RPC over stdin/stdout)`);
    console.error(`Use with MCP-compatible clients`);

    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        
        if (request.method === 'initialize') {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'tiger-code-pilot', version: VERSION }
            }
          }) + '\n');
        } else if (request.method === 'tools/list') {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: { tools: mcpServer.getToolsList() }
          }) + '\n');
        } else if (request.method === 'tools/call') {
          const result = await mcpServer.handleToolCall(request.params.name, request.params.arguments || {});
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: result }]
            }
          }) + '\n');
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
      }
    });
  }
}

// Export for use by other modules
module.exports = { MCPServer, createHTTPServer, naturalChat, vibecode, loadConfig };

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  });
}
