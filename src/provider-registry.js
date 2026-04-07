#!/usr/bin/env node

/**
 * Tiger Code Pilot - Provider Registry & Model Installer
 *
 * All provider config reads/writes go through core-engine's loadConfig/saveConfig.
 * No separate providers.json — one config store for the entire backend.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { loadConfig, saveConfig, PROVIDER_ENDPOINTS } = require('./core-engine');

const CONFIG_DIR = path.join(require('os').homedir(), '.tiger-code-pilot');
const MODELS_DIR = path.join(CONFIG_DIR, 'models');

// ─── Provider definitions ─────────────────────────────────────────────────────

const PROVIDER_REGISTRY = {
  openai: {
    name: 'OpenAI', type: 'cloud',
    baseUrl: PROVIDER_ENDPOINTS.openai,
    apiKeyEnv: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'paid', speed: 'fast', quality: 'excellent'
  },
  anthropic: {
    name: 'Anthropic Claude', type: 'cloud',
    baseUrl: PROVIDER_ENDPOINTS.anthropic,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: ['claude-opus-4-20250414', 'claude-sonnet-4-20250514', 'claude-haiku-20241022'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'paid', speed: 'fast', quality: 'excellent'
  },
  google: {
    name: 'Google Gemini', type: 'cloud',
    baseUrl: PROVIDER_ENDPOINTS.google,
    apiKeyEnv: 'GOOGLE_API_KEY',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    features: ['chat', 'code', 'analyze', 'vision'],
    pricing: 'free-tier', speed: 'very-fast', quality: 'very-good'
  },
  huggingface: {
    name: 'HuggingFace', type: 'cloud',
    baseUrl: PROVIDER_ENDPOINTS.huggingface,
    apiKeyEnv: 'HUGGINGFACE_API_KEY',
    models: ['meta-llama/Llama-3.3-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct', 'Salesforce/codegen-350M-mono'],
    features: ['chat', 'code'],
    pricing: 'free-tier', speed: 'medium', quality: 'good'
  },
  ollama: {
    name: 'Ollama (Local)', type: 'local',
    baseUrl: PROVIDER_ENDPOINTS.ollama,
    listUrl: 'http://localhost:11434/api/tags',
    apiKeyEnv: null,
    models: [],
    features: ['chat', 'code', 'analyze'],
    pricing: 'free', speed: 'varies', quality: 'varies'
  },
  lmstudio: {
    name: 'LM Studio (Local)', type: 'local',
    baseUrl: PROVIDER_ENDPOINTS.lmstudio,
    listUrl: 'http://localhost:1234/v1/models',
    apiKeyEnv: null,
    models: [],
    features: ['chat', 'code', 'analyze'],
    pricing: 'free', speed: 'varies', quality: 'varies'
  },
  groq: {
    name: 'Groq', type: 'cloud',
    baseUrl: PROVIDER_ENDPOINTS.groq,
    apiKeyEnv: 'GROQ_API_KEY',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'free-tier', speed: 'ultra-fast', quality: 'very-good'
  },
  openrouter: {
    name: 'OpenRouter', type: 'cloud',
    baseUrl: PROVIDER_ENDPOINTS.openrouter,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'paid', speed: 'varies', quality: 'excellent'
  },
  local: {
    name: 'Custom Local Server', type: 'local',
    baseUrl: PROVIDER_ENDPOINTS.local,
    apiKeyEnv: null,
    models: [],
    features: ['chat', 'code', 'analyze'],
    pricing: 'free', speed: 'varies', quality: 'varies'
  }
};

// ─── Model catalog ────────────────────────────────────────────────────────────

const MODEL_CATALOG = [
  {
    id: 'deepseek-coder-6.7b', name: 'DeepSeek Coder 6.7B',
    description: 'Excellent code generation and understanding',
    size: '3.8 GB', quantization: 'Q4_K_M', category: 'code',
    quality: 'excellent', speed: 'fast', ram: '8 GB',
    url: 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf'
  },
  {
    id: 'starcoder2-7b', name: 'StarCoder2 7B',
    description: 'State-of-the-art code generation by BigCode',
    size: '4.4 GB', quantization: 'Q4_K_M', category: 'code',
    quality: 'very-good', speed: 'fast', ram: '8 GB',
    url: 'https://huggingface.co/TheBloke/starcoder2-7B-GGUF/resolve/main/starcoder2-7B.Q4_K_M.gguf'
  },
  {
    id: 'codeqwen-7b', name: 'CodeQwen 7B',
    description: "Qwen's code-specialized model",
    size: '4.4 GB', quantization: 'Q4_K_M', category: 'code',
    quality: 'very-good', speed: 'fast', ram: '8 GB',
    url: 'https://huggingface.co/Qwen/CodeQwen1.5-7B-Chat-GGUF/resolve/main/codeqwen1.5-7b-chat-q4_k_m.gguf'
  },
  {
    id: 'llama-3.2-3b', name: 'Llama 3.2 3B',
    description: 'Lightweight general purpose model',
    size: '2.0 GB', quantization: 'Q4_K_M', category: 'general',
    quality: 'good', speed: 'very-fast', ram: '4 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf'
  },
  {
    id: 'llama-3.2-8b', name: 'Llama 3.2 8B',
    description: 'Balanced general purpose model',
    size: '4.9 GB', quantization: 'Q4_K_M', category: 'general',
    quality: 'very-good', speed: 'fast', ram: '8 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-8B-Instruct-GGUF/resolve/main/Llama-3.2-8B-Instruct-Q4_K_M.gguf'
  },
  {
    id: 'phi-3-mini', name: 'Phi-3 Mini 3.8B',
    description: "Microsoft's efficient small model",
    size: '2.3 GB', quantization: 'Q4_K_M', category: 'general',
    quality: 'good', speed: 'very-fast', ram: '4 GB',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf'
  },
  {
    id: 'qwen-2.5-1.5b', name: 'Qwen 2.5 1.5B',
    description: 'Tiny model for fast responses on low-end hardware',
    size: '1.0 GB', quantization: 'Q4_K_M', category: 'tiny',
    quality: 'decent', speed: 'ultra-fast', ram: '2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
  }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureModelsDir() {
  if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// ─── Provider config — reads/writes via core-engine config.json ───────────────

function getActiveProvider() {
  return loadConfig().provider;
}

function setActiveProvider(name) {
  const config = loadConfig();
  config.provider = name;
  if (PROVIDER_ENDPOINTS[name]) config.endpointUrl = PROVIDER_ENDPOINTS[name];
  saveConfig(config);
}

function setProviderApiKey(provider, key) {
  const config = loadConfig();
  if (!config.apiKeys) config.apiKeys = {};
  config.apiKeys[provider] = key;
  saveConfig(config);
}

function getProviderApiKey(provider) {
  const config = loadConfig();
  return config.apiKeys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`] || null;
}

// ─── Local provider detection ─────────────────────────────────────────────────

function makeRequest(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function detectLocalProviders() {
  const detected = {};

  try {
    const raw = await makeRequest('http://localhost:11434/api/tags');
    const data = JSON.parse(raw);
    detected.ollama = { available: true, models: (data.models || []).map(m => m.name) };
  } catch (e) {
    detected.ollama = { available: false };
  }

  try {
    const raw = await makeRequest('http://localhost:1234/v1/models');
    const data = JSON.parse(raw);
    detected.lmstudio = { available: true, models: (data.data || []).map(m => m.id) };
  } catch (e) {
    detected.lmstudio = { available: false };
  }

  return detected;
}

// ─── Model download ───────────────────────────────────────────────────────────

async function downloadModel(modelId, progressCallback = null) {
  const model = MODEL_CATALOG.find(m => m.id === modelId);
  if (!model) throw new Error(`Model not found in catalog: ${modelId}`);

  ensureModelsDir();
  const filePath = path.join(MODELS_DIR, `${modelId}.gguf`);
  if (fs.existsSync(filePath)) return { installed: true, path: filePath, model };

  console.error(`\n📥 Downloading ${model.name}...`);
  console.error(`   Size: ${model.size} | RAM: ${model.ram} | Category: ${model.category}`);
  console.error(`\n${'─'.repeat(60)}`);

  return new Promise((resolve, reject) => {
    function fetchUrl(url, hops = 0) {
      if (hops > 5) { reject(new Error('Too many redirects')); return; }
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      client.get(url, (res) => {
        // Follow redirects using Location header
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const location = res.headers['location'];
          if (!location) { reject(new Error('Redirect missing Location header')); return; }
          res.resume(); // drain to free socket
          fetchUrl(location, hops + 1);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalSize = parseInt(res.headers['content-length'], 10);
        let downloaded = 0;
        const fileStream = fs.createWriteStream(filePath);

        res.on('data', chunk => {
          downloaded += chunk.length;
          fileStream.write(chunk);
          if (progressCallback && totalSize) {
            const pct = Math.round((downloaded / totalSize) * 100);
            progressCallback(pct, (downloaded / 1048576).toFixed(1), (totalSize / 1048576).toFixed(1));
          }
        });

        fileStream.on('finish', () => {
          fileStream.close();
          console.error(`\n${'─'.repeat(60)}`);
          console.error(`✅ Installed: ${filePath}`);
          resolve({ installed: true, path: filePath, model });
        });

        res.on('error', err => { fileStream.destroy(); try { fs.unlinkSync(filePath); } catch (e) {} reject(err); });
      }).on('error', err => { try { fs.unlinkSync(filePath); } catch (e) {} reject(err); });
    }

    fetchUrl(model.url);
  });
}

// ─── Installed model management ───────────────────────────────────────────────

function listInstalledModels() {
  ensureModelsDir();
  return fs.readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.gguf'))
    .map(f => {
      const id = f.replace('.gguf', '');
      const stats = fs.statSync(path.join(MODELS_DIR, f));
      const catalog = MODEL_CATALOG.find(m => m.id === id);
      return {
        id,
        name: catalog?.name || id,
        path: path.join(MODELS_DIR, f),
        size: (stats.size / 1073741824).toFixed(2) + ' GB',
        category: catalog?.category || 'unknown'
      };
    });
}

function removeModel(modelId) {
  const filePath = path.join(MODELS_DIR, `${modelId}.gguf`);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; }
  return false;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

async function listProviders() {
  const config = loadConfig();
  const detected = await detectLocalProviders();

  console.log('\n🐯 Available Providers:');
  console.log('━'.repeat(60));

  for (const [id, provider] of Object.entries(PROVIDER_REGISTRY)) {
    const isActive = config.provider === id;
    const apiKey = getProviderApiKey(id);
    const isDetected = detected[id]?.available;

    let dot = '⚪';
    if (isActive) dot = '🟢';
    else if (apiKey) dot = '🟡';
    else if (isDetected) dot = '🔵';

    console.log(`${dot} ${provider.name}${isActive ? ' (active)' : ''}`);
    console.log(`   Type: ${provider.type} | Pricing: ${provider.pricing} | Speed: ${provider.speed}`);
    console.log(`   Models: ${provider.models.slice(0, 3).join(', ')}${provider.models.length > 3 ? '...' : ''}`);

    if (provider.type === 'local') {
      console.log(isDetected
        ? `   ✅ Running${detected[id].models?.length ? ' — ' + detected[id].models.join(', ') : ''}`
        : `   ❌ Not detected`);
    } else {
      console.log(apiKey ? `   ✅ API key configured` : `   ❌ No API key — set ${provider.apiKeyEnv}`);
    }
    console.log('');
  }

  console.log(`Active: ${config.provider} | Model: ${config.model}`);
}

function showModelCatalog(category = null) {
  const list = category ? MODEL_CATALOG.filter(m => m.category === category) : MODEL_CATALOG;
  console.log('\n📚 Model Catalog');
  console.log('━'.repeat(60));
  for (const m of list) {
    const installed = fs.existsSync(path.join(MODELS_DIR, `${m.id}.gguf`));
    console.log(`${installed ? '✅' : '⬜'} ${m.name}`);
    console.log(`   ${m.description}`);
    console.log(`   Size: ${m.size} | RAM: ${m.ram} | Quality: ${m.quality} | ID: ${m.id}`);
    console.log('');
  }
  console.log('Install: tiger-code-pilot model install <id>');
  console.log('Categories: code, general, tiny');
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'providers':
      listProviders();
      break;

    case 'provider':
      if (args[1] === 'set' && args[2]) {
        setActiveProvider(args[2]);
        console.log(`✅ Active provider set to ${args[2]}`);
      } else if (args[1] === 'key' && args[2] && args[3]) {
        setProviderApiKey(args[2], args[3]);
        console.log(`✅ API key saved for ${args[2]}`);
      } else {
        listProviders();
      }
      break;

    case 'models':
    case 'catalog':
      showModelCatalog(args[1]);
      break;

    case 'model':
      if (args[1] === 'install' && args[2]) {
        downloadModel(args[2], (pct, dl, total) => {
          const bar = '█'.repeat(Math.floor(pct / 2)) + '░'.repeat(50 - Math.floor(pct / 2));
          process.stderr.write(`\r   [${bar}] ${pct}% (${dl}/${total} MB)`);
        })
        .then(r => console.log(`\n\n✅ Installed: ${r.model.name}`))
        .catch(e => { console.error(`\n❌ ${e.message}`); process.exit(1); });
      } else if (args[1] === 'list') {
        const installed = listInstalledModels();
        if (!installed.length) { console.log('No models installed.'); break; }
        console.log('\n📦 Installed Models:\n' + '━'.repeat(60));
        for (const m of installed) {
          console.log(`✅ ${m.name} — ${m.size} (${m.category})\n   ${m.path}\n`);
        }
      } else if (args[1] === 'remove' && args[2]) {
        console.log(removeModel(args[2]) ? `✅ Removed ${args[2]}` : `❌ Not found: ${args[2]}`);
      } else if (args[1] === 'catalog') {
        showModelCatalog(args[2]);
      }
      break;

    case 'detect':
      detectLocalProviders().then(detected => {
        console.log('\n🔍 Local Provider Detection:\n' + '━'.repeat(60));
        for (const [name, info] of Object.entries(detected)) {
          console.log(`${info.available ? '✅' : '❌'} ${name}`);
          if (info.available && info.models?.length) console.log(`   Models: ${info.models.join(', ')}`);
        }
      });
      break;

    default:
      console.log(`
🐯 Provider & Model Management

  providers                     List all providers with status
  provider set <name>           Set active provider
  provider key <name> <key>     Save API key
  detect                        Auto-detect local providers (Ollama, LM Studio)

  models [category]             Show model catalog
  model install <id>            Download and install a model
  model list                    List installed models
  model remove <id>             Remove an installed model

Categories: code, general, tiny
`);
  }
}

module.exports = {
  PROVIDER_REGISTRY, MODEL_CATALOG,
  getActiveProvider, setActiveProvider,
  setProviderApiKey, getProviderApiKey,
  detectLocalProviders,
  downloadModel, listInstalledModels, removeModel,
  CONFIG_DIR, MODELS_DIR, main
};

if (require.main === module) main();
