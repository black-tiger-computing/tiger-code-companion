'use strict';

/**
 * MCP Server Auto-Loader
 *
 * Clones MCP servers from GitHub, detects their tool definitions,
 * registers them with the plugin system, and checks GitHub for
 * deprecation signals (archived repos, stale commits, etc.).
 *
 * Usage (programmatic):
 *   const loader = require('./mcp-auto-loader');
 *   await loader.installFromGitHub('github-mcp');
 *   await loader.checkDeprecation('github-mcp');
 *   await loader.autoDiscoverAndInstall();
 */

const fs = require('fs');
const path = require('path');
// os, http not currently used - reserved for future features
// const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
// const http = require('http');
const { getPluginSystem } = require('./plugin-system');
const mcpRegistry = require('./mcp-registry');

const execAsync = promisify(exec);

const MCP_INSTALL_DIR = mcpRegistry.MCP_INSTALL_DIR;
const KNOWN_MCP_SERVERS = mcpRegistry.KNOWN_MCP_SERVERS;

// ─── GitHub API helpers ───────────────────────────────────────────────────────

function githubRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com${endpoint}`;
    const client = https;
    const headers = { 'User-Agent': 'Tiger-Code-Pilot-MCP-Loader' };
    // If GITHUB_TOKEN is set, use it for higher rate limits
    const token = process.env.GITHUB_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = client.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Invalid JSON from GitHub')); }
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GitHub request timeout')); });
  });
}

// ─── Deprecation Checker ──────────────────────────────────────────────────────

async function checkDeprecation(serverId) {
  const entry = KNOWN_MCP_SERVERS.find(s => s.id === serverId);
  if (!entry) throw new Error(`Unknown server: ${serverId}`);

  const info = {};

  try {
    // Fetch repo metadata
    const repoData = await githubRequest(`/repos/${entry.repo}`);
    info.archived = repoData.archived || false;
    info.stars = repoData.stargazers_count || 0;
    info.pushedAt = repoData.pushed_at;
    info.createdAt = repoData.created_at;
    info.openIssues = repoData.open_issues_count;
    info.forks = repoData.forks_count;
    info.language = repoData.language;
    info.topics = repoData.topics || [];

    // Check for deprecation markers
    info.deprecated = false;
    info.deprecationReason = null;

    if (info.archived) {
      info.deprecated = true;
      info.deprecationReason = 'Repository has been archived by owner';
    } else {
      const daysSincePush = (Date.now() - new Date(info.pushedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePush > 180) {
        info.deprecated = true;
        info.deprecationReason = `No commits for ${Math.round(daysSincePush)} days (180-day threshold)`;
      }
    }

    // Check if repo has been forked by many (sign of community support)
    info.communityHealth = info.forks > 50 ? 'healthy' : info.forks > 10 ? 'moderate' : 'low';

  } catch (e) {
    info.error = e.message;
    info.deprecated = null; // Unknown — can't determine
  }

  return info;
}

// ─── GitHub Clone & Install ───────────────────────────────────────────────────

async function cloneRepo(repo, targetDir) {
  const url = `https://github.com/${repo}.git`;
  if (fs.existsSync(path.join(targetDir, '.git'))) {
    // Already cloned — pull latest
    await execAsync('git pull', { cwd: targetDir, timeout: 60000 });
    return 'updated';
  }
  await execAsync(`git clone --depth 1 ${url} "${targetDir}"`, { timeout: 120000 });
  return 'cloned';
}

