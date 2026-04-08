#!/usr/bin/env node

/**
 * Tiger Code MCP Server
 *
 * Official Model Context Protocol (MCP) server for Tiger Code Pilot.
 * Provides 15+ AI coding tools for code analysis, generation, debugging,
 * git operations, file management, and terminal command execution.
 *
 * Compatible with Claude Desktop, Cursor, and any MCP-compatible client.
 *
 * @packageDocumentation
 * @module @tiger-code/mcp-server
 * @license MIT
 * @version 1.0.0
 * @see https://modelcontextprotocol.io/
 * @see https://github.com/tiger-code-pilot/tiger-code-mcp-server
 */

'use strict';

// ─── Dependencies ──────────────────────────────────────────────────────────────

const http = require('http');
const readline = require('readline');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Constants ─────────────────────────────────────────────────────────────────

const VERSION = '1.0.0';
const SERVER_NAME = 'tiger-code-mcp-server';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const CONFIG_DIR = path.join(os.homedir(), '.tiger-code-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_PORT = 3001;
const COMMAND_TIMEOUT_MS = 120_000;
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

// ─── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = Object.freeze({
  provider: 'ollama',
  model: 'llama3.2',
  endpointUrl: 'http://localhost:11434/api/chat',
  settings: { temperature: 0.7, maxTokens: 4096 }
});

/**
 * Load configuration from disk
 * @returns {Object} Merged configuration with defaults
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed, settings: { ...DEFAULT_CONFIG.settings, ...(parsed.settings || {}) } };
    }
  } catch (err) {
    console.error(`⚠️ Config file corrupted, resetting to defaults. (${err.message})`);
    saveConfig(DEFAULT_CONFIG);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to disk
 * @param {Object} config - Configuration object to save
 */
function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error(`❌ Failed to save config: ${err.message}`);
  }
}

// ─── HTTP Client ───────────────────────────────────────────────────────────────

/**
 * Make HTTP request to AI provider
 * @param {string} url - Endpoint URL
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Response data
 */
async function httpPost(url, body) {
  // Use native fetch (Node 18+) or axios fallback
  if (typeof globalThis.fetch === 'function') {
    const response = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  // Fallback for older Node versions
  const axios = require('axios');
  const { data } = await axios.post(url, body);
  return data;
}

/**
 * Call AI provider with messages
 * @param {Array<{role: string, content: string}>} messages - Chat messages
 * @param {Object} options - Override options
 * @returns {Promise<string>} AI response text
 */
async function callAI(messages, options = {}) {
  const config = loadConfig();
  const endpoint = options.endpointUrl || config.endpointUrl;
  const model = options.model || config.model;
  const temperature = options.temperature ?? config.settings?.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? config.settings?.maxTokens ?? 4096;

  const requestBody = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  try {
    const data = await httpPost(endpoint, requestBody);
    return data.choices?.[0]?.message?.content || data.message?.content || 'No response';
  } catch (err) {
    return `Error calling AI provider: ${err.message}`;
  }
}

// ─── Tool Definitions ──────────────────────────────────────────────────────────

/** @typedef {Object} ToolParameter
 * @property {string} type
 * @property {Object} properties
 * @property {string[]} [required]
 */

/** @typedef {Object} Tool
 * @property {string} name
 * @property {string} description
 * @property {ToolParameter} parameters
 */

/** @type {Tool[]} */
const TOOLS = [
  // AI Tools
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
        description: { type: 'string', description: 'Description of what to generate' },
        language: { type: 'string', description: 'Programming language' }
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
        code: { type: 'string', description: 'The code to explain' }
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
        code: { type: 'string', description: 'The code to refactor' }
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
        code: { type: 'string', description: 'The code to debug' },
        error_message: { type: 'string', description: 'Error message if available' }
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
        code: { type: 'string', description: 'The code to write tests for' },
        framework: { type: 'string', description: 'Testing framework (e.g., jest, pytest)' }
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
        message: { type: 'string', description: 'Your message or question' },
        session_id: { type: 'string', description: 'Session ID for conversation history' }
      },
      required: ['message']
    }
  },
  // File System Tools
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
    name: 'write_file',
    description: 'Write content to a file (creates directories as needed)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
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
  },
  // Terminal Tool
  {
    name: 'run_command',
    description: 'Run a safe terminal command (restricted allowlist)',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to run' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['command']
    }
  },
  // Git Tools
  {
    name: 'git_status',
    description: 'Show git status of the repository',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Repository path' }
      }
    }
  },
  {
    name: 'git_log',
    description: 'Show git commit log',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Repository path' },
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
        cwd: { type: 'string', description: 'Repository path' },
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
        cwd: { type: 'string', description: 'Repository path' },
        remote: { type: 'boolean', description: 'Show remote branches' }
      }
    }
  }
];

