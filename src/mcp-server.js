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

// Imports for MCP server
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const readline = require('readline');
const http = require('http');
const { getCoreEngine } = require('./core-engine');
const { getPluginSystem } = require('./plugin-system');
const mcpAutoLoader = require('./mcp-auto-loader');
const mcpRegistry = require('./mcp-registry');
const sessionTracker = require('./session-tracker');

const VERSION = '0.4.0';
const CONFIG_DIR = path.join(os.homedir(), '.tiger-code-pilot');
const SERVER_JSON = path.join(CONFIG_DIR, 'server.json');

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
  },
  {
    name: 'git_log',
    description: 'Show git commit log',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string' },
        count: { type: 'number', description: 'Number of commits to show' }
      }
    }
  },
  {
    name: 'git_diff',
    description: 'Show git diff of unstaged changes',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string' },
        file: { type: 'string', description: 'Specific file to diff' }
      }
    }
  },
  {
    name: 'git_branch',
    description: 'List git branches',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string' },
        remote: { type: 'boolean', description: 'Show remote branches' }
      }
    }
  },
  // ACP Tools — inter-agent communication
  {
    name: 'acp_send',
    description: 'Send a message to another agent or process',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target agent or recipient ID' },
        type: { type: 'string', enum: ['task', 'status', 'data', 'signal'], description: 'Message type' },
        payload: { type: 'object', description: 'Message content' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }
      },
      required: ['to', 'type', 'payload']
    }
  },
  {
    name: 'acp_receive',
    description: 'Receive the next pending message for this agent',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Agent ID to receive for' },
        type: { type: 'string', description: 'Filter by message type' }
      }
    }
  },
  {
    name: 'acp_register',
    description: 'Register an agent with the ACP system',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Unique agent identifier' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'List of agent capabilities' },
        endpoint: { type: 'string', description: 'Agent communication endpoint URL' }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'acp_list_agents',
    description: 'List all active registered agents',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'acp_queue_status',
    description: 'Show message queue statistics',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'acp_broadcast',
    description: 'Send a message to all registered agents',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Message type' },
        payload: { type: 'object', description: 'Message content' }
      },
      required: ['type', 'payload']
    }
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
  git_status:     async (args) => getPluginSystem().executeTool('git_status', args),
  git_log:        async (args) => getPluginSystem().executeTool('git_log', args),
  git_diff:       async (args) => getPluginSystem().executeTool('git_diff', args),
  git_branch:     async (args) => getPluginSystem().executeTool('git_branch', args),
  // ACP tools — inter-agent communication
  acp_send:       async (args) => getPluginSystem().executeTool('acp_send', args),
  acp_receive:    async (args) => getPluginSystem().executeTool('acp_receive', args),
  acp_register:   async (args) => getPluginSystem().executeTool('acp_register', args),
  acp_list_agents:async (args) => getPluginSystem().executeTool('acp_list_agents', args),
  acp_queue_status: async (args) => getPluginSystem().executeTool('acp_queue_status', args),
  acp_broadcast:  async (args) => getPluginSystem().executeTool('acp_broadcast', args)
};

class MCPServer {
  constructor() {
    this.tools = MCP_TOOLS;
    this.handlers = TOOL_HANDLERS;
    this.githubMcpTools = [];
    this.githubMcpHandlers = {};
  }

  async loadGitHubMcpServers() {
    // Load installed GitHub MCP servers
    const installed = mcpRegistry.getInstalledList();
    for (const server of installed) {
      if (server.deprecated) continue;
      // Tools are already registered with plugin system via auto-loader
      // We just need to add them to our tools list
      const pluginTools = getPluginSystem().getToolsList()
        .filter(t => t.name.startsWith(`mcp-${server.id}_`));

      for (const tool of pluginTools) {
        const cleanName = tool.name.replace(`mcp-${server.id}_`, '');
        this.githubMcpTools.push({
          ...tool,
          name: cleanName,
          server: server.id
        });
        // Create handler that delegates to plugin system
        this.githubMcpHandlers[cleanName] = async (args) =>
          getPluginSystem().executeTool(tool.name, args);
      }
    }
    return this.githubMcpTools.length;
  }

