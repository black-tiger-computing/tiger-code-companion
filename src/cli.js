#!/usr/bin/env node

/**
 * Tiger Code Pilot CLI
 *
 * Usage:
 *   tiger-code-pilot <command> [options]
 *
 * Commands:
 *   analyze <file>      Analyze code file with AI
 *   chat                Start interactive chat mode
 *   vibecode <action>   AI-powered coding (generate, explain, refactor, etc.)
 *   server              Start local HTTP server
 *   daemon              Start background daemon
 *   config              Configure API keys and providers
 *   test-connection     Test API connection
 *   version             Show version
 *   help                Show this help
 *
 * Examples:
 *   tiger-code-pilot analyze src/index.js
 *   tiger-code-pilot analyze src/index.js --mode security
 *   tiger-code-pilot chat
 *   tiger-code-pilot vibecode generate "a web server in python" --language python
 *   tiger-code-pilot server --port 3000
 *   tiger-code-pilot config set openai sk-xxx
 *   tiger-code-pilot test-connection
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const providerRegistry = require('./provider-registry');

const VERSION = '0.4.0';
const CONFIG_DIR = path.join(require('os').homedir(), '.tiger-code-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeys: {}
  };
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getApiKey(config, provider) {
  return config.apiKeys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`];
}

function analyzeFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    log(`❌ File not found: ${filePath}`, 'red');
    process.exit(1);
  }

  const config = loadConfig();
  const code = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).slice(1);

  const mode = options.mode || 'general';
  const analysisPrompts = {
    general: 'Analyze this code for quality, bugs, and improvements:',
    security: 'Perform a security audit of this code:',
    performance: 'Analyze this code for performance issues:',
    bugs: 'Find bugs and issues in this code:'
  };

  const prompt = `${analysisPrompts[mode] || analysisPrompts.general}

${ext.toUpperCase()} CODE (${fileName}):
\`\`\`${ext}
${code}
\`\`\``;

  log(`🐯 Tiger Code Pilot - Analyzing ${fileName}...`, 'cyan');
  log(`   Provider: ${config.provider}`, 'blue');
  log(`   Model: ${config.model}`, 'blue');
  log(`   Mode: ${mode}`, 'blue');
  log('');

  const apiKey = getApiKey(config, config.provider);
  if (!apiKey) {
    log(`❌ No API key configured for ${config.provider}`, 'red');
    log('   Run: tiger-code-pilot config set <provider> <api-key>', 'yellow');
    process.exit(1);
  }

  axios.post(config.endpointUrl, {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  })
  .then(response => {
    const result = response.data.choices?.[0]?.message?.content;
    if (result) {
      log('✅ Analysis Complete:', 'green');
      log('─'.repeat(60), 'bright');
      log(result);
      log('─'.repeat(60), 'bright');
    } else {
      log('❌ No response received', 'red');
      process.exit(1);
    }
  })
  .catch(error => {
    log('❌ Analysis failed:', 'red');
    if (error.response?.data?.error?.message) {
      log(`   ${error.response.data.error.message}`, 'red');
    } else {
      log(`   ${error.message}`, 'red');
    }
    process.exit(1);
  });
}

function showHelp() {
  log(`
🐯 Tiger Code Pilot v${VERSION}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: tiger-code-pilot <command> [options]

Commands:
  analyze <file>              Analyze code file with AI
    --mode <type>             Analysis type: general, security, performance, bugs
    --provider <name>         Override provider
    --model <name>            Override model

  chat                        Start interactive natural language chat mode
  vibecode <action> [desc]    AI-powered coding from descriptions
    Actions: generate, explain, refactor, debug, convert, document, test, optimize
    --language <lang>         Target language
    --file <path>             Read code from file

  server [--port 3000]        Start local HTTP server
    GET  /health              Health check
    POST /chat                Natural language chat
    POST /analyze             Code analysis

  daemon                      Start background daemon
  daemon stop                 Stop running daemon
  daemon status               Check daemon status

  concept                     Start concept-to-reality session
  build                       Same as concept
  create                      Same as concept

  config                      Show current configuration
  config set <provider> <key> Set API key for provider
  config provider <name>      Set default provider
  config model <name>         Set default model

  test-connection             Test API connection
  version                     Show version
  help                        Show this help

Examples:
  tiger-code-pilot analyze src/index.js
  tiger-code-pilot analyze src/app.py --mode security
  tiger-code-pilot chat
  tiger-code-pilot vibecode generate "REST API in Python" --language python
  tiger-code-pilot vibecode refactor --file src/app.js
  tiger-code-pilot server --port 3000
  tiger-code-pilot daemon
  tiger-code-pilot daemon status
  tiger-code-pilot daemon stop
  tiger-code-pilot concept
  tiger-code-pilot config set openai sk-xxx
  tiger-code-pilot test-connection

Config Location:
  ${CONFIG_FILE}

Environment Variables:
  OPENAI_API_KEY        OpenAI API key
  HUGGINGFACE_API_KEY   HuggingFace API key
  OLLAMA_API_KEY        Ollama API key
`, 'cyan');
}

function testConnection() {
  const config = loadConfig();
  const apiKey = getApiKey(config, config.provider);

  log(`🐯 Testing connection to ${config.provider}...`, 'cyan');
  log(`   Endpoint: ${config.endpointUrl}`, 'blue');
  log(`   Model: ${config.model}`, 'blue');
  log('');

  if (!apiKey) {
    log(`❌ No API key found for ${config.provider}`, 'red');
    process.exit(1);
  }

  axios.post(config.endpointUrl, {
    model: config.model,
    messages: [{ role: 'user', content: 'test' }],
    max_tokens: 5
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    timeout: 10000
  })
  .then(response => {
    if (response.status >= 200 && response.status < 300) {
      log('✅ Connection successful!', 'green');
    } else {
      log(`❌ Connection failed: HTTP ${response.status}`, 'red');
      process.exit(1);
    }
  })
  .catch(error => {
    log('❌ Connection failed:', 'red');
    if (error.response?.data?.error?.message) {
      log(`   ${error.response.data.error.message}`, 'red');
    } else {
      log(`   ${error.message}`, 'red');
    }
    process.exit(1);
  });
}

function showConfig() {
  const config = loadConfig();

  log('🐯 Tiger Code Pilot Configuration', 'cyan');
  log('─'.repeat(50), 'bright');
  log(`Default Provider: ${config.provider}`, 'blue');
  log(`Model: ${config.model}`, 'blue');
  log(`Endpoint: ${config.endpointUrl}`, 'blue');
  log('');

  if (config.apiKeys) {
    log('API Keys:', 'bright');
    Object.keys(config.apiKeys).forEach(provider => {
      const key = config.apiKeys[provider];
      const masked = key.length > 10
        ? key.substring(0, 4) + '••••••' + key.substring(key.length - 4)
        : '••••••';
      log(`  ${provider}: ${masked}`, key ? 'green' : 'red');
    });
  } else {
    log('No API keys configured', 'yellow');
  }
  log('');
  log(`Config file: ${CONFIG_FILE}`, 'blue');
}

// Interactive chat mode
function startInteractiveChat() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  log('🐯 Tiger Code Pilot - Interactive Chat', 'cyan');
  log('Type your questions or coding tasks. Type "exit" to quit.', 'blue');
  log('─'.repeat(60), 'bright');

  const chatHistory = [];

  const ask = () => {
    rl.question('\n❓ You: ', async (input) => {
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        log('Goodbye! 👋', 'cyan');
        rl.close();
        return;
      }

      if (!input.trim()) {
        ask();
        return;
      }

      log('\n⏳ Thinking...', 'yellow');

      try {
        const config = loadConfig();
        const apiKey = getApiKey(config, config.provider);
        if (!apiKey) {
          log(`❌ No API key for ${config.provider}`, 'red');
          ask();
          return;
        }

        const messages = [
          {
            role: 'system',
            content: 'You are Tiger Code Pilot, an expert AI coding assistant. Provide complete code examples and clear explanations.'
          },
          ...chatHistory.slice(-10),
          { role: 'user', content: input }
        ];

        const response = await axios.post(config.endpointUrl, {
          model: config.model,
          messages,
          temperature: 0.7,
          max_tokens: 4096
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 120000
        });

        const reply = response.data.choices?.[0]?.message?.content;
        if (reply) {
          chatHistory.push({ role: 'user', content: input });
          chatHistory.push({ role: 'assistant', content: reply });
          log('\n' + reply, 'green');
        }
      } catch (error) {
        log(`❌ Error: ${error.response?.data?.error?.message || error.message}`, 'red');
      }

      ask();
    });
  };

  ask();
}

// Vibecode function
function handleVibecode(args) {
  const action = args[1];
  if (!action) {
    log('❌ Usage: tiger-code-pilot vibecode <action> [options]', 'red');
    log('   Actions: generate, explain, refactor, debug, convert, document, test, optimize', 'yellow');
    process.exit(1);
  }

  const description = args[2];
  if (!description && action === 'generate') {
    log('❌ Please provide a description', 'red');
    log('   Example: tiger-code-pilot vibecode generate "a REST API in Python"', 'yellow');
    process.exit(1);
  }

  const options = {};
  for (let i = 3; i < args.length; i += 2) {
    if (args[i] === '--language') options.language = args[i + 1];
    if (args[i] === '--file') options.file = args[i + 1];
  }

  if (options.file && fs.existsSync(options.file)) {
    options.code = fs.readFileSync(options.file, 'utf8');
  }

  vibecode(action, { description: description || options.code, ...options });
}

function vibecode(action, options = {}) {
  const prompts = {
    generate: `Generate code based on this description. Provide complete, working code with comments.

Description: ${options.description}
Language: ${options.language || 'auto'}

Provide the complete code:`,

    explain: `Explain this code in simple terms:

${options.code || options.description}`,

    refactor: `Refactor this code to be cleaner and more maintainable:

${options.code || options.description}

Provide the refactored code with explanations:`,

    debug: `Find and fix bugs in this code:

${options.code || options.description}

Explain what was wrong and provide the fixed code:`,

    convert: `Convert this code to ${options.language || 'the target language'}:

${options.code || options.description}

Provide the complete converted code:`,

    document: `Add comprehensive documentation to this code:

${options.code || options.description}

Add docstrings, inline comments, and usage examples:`,

    test: `Write comprehensive unit tests for this code:

${options.code || options.description}

Provide complete test file with edge cases:`,

    optimize: `Optimize this code for performance:

${options.code || options.description}

Explain the optimizations made:`
  };

  const prompt = prompts[action];
  if (!prompt) {
    log(`❌ Unknown action: ${action}`, 'red');
    log('   Available: generate, explain, refactor, debug, convert, document, test, optimize', 'yellow');
    process.exit(1);
  }

  const config = loadConfig();
  const apiKey = getApiKey(config, config.provider);

  if (!apiKey) {
    log(`❌ No API key for ${config.provider}`, 'red');
    process.exit(1);
  }

  log(`🐯 Tiger Code Pilot - ${action.charAt(0).toUpperCase() + action.slice(1)}...`, 'cyan');
  log('─'.repeat(60), 'bright');

  axios.post(config.endpointUrl, {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 4096
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    timeout: 120000
  })
  .then(response => {
    const result = response.data.choices?.[0]?.message?.content;
    if (result) {
      log(result, 'green');
      log('─'.repeat(60), 'bright');
    }
  })
  .catch(error => {
    log(`❌ Error: ${error.response?.data?.error?.message || error.message}`, 'red');
    process.exit(1);
  });
}

// HTTP Server mode
function startServer(args) {
  const port = parseInt(args.find(a => a === '--port') || '3000');
  const config = loadConfig();

  log(`🐯 Tiger Code Pilot Server`, 'cyan');
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'bright');
  log(`Starting server on http://localhost:${port}`, 'blue');
  log(`Provider: ${config.provider}`, 'blue');
  log(`Model: ${config.model}`, 'blue');
  log('');

  const http = require('http');
  const bodyParser = (req) => {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(JSON.parse(body || '{}')));
    });
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', version: VERSION }));
      return;
    }

    // Chat endpoint
    if (req.method === 'POST' && req.url === '/chat') {
      const data = await bodyParser(req);
      log(`💬 Chat request: ${data.message?.substring(0, 50)}...`, 'blue');

      try {
        const apiKey = getApiKey(config, config.provider);
        const response = await axios.post(config.endpointUrl, {
          model: config.model,
          messages: [
            { role: 'system', content: 'You are Tiger Code Pilot, an expert AI coding assistant.' },
            { role: 'user', content: data.message }
          ],
          temperature: 0.7,
          max_tokens: 4096
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 120000
        });

        res.writeHead(200);
        res.end(JSON.stringify({
          response: response.data.choices?.[0]?.message?.content
        }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Analyze endpoint
    if (req.method === 'POST' && req.url === '/analyze') {
      const data = await bodyParser(req);
      log(`🔍 Analyze request: ${data.mode || 'general'}`, 'blue');

      try {
        const apiKey = getApiKey(config, config.provider);
        const modePrompts = {
          general: 'Analyze this code for quality and improvements:',
          security: 'Security audit of this code:',
          performance: 'Performance analysis of this code:',
          bugs: 'Find bugs in this code:'
        };

        const response = await axios.post(config.endpointUrl, {
          model: config.model,
          messages: [{
            role: 'user',
            content: `${modePrompts[data.mode || 'general']}\n\n\`\`\`${data.language || ''}\n${data.code}\n\`\`\``
          }],
          temperature: 0.3
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 120000
        });

        res.writeHead(200);
        res.end(JSON.stringify({ analysis: response.data.choices?.[0]?.message?.content }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found. Available: /health, /chat, /analyze' }));
  });

  server.listen(port, () => {
    log(`✅ Server running!`, 'green');
    log('');
    log(`Endpoints:`, 'bright');
    log(`  GET  http://localhost:${port}/health`, 'cyan');
    log(`  POST http://localhost:${port}/chat`, 'cyan');
    log(`  POST http://localhost:${port}/analyze`, 'cyan');
    log('');
    log(`Examples:`, 'bright');
    log(`  curl http://localhost:${port}/health`, 'yellow');
    log(`  curl -X POST http://localhost:${port}/chat -H 'Content-Type: application/json' -d '{"message":"write hello world in python"}'`, 'yellow');
    log('');
    log(`Press Ctrl+C to stop`, 'blue');
  });

  process.on('SIGINT', () => {
    log('\n\n👋 Server stopped', 'cyan');
    server.close();
    process.exit(0);
  });
}

// Background daemon mode
function startDaemon(args) {
  const port = parseInt(args.find(a => a === '--port') || '3000');
  const pidFile = path.join(CONFIG_DIR, 'daemon.pid');
  const logFile = path.join(CONFIG_DIR, 'daemon.log');

  // Check if already running
  if (fsSync.existsSync(pidFile)) {
    const pid = parseInt(fsSync.readFileSync(pidFile, 'utf8'));
    try {
      process.kill(pid, 0);
      log(`❌ Daemon already running (PID: ${pid})`, 'red');
      log(`   Stop with: tiger-code-pilot daemon stop`, 'yellow');
      process.exit(1);
    } catch (e) {
      // Process not running, clean up
      fsSync.unlinkSync(pidFile);
    }
  }

  if (args[1] === 'stop') {
    if (fsSync.existsSync(pidFile)) {
      const pid = parseInt(fsSync.readFileSync(pidFile, 'utf8'));
      try {
        process.kill(pid, 'SIGTERM');
        fsSync.unlinkSync(pidFile);
        log(`✅ Daemon stopped`, 'green');
      } catch (e) {
        log(`❌ Failed to stop daemon`, 'red');
        fsSync.unlinkSync(pidFile);
      }
    } else {
      log(`❌ Daemon not running`, 'yellow');
    }
    process.exit(0);
  }

  if (args[1] === 'status') {
    if (fsSync.existsSync(pidFile)) {
      const pid = parseInt(fsSync.readFileSync(pidFile, 'utf8'));
      try {
        process.kill(pid, 0);
        log(`✅ Daemon running (PID: ${pid})`, 'green');
        log(`   Server: http://localhost:${port}`, 'blue');
        log(`   Logs: ${logFile}`, 'blue');
      } catch (e) {
        log(`❌ Daemon process not running (stale PID file)`, 'red');
        fsSync.unlinkSync(pidFile);
      }
    } else {
      log(`❌ Daemon not running`, 'yellow');
    }
    process.exit(0);
  }

  // Start daemon
  log(`🐯 Starting Tiger Code Pilot Daemon...`, 'cyan');
  log(`   PID file: ${pidFile}`, 'blue');
  log(`   Log file: ${logFile}`, 'blue');
  log(`   Port: ${port}`, 'blue');

  const { spawn } = require('child_process');
  const daemon = spawn('node', [path.join(__dirname, 'cli.js'), 'server', '--port', port.toString()], {
    detached: true,
    stdio: 'ignore'
  });

  daemon.unref();
  fsSync.writeFileSync(pidFile, daemon.pid.toString());

  log(`✅ Daemon started (PID: ${daemon.pid})`, 'green');
  log(`   Server: http://localhost:${port}`, 'blue');
  log(`   Stop with: tiger-code-pilot daemon stop`, 'yellow');
}

// Concept to Reality session
function startConceptSession() {
  const { ConceptToRealitySession } = require('./concept-to-reality');
  const session = new ConceptToRealitySession();
  session.start().catch(error => {
    log(`❌ Session error: ${error.message}`, 'red');
    process.exit(1);
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'analyze':
    const file = args[1];
    if (!file) {
      log('❌ Please specify a file to analyze', 'red');
      log('   Usage: tiger-code-pilot analyze <file>', 'yellow');
      process.exit(1);
    }

    const options = {};
    for (let i = 2; i < args.length; i += 2) {
      if (args[i] === '--mode') options.mode = args[i + 1];
      if (args[i] === '--provider') options.provider = args[i + 1];
      if (args[i] === '--model') options.model = args[i + 1];
    }
    analyzeFile(file, options);
    break;

  case 'config':
    const subcommand = args[1];
    if (!subcommand) {
      showConfig();
      break;
    }

    if (subcommand === 'set') {
      const provider = args[2];
      const apiKey = args[3];
      if (!provider || !apiKey) {
        log('❌ Usage: tiger-code-pilot config set <provider> <api-key>', 'red');
        process.exit(1);
      }

      const config = loadConfig();
      if (!config.apiKeys) config.apiKeys = {};
      config.apiKeys[provider] = apiKey;
      saveConfig(config);

      log(`✅ API key saved for ${provider}`, 'green');
    } else if (subcommand === 'get') {
      const provider = args[2];
      if (!provider) {
        showConfig();
        break;
      }

      const config = loadConfig();
      const key = config.apiKeys?.[provider];
      if (key) {
        const masked = key.substring(0, 4) + '••••••' + key.substring(key.length - 4);
        log(`${provider}: ${masked}`, 'green');
      } else {
        log(`No API key configured for ${provider}`, 'yellow');
      }
    } else if (subcommand === 'provider') {
      const provider = args[2];
      if (!provider) {
        log('❌ Usage: tiger-code-pilot config provider <name>', 'red');
        process.exit(1);
      }

      const config = loadConfig();
      config.provider = provider;

      const endpoints = {
        openai: 'https://api.openai.com/v1/chat/completions',
        huggingface: 'https://api-inference.huggingface.co/models/',
        ollama: 'http://localhost:11434/api/generate',
        local: 'http://localhost:8080/v1/chat/completions'
      };

      if (endpoints[provider]) {
        config.endpointUrl = endpoints[provider];
      }

      saveConfig(config);
      log(`✅ Default provider set to ${provider}`, 'green');
    } else if (subcommand === 'model') {
      const model = args[2];
      if (!model) {
        log('❌ Usage: tiger-code-pilot config model <name>', 'red');
        process.exit(1);
      }

      const config = loadConfig();
      config.model = model;
      saveConfig(config);
      log(`✅ Default model set to ${model}`, 'green');
    }
    break;

  case 'test-connection':
    testConnection();
    break;

  case 'chat':
    startInteractiveChat();
    break;

  case 'vibecode':
    handleVibecode(args);
    break;

  case 'server':
    startServer(args);
    break;

  case 'daemon':
    startDaemon(args);
    break;

  case 'providers':
  case 'provider':
    if (args[1] === 'set' && args[2]) {
      const config = loadConfig();
      config.provider = args[2];
      const endpoints = {
        openai: 'https://api.openai.com/v1/chat/completions',
        anthropic: 'https://api.anthropic.com/v1/messages',
        google: 'https://generativelanguage.googleapis.com/v1beta/models',
        huggingface: 'https://api-inference.huggingface.co/models/',
        ollama: 'http://localhost:11434/api/generate',
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        lmstudio: 'http://localhost:1234/v1/chat/completions',
        local: 'http://localhost:8080/v1/chat/completions'
      };
      if (endpoints[args[2]]) config.endpointUrl = endpoints[args[2]];
      saveConfig(config);
      log(`✅ Active provider set to ${args[2]}`, 'green');
    } else if (args[1] === 'key' && args[2] && args[3]) {
      const config = loadConfig();
      if (!config.apiKeys) config.apiKeys = {};
      config.apiKeys[args[2]] = args[3];
      saveConfig(config);
      log(`✅ API key saved for ${args[2]}`, 'green');
    } else {
      // Delegate to provider registry
      providerRegistry.main();
    }
    break;

  case 'models':
  case 'model':
    providerRegistry.main();
    break;

  case 'detect':
    providerRegistry.main();
    break;

  case 'concept':
  case 'build':
  case 'create':
    startConceptSession();
    break;

  case 'version':
    log(`Tiger Code Pilot v${VERSION}`, 'cyan');
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    if (!command) {
      showHelp();
    } else {
      log(`❌ Unknown command: ${command}`, 'red');
      log('   Run: tiger-code-pilot help', 'yellow');
      process.exit(1);
    }
}