// ─── Tool Handlers ─────────────────────────────────────────────────────────────

/** Commands allowed in the terminal allowlist */
const ALLOWED_COMMANDS = new Set([
  'ls', 'dir', 'cat', 'type', 'echo', 'pwd', 'npm', 'npx', 'node',
  'git', 'pip', 'python', 'python3', 'grep', 'find', 'head', 'tail',
  'wc', 'sort', 'jest', 'mocha', 'vitest', 'tsc', 'eslint', 'cargo',
  'go', 'rustc', 'javac', 'java', 'curl', 'wget', 'ps', 'kill', 'mkdir', 'cp', 'mv'
]);

/** Dangerous command patterns to block */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+\$HOME/i,
  /del\s+\/[sf]/i,
  /sudo/i,
  /mkfs/i,
  /format\s+[c-z]:/i
];

/** @type {Object<string, function>} */
const TOOL_HANDLERS = {
  // AI Tools
  analyze_code: async (args) => {
    const mode = args.mode || 'general';
    const language = args.language || 'code';
    const prompts = {
      general: `Analyze this ${language} code for quality, bugs, and improvements:`,
      security: `Perform a security audit of this ${language} code:`,
      performance: `Analyze this ${language} code for performance issues:`,
      bugs: `Find bugs and issues in this ${language} code:`
    };
    const prompt = `${prompts[mode]}\n\n\`\`\`${language}\n${args.code}\n\`\`\``;
    return callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },

  generate_code: async (args) => {
    const prompt = `Generate complete working ${args.language || ''} code with comments.\nDescription: ${args.description}`;
    return callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },

  explain_code: async (args) => {
    const prompt = `Explain this code in simple terms:\n${args.code}`;
    return callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },

  refactor_code: async (args) => {
    const prompt = `Refactor this code to be cleaner and more maintainable:\n${args.code}`;
    return callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },

  debug_code: async (args) => {
    const code = args.error_message ? `${args.code}\n\nError: ${args.error_message}` : args.code;
    const prompt = `Find and fix all bugs in this code:\n${code}`;
    return callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },

  write_tests: async (args) => {
    const prompt = `Write comprehensive unit tests for this code:\n${args.code}`;
    return callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },

  chat: async (args) => {
    return callAI([
      { role: 'system', content: 'You are Tiger Code Pilot, an expert AI coding assistant.' },
      { role: 'user', content: args.message }
    ]);
  },

  // File Tools
  read_file: async (args) => {
    try {
      return fs.readFileSync(args.path, 'utf8');
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  },

  write_file: async (args) => {
    try {
      const dir = path.dirname(args.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(args.path, args.content, 'utf8');
      return `File written: ${args.path}`;
    } catch (err) {
      return `Error writing file: ${err.message}`;
    }
  },

  list_directory: async (args) => {
    try {
      const entries = fs.readdirSync(args.path, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
    } catch (err) {
      return `Error listing directory: ${err.message}`;
    }
  },

  // Terminal Tool
  run_command: async (args) => {
    const execAsync = promisify(exec);
    const base = args.command.split(/\s+/)[0].toLowerCase();
    const cmdBase = base.endsWith('.exe') ? base.slice(0, -4) : base;

    if (!ALLOWED_COMMANDS.has(cmdBase)) {
      return `Command not allowed: "${cmdBase}". Use allowed commands only.`;
    }
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(args.command)) {
        return 'Command blocked: matches dangerous pattern';
      }
    }

    try {
      const { stdout, stderr } = await execAsync(args.command, {
        cwd: args.cwd || process.cwd(),
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_SIZE
      });
      return stderr ? `stdout:\n${stdout}\n\nstderr:\n${stderr}` : stdout;
    } catch (err) {
      return `Command failed: ${err.message}`;
    }
  },

  // Git Tools
  git_status: async (args) => {
    try {
      const { stdout } = await promisify(exec)('git status --short', { cwd: args.cwd || process.cwd() });
      return stdout || 'Working tree clean';
    } catch (err) {
      return `Not a git repo: ${err.message}`;
    }
  },

  git_log: async (args) => {
    try {
      const count = args.count || 10;
      const { stdout } = await promisify(exec)(`git log --oneline -${count}`, { cwd: args.cwd || process.cwd() });
      return stdout || 'No commits found';
    } catch (err) {
      return `Not a git repo: ${err.message}`;
    }
  },

  git_diff: async (args) => {
    try {
      const fileArg = args.file ? ` -- ${args.file}` : '';
      const { stdout } = await promisify(exec)(`git diff${fileArg}`, { cwd: args.cwd || process.cwd() });
      return stdout || 'No unstaged changes';
    } catch (err) {
      return `Not a git repo: ${err.message}`;
    }
  },

  git_branch: async (args) => {
    try {
      const cmd = args.remote ? 'git branch -a' : 'git branch';
      const { stdout } = await promisify(exec)(cmd, { cwd: args.cwd || process.cwd() });
      return stdout || 'No branches found';
    } catch (err) {
      return `Not a git repo: ${err.message}`;
    }
  }
};

// ─── MCP Server Class ──────────────────────────────────────────────────────────

/**
 * Tiger Code MCP Server
 * Implements the Model Context Protocol for AI coding assistance
 */
class TigerCodeMCPServer {
  constructor() {
    /** @type {Tool[]} */
    this.tools = TOOLS;
    /** @type {Object<string, function>} */
    this.handlers = TOOL_HANDLERS;
  }

  /**
   * Handle a tool call from an MCP client
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<string>} Tool result
   */
  async handleToolCall(name, args) {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await handler(args || {});
  }

  /**
   * Get the list of available tools
   * @returns {Tool[]}
   */
  getToolsList() {
    return this.tools;
  }
}

// ─── stdio Mode (MCP Protocol) ────────────────────────────────────────────────

/**
 * Start server in stdio mode (for MCP clients like Claude Desktop, Cursor)
 * @param {TigerCodeMCPServer} server
 */
function startStdioMode(server) {
  console.error(`🐯 Tiger Code MCP Server v${VERSION} — stdio mode`);
  console.error(`   Tools: ${server.getToolsList().map(t => t.name).join(', ')}`);
  console.error(`   Provider: ${loadConfig().provider}`);
  console.error('   Compatible with Claude Desktop, Cursor, and MCP clients');
  console.error('   Press Ctrl+C to stop');

  const rl = readline.createInterface({
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
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: VERSION }
          }
        }) + '\n');
      } else if (request.method === 'tools/list') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: server.getToolsList() }
        }) + '\n');
      } else if (request.method === 'tools/call') {
        const result = await server.handleToolCall(
          request.params.name,
          request.params.arguments || {}
        );
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: String(result) }]
          }
        }) + '\n');
      }
    } catch (error) {
      console.error(`Error handling request: ${error.message}`);
    }
  });
}