  async handleToolCall(name, args) {
    // Check GitHub MCP handlers first
    if (this.githubMcpHandlers[name]) {
      return await this.githubMcpHandlers[name](args);
    }
    // Fall back to built-in handlers
    const handler = this.handlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return await handler(args);
  }

  getToolsList() {
    return [...this.tools, ...this.githubMcpTools];
  }
}

// ─── stdio mode (MCP protocol) ────────────────────────────────────────────────

function startStdioMode(mcpServer) {
  console.error(`🐯 Tiger Code Pilot MCP Server v${VERSION} — stdio mode`);

  // Load GitHub MCP servers
  mcpServer.loadGitHubMcpServers().then(count => {
    if (count > 0) {
      console.error(`   GitHub MCP servers loaded: ${count} additional tools`);
    }
  }).catch(e => console.error(`   ⚠️  GitHub MCP load failed: ${e.message}`));

  console.error(`   Tools: ${mcpServer.getToolsList().map(t => t.name).join(', ')}`);
  console.error(`   Plugin tools included: read_file, write_file, list_directory, run_command, git_status`);
  console.error(`   ACP tools included: acp_send, acp_receive, acp_register, acp_list_agents, acp_queue_status, acp_broadcast`);

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

// ─── Port Auto-Discovery ──────────────────────────────────────────────────────

function findAvailablePort(startPort, maxAttempts = 20) {
  const net = require('net');
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      if (port > startPort + maxAttempts) { reject(new Error('No available port found')); return; }
      const server = net.createServer();
      server.listen(port, '127.0.0.1', () => {
        server.close();
        resolve(port);
      });
      server.on('error', () => tryPort(port + 1));
    }
    tryPort(startPort);
  });
}

function writeServerJson(port, mode) {
  const info = {
    pid: process.pid,
    port,
    started_at: new Date().toISOString(),
    mode
  };
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SERVER_JSON, JSON.stringify(info, null, 2));
  return info;
}

