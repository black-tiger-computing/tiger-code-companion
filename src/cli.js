#!/usr/bin/env node

/**
 * Tiger Code Pilot CLI
 * All AI calls route through core-engine — no direct axios here.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { getCoreEngine, loadConfig, saveConfig, repairConfig, PROVIDER_ENDPOINTS } = require('./core-engine');
const providerRegistry = require('./provider-registry');

const VERSION = '0.4.0';
const CONFIG_DIR = path.join(require('os').homedir(), '.tiger-code-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, '.tiger-code-pilot', 'config.json');

const C = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${C[color] || ''}${msg}${C.reset}`);
}

// ─── Analyze ──────────────────────────────────────────────────────────────────

async function analyzeFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) { log(`❌ File not found: ${filePath}`, 'red'); process.exit(1); }

  const code = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).slice(1) || 'code';
  const mode = options.mode || 'general';

  log(`🐯 Analyzing ${path.basename(filePath)} [${mode}]...`, 'cyan');

  try {
    const result = await getCoreEngine().analyze(code, ext, mode);
    log('✅ Analysis Complete:', 'green');
    log('─'.repeat(60), 'bright');
    log(result);
    log('─'.repeat(60), 'bright');
  } catch (e) {
    log(`❌ ${e.message}`, 'red');
    process.exit(1);
  }
}

// ─── Interactive chat ─────────────────────────────────────────────────────────

function startInteractiveChat() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const engine = getCoreEngine();
  const sessionId = `cli-${Date.now()}`;

  log('🐯 Tiger Code Pilot — Interactive Chat', 'cyan');
  log('Type your questions. "condense" to compress history. "exit" to quit.', 'blue');
  log('─'.repeat(60), 'bright');

  const ask = () => {
    rl.question('\n❓ You: ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { ask(); return; }
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        log('Goodbye! 👋', 'cyan'); rl.close(); return;
      }
      if (trimmed.toLowerCase() === 'condense' || trimmed.toLowerCase() === 'chunk') {
        log('⏳ Condensing session...', 'yellow');
        const summary = await engine.condenseSession(sessionId);
        log('✅ Condensed:\n' + summary, 'green');
        ask(); return;
      }

      log('\n⏳ Thinking...', 'yellow');
      try {
        const reply = await engine.chat(trimmed, sessionId);
        log('\n' + reply, 'green');
      } catch (e) {
        log(`❌ ${e.message}`, 'red');
      }
      ask();
    });
  };
  ask();
}

// ─── Vibecode ─────────────────────────────────────────────────────────────────

async function handleVibecode(args) {
  const action = args[1];
  if (!action) {
    log('❌ Usage: tiger-code-pilot vibecode <action> [options]', 'red');
    log('   Actions: generate, explain, refactor, debug, convert, document, test, optimize', 'yellow');
    process.exit(1);
  }

  const options = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--language') options.language = args[++i];
    else if (args[i] === '--file') options.file = args[++i];
    else if (!options.description) options.description = args[i];
  }

  if (options.file && fs.existsSync(options.file)) {
    options.code = fs.readFileSync(options.file, 'utf8');
  }

  if (action === 'generate' && !options.description) {
    log('❌ Provide a description: tiger-code-pilot vibecode generate "a REST API"', 'red');
    process.exit(1);
  }

  log(`🐯 ${action.charAt(0).toUpperCase() + action.slice(1)}...`, 'cyan');
  log('─'.repeat(60), 'bright');

  try {
    const result = await getCoreEngine().vibecode(action, options);
    log(result, 'green');
    log('─'.repeat(60), 'bright');
  } catch (e) {
    log(`❌ ${e.message}`, 'red');
    process.exit(1);
  }
}

// ─── Test connection ──────────────────────────────────────────────────────────

async function testConnection() {
  const config = loadConfig();
  log(`🐯 Testing connection to ${config.provider}...`, 'cyan');
  log(`   Endpoint: ${config.endpointUrl}`, 'blue');
  log(`   Model: ${config.model}`, 'blue');

  try {
    const ok = await getCoreEngine().checkHealth(config.provider);
    if (ok) { log('✅ Connection successful!', 'green'); }
    else { log(`❌ Provider "${config.provider}" not reachable or no API key set.`, 'red'); process.exit(1); }
  } catch (e) {
    log(`❌ ${e.message}`, 'red'); process.exit(1);
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

function showConfig() {
  const config = loadConfig();
  log('🐯 Tiger Code Pilot Configuration', 'cyan');
  log('─'.repeat(50), 'bright');
  log(`Provider:  ${config.provider}`, 'blue');
  log(`Model:     ${config.model}`, 'blue');
  log(`Endpoint:  ${config.endpointUrl}`, 'blue');
  log('');
  if (config.apiKeys && Object.keys(config.apiKeys).length) {
    log('API Keys:', 'bright');
    for (const [provider, key] of Object.entries(config.apiKeys)) {
      const masked = key.length > 8 ? key.slice(0, 4) + '••••' + key.slice(-4) : '••••••••';
      log(`  ${provider}: ${masked}`, 'green');
    }
  } else {
    log('No API keys configured', 'yellow');
  }
  log(`\nConfig: ${CONFIG_FILE}`, 'blue');
}

// ─── Standalone Tiger Chat server (for tiger-chat standalone app) ─────────────

function startTigerChatServer(args) {
  const port = (() => {
    const idx = args.indexOf('--port');
    return idx !== -1 ? parseInt(args[idx + 1]) : 3000;
  })();

  const http = require('http');
  const engine = getCoreEngine();

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
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:' + port);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', version: VERSION, provider: loadConfig().provider }));
      return;
    }

    if (req.method === 'POST' && req.url === '/chat') {
      const { message, session_id } = await parseBody(req);
      if (!message) { res.writeHead(400); res.end(JSON.stringify({ error: 'message required' })); return; }
      try {
        const response = await engine.chat(message, session_id || 'tiger-chat');
        res.writeHead(200);
        res.end(JSON.stringify({ response }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/analyze') {
      const { code, language, mode } = await parseBody(req);
      if (!code) { res.writeHead(400); res.end(JSON.stringify({ error: 'code required' })); return; }
      try {
        const analysis = await engine.analyze(code, language || 'code', mode || 'general');
        res.writeHead(200);
        res.end(JSON.stringify({ analysis }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/vibecode') {
      const { action, ...params } = await parseBody(req);
      if (!action) { res.writeHead(400); res.end(JSON.stringify({ error: 'action required' })); return; }
      try {
        const result = await engine.vibecode(action, params);
        res.writeHead(200);
        res.end(JSON.stringify({ result }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/condense') {
      const { session_id } = await parseBody(req);
      try {
        const summary = await engine.condenseSession(session_id || 'tiger-chat');
        res.writeHead(200);
        res.end(JSON.stringify({ summary }));
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
    log(`🐯 Tiger Chat Server running on http://localhost:${port}`, 'cyan');
    log(`   Provider: ${loadConfig().provider}`, 'blue');
    log(`   Endpoints: /health  /chat  /analyze  /vibecode  /condense`, 'blue');
    log(`   Press Ctrl+C to stop`, 'yellow');
  });

  process.on('SIGINT', () => { log('\n👋 Server stopped', 'cyan'); server.close(); process.exit(0); });
}

// ─── Concept to Reality ───────────────────────────────────────────────────────

function startConceptSession() {
  const { ConceptToRealitySession } = require('./concept-to-reality');
  const session = new ConceptToRealitySession();
  session.start().catch(e => { log(`❌ Session error: ${e.message}`, 'red'); process.exit(1); });
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function showHelp() {
  log(`
🐯 Tiger Code Pilot v${VERSION}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: tiger-code-pilot <command> [options]

Commands:
  analyze <file>              Analyze code with AI
    --mode general|security|performance|bugs

  chat                        Interactive AI chat
  vibecode <action> [desc]    AI coding actions
    Actions: generate, explain, refactor, debug, convert, document, test, optimize
    --language <lang>   --file <path>

  concept / build / create    Start concept-to-reality build session

  server [--port 3000]        Start Tiger Chat standalone backend
  mcp install <id>            Install an MCP server from GitHub
  mcp list [category]         List catalog or installed servers
  mcp status                  Show deprecation status of installed servers
  mcp remove <id>             Uninstall an MCP server
  mcp search <query>          Search the MCP server catalog
  mcp discover                Auto-discover and install from GitHub

  config                      Show current config
  config set <provider> <key> Save API key
  config provider <name>      Set active provider
  config model <name>         Set active model
  config repair               Reset config to defaults

  providers                   List all providers with status
  detect                      Auto-detect local providers (Ollama, LM Studio)
  models [category]           Show downloadable model catalog
  model install <id>          Download and install a local model
  model list                  List installed models

  test-connection             Test current provider connection
  version                     Show version
  help                        Show this help

Providers: ollama, lmstudio, local (local-first, no API keys needed)
Config: ${CONFIG_FILE}
`, 'cyan');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

(async () => {
  switch (command) {
    case 'analyze': {
      const file = args[1];
      if (!file) { log('❌ Usage: tiger-code-pilot analyze <file>', 'red'); process.exit(1); }
      const opts = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--mode') opts.mode = args[++i];
      }
      await analyzeFile(file, opts);
      break;
    }

    case 'chat':
      startInteractiveChat();
      break;

    case 'vibecode':
      await handleVibecode(args);
      break;

    case 'server':
      startTigerChatServer(args);
      break;

    case 'concept': case 'build': case 'create':
      startConceptSession();
      break;

    case 'config': {
      const sub = args[1];
      if (!sub) { showConfig(); break; }
      if (sub === 'repair') { repairConfig(); break; }

      const config = loadConfig();
      if (sub === 'set' && args[2] && args[3]) {
        if (!config.apiKeys) config.apiKeys = {};
        config.apiKeys[args[2]] = args[3];
        saveConfig(config);
        log(`✅ API key saved for ${args[2]}`, 'green');
      } else if (sub === 'provider' && args[2]) {
        config.provider = args[2];
        if (PROVIDER_ENDPOINTS[args[2]]) config.endpointUrl = PROVIDER_ENDPOINTS[args[2]];
        saveConfig(config);
        log(`✅ Provider set to ${args[2]}`, 'green');
      } else if (sub === 'model' && args[2]) {
        config.model = args[2];
        saveConfig(config);
        log(`✅ Model set to ${args[2]}`, 'green');
      } else {
        showConfig();
      }
      break;
    }

    case 'test-connection':
      await testConnection();
      break;

    case 'providers': case 'provider':
      if (args[1] === 'set' && args[2]) {
        const config = loadConfig();
        config.provider = args[2];
        if (PROVIDER_ENDPOINTS[args[2]]) config.endpointUrl = PROVIDER_ENDPOINTS[args[2]];
        saveConfig(config);
        log(`✅ Provider set to ${args[2]}`, 'green');
      } else if (args[1] === 'key' && args[2] && args[3]) {
        const config = loadConfig();
        if (!config.apiKeys) config.apiKeys = {};
        config.apiKeys[args[2]] = args[3];
        saveConfig(config);
        log(`✅ API key saved for ${args[2]}`, 'green');
      } else {
        providerRegistry.main();
      }
      break;

    case 'models': case 'model': case 'detect':
      providerRegistry.main();
      break;

    case 'mcp': {
      const sub = args[1];
      const mcpLoader = require('./mcp-auto-loader');
      const mcpReg = require('./mcp-registry');

      if (sub === 'install' && args[2]) {
        log(`📥 Installing MCP server: ${args[2]}...`, 'cyan');
        try {
          const result = await mcpLoader.installFromGitHub(args[2]);
          if (result.status === 'installed') {
            log(`✅ ${result.name} installed — ${result.toolsRegistered} tool(s) registered`, 'green');
            if (result.deprecated) log(`⚠️  DEPRECATED: ${result.deprecationReason}`, 'yellow');
          } else {
            log(`ℹ️  Already installed: ${result.serverId}`, 'blue');
          }
        } catch (e) { log(`❌ ${e.message}`, 'red'); process.exit(1); }
      } else if (sub === 'remove' && args[2]) {
        const result = await mcpLoader.uninstallServer(args[2]);
        log(result.status === 'uninstalled' ? `✅ Removed ${args[2]}` : `❌ Not installed: ${args[2]}`,
          result.status === 'uninstalled' ? 'green' : 'yellow');
      } else if (sub === 'status') {
        const report = mcpLoader.getStatusReport();
        if (!report.length) { log('No MCP servers installed', 'blue'); break; }
        log('\n📦 Installed MCP Servers:', 'cyan');
        log('━'.repeat(60), 'bright');
        for (const s of report) {
          const dep = s.deprecated ? ' ⚠️ DEPRECATED' : '';
          const reason = s.deprecationReason ? ` (${s.deprecationReason})` : '';
          log(`  ${s.name}${dep}${reason}`, s.deprecated ? 'yellow' : 'green');
          log(`    Repo: ${s.repo} | Installed: ${new Date(s.installedAt).toLocaleDateString()}`, 'blue');
        }
      } else if (sub === 'list') {
        const category = args[2];
        const catalog = mcpReg.getCatalog();
        const filtered = category ? catalog.filter(s => s.category === category) : catalog;
        log('\n📚 MCP Server Catalog:', 'cyan');
        log('━'.repeat(60), 'bright');
        for (const s of filtered) {
          const installed = s.installed ? '✅' : '  ';
          const dep = s.deprecated ? ' ⚠️ DEPRECATED' : '';
          log(`  ${installed} ${s.name}${dep}`);
          log(`     ${s.description}`, 'blue');
          log(`     Tools: ${s.tools.slice(0, 4).join(', ')}${s.tools.length > 4 ? '...' : ''}`, 'dim');
          log('');
        }
      } else if (sub === 'search' && args[2]) {
        const results = mcpReg.searchCatalog(args[2]);
        if (!results.length) { log(`No servers matching "${args[2]}"`, 'yellow'); break; }
        log(`\n🔍 Search: "${args[2]}"`, 'cyan');
        for (const s of results) {
          log(`  ${s.installed ? '✅' : '  '} ${s.name} [${s.category}]`);
          log(`     ${s.description}`, 'blue');
        }
      } else if (sub === 'discover') {
        log('🔍 Discovering MCP servers on GitHub...', 'cyan');
        try {
          const results = await mcpLoader.autoDiscoverAndInstall();
          for (const r of results) {
            log(`  ${r.status === 'installed' ? '✅' : r.status === 'failed' ? '❌' : '⏭️'} ${r.id}: ${r.status}${r.deprecated ? ' (deprecated, skipped)' : ''}`,
              r.status === 'installed' ? 'green' : r.status === 'failed' ? 'red' : 'yellow');
          }
        } catch (e) { log(`❌ Discovery failed: ${e.message}`, 'red'); }
      } else {
        log('\n📦 MCP Server Management', 'cyan');
        log('  mcp install <id>    Install from GitHub');
        log('  mcp list [category] Browse catalog');
        log('  mcp status          Deprecation status');
        log('  mcp remove <id>     Uninstall');
        log('  mcp search <query>  Search catalog');
        log('  mcp discover        Auto-discover on GitHub');
      }
      break;
    }

    case 'version':
      log(`Tiger Code Pilot v${VERSION}`, 'cyan');
      break;

    case 'help': case '--help': case '-h':
      showHelp();
      break;

    default:
      if (!command) showHelp();
      else { log(`❌ Unknown command: ${command}. Run: tiger-code-pilot help`, 'red'); process.exit(1); }
  }
})();
