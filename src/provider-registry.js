#!/usr/bin/env node

/**
 * Tiger Code Pilot - Provider Registry & Model Installer
 *
 * Manages AI providers and local model installations.
 *
 * Features:
 * - Provider auto-detection (Ollama, LM Studio, etc.)
 * - Model catalog with recommendations
 * - Download and install models locally
 * - Model management (list, remove, switch)
 * - Provider comparison and health checks
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const CONFIG_DIR = path.join(require('os').homedir(), '.tiger-code-pilot');
const MODELS_DIR = path.join(CONFIG_DIR, 'models');
const PROVIDERS_FILE = path.join(CONFIG_DIR, 'providers.json');
const MODELS_CATALOG_FILE = path.join(CONFIG_DIR, 'models-catalog.json');

// Provider Registry
const PROVIDER_REGISTRY = {
  openai: {
    name: 'OpenAI',
    type: 'cloud',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'paid',
    speed: 'fast',
    quality: 'excellent'
  },
  anthropic: {
    name: 'Anthropic Claude',
    type: 'cloud',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250414', 'claude-haiku-20241022'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'paid',
    speed: 'fast',
    quality: 'excellent'
  },
  google: {
    name: 'Google Gemini',
    type: 'cloud',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    apiKeyEnv: 'GOOGLE_API_KEY',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    features: ['chat', 'code', 'analyze', 'vision'],
    pricing: 'free-tier',
    speed: 'very-fast',
    quality: 'very-good'
  },
  huggingface: {
    name: 'HuggingFace',
    type: 'cloud',
    baseUrl: 'https://api-inference.huggingface.co/models',
    apiKeyEnv: 'HUGGINGFACE_API_KEY',
    models: ['meta-llama/Llama-3.3-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct', 'Salesforce/codegen-350M-mono'],
    features: ['chat', 'code'],
    pricing: 'free-tier',
    speed: 'medium',
    quality: 'good'
  },
  ollama: {
    name: 'Ollama (Local)',
    type: 'local',
    baseUrl: 'http://localhost:11434/api/generate',
    chatUrl: 'http://localhost:11434/api/chat',
    listUrl: 'http://localhost:11434/api/tags',
    apiKeyEnv: null,
    models: [], // Fetched dynamically
    features: ['chat', 'code', 'analyze'],
    pricing: 'free',
    speed: 'varies',
    quality: 'varies'
  },
  lmstudio: {
    name: 'LM Studio (Local)',
    type: 'local',
    baseUrl: 'http://localhost:1234/v1/chat/completions',
    listUrl: 'http://localhost:1234/v1/models',
    apiKeyEnv: null,
    models: [], // Fetched dynamically
    features: ['chat', 'code', 'analyze'],
    pricing: 'free',
    speed: 'varies',
    quality: 'varies'
  },
  local: {
    name: 'Custom Local Server',
    type: 'local',
    baseUrl: 'http://localhost:8080/v1/chat/completions',
    apiKeyEnv: null,
    models: [],
    features: ['chat', 'code', 'analyze'],
    pricing: 'free',
    speed: 'varies',
    quality: 'varies'
  },
  openrouter: {
    name: 'OpenRouter',
    type: 'cloud',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'paid',
    speed: 'varies',
    quality: 'excellent'
  },
  groq: {
    name: 'Groq',
    type: 'cloud',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyEnv: 'GROQ_API_KEY',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    features: ['chat', 'code', 'analyze'],
    pricing: 'free-tier',
    speed: 'ultra-fast',
    quality: 'very-good'
  }
};

// Model Catalog for local installation
const MODEL_CATALOG = [
  // Code models
  {
    id: 'deepseek-coder-6.7b',
    name: 'DeepSeek Coder 6.7B',
    description: 'Excellent code generation and understanding',
    size: '3.8 GB',
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
    category: 'code',
    quality: 'excellent',
    speed: 'fast',
    ram: '8 GB'
  },
  {
    id: 'starcoder2-7b',
    name: 'StarCoder2 7B',
    description: 'State-of-the-art code generation by BigCode',
    size: '4.4 GB',
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/TheBloke/starcoder2-7B-GGUF/resolve/main/starcoder2-7B.Q4_K_M.gguf',
    category: 'code',
    quality: 'very-good',
    speed: 'fast',
    ram: '8 GB'
  },
  {
    id: 'codeqwen-7b',
    name: 'CodeQwen 7B',
    description: 'Qwen\'s code-specialized model',
    size: '4.4 GB',
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/Qwen/CodeQwen1.5-7B-Chat-GGUF/resolve/main/codeqwen1.5-7b-chat-q4_k_m.gguf',
    category: 'code',
    quality: 'very-good',
    speed: 'fast',
    ram: '8 GB'
  },
  // General models
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    description: 'Lightweight general purpose model',
    size: '2.0 GB',
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    category: 'general',
    quality: 'good',
    speed: 'very-fast',
    ram: '4 GB'
  },
  {
    id: 'llama-3.2-8b',
    name: 'Llama 3.2 8B',
    description: 'Balanced general purpose model',
    size: '4.9 GB',
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/bartowski/Llama-3.2-8B-Instruct-GGUF/resolve/main/Llama-3.2-8B-Instruct-Q4_K_M.gguf',
    category: 'general',
    quality: 'very-good',
    speed: 'fast',
    ram: '8 GB'
  },
  {
    id: 'phi-3-mini',
    name: 'Phi-3 Mini 3.8B',
    description: 'Microsoft\'s efficient small model',
    size: '2.3 GB',
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    category: 'general',
    quality: 'good',
    speed: 'very-fast',
    ram: '4 GB'
  },
  // Tiny models for quick testing
  {
    id: 'qwen-2.5-1.5b',
    name: 'Qwen 2.5 1.5B',
    description: 'Tiny model for fast responses on low-end hardware',
    size: '1.0 GB',
    quantization: 'Q4_K_M',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    category: 'tiny',
    quality: 'decent',
    speed: 'ultra-fast',
    ram: '2 GB'
  }
];

// Utility functions
function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
}

function loadProviders() {
  ensureDirs();
  if (fs.existsSync(PROVIDERS_FILE)) {
    return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));
  }
  return { active: 'openai', configured: {} };
}

function saveProviders(data) {
  ensureDirs();
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(data, null, 2));
}

// Auto-detect local providers
async function detectLocalProviders() {
  const detected = {};

  // Check Ollama
  try {
    const response = await makeRequest('http://localhost:11434/api/tags', { timeout: 2000 });
    if (response) {
      const data = JSON.parse(response);
      detected.ollama = {
        available: true,
        models: (data.models || []).map(m => m.name),
        version: data.version || 'unknown'
      };
    }
  } catch (e) {
    detected.ollama = { available: false };
  }

  // Check LM Studio
  try {
    const response = await makeRequest('http://localhost:1234/v1/models', { timeout: 2000 });
    if (response) {
      const data = JSON.parse(response);
      detected.lmstudio = {
        available: true,
        models: (data.data || []).map(m => m.id)
      };
    }
  } catch (e) {
    detected.lmstudio = { available: false };
  }

  return detected;
}

// Simple HTTP request without axios
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout: options.timeout || 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Download model
async function downloadModel(modelId, progressCallback = null) {
  const model = MODEL_CATALOG.find(m => m.id === modelId);
  if (!model) {
    throw new Error(`Model not found: ${modelId}`);
  }

  ensureDirs();
  const filePath = path.join(MODELS_DIR, `${modelId}.gguf`);

  if (fs.existsSync(filePath)) {
    return { installed: true, path: filePath, model };
  }

  console.error(`\n📥 Downloading ${model.name}...`);
  console.error(`   Size: ${model.size}`);
  console.error(`   Category: ${model.category}`);
  console.error(`   RAM Required: ${model.ram}`);
  console.error(`\n${'─'.repeat(60)}`);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(model.url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.get(model.url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        return downloadModel(modelId, progressCallback).then(resolve).catch(reject);
      }

      const totalSize = parseInt(res.headers['content-length'], 10);
      let downloaded = 0;
      const fileStream = fs.createWriteStream(filePath);

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        fileStream.write(chunk);

        if (progressCallback && totalSize) {
          const percent = Math.round((downloaded / totalSize) * 100);
          const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
          const totalMB = (totalSize / 1024 / 1024).toFixed(1);
          progressCallback(percent, downloadedMB, totalMB);
        }
      });

      fileStream.on('finish', () => {
        fileStream.close();
        console.error(`\n${'─'.repeat(60)}`);
        console.error(`✅ Download complete: ${filePath}`);
        resolve({ installed: true, path: filePath, model });
      });
    });

    req.on('error', (err) => {
      fs.unlinkSync(filePath);
      reject(err);
    });
  });
}

// List installed models
function listInstalledModels() {
  ensureDirs();
  const models = [];
  const files = fs.readdirSync(MODELS_DIR);

  for (const file of files) {
    if (file.endsWith('.gguf')) {
      const filePath = path.join(MODELS_DIR, file);
      const stats = fs.statSync(filePath);
      const modelId = file.replace('.gguf', '');
      const catalogModel = MODEL_CATALOG.find(m => m.id === modelId);

      models.push({
        id: modelId,
        name: catalogModel?.name || modelId,
        path: filePath,
        size: (stats.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        category: catalogModel?.category || 'unknown'
      });
    }
  }

  return models;
}

// Remove installed model
function removeModel(modelId) {
  const filePath = path.join(MODELS_DIR, `${modelId}.gguf`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// Provider commands
async function listProviders() {
  const config = loadProviders();
  const detected = await detectLocalProviders();

  console.log('\n🐯 Available Providers:');
  console.log('━'.repeat(60));

  for (const [id, provider] of Object.entries(PROVIDER_REGISTRY)) {
    const isConfigured = config.configured?.[id];
    const isDetected = detected[id]?.available;
    const isActive = config.active === id;
    const hasApiKey = process.env[provider.apiKeyEnv];

    let status = '⚪';
    if (isActive) status = '🟢';
    else if (isConfigured || hasApiKey) status = '🟡';
    else if (isDetected) status = '🔵';

    console.log(`${status} ${provider.name}`);
    console.log(`   Type: ${provider.type} | Pricing: ${provider.pricing}`);
    console.log(`   Speed: ${provider.speed} | Quality: ${provider.quality}`);
    console.log(`   Models: ${provider.models.slice(0, 3).join(', ')}${provider.models.length > 3 ? '...' : ''}`);

    if (provider.type === 'local') {
      if (isDetected) {
        console.log(`   ✅ Detected locally`);
        if (detected[id].models?.length) {
          console.log(`   Local models: ${detected[id].models.join(', ')}`);
        }
      } else {
        console.log(`   ❌ Not detected locally`);
      }
    } else if (provider.apiKeyEnv) {
      if (hasApiKey) {
        console.log(`   ✅ API key set via ${provider.apiKeyEnv}`);
      } else {
        console.log(`   ❌ No API key (set ${provider.apiKeyEnv})`);
      }
    }
    console.log('');
  }

  console.log(`Active Provider: ${config.active || 'openai'}`);
}

function showModelCatalog(category = null) {
  const filtered = category
    ? MODEL_CATALOG.filter(m => m.category === category)
    : MODEL_CATALOG;

  console.log('\n📚 Model Catalog for Local Installation');
  console.log('━'.repeat(60));

  for (const model of filtered) {
    const installed = fs.existsSync(path.join(MODELS_DIR, `${model.id}.gguf`));
    const icon = installed ? '✅' : '⬜';

    console.log(`${icon} ${model.name}`);
    console.log(`   ${model.description}`);
    console.log(`   Size: ${model.size} | RAM: ${model.ram} | Quality: ${model.quality}`);
    console.log(`   ID: ${model.id}`);
    console.log('');
  }

  console.log('\nTo install: tiger-code-pilot model install <id>');
  console.log('Categories: code, general, tiny');
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'providers':
      listProviders();
      break;

    case 'provider':
      if (args[1] === 'set' && args[2]) {
        const config = loadProviders();
        config.active = args[2];
        saveProviders(config);
        console.log(`✅ Active provider set to ${args[2]}`);
      } else if (args[1] === 'key' && args[2] && args[3]) {
        const config = loadProviders();
        if (!config.configured) config.configured = {};
        config.configured[args[2]] = { apiKey: args[3] };
        saveProviders(config);
        console.log(`✅ API key saved for ${args[2]}`);
      }
      break;

    case 'models':
      showModelCatalog(args[1]);
      break;

    case 'model':
      if (args[1] === 'install' && args[2]) {
        downloadModel(args[2], (percent, downloaded, total) => {
          const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
          process.stderr.write(`\r   [${bar}] ${percent}% (${downloaded}/${total} GB)`);
        })
        .then(result => {
          console.log(`\n\n✅ Model installed: ${result.model.name}`);
        })
        .catch(err => {
          console.error(`\n❌ Download failed: ${err.message}`);
          process.exit(1);
        });
      } else if (args[1] === 'list') {
        const installed = listInstalledModels();
        if (installed.length === 0) {
          console.log('No models installed. Use: tiger-code-pilot model catalog');
        } else {
          console.log('\n📦 Installed Models:');
          console.log('━'.repeat(60));
          for (const model of installed) {
            console.log(`✅ ${model.name}`);
            console.log(`   Category: ${model.category} | Size: ${model.size}`);
            console.log(`   Path: ${model.path}`);
            console.log('');
          }
        }
      } else if (args[1] === 'remove' && args[2]) {
        if (removeModel(args[2])) {
          console.log(`✅ Removed model: ${args[2]}`);
        } else {
          console.log(`❌ Model not found: ${args[2]}`);
        }
      } else if (args[1] === 'catalog') {
        showModelCatalog(args[2]);
      }
      break;

    case 'detect':
      detectLocalProviders().then(detected => {
        console.log('\n🔍 Local Provider Detection:');
        console.log('━'.repeat(60));
        for (const [name, info] of Object.entries(detected)) {
          console.log(`${info.available ? '✅' : '❌'} ${name}`);
          if (info.available && info.models?.length) {
            console.log(`   Models: ${info.models.join(', ')}`);
          }
        }
      });
      break;

    default:
      console.log(`
🐯 Provider & Model Management

Commands:
  providers                        List all providers with status
  provider set <name>              Set active provider
  provider key <name> <api-key>    Save API key for provider
  detect                           Auto-detect local providers

  models [category]                Show model catalog (optional: code, general, tiny)
  model catalog [category]         Same as models
  model install <id>               Download and install a model
  model list                       List installed models
  model remove <id>                Remove an installed model

Examples:
  tiger-code-pilot providers
  tiger-code-pilot provider set ollama
  tiger-code-pilot provider key openai sk-xxx
  tiger-code-pilot models code
  tiger-code-pilot model install llama-3.2-3b
  tiger-code-pilot model list
  tiger-code-pilot detect
`);
  }
}

// Export for use by other modules
module.exports = {
  PROVIDER_REGISTRY,
  MODEL_CATALOG,
  loadProviders,
  saveProviders,
  detectLocalProviders,
  downloadModel,
  listInstalledModels,
  removeModel,
  CONFIG_DIR,
  MODELS_DIR,
  main
};

// Run if called directly
if (require.main === module) {
  main();
}