function readServerJson() {
  try {
    if (fs.existsSync(SERVER_JSON)) return JSON.parse(fs.readFileSync(SERVER_JSON, 'utf8'));
  } catch (e) { /* ignore */ }
  return null;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
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

    const url = req.url.split('?')[0]; // strip query params

    // ── GET /health ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && url === '/health') {
      const config = getCoreEngine().getConfig();
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        port,
        version: VERSION,
        provider: config.provider,
        model: config.model,
        tools: mcpServer.getToolsList().map(t => t.name)
      }));
      return;
    }

    // ── GET /tools/list ─────────────────────────────────────────────────────
    if (req.method === 'GET' && url === '/tools/list') {
      res.writeHead(200);
      res.end(JSON.stringify(mcpServer.getToolsList().map(t => ({
        name: t.name, description: t.description, parameters: t.parameters
      }))));
      return;
    }

    // ── GET /tools (alias) ──────────────────────────────────────────────────
    if (req.method === 'GET' && url === '/tools') {
      res.writeHead(200);
      res.end(JSON.stringify({ tools: mcpServer.getToolsList() }));
      return;
    }

    // ── POST /tools/call ────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/tools/call') {
      const { name, arguments: args } = await parseBody(req);
      if (!name) { res.writeHead(400); res.end(JSON.stringify({ error: 'name required' })); return; }
      try {
        const result = await mcpServer.handleToolCall(name, args || {});
        res.writeHead(200);
        res.end(JSON.stringify({ content: result }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /tool (alias) ──────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/tool') {
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

    // ── POST /chat ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/chat') {
      const { message, session_id, context } = await parseBody(req);
      if (!message) { res.writeHead(400); res.end(JSON.stringify({ error: 'message required' })); return; }
      try {
        // Auto-create session if session_id not provided
        const sid = session_id || sessionTracker.createSession({}).session_id;
        sessionTracker.getSession(sid, true); // touch message_count
        const response = await getCoreEngine().chat(message, sid);
        res.writeHead(200);
        res.end(JSON.stringify({
          type: 'response',
          content: response,
          session_id: sid
        }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── POST /chat/stream (SSE) ────────────────────────────────────────────
    if (req.method === 'POST' && url === '/chat/stream') {
      const { message, session_id } = await parseBody(req);
      if (!message) { res.writeHead(400); res.end(JSON.stringify({ error: 'message required' })); return; }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      const sid = session_id || sessionTracker.createSession({}).session_id;
      sessionTracker.getSession(sid, true);

      try {
        const engine = getCoreEngine();
        if (engine.chatStream) {
          await engine.chatStream(message, sid, (chunk) => {
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          });
          res.write(`data: ${JSON.stringify({ type: 'done', session_id: sid })}\n\n`);
        } else {
          // Fallback: non-streaming
          const response = await engine.chat(message, sid);
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: response })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done', session_id: sid })}\n\n`);
        }
        res.end();
      } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
        res.end();
      }
      return;
    }

    // ── POST /analyze ───────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/analyze') {
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

    // ── POST /vibecode ──────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/vibecode') {
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

    // ── Session Management ──────────────────────────────────────────────────

    // POST /sessions — create session
    if (req.method === 'POST' && url === '/sessions') {
      const { model, provider } = await parseBody(req);
      const session = sessionTracker.createSession({
        model: model || 'default',
        provider: provider || 'default'
      });
      res.writeHead(201);
      res.end(JSON.stringify(session));
      return;
    }

    // GET /sessions — list sessions
    if (req.method === 'GET' && url === '/sessions') {
      res.writeHead(200);
      res.end(JSON.stringify(sessionTracker.listSessions()));
      return;
    }

    // DELETE /sessions/:id — delete session
    if (req.method === 'DELETE' && url.startsWith('/sessions/')) {
      const sessionId = url.split('/')[2];
      const ok = sessionTracker.deleteSession(sessionId);
      if (!ok) { res.writeHead(404); res.end(JSON.stringify({ error: 'session not found' })); return; }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ── Config Endpoints ────────────────────────────────────────────────────

    // GET /config
    if (req.method === 'GET' && url === '/config') {
      const config = getCoreEngine().getConfig();
      res.writeHead(200);
      res.end(JSON.stringify({
        provider: config.provider,
        model: config.model,
        autonomy: config.autonomy || 'ask',
        endpointUrl: config.endpointUrl,
        settings: config.settings || {}
      }));
      return;
    }

    // POST /config
    if (req.method === 'POST' && url === '/config') {
      const body = await parseBody(req);
      const engine = getCoreEngine();
      const config = engine.getConfig();

      if (body.provider) {
        engine.switchProvider(body.provider);
      }
      if (body.model) {
        engine.setModel(body.model);
      }
      if (body.apiKey) {
        engine.setApiKey(body.provider || config.provider, body.apiKey);
      }
      if (body.autonomy) {
        config.autonomy = body.autonomy;
        const { saveConfig } = require('./core-engine');
        saveConfig(config);
      }
      if (body.settings) {
        config.settings = { ...config.settings, ...body.settings };
        const { saveConfig } = require('./core-engine');
        saveConfig(config);
      }

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ── MCP Server Management ───────────────────────────────────────────────

    if (req.method === 'GET' && url === '/mcp/catalog') {
      res.writeHead(200);
      res.end(JSON.stringify({ servers: mcpRegistry.getCatalog() }));
      return;
    }
    if (req.method === 'GET' && url === '/mcp/installed') {
      res.writeHead(200);
      res.end(JSON.stringify({ servers: mcpRegistry.getInstalledList() }));
      return;
    }
    if (req.method === 'POST' && url === '/mcp/install') {
      const { server_id } = await parseBody(req);
      if (!server_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'server_id required' })); return; }
      try {
        const result = await mcpAutoLoader.installFromGitHub(server_id);
        await mcpServer.loadGitHubMcpServers();
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (req.method === 'POST' && url === '/mcp/uninstall') {
      const { server_id } = await parseBody(req);
      if (!server_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'server_id required' })); return; }
      try {
        const result = await mcpAutoLoader.uninstallServer(server_id);
        await mcpServer.loadGitHubMcpServers();
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (req.method === 'GET' && url === '/mcp/status') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: mcpAutoLoader.getStatusReport() }));
      return;
    }
    if (req.method === 'POST' && url === '/mcp/update') {
      const { server_id } = await parseBody(req);
      if (!server_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'server_id required' })); return; }
      try {
        const result = await mcpAutoLoader.updateServer(server_id);
        await mcpServer.loadGitHubMcpServers();
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── 404 ─────────────────────────────────────────────────────────────────
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    mcpServer._server = server; // attach for test cleanup
    mcpServer.loadGitHubMcpServers().then(count => {
      if (count > 0) console.error(`   GitHub MCP servers loaded: ${count} additional tools`);
    }).catch(e => console.error(`   ⚠️  GitHub MCP load failed: ${e.message}`));

    const serverInfo = writeServerJson(port, 'http');
    const config = getCoreEngine().getConfig();

    console.error(`🐯 Tiger Code Pilot MCP Server v${VERSION} — HTTP mode`);
    console.error(`   Running on http://localhost:${port}`);
    console.error(`   PID: ${process.pid}`);
    console.error(`   Provider: ${config.provider} | Model: ${config.model}`);
    console.error(`   Autonomy: ${config.autonomy || 'ask'}`);
    console.error(`   Tools: ${mcpServer.getToolsList().map(t => t.name).join(', ')}`);
    console.error(`   Endpoints:`);
    console.error(`     GET  /health`);
    console.error(`     GET  /tools/list`);
    console.error(`     POST /tools/call`);
    console.error(`     POST /chat`);
    console.error(`     POST /chat/stream  (SSE)`);
    console.error(`     POST /analyze`);
    console.error(`     POST /vibecode`);
    console.error(`     POST /sessions     GET /sessions     DELETE /sessions/:id`);
    console.error(`     GET  /config       POST /config`);
    console.error(`     GET  /mcp/*        POST /mcp/*`);
    console.error(`   Press Ctrl+C to stop`);
  });

  process.on('SIGINT', () => {
    console.error('\n👋 Server stopped');
    if (fs.existsSync(SERVER_JSON)) fs.unlinkSync(SERVER_JSON);
    server.close();
    process.exit(0);
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const mcpServer = new MCPServer();
  const args = process.argv.slice(2);
  const httpFlag = args.indexOf('--http');

  if (httpFlag !== -1) {
    // Port resolution:
    // 1. Check CLI argument (--http 8080)
    // 2. Check config.json port key
    // 3. Check existing server.json (reuse if process still running)
    // 4. Scan from 3097 upward
    let port = null;

    // CLI override
    const cliPort = parseInt(args[httpFlag + 1]);
    if (!isNaN(cliPort)) {
      port = cliPort;
    } else {
      // Check existing server.json
      const existing = readServerJson();
      if (existing && isProcessRunning(existing.pid)) {
        console.error(`ℹ️  Server already running on port ${existing.port} (PID ${existing.pid})`);
        console.error(`   Connect to http://localhost:${existing.port}`);
        process.exit(0);
      }

      // Check config.json
      try {
        const config = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'config.json'), 'utf8'));
        if (config.port && !isNaN(config.port)) {
          port = config.port;
        }
      } catch (e) { /* no config or invalid */ }

      // Auto-discover
      if (!port) {
        const startPort = 3097;
        port = await findAvailablePort(startPort);
      }
    }

    startHttpMode(mcpServer, port);
  } else {
    startStdioMode(mcpServer);
  }
}

module.exports = { MCPServer, startStdioMode, startHttpMode, findAvailablePort, readServerJson, isProcessRunning };

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  });
}