async function installDependencies(serverDir) {
  // Detect package manager
  if (fs.existsSync(path.join(serverDir, 'package.json'))) {
    if (fs.existsSync(path.join(serverDir, 'bun.lockb')) || fs.existsSync(path.join(serverDir, 'bun.lock'))) {
      await execAsync('bun install', { cwd: serverDir, timeout: 120000 });
    } else if (fs.existsSync(path.join(serverDir, 'pnpm-lock.yaml'))) {
      await execAsync('pnpm install', { cwd: serverDir, timeout: 120000 });
    } else if (fs.existsSync(path.join(serverDir, 'yarn.lock'))) {
      await execAsync('yarn install', { cwd: serverDir, timeout: 120000 });
    } else {
      await execAsync('npm install', { cwd: serverDir, timeout: 120000 });
    }
    return 'node';
  }

  if (fs.existsSync(path.join(serverDir, 'requirements.txt')) || fs.existsSync(path.join(serverDir, 'pyproject.toml'))) {
    await execAsync('pip install -r requirements.txt 2>/dev/null || pip install -e .', {
      cwd: serverDir, shell: true, timeout: 120000
    }).catch(() => {});
    return 'python';
  }

  if (fs.existsSync(path.join(serverDir, 'Cargo.toml'))) {
    await execAsync('cargo build --release', { cwd: serverDir, timeout: 300000 });
    return 'rust';
  }

  if (fs.existsSync(path.join(serverDir, 'go.mod'))) {
    await execAsync('go build -o mcp-server', { cwd: serverDir, timeout: 120000 });
    return 'go';
  }

  return 'unknown';
}

// ─── Tool Extraction & Registration ───────────────────────────────────────────

function detectEntryPoint(serverDir, runtime) {
  // Look for common entry points
  const candidates = {
    node: ['dist/index.js', 'dist/index.cjs', 'build/index.js', 'src/index.js', 'index.js'],
    python: ['server.py', 'main.py', 'mcp_server.py', '__main__.py'],
    rust: ['target/release/mcp-server', 'target/release/server'],
    go: ['mcp-server'],
    unknown: ['server', 'mcp-server', 'start.sh']
  };

  const list = candidates[runtime] || [];
  for (const candidate of list) {
    const fullPath = path.join(serverDir, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  // Fallback: find any executable JS or Python file
  if (runtime === 'node') {
    try {
      const { stdout } = require('child_process').execSync('ls dist/*.js build/*.js src/*.js 2>/dev/null', { cwd: serverDir });
      const files = stdout.trim().split('\n').filter(Boolean);
      if (files.length) return path.join(serverDir, files[0]);
    } catch (e) { /* ignore */ }
  }

  return null;
}

async function extractToolsFromServer(serverDir, entryPoint) {
  // Heuristic: scan source files for tool registrations
  // For now, return a wrapper tool that spawns the MCP server and forwards calls
  if (!entryPoint || !fs.existsSync(entryPoint)) return [];

  return [{
    name: `mcp_external_server_${path.basename(serverDir)}`,
    description: `External MCP server at ${path.basename(serverDir)}`,
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Tool name to call' },
        arguments: { type: 'object', description: 'Tool arguments' }
      },
      required: ['tool']
    },
    handler: async (_args) => {
      // Spawn the MCP server as a stdio subprocess and forward the call
      // This is a simplified version — a full implementation would use
      // the MCP protocol over stdio
      return `MCP server at ${path.basename(serverDir)} — direct tool calls require MCP protocol client`;
    }
  }];
}

async function registerServerTools(serverId, tools) {
  const ps = getPluginSystem();
  let registered = 0;
  for (const tool of tools) {
    try {
      // Prefix with server ID to avoid collisions
      const prefixedTool = { ...tool, name: `${serverId}_${tool.name}` };
      ps.registerPlugin({ name: `mcp-${serverId}-${tool.name}`, version: '1.0.0', description: tool.description, tools: [prefixedTool] });
      registered++;
    } catch (e) {
      console.error(`⚠️  Failed to register tool ${tool.name} from ${serverId}: ${e.message}`);
    }
  }
  return registered;
}

// ─── Main Install Flow ────────────────────────────────────────────────────────

