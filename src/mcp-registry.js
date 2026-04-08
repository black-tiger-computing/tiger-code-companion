'use strict';

/**
 * MCP Server Registry
 *
 * Curated catalog of GitHub-hosted MCP servers with metadata,
 * installation status, and deprecation tracking.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MCP_REGISTRY_DIR = path.join(os.homedir(), '.tiger-code-pilot', 'mcp-servers');
const MCP_REGISTRY_FILE = path.join(MCP_REGISTRY_DIR, 'registry.json');
const MCP_INSTALL_DIR = path.join(MCP_REGISTRY_DIR, 'installed');

function ensureMcpDir() {
  if (!fs.existsSync(MCP_REGISTRY_DIR)) fs.mkdirSync(MCP_REGISTRY_DIR, { recursive: true });
  if (!fs.existsSync(MCP_INSTALL_DIR)) fs.mkdirSync(MCP_INSTALL_DIR, { recursive: true });
}

// ─── Curated MCP Server Catalog ──────────────────────────────────────────────
//
// Schema: {
//   id: string,
//   repo: string,           // GitHub "owner/repo"
//   name: string,
//   description: string,
//   tools: string[],        // Tool names exposed
//   language: string,       // Primary language
//   stars?: number,         // Cached star count
//   lastUpdated?: string,   // Cached last push
//   deprecated?: boolean,   // Manual deprecation flag
//   deprecationReason?: string
// }

const KNOWN_MCP_SERVERS = [
  {
    id: 'github-mcp',
    repo: 'modelcontextprotocol/servers',
    name: 'GitHub MCP Server',
    description: 'Official GitHub integration — search repos, issues, PRs, and more',
    tools: ['search_repositories', 'create_issue', 'get_pull_request', 'list_issues', 'get_file_contents'],
    language: 'TypeScript',
    category: 'development'
  },
  {
    id: 'filesystem-mcp',
    repo: 'modelcontextprotocol/servers',
    name: 'Filesystem MCP Server',
    description: 'Read, write, and manipulate files on your local filesystem',
    tools: ['read_file', 'write_file', 'list_directory', 'create_directory', 'delete_file'],
    language: 'TypeScript',
    category: 'utilities'
  },
  {
    id: 'sqlite-mcp',
    repo: 'modelcontextprotocol/servers',
    name: 'SQLite MCP Server',
    description: 'Query and manage SQLite databases',
    tools: ['query', 'create_table', 'insert', 'describe_table'],
    language: 'Python',
    category: 'database'
  },
  {
    id: 'puppeteer-mcp',
    repo: 'modelcontextprotocol/servers',
    name: 'Puppeteer MCP Server',
    description: 'Browser automation with Puppeteer — navigate, screenshot, extract content',
    tools: ['navigate', 'screenshot', 'get_content', 'click', 'fill', 'evaluate'],
    language: 'TypeScript',
    category: 'browser'
  },
  {
    id: 'fetch-mcp',
    repo: 'modelcontextprotocol/servers',
    name: 'Fetch MCP Server',
    description: 'Fetch and convert web content — HTML to markdown, PDF generation',
    tools: ['fetch', 'fetch_markdown', 'fetch_pdf', 'fetch_txt'],
    language: 'TypeScript',
    category: 'web'
  },
  {
    id: 'git-mcp',
    repo: 'cody-klose/mcp-git',
    name: 'Git MCP Server',
    description: 'Git operations — status, diff, log, blame, branch management',
    tools: ['git_status', 'git_diff', 'git_log', 'git_blame', 'git_branch'],
    language: 'TypeScript',
    category: 'development'
  },
  {
    id: 'docker-mcp',
    repo: 'ckreiling/mcp-server-docker',
    name: 'Docker MCP Server',
    description: 'Docker container management — list, start, stop, logs, exec',
    tools: ['list_containers', 'start_container', 'stop_container', 'container_logs', 'exec_command'],
    language: 'Python',
    category: 'devops'
  },
  {
    id: 'postgres-mcp',
    repo: 'alexander-zuev/supabase-mcp-server',
    name: 'Supabase MCP Server',
    description: 'Supabase/PostgreSQL database queries and management',
    tools: ['query', 'execute_sql', 'list_tables', 'describe_table'],
    language: 'TypeScript',
    category: 'database'
  },
  {
    id: 'sequential-thinking-mcp',
    repo: 'anthropics/languages',
    name: 'Sequential Thinking MCP',
    description: 'Structured reasoning for complex multi-step analysis tasks',
    tools: ['sequential_thinking'],
    language: 'TypeScript',
    category: 'reasoning'
  },
  {
    id: 'playwright-mcp',
    repo: 'anthropics/languages',
    name: 'Playwright MCP Server',
    description: 'E2E browser automation via Playwright',
    tools: ['navigate', 'screenshot', 'click', 'type', 'evaluate'],
    language: 'TypeScript',
    category: 'browser'
  }
];

// ─── Installed Server Tracking ────────────────────────────────────────────────

function getInstalledServers() {
  ensureMcpDir();
  const manifest = path.join(MCP_INSTALL_DIR, 'manifest.json');
  try {
    if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, 'utf8'));
  } catch (e) { /* start fresh */ }
  return {};
}

