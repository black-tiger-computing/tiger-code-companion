#!/usr/bin/env node

/**
 * Tiger Code Pilot — Server Daemon Manager
 *
 * Auto-start mechanism for IDE/extension launch.
 *
 * Protocol:
 *   1. Check if ~/.tiger-code-pilot/server.json exists
 *   2. If yes → check if PID is still running
 *   3. If running → return existing port
 *   4. If not running → spawn tiger-code-mcp --http as child process
 *   5. Wait for /health endpoint to respond
 *   6. Return the port number
 *
 * Usage:
 *   const { ensureServerRunning } = require('./server-daemon');
 *   const port = await ensureServerRunning();
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

const CONFIG_DIR = path.join(os.homedir(), '.tiger-code-pilot');
const SERVER_JSON = path.join(CONFIG_DIR, 'server.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function waitForHealth(port, maxRetries = 30, delayMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function tryHealth() {
      attempts++;
      if (attempts > maxRetries) {
        reject(new Error(`Server did not become healthy on port ${port} after ${maxRetries} attempts`));
        return;
      }

      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            setTimeout(tryHealth, delayMs);
          }
        });
      });

      req.on('error', () => {
        setTimeout(tryHealth, delayMs);
      });

      req.setTimeout(2000);
    }

    tryHealth();
  });
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Ensure the MCP HTTP server is running.
 * Spawns a new instance if no healthy server is found.
 *
 * @param {object} opts
 * @param {string} opts.mcpPath — path to mcp-server.js (default: auto-resolve)
 * @returns {Promise<{port: number, pid: number, healthy: boolean}>}
 */
async function ensureServerRunning(opts = {}) {
  // Step 1: Check existing server.json
  const serverInfo = readServerJson();

  if (serverInfo && serverInfo.pid && isProcessRunning(serverInfo.pid)) {
    // Verify it's actually responding
    try {
      const health = await waitForHealth(serverInfo.port, 5, 300);
      return { port: serverInfo.port, pid: serverInfo.pid, healthy: true, existing: true, health };
    } catch (e) {
      // Process exists but not responding — kill and restart
      try { process.kill(serverInfo.pid, 'SIGTERM'); } catch (e) { /* already dead */ }
      // Wait for process to die
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Step 2: Spawn new instance
  let mcpPath;
  try {
    mcpPath = opts.mcpPath || require.resolve('./mcp-server.js');
  } catch (e) {
    throw new Error(`Cannot find mcp-server.js: ${e.message}. Provide opts.mcpPath.`);
  }

  const serverDir = path.dirname(mcpPath);

  let child;
  try {
    child = spawn('node', [mcpPath, '--http'], {
      cwd: serverDir,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch (e) {
    throw new Error(`Failed to spawn MCP server: ${e.message}`);
  }

  // Step 3: Wait for health
  let serverJson = null;
  const maxWait = 60; // 30 seconds (60 * 500ms)
  let attempts = 0;

  while (!serverJson && attempts < maxWait) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
    serverJson = readServerJson();
  }

  if (!serverJson) {
    // Try to kill the orphaned child
    try { process.kill(child.pid, 'SIGTERM'); } catch (e) { /* ignore */ }
    throw new Error('Server failed to start — server.json not created within 30s');
  }

  const health = await waitForHealth(serverJson.port, 30, 500);

  return {
    port: serverJson.port,
    pid: serverJson.pid,
    healthy: true,
    existing: false,
    health
  };
}

/**
 * Stop the running server (for cleanup/shutdown).
 * @returns {Promise<{ok: boolean}>}
 */
async function stopServer() {
  const serverInfo = readServerJson();
  if (!serverInfo || !serverInfo.pid) return { ok: false, reason: 'No server info found' };

  try {
    process.kill(serverInfo.pid, 'SIGTERM');
    // Wait for process to exit
    await new Promise(r => setTimeout(r, 2000));

    // Clean up server.json
    if (fs.existsSync(SERVER_JSON)) {
      fs.unlinkSync(SERVER_JSON);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * Get the current server status without starting anything.
 * @returns {{running: boolean, port?: number, pid?: number}}
 */
function getServerStatus() {
  const serverInfo = readServerJson();
  if (!serverInfo) return { running: false };

  const isRunning = isProcessRunning(serverInfo.pid);
  return {
    running: isRunning,
    port: serverInfo.port,
    pid: serverInfo.pid,
    started_at: serverInfo.started_at,
    mode: serverInfo.mode
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'start':
      console.log('🐯 Starting MCP server...');
      ensureServerRunning()
        .then(r => {
          console.log(`✅ Server running on http://localhost:${r.port} (PID ${r.pid})${r.existing ? ' (existing)' : ''}`);
        })
        .catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
      break;

    case 'stop':
      console.log('🐯 Stopping MCP server...');
      stopServer()
        .then(r => {
          console.log(r.ok ? '✅ Server stopped' : `❌ ${r.reason}`);
        })
        .catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
      break;

    case 'status':
      const status = getServerStatus();
      if (!status.running) {
        console.log('⚪ No server running');
      } else {
        console.log(`🟢 Running on http://localhost:${status.port} (PID ${status.pid})`);
        console.log(`   Started: ${status.started_at}`);
        console.log(`   Mode: ${status.mode}`);
      }
      break;

    default:
      console.log(`
🐯 Server Daemon Manager

  start     Start MCP server (or connect to existing)
  stop      Stop the running server
  status    Show server status
`);
  }
}

module.exports = {
  ensureServerRunning,
  stopServer,
  getServerStatus,
  readServerJson,
  isProcessRunning,
  waitForHealth,
  main
};

if (require.main === module) main();