async function installFromGitHub(serverId) {
  const entry = KNOWN_MCP_SERVERS.find(s => s.id === serverId);
  if (!entry) throw new Error(`Unknown MCP server: ${serverId}`);
  if (mcpRegistry.isInstalled(serverId)) {
    return { status: 'already_installed', serverId, repo: entry.repo };
  }

  console.error(`📥 Installing MCP server: ${entry.name} (${entry.repo})`);
  const serverDir = path.join(MCP_INSTALL_DIR, serverId);

  try {
    // 1. Clone
    const cloneStatus = await cloneRepo(entry.repo, serverDir);
    console.error(`   Git: ${cloneStatus}`);

    // 2. Install deps
    const runtime = await installDependencies(serverDir);
    console.error(`   Runtime: ${runtime}`);

    // 3. Find entry point
    const entryPoint = detectEntryPoint(serverDir, runtime);
    console.error(`   Entry: ${entryPoint || 'none found'}`);

    // 4. Extract tools (heuristic)
    const tools = await extractToolsFromServer(serverDir, entryPoint);
    console.error(`   Tools detected: ${tools.length}`);

    // 5. Register with plugin system
    const registered = await registerServerTools(serverId, tools);
    console.error(`   Registered: ${registered} tool(s)`);

    // 6. Check deprecation
    const depInfo = await checkDeprecation(serverId);

    // 7. Mark as installed
    mcpRegistry.markInstalled(serverId, {
      repo: entry.repo,
      name: entry.name,
      runtime,
      entryPoint,
      toolsDetected: tools.length,
      toolsRegistered: registered,
      githubInfo: depInfo,
      deprecated: depInfo.deprecated,
      deprecationReason: depInfo.deprecationReason
    });

    return {
      status: 'installed',
      serverId,
      name: entry.name,
      cloneStatus,
      runtime,
      entryPoint,
      toolsDetected: tools.length,
      toolsRegistered: registered,
      deprecated: depInfo.deprecated,
      deprecationReason: depInfo.deprecationReason
    };
  } catch (e) {
    console.error(`❌ Failed to install ${serverId}: ${e.message}`);
    // Clean up partial clone
    try {
      if (fs.existsSync(serverDir)) fs.rmSync(serverDir, { recursive: true, force: true });
    } catch (e2) {
      console.error(`⚠️  Cleanup failed: ${e2.message}`);
    }
    throw e;
  }
}

async function uninstallServer(serverId) {
  if (!mcpRegistry.isInstalled(serverId)) return { status: 'not_installed' };

  const serverDir = path.join(MCP_INSTALL_DIR, serverId);
  mcpRegistry.markUninstalled(serverId);

  // Optionally remove cloned files
  try {
    if (fs.existsSync(serverDir)) fs.rmSync(serverDir, { recursive: true, force: true });
  } catch (e) { /* ignore */ }

  return { status: 'uninstalled', serverId };
}

async function updateServer(serverId) {
  if (!mcpRegistry.isInstalled(serverId)) {
    return installFromGitHub(serverId);
  }

  const serverDir = path.join(MCP_INSTALL_DIR, serverId);
  if (!fs.existsSync(serverDir)) {
    return installFromGitHub(serverId);
  }

  // Pull latest
  const { stdout } = await execAsync('git pull', { cwd: serverDir, timeout: 60000 });
  if (stdout.includes('Already up to date')) return { status: 'up_to_date', serverId };

  // Re-check deprecation
  const depInfo = await checkDeprecation(serverId);

  // Update installed manifest
  const servers = mcpRegistry.getInstalledServers();
  if (servers[serverId]) {
    servers[serverId].githubInfo = depInfo;
    servers[serverId].deprecated = depInfo.deprecated;
    servers[serverId].deprecationReason = depInfo.deprecationReason;
    servers[serverId].lastUpdated = new Date().toISOString();
    mcpRegistry.saveInstalledServers(servers);
  }

  return { status: 'updated', serverId, deprecated: depInfo.deprecated, deprecationReason: depInfo.deprecationReason };
}

// ─── Auto-Discovery ───────────────────────────────────────────────────────────