function saveInstalledServers(servers) {
  ensureMcpDir();
  const manifest = path.join(MCP_INSTALL_DIR, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify(servers, null, 2));
}

function isInstalled(serverId) {
  return !!getInstalledServers()[serverId];
}

function markInstalled(serverId, meta) {
  const servers = getInstalledServers();
  servers[serverId] = {
    ...meta,
    installedAt: new Date().toISOString(),
    status: 'active'
  };
  saveInstalledServers(servers);
}

function markUninstalled(serverId) {
  const servers = getInstalledServers();
  if (servers[serverId]) {
    servers[serverId].status = 'uninstalled';
    servers[serverId].uninstalledAt = new Date().toISOString();
    saveInstalledServers(servers);
    return true;
  }
  return false;
}

// ─── Deprecation Detection ────────────────────────────────────────────────────

function isDeprecated(serverEntry) {
  // Manual flag
  if (serverEntry.deprecated) return true;

  // Archived repo signal
  if (serverEntry.githubInfo?.archived) return true;

  // No commits in 180 days
  if (serverEntry.lastPushed) {
    const daysSincePush = (Date.now() - new Date(serverEntry.lastPushed).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePush > 180) return true;
  }

  // Archived status in installed manifest
  if (serverEntry.status === 'archived') return true;

  return false;
}

function getDeprecationReason(serverEntry) {
  if (serverEntry.deprecationReason) return serverEntry.deprecationReason;
  if (serverEntry.githubInfo?.archived) return 'Repository has been archived by owner';
  if (serverEntry.lastPushed) {
    const daysSincePush = (Date.now() - new Date(serverEntry.lastPushed).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePush > 180) return `No activity for ${Math.round(daysSincePush)} days (180-day threshold)`;
  }
  if (serverEntry.status === 'archived') return 'Marked as archived';
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function getCatalog() {
  return KNOWN_MCP_SERVERS.map(s => ({
    ...s,
    installed: isInstalled(s.id),
    deprecated: isDeprecated(s),
    deprecationReason: getDeprecationReason(s)
  }));
}

function getCatalogById(id) {
  const entry = KNOWN_MCP_SERVERS.find(s => s.id === id);
  if (!entry) return null;
  return {
    ...entry,
    installed: isInstalled(id),
    deprecated: isDeprecated(entry),
    deprecationReason: getDeprecationReason(entry)
  };
}

function getInstalledList() {
  const installed = getInstalledServers();
  return Object.entries(installed)
    .filter(([, meta]) => meta.status === 'active')
    .map(([id, meta]) => ({
      id,
      repo: meta.repo,
      name: meta.name,
      installedAt: meta.installedAt,
      deprecated: isDeprecated(meta),
      deprecationReason: getDeprecationReason(meta)
    }));
}

function getCategoryList() {
  const cats = new Set(KNOWN_MCP_SERVERS.map(s => s.category));
  return [...cats].sort();
}

function searchCatalog(query) {
  const q = query.toLowerCase();
  return getCatalog().filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.tools.some(t => t.toLowerCase().includes(q))
  );
}

module.exports = {
  getCatalog,
  getCatalogById,
  getInstalledList,
  getCategoryList,
  searchCatalog,
  isInstalled,
  markInstalled,
  markUninstalled,
  isDeprecated,
  getDeprecationReason,
  KNOWN_MCP_SERVERS,
  MCP_INSTALL_DIR,
  MCP_REGISTRY_DIR,
  MCP_REGISTRY_FILE
};
