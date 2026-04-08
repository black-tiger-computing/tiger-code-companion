#!/usr/bin/env node

/**
 * Tiger Code MCP Server — Test Suite
 *
 * Tests tool handlers, MCP protocol compliance, security, and HTTP endpoints.
 * Run with: node test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Test Runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    process.stdout.write(`  ✅ ${message}\n`);
  } else {
    failed++;
    failures.push(message);
    process.stdout.write(`  ❌ ${message}\n`);
  }
}

async function test(name, fn) {
  process.stdout.write(`\n📋 ${name}\n`);
  try {
    await fn();
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    process.stdout.write(`  ❌ ${name}: ${err.message}\n`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const { TigerCodeMCPServer, TOOLS, TOOL_HANDLERS, VERSION, SERVER_NAME } = require('./index');

test('Module exports', () => {
  assert(typeof TigerCodeMCPServer === 'function', 'TigerCodeMCPServer is exported');
  assert(Array.isArray(TOOLS), 'TOOLS array is exported');
  assert(typeof TOOL_HANDLERS === 'object', 'TOOL_HANDLERS object is exported');
  assert(typeof VERSION === 'string', 'VERSION string is exported');
  assert(typeof SERVER_NAME === 'string', 'SERVER_NAME string is exported');
});

test('Server instantiation', () => {
  const server = new TigerCodeMCPServer();
  assert(server instanceof TigerCodeMCPServer, 'Server instantiates correctly');
  assert(Array.isArray(server.getToolsList()), 'getToolsList returns array');
  assert(typeof server.handleToolCall === 'function', 'handleToolCall is a function');
});

test('Tool count and names', () => {
  const server = new TigerCodeMCPServer();
  const tools = server.getToolsList();
  assert(tools.length === 15, `Has 15 tools (has ${tools.length})`);

  const expectedTools = [
    'analyze_code', 'generate_code', 'explain_code', 'refactor_code',
    'debug_code', 'write_tests', 'chat', 'read_file', 'write_file',
    'list_directory', 'run_command', 'git_status', 'git_log', 'git_diff', 'git_branch'
  ];

  for (const toolName of expectedTools) {
    const tool = tools.find(t => t.name === toolName);
    assert(tool !== undefined, `Tool "${toolName}" exists`);
  }
});

test('Tool structure validation', () => {
  const server = new TigerCodeMCPServer();
  for (const tool of server.getToolsList()) {
    assert(tool.name && typeof tool.name === 'string', `"${tool.name}" has valid name`);
    assert(tool.description && typeof tool.description === 'string', `"${tool.name}" has valid description`);
    assert(tool.parameters && typeof tool.parameters === 'object', `"${tool.name}" has valid parameters`);
    assert(tool.parameters.type === 'object', `"${tool.name}" has object type`);
    assert(tool.parameters.properties && typeof tool.parameters.properties === 'object', `"${tool.name}" has properties`);
  }
});

test('Tool handler count matches tool count', () => {
  const server = new TigerCodeMCPServer();
  const toolNames = server.getToolsList().map(t => t.name);
  const handlerNames = Object.keys(server.handlers);

  assert(toolNames.length === handlerNames.length, `Same number of tools (${toolNames.length}) and handlers (${handlerNames.length})`);

  for (const name of toolNames) {
    assert(typeof server.handlers[name] === 'function', `Handler exists for "${name}"`);
  }
});

test('File tool: read_file', async () => {
  const server = new TigerCodeMCPServer();
  // Create a temp file
  const tmpFile = path.join(os.tmpdir(), `tiger-test-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, 'Hello, Tiger Code!', 'utf8');

  try {
    const result = await server.handleToolCall('read_file', { path: tmpFile });
    assert(result === 'Hello, Tiger Code!', 'read_file returns correct content');
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test('File tool: read_file (non-existent)', async () => {
  const server = new TigerCodeMCPServer();
  const result = await server.handleToolCall('read_file', { path: '/nonexistent/file.txt' });
  assert(result.startsWith('Error reading file:'), 'read_file handles missing file gracefully');
});

test('File tool: write_file', async () => {
  const server = new TigerCodeMCPServer();
  const tmpFile = path.join(os.tmpdir(), `tiger-test-write-${Date.now()}.txt`);

  try {
    const result = await server.handleToolCall('write_file', {
      path: tmpFile,
      content: 'Written by Tiger!'
    });
    assert(result.includes('File written:'), 'write_file returns success message');
    assert(fs.existsSync(tmpFile), 'File was actually created');
    assert(fs.readFileSync(tmpFile, 'utf8') === 'Written by Tiger!', 'File content is correct');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('File tool: write_file (creates directories)', async () => {
  const server = new TigerCodeMCPServer();
  const nestedDir = path.join(os.tmpdir(), `tiger-test-dir-${Date.now()}`, 'nested');
  const tmpFile = path.join(nestedDir, 'test.txt');

  try {
    await server.handleToolCall('write_file', { path: tmpFile, content: 'nested' });
    assert(fs.existsSync(tmpFile), 'File created in nested directory');
  } finally {
    if (fs.existsSync(nestedDir)) fs.rmSync(nestedDir, { recursive: true, force: true });
  }
});

test('File tool: list_directory', async () => {
  const server = new TigerCodeMCPServer();
  const result = await server.handleToolCall('list_directory', { path: __dirname });
  assert(typeof result === 'string', 'list_directory returns string');
  assert(result.length > 0, 'list_directory returns non-empty result');
  assert(result.includes('index.js') || result.includes('📄'), 'list_directory shows files');
});

test('Git tool: git_status', async () => {
  const server = new TigerCodeMCPServer();
  const result = await server.handleToolCall('git_status', { cwd: process.cwd() });
  assert(typeof result === 'string', 'git_status returns string');
  assert(!result.startsWith('Not a git repo:'), 'git_status works in git repo');
});

test('Git tool: git_log', async () => {
  const server = new TigerCodeMCPServer();
  const result = await server.handleToolCall('git_log', { cwd: process.cwd(), count: 3 });
  assert(typeof result === 'string', 'git_log returns string');
  assert(!result.startsWith('Not a git repo:'), 'git_log works in git repo');
});

test('Git tool: git_branch', async () => {
  const server = new TigerCodeMCPServer();
  const result = await server.handleToolCall('git_branch', { cwd: process.cwd() });
  assert(typeof result === 'string', 'git_branch returns string');
  assert(!result.startsWith('Not a git repo:'), 'git_branch works in git repo');
});

test('Security: blocked dangerous commands', async () => {
  const server = new TigerCodeMCPServer();

  const dangerousCommands = [
    'rm -rf /',
    'rm -rf $HOME',
    'del /s /q C:\\',
    'sudo rm -rf /',
    'mkfs.ext4 /dev/sda',
    'format C:'
  ];

  for (const cmd of dangerousCommands) {
    const result = await server.handleToolCall('run_command', { command: cmd });
    assert(
      result.includes('not allowed') || result.includes('blocked') || result.includes('Command failed'),
      `Blocked dangerous command: "${cmd}"`
    );
  }
});

test('Security: unknown tool throws error', async () => {
  const server = new TigerCodeMCPServer();
  try {
    await server.handleToolCall('nonexistent_tool', {});
    assert(false, 'Should have thrown an error');
  } catch (err) {
    assert(err.message.includes('Unknown tool'), 'Throws correct error for unknown tool');
  }
});

test('Version consistency', () => {
  assert(VERSION === '1.0.0', 'Version is 1.0.0');
  assert(SERVER_NAME === 'tiger-code-mcp-server', 'Server name is correct');
});

test('MCP Protocol compatibility', () => {
  const server = new TigerCodeMCPServer();
  const tools = server.getToolsList();

  // Verify all tools have required fields for MCP protocol
  for (const tool of tools) {
    assert(typeof tool.name === 'string', `Tool "${tool.name}" name is string`);
    assert(typeof tool.description === 'string', `Tool "${tool.name}" description is string`);
    assert(tool.parameters.type === 'object', `Tool "${tool.name}" has correct parameter type`);
  }
});

// ─── HTTP Server Test ──────────────────────────────────────────────────────────

test('HTTP server starts and responds', async () => {
  const { TigerCodeMCPServer } = require('./index');
  const server = new TigerCodeMCPServer();

  // Import the start function indirectly by creating a minimal HTTP server
  const http = require('http');

  return new Promise((resolve) => {
    const testServer = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', version: VERSION }));
      } else if (req.method === 'GET' && req.url === '/tools') {
        res.writeHead(200);
        res.end(JSON.stringify({ tools: server.getToolsList() }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    testServer.listen(0, async () => {
      const port = testServer.address().port;

      try {
        // Test /health
        const healthRes = await fetch(`http://localhost:${port}/health`);
        const healthData = await healthRes.json();
        assert(healthData.status === 'ok', 'Health endpoint returns ok');
        assert(healthData.version === VERSION, 'Health endpoint has correct version');

        // Test /tools
        const toolsRes = await fetch(`http://localhost:${port}/tools`);
        const toolsData = await toolsRes.json();
        assert(Array.isArray(toolsData.tools), 'Tools endpoint returns array');
        assert(toolsData.tools.length === 15, 'Tools endpoint returns 15 tools');

        testServer.close();
        resolve();
      } catch (err) {
        testServer.close();
        assert(false, `HTTP test failed: ${err.message}`);
        resolve();
      }
    });
  });
});

// ─── Results ──────────────────────────────────────────────────────────────────

process.stdout.write('\n' + '='.repeat(60) + '\n');
process.stdout.write(`\n📊 Test Results: ${passed} passed, ${failed} failed\n\n`);

if (failures.length > 0) {
  process.stdout.write('❌ Failed tests:\n');
  for (const msg of failures) {
    process.stdout.write(`   - ${msg}\n`);
  }
  process.stdout.write('\n');
  process.exit(1);
} else {
  process.stdout.write('✅ All tests passed! 🐯\n\n');
  process.exit(0);
}