async function discoverGitHubMcpServers() {
  // Search GitHub for repos tagged with "mcp-server" or "model-context-protocol"
  try {
    const results = await githubRequest('/search/repositories?q=topic:mcp-server+topic:model-context-protocol&sort=stars&order=desc&per_page=20');
    return results.items.map(item => ({
      id: item.full_name.replace('/', '-'),
      repo: item.full_name,
      name: item.name,
      description: item.description || '',
      stars: item.stargazers_count,
      language: item.language,
      tools: [],
      category: 'discovered'
    }));
  } catch (e) {
    console.error(`⚠️  GitHub discovery failed: ${e.message}`);
    return [];
  }
}

async function autoDiscoverAndInstall() {
  const discovered = await discoverGitHubMcpServers();
  const results = [];

  for (const server of discovered) {
    try {
      // Skip already installed
      if (mcpRegistry.isInstalled(server.id)) {
        results.push({ id: server.id, status: 'skipped', reason: 'already installed' });
        continue;
      }

      // Check deprecation before installing
      const depInfo = await checkDeprecationDynamic(server.repo);
      if (depInfo.deprecated) {
        results.push({ id: server.id, status: 'skipped', reason: depInfo.deprecationReason });
        continue;
      }

      const installResult = await installDynamic(server);
      results.push(installResult);
    } catch (e) {
      results.push({ id: server.id, status: 'failed', error: e.message });
    }
  }

  return results;
}

// Dynamic install for discovered (not pre-registered) servers
async function installDynamic(server) {
  const serverDir = path.join(MCP_INSTALL_DIR, server.id);
  const cloneStatus = await cloneRepo(server.repo, serverDir);
  const runtime = await installDependencies(serverDir);
  const entryPoint = detectEntryPoint(serverDir, runtime);
  const tools = await extractToolsFromServer(serverDir, entryPoint);
  const registered = await registerServerTools(server.id, tools);

  const depInfo = await checkDeprecationDynamic(server.repo);
  mcpRegistry.markInstalled(server.id, {
    repo: server.repo,
    name: server.name,
    runtime, entryPoint,
    toolsDetected: tools.length,
    toolsRegistered: registered,
    githubInfo: depInfo,
    deprecated: depInfo.deprecated,
    deprecationReason: depInfo.deprecationReason
  });

  return {
    id: server.id,
    status: 'installed',
    cloneStatus, runtime, entryPoint,
    toolsDetected: tools.length,
    toolsRegistered: registered,
    deprecated: depInfo.deprecated
  };
}

async function checkDeprecationDynamic(repo) {
  try {
    const info = await githubRequest(`/repos/${repo}`);
    const deprecated = info.archived || ((Date.now() - new Date(info.pushed_at).getTime()) / (1000 * 60 * 60 * 24) > 180);
    const daysSincePush = (Date.now() - new Date(info.pushed_at).getTime()) / (1000 * 60 * 60 * 24);
    return {
      archived: info.archived,
      stars: info.stargazers_count,
      pushedAt: info.pushed_at,
      deprecated,
      deprecationReason: info.archived
        ? 'Repository archived'
        : deprecated ? `No activity for ${Math.round(daysSincePush)} days` : null
    };
  } catch (e) {
    return { deprecated: null, error: e.message };
  }
}

// ─── Status Report ────────────────────────────────────────────────────────────

function getStatusReport() {
  const installed = mcpRegistry.getInstalledList();
  return installed.map(s => {
    const dep = mcpRegistry.isDeprecated(s);
    const reason = mcpRegistry.getDeprecationReason(s);
    return { ...s, deprecated: dep, deprecationReason: reason };
  });
}

module.exports = {
  installFromGitHub,
  uninstallServer,
  updateServer,
  checkDeprecation,
  discoverGitHubMcpServers,
  autoDiscoverAndInstall,
  getStatusReport,
  MCP_INSTALL_DIR
};
