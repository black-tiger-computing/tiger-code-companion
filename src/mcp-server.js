#!/usr/bin/env node

/**
 * Tiger Code Pilot MCP Server
 *
 * Implements Model Context Protocol over stdio or HTTP REST API.
 * Used by MCP-compatible clients (Claude Desktop, Cursor) or any HTTP client.
 *
 * Usage:
 *   tiger-code-mcp              # stdio mode (for MCP clients)
 *   tiger-code-mcp --http       # HTTP REST mode (default port 3001)
 *   tiger-code-mcp --http 8080  # HTTP on custom port
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const readline = require('readline');
const http = require('http');
const { getCoreEngine } = require('./core-engine');
const { getPluginSystem } = require('./plugin-system');

const VERSION = '0.4.0';

// ─── Tool definitions ─────────────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: 'analyze_code',
    description: 'Analyze code for bugs, security issues, performance problems, or general quality',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to analyze' },
        language: { type: 'string', description: 'Programming language' },
        mode: { type: 'string', enum: ['general', 'security', 'performance', 'bugs'] }
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
        description: { type: 'string' },
        language: { type: 'string' }
      },
      required: ['description', 'language']
    }
  },
  {
    name: 'explain_code',
    description: 'Explain what code does in simple terms',
    parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
  },
  {
    name: 'refactor_code',
    description: 'Refactor code to be cleaner and more maintainable',
    parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
  },
  {
    name: 'debug_code',
    description: 'Find and fix bugs in code',
    parameters: {
      type: 'object',
      properties: { code: { type: 'string' }, error_message: { type: 'string' } },
      required: ['code']
    }
  },
  {
    name: 'write_tests',
    description: 'Generate unit tests for code',
    parameters: {
      type: 'object',
      properties: { code: { type: 'string' }, framework: { type: 'string' } },
      required: ['code']
    }
  },
  {
    name: 'chat',
    description: 'Natural language conversation about coding',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string' }, session_id: { type: 'string' } },
      required: ['message']
    }
  },
  // Plugin-backed tools — handlers delegate to plugin system
  {
    name: 'read_file',
    description: 'Read contents of a file',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates directories as needed)',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List files in a directory',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'run_command',
    description: 'Run a safe terminal command (restricted allowlist)',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' }, cwd: { type: 'string' } },
      required: ['command']
    }
  },
  {
    name: 'git_status',
    description: 'Show git status of the repository',
    parameters: { type: 'object', properties: { cwd: { type: 'string' } } }
  }
];

// ─── Tool handlers ─────────────────────────────────────────────────────────────

const TOOL_HANDLERS = {
  analyze_code: async (args) => getCoreEngine().analyze(args.code, args.language || 'code', args.mode || 'general'),
  generate_code: async (args) => getCoreEngine().vibecode('generate', args),
  explain_code:  async (args) => getCoreEngine().vibecode('explain', args),
  refactor_code: async (args) => getCoreEngine().vibecode('refactor', args),
  debug_code:    async (args) => getCoreEngine().vibecode('debug', {
    code: args.error_message ? `${args.code}\n\nError: ${args.error_message}` : args.code
  }),
  write_tests:   async (args) => getCoreEngine().vibecode('test', args),
  chat:          async (args) => getCoreEngine().chat(args.message, args.session_id),
  // Plugin-delegated tools
  read_file:      async (args) => getPluginSystem().executeTool('read_file', args),
  write_file:     async (args) => getPluginSystem().executeTool('write_file', args),
  list_directory: async (args) => getPluginSystem().executeTool('list_directory', args),
  run_command:    async (args) => getPluginSystem().executeTool('run_command', args),
  git_status:     async (args) => getPluginSystem().executeTool('git_status', args)
};

class MCPServer {
  constructor() {
    this.tools = MCP_TOOLS;
    this.handlers = TOOL_HANDLERS;
  }

  async handleToolCall(name, args) {
    const handler = this.handlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return await handler(args);
  }

  getToolsList() { return this.tools; }
}

// ─── stdio mode (MCP protocol) ────────────────────────────────────────────────

function startStdioMode(mcpServer) {
  console.error(`🐯 Tiger Code Pilot MCP Server v${VERSION} — stdio mode`);
  console.error(`   Tools: ${mcpServer.getToolsList().map(t => t.name).join(', ')}`);
  console.error(`   Plugin tools included: read_file, write_file, list_directory, run_command, git_status`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);

      if (request.method === 'initialize') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'tiger-code-pilot', version: VERSION }
          }
        }) + '\n');
      } else if (request.method === 'tools/list') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          result: { tools: mcpServer.getToolsList() }
        }) + '\n');
      } else if (request.method === 'tools/call') {
        const result = await mcpServer.handleToolCall(request.params.name, request.params.arguments || {});
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          result: { content: [{ type: 'text', text: String(result) }] }
        }) + '\n');
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  });
}

// ─── HTTP mode (REST API) ─────────────────────────────────────────────────────

function startHttpMode(mcpServer, port) {
  const parseBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { resolve({}); }
    });
  });

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // GET /health
    if (req.method === 'GET' && req.url === '/health') {
      const config = getCoreEngine().getConfig();
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        version: VERSION,
        provider: config.provider,
        model: config.model,
        tools: mcpServer.getToolsList().map(t => t.name)
      }));
      return;
    }

    // GET /tools
    if (req.method === 'GET' && req.url === '/tools') {
      res.writeHead(200);
      res.end(JSON.stringify({ tools: mcpServer.getToolsList() }));
      return;
    }

    // POST /tool — unified tool invocation
    if (req.method === 'POST' && req.url === '/tool') {
      const { name, arguments: args } = await parseBody(req);
      if (!name) { res.writeHead(400); res.end(JSON.stringify({ error: 'name required' })); return; }
      try {
        const result = await mcpServer.handleToolCall(name, args || {});
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // POST /chat — convenience endpoint
    if (req.method === 'POST' && req.url === '/chat') {
      const { message, session_id } = await parseBody(req);
      if (!message) { res.writeHead(400); res.end(JSON.stringify({ error: 'message required' })); return; }
      try {
        const response = await getCoreEngine().chat(message, session_id || 'default');
        res.writeHead(200);
        res.end(JSON.stringify({ response }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // POST /analyze
    if (req.method === 'POST' && req.url === '/analyze') {
      const { code, language, mode } = await parseBody(req);
      if (!code) { res.writeHead(400); res.end(JSON.stringify({ error: 'code required' })); return; }
      try {
        const analysis = await getCoreEngine().analyze(code, language || 'code', mode || 'general');
        res.writeHead(200);
        res.end(JSON.stringify({ analysis }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // POST /vibecode
    if (req.method === 'POST' && req.url === '/vibecode') {
      const { action, ...params } = await parseBody(req);
      if (!action) { res.writeHead(400); res.end(JSON.stringify({ error: 'action required' })); return; }
      try {
        const result = await getCoreEngine().vibecode(action, params);
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    console.error(`🐯 Tiger Code Pilot MCP Server v${VERSION} — HTTP mode`);
    console.error(`   Running on http://localhost:${port}`);
    console.error(`   Provider: ${getCoreEngine().getConfig().provider}`);
    console.error(`   Tools: ${mcpServer.getToolsList().map(t => t.name).join(', ')}`);
    console.error(`   Endpoints:`);
    console.error(`     GET  /health`);
    console.error(`     GET  /tools`);
    console.error(`     POST /tool       { "name": "...", "arguments": {} }`);
    console.error(`     POST /chat       { "message": "..." }`);
    console.error(`     POST /analyze    { "code": "...", "language": "js" }`);
    console.error(`     POST /vibecode   { "action": "generate", "description": "..." }`);
    console.error(`   Press Ctrl+C to stop`);
  });

  process.on('SIGINT', () => { console.error('\n👋 Server stopped'); server.close(); process.exit(0); });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const mcpServer = new MCPServer();
  const args = process.argv.slice(2);
  const httpFlag = args.indexOf('--http');

  if (httpFlag !== -1) {
    const port = parseInt(args[httpFlag + 1]) || 3001;
    startHttpMode(mcpServer, port);
  } else {
    startStdioMode(mcpServer);
  }
}

module.exports = { MCPServer, startStdioMode, startHttpMode };

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  });
}
