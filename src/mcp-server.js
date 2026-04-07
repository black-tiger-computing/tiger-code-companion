#!/usr/bin/env node

/**
 * Tiger Code Pilot MCP Server
 *
 * Implements Model Context Protocol over stdio (JSON-RPC).
 * Used by MCP-compatible clients: Claude Desktop, Cursor, etc.
 *
 * Usage:
 *   tiger-code-mcp          # stdio mode only
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { getCoreEngine } = require('./core-engine');

const VERSION = '0.4.0';

function naturalChat(userMessage, sessionId = 'default') {
  return getCoreEngine().chat(userMessage, sessionId);
}

function vibecode(action, params) {
  return getCoreEngine().vibecode(action, params);
}

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
      properties: {
        code: { type: 'string' },
        error_message: { type: 'string' }
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
        code: { type: 'string' },
        framework: { type: 'string' }
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
        message: { type: 'string' },
        session_id: { type: 'string' }
      },
      required: ['message']
    }
  },
  {
    name: 'read_file',
    description: 'Read contents of a file',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'list_directory',
    description: 'List files in a directory',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  }
];

const TOOL_HANDLERS = {
  analyze_code: async (args) => {
    const modePrompts = {
      general: 'Analyze this code for quality, bugs, and improvements:',
      security: 'Perform a security audit of this code:',
      performance: 'Analyze this code for performance issues:',
      bugs: 'Find bugs and issues in this code:'
    };
    const prompt = `${modePrompts[args.mode || 'general']}\n\n\`\`\`${args.language || ''}\n${args.code}\n\`\`\``;
    return await callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  },
  generate_code: async (args) => vibecode('generate', args),
  explain_code: async (args) => vibecode('explain', args),
  refactor_code: async (args) => vibecode('refactor', args),
  debug_code: async (args) => vibecode('debug', { code: args.error_message ? `${args.code}\n\nError: ${args.error_message}` : args.code }),
  write_tests: async (args) => vibecode('test', args),
  chat: async (args) => naturalChat(args.message, args.session_id),
  read_file: async (args) => {
    try { return await fs.readFile(args.path, 'utf8'); }
    catch (e) { return `Error: ${e.message}`; }
  },
  list_directory: async (args) => {
    try {
      const files = await fs.readdir(args.path, { withFileTypes: true });
      return files.map(f => `${f.isDirectory() ? '📁' : '📄'} ${f.name}`).join('\n');
    } catch (e) { return `Error: ${e.message}`; }
  }
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

async function main() {
  const mcpServer = new MCPServer();
  console.error(`🐯 Tiger Code Pilot MCP Server v${VERSION} — stdio mode`);

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
          result: { content: [{ type: 'text', text: result }] }
        }) + '\n');
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  });
}

module.exports = { MCPServer, naturalChat, vibecode, loadConfig };

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  });
}
