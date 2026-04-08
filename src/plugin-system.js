'use strict';

/**
 * Tiger Code Pilot - Plugin System
 * Extensible tool integration. Plugins register tools with name, description,
 * parameters (JSON Schema), and handler function.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGINS_DIR = path.join(os.homedir(), '.tiger-code-pilot', 'plugins');

// ─── Built-in Plugins ─────────────────────────────────────────────────────────

const fileSystemPlugin = {
  name: 'file-system', version: '1.0.0',
  description: 'Read and write files, list directories',
  tools: [
    {
      name: 'read_file', description: 'Read the contents of a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      handler: async (args) => {
        try { return fs.readFileSync(args.path, 'utf8'); }
        catch (e) { return `Error: ${e.message}`; }
      }
    },
    {
      name: 'write_file', description: 'Write content to a file',
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      handler: async (args) => {
        try {
          const dir = path.dirname(args.path);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(args.path, args.content, 'utf8');
          return `File written: ${args.path}`;
        } catch (e) { return `Error: ${e.message}`; }
      }
    },
    {
      name: 'list_directory', description: 'List files in a directory',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      handler: async (args) => {
        try {
          const entries = fs.readdirSync(args.path, { withFileTypes: true });
          return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
        } catch (e) { return `Error: ${e.message}`; }
      }
    }
  ]
};

const shellPlugin = {
  name: 'shell', version: '1.0.0',
  description: 'Execute safe terminal commands',
  tools: [
    {
      name: 'run_command', description: 'Run a safe terminal command',
      parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] },
      handler: async (args) => {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const ALLOWED = new Set(['ls','dir','cat','type','echo','pwd','npm','npx','node','git','pip','python','python3','grep','find','head','tail','wc','sort','jest','mocha','vitest','tsc','eslint']);
        const DANGEROUS = [/rm\s+-rf/i, /del\s+\/[sf]/i, /sudo/i, /chmod\s+777/i];
        const base = args.command.split(/\s+/)[0].toLowerCase();
        if (!ALLOWED.has(base)) return `Command not allowed: "${base}"`;
        for (const p of DANGEROUS) { if (p.test(args.command)) return 'Command blocked: dangerous pattern'; }
        try {
          const { stdout, stderr } = await execAsync(args.command, { cwd: args.cwd || process.cwd(), timeout: 60000 });
          return stderr ? `stdout:\n${stdout}\nstderr:\n${stderr}` : stdout;
        } catch (e) { return `Command failed: ${e.message}`; }
      }
    }
  ]
};

const gitPlugin = {
  name: 'git', version: '1.0.0',
  description: 'Git operations',
  tools: [
    {
      name: 'git_status', description: 'Show git status',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } } },
      handler: async (args) => {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        try {
          const { stdout } = await promisify(exec)('git status --short', { cwd: args.cwd || process.cwd() });
          return stdout || 'Working tree clean';
        } catch (e) { return `Not a git repo: ${e.message}`; }
      }
    }
  ]
};

// ─── Plugin Registry ──────────────────────────────────────────────────────────

class PluginSystem {
  constructor() {
    this.plugins = new Map();
    this.tools = new Map();
    this.registerPlugin(fileSystemPlugin);
    this.registerPlugin(shellPlugin);
    this.registerPlugin(gitPlugin);
  }

  registerPlugin(plugin) {
    if (this.plugins.has(plugin.name)) throw new Error(`Plugin already registered: ${plugin.name}`);
    this.plugins.set(plugin.name, plugin);
    for (const tool of plugin.tools) {
      if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
      this.tools.set(tool.name, { ...tool, plugin: plugin.name });
    }
  }

  getTool(name) { return this.tools.get(name) || null; }
  getToolsList() { return Array.from(this.tools.values()).map(t => ({ name: t.name, description: t.description, parameters: t.parameters })); }

  async executeTool(name, args, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return await tool.handler(args, context);
  }

  loadExternalPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) return;
    for (const entry of fs.readdirSync(PLUGINS_DIR)) {
      if (!entry.endsWith('.js')) continue;
      try {
        const plugin = require(path.join(PLUGINS_DIR, entry));
        if (plugin.name && plugin.tools) this.registerPlugin(plugin);
      } catch (e) { console.error(`⚠️  Failed to load plugin ${entry}: ${e.message}`); }
    }
  }
}

let _instance = null;
function getPluginSystem() {
  if (!_instance) { _instance = new PluginSystem(); _instance.loadExternalPlugins(); }
  return _instance;
}

module.exports = { PluginSystem, getPluginSystem, fileSystemPlugin, shellPlugin, gitPlugin, PLUGINS_DIR };