// ─── HTTP Mode (REST API) ─────────────────────────────────────────────────────

/**
 * Parse JSON body from HTTP request
 * @param {http.IncomingMessage} req
 * @returns {Promise<Object>}
 */
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        resolve({});
      }
    });
  });
}

/**
 * Start server in HTTP mode (REST API)
 * @param {TigerCodeMCPServer} server
 * @param {number} port
 */
function startHttpMode(server, port) {
  const httpServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // GET /health
      if (req.method === 'GET' && req.url === '/health') {
        const config = loadConfig();
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'ok',
          version: VERSION,
          server: SERVER_NAME,
          provider: config.provider,
          model: config.model,
          tools: server.getToolsList().map(t => t.name)
        }));
        return;
      }

      // GET /tools
      if (req.method === 'GET' && req.url === '/tools') {
        res.writeHead(200);
        res.end(JSON.stringify({ tools: server.getToolsList() }));
        return;
      }

      // POST /tool
      if (req.method === 'POST' && req.url === '/tool') {
        const { name, arguments: args } = await parseBody(req);
        if (!name) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Tool name is required' }));
          return;
        }
        const result = await server.handleToolCall(name, args || {});
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
        return;
      }

      // 404
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found. Available endpoints: GET /health, GET /tools, POST /tool' }));
    } catch (error) {
      console.error(`HTTP error: ${error.message}`);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  httpServer.listen(port, () => {
    const config = loadConfig();
    console.error(`🐯 Tiger Code MCP Server v${VERSION} — HTTP mode`);
    console.error(`   Running on http://localhost:${port}`);
    console.error(`   Provider: ${config.provider} (${config.model})`);
    console.error(`   Tools (${server.getToolsList().length}): ${server.getToolsList().map(t => t.name).join(', ')}`);
    console.error('   Endpoints: GET /health, GET /tools, POST /tool');
    console.error('   Press Ctrl+C to stop');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.error('\n👋 Server stopped');
    httpServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error('\n👋 Server stopped (SIGTERM)');
    httpServer.close();
    process.exit(0);
  });
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Main entry point
 */
async function main() {
  const server = new TigerCodeMCPServer();
  const args = process.argv.slice(2);
  const httpFlag = args.indexOf('--http');

  if (httpFlag !== -1) {
    const port = parseInt(args[httpFlag + 1], 10) || DEFAULT_PORT;
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`❌ Invalid port: ${args[httpFlag + 1]}`);
      process.exit(1);
    }
    startHttpMode(server, port);
  } else {
    startStdioMode(server);
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  TigerCodeMCPServer,
  TOOLS,
  TOOL_HANDLERS,
  VERSION,
  SERVER_NAME,
  loadConfig,
  saveConfig,
  callAI
};

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  });
}
