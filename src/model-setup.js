#!/usr/bin/env node

/**
 * Tiger Code Pilot - Model Setup & Onboarding
 *
 * Guides users through AI model selection and API key setup.
 * Supports free tiers, multi-provider stack, and BYO-key (Bring Your Own Key).
 */

const readline = require('readline');
const { loadConfig, saveConfig } = require('./core-engine');
// PROVIDER_ENDPOINTS not directly used in this module
// providerRegistry not used - this module handles model selection independently

const COLORS = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color] || ''}${msg}${COLORS.reset}`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Model Catalog ────────────────────────────────────────────────────────────

const MODEL_CATALOG = [
  // Qwen Models
  {
    id: 'qwen3-coder-next', provider: 'qwen',
    name: 'Qwen3-Coder-Next', description: 'Best for coding - excellent code generation & understanding',
    quality: '⭐⭐⭐⭐⭐', speed: '⚡⚡⚡⚡', free: true, freeLimit: '2,000 req/day',
    recommended: true, category: 'code'
  },
  {
    id: 'qwen3-max', provider: 'qwen',
    name: 'Qwen3-Max', description: 'Most capable for complex reasoning & multi-step tasks',
    quality: '⭐⭐⭐⭐⭐', speed: '⚡⚡⚡', free: true, freeLimit: '2,000 req/day',
    recommended: false, category: 'general'
  },
  {
    id: 'qwen-plus', provider: 'qwen',
    name: 'Qwen-Plus', description: 'Balanced speed & quality, cost-effective',
    quality: '⭐⭐⭐⭐', speed: '⚡⚡⚡⚡', free: true, freeLimit: '2,000 req/day',
    recommended: false, category: 'general'
  },

  // Groq Models (Free Llama)
  {
    id: 'llama3-70b-8192', provider: 'groq',
    name: 'Llama 3 70B (Groq)', description: 'Excellent code, blazing fast on Groq infrastructure',
    quality: '⭐⭐⭐⭐⭐', speed: '⚡⚡⚡⚡⚡', free: true, freeLimit: 'Generous free tier',
    recommended: true, category: 'code'
  },
  {
    id: 'llama3-8b-8192', provider: 'groq',
    name: 'Llama 3 8B (Groq)', description: 'Fast & lightweight for quick tasks',
    quality: '⭐⭐⭐⭐', speed: '⚡⚡⚡⚡⚡', free: true, freeLimit: 'Generous free tier',
    recommended: false, category: 'general'
  },
  {
    id: 'mixtral-8x7b-32768', provider: 'groq',
    name: 'Mixtral 8x7B (Groq)', description: 'Mixture of Experts with 32K context window',
    quality: '⭐⭐⭐⭐', speed: '⚡⚡⚡⚡', free: true, freeLimit: 'Generous free tier',
    recommended: false, category: 'general'
  },

  // HuggingFace Models
  {
    id: 'Qwen/Qwen2.5-Coder-32B-Instruct', provider: 'huggingface',
    name: 'Qwen 2.5 Coder 32B', description: 'Code-specialized model from Alibaba',
    quality: '⭐⭐⭐⭐⭐', speed: '⚡⚡⚡', free: true, freeLimit: 'Rate limited',
    recommended: true, category: 'code'
  },
  {
    id: 'deepseek-ai/deepseek-coder-33b-instruct', provider: 'huggingface',
    name: 'DeepSeek Coder 33B', description: 'Specialized code generation model',
    quality: '⭐⭐⭐⭐⭐', speed: '⚡⚡⚡', free: true, freeLimit: 'Rate limited',
    recommended: false, category: 'code'
  },
  {
    id: 'meta-llama/Llama-3.1-70B-Instruct', provider: 'huggingface',
    name: 'Llama 3.1 70B', description: "Meta's latest large language model",
    quality: '⭐⭐⭐⭐⭐', speed: '⚡⚡⚡', free: true, freeLimit: 'Rate limited',
    recommended: false, category: 'general'
  }
];

// ─── Provider Setup Info ──────────────────────────────────────────────────────

const PROVIDER_SETUP = {
  qwen: {
    name: 'Qwen (Alibaba Cloud)',
    envVar: 'DASHSCOPE_API_KEY',
    signupUrl: 'https://bailian.console.alibabacloud.com/',
    instructions: `
1. Sign up at Alibaba Cloud Model Studio
2. Navigate to Settings > API Key
3. Create and copy your API key
4. Set environment variable: DASHSCOPE_API_KEY=your_key
Free tier: 2,000 requests per day`
  },
  groq: {
    name: 'Groq',
    envVar: 'GROQ_API_KEY',
    signupUrl: 'https://console.groq.com/',
    instructions: `
1. Sign up at Groq Console
2. Create API key from dashboard
3. Set environment variable: GROQ_API_KEY=your_key
Free tier: Generous RPM/RPD limits`
  },
  huggingface: {
    name: 'HuggingFace',
    envVar: 'HF_TOKEN',
    signupUrl: 'https://huggingface.co/settings/tokens',
    instructions: `
1. Sign up at HuggingFace
2. Go to Settings > Access Tokens
3. Create a new token (read access is enough)
4. Set environment variable: HF_TOKEN=your_token
Free tier: Rate limited but usable`
  }
};

// ─── Display Functions ────────────────────────────────────────────────────────

function displayModelList(filter = 'all') {
  let models = MODEL_CATALOG;
  if (filter === 'recommended') models = models.filter(m => m.recommended);
  if (filter === 'code') models = models.filter(m => m.category === 'code');
  if (filter === 'free') models = models.filter(m => m.free);

  log('\n📋 Available AI Models:', 'cyan');
  log('─'.repeat(80), 'bright');

  models.forEach((model, idx) => {
    const num = idx + 1;
    const rec = model.recommended ? ' 🌟 RECOMMENDED' : '';
    log(`${COLORS.bright}${num}. ${model.name}${rec}${COLORS.reset}`, 'white');
    log(`   ${model.description}`, 'dim');
    log(`   Quality: ${model.quality} | Speed: ${model.speed}`, 'dim');
    log(`   Free: ${model.free ? '✅ ' + model.freeLimit : '❌ Paid only'}`, model.free ? 'green' : 'red');
    log('');
  });

  log('─'.repeat(80), 'bright');
}

function displayProviderStack() {
  log('\n🏗️  Multi-Provider Stack:', 'cyan');
  log('─'.repeat(80), 'bright');

  log('\n🥇 PRIMARY: Qwen (Alibaba Cloud)', 'green');
  log('   • Best code quality with Qwen3-Coder-Next', 'dim');
  log('   • 2,000 free requests per day', 'dim');
  log('   • Sign up: https://bailian.console.alibabacloud.com/', 'dim');

  log('\n🥈 BACKUP 1: Groq (Free Llama/Mixtral)', 'yellow');
  log('   • Extremely fast inference on custom hardware', 'dim');
  log('   • Llama 3 70B, Mixtral 8x7B available free', 'dim');
  log('   • Sign up: https://console.groq.com/', 'dim');

  log('\n🥉 BACKUP 2: HuggingFace Inference API', 'yellow');
  log('   • Access to 100+ open-source models', 'dim');
  log('   • Qwen Coder, Llama, DeepSeek available', 'dim');
  log('   • Sign up: https://huggingface.co/', 'dim');

  log('\n🏠 LOCAL FALLBACK: Ollama / LM Studio', 'blue');
  log('   • Run models locally - completely free & private', 'dim');
  log('   • Requires downloading models (4-8GB each)', 'dim');

  log('\n💡 BYO-KEY: Bring Your Own Key', 'magenta');
  log('   • Users with existing OpenAI/Anthropic keys can add them', 'dim');
  log('   • Unlimited usage with your own API account', 'dim');

  log('\n─'.repeat(80), 'bright');
}

// ─── Interactive Setup ────────────────────────────────────────────────────────

async function selectModel() {
  displayModelList('recommended');

  log('\n🎯 Model Selection:', 'cyan');
  log('1. Quick setup (recommended models only)', 'white');
  log('2. Browse all available models', 'white');
  log('3. Use my own API key (OpenAI, Anthropic, etc)', 'white');
  log('4. Local models only (Ollama/LM Studio)', 'white');

  const choice = await ask('\nSelect option (1-4): ');

  switch (choice) {
    case '1':
      return await quickSetup();
    case '2':
      return await browseAllModels();
    case '3':
      return await customApiKey();
    case '4':
      return await localOnly();
    default:
      log('Invalid option, defaulting to quick setup...', 'yellow');
      return await quickSetup();
  }
}

async function quickSetup() {
  log('\n⚡ Quick Setup - Recommended Models', 'cyan');
  log('─'.repeat(60), 'bright');

  const recommended = MODEL_CATALOG.filter(m => m.recommended);
  recommended.forEach((m, i) => log(`${i + 1}. ${m.name} - ${m.description}`, 'white'));

  const choice = await ask('\nSelect model (number): ');
  const model = recommended[parseInt(choice) - 1] || recommended[0];

  log(`\n✅ Selected: ${model.name}`, 'green');
  log(`   Provider: ${model.provider}`, 'dim');
  log(`   Free limit: ${model.freeLimit}`, 'dim');

  const setup = PROVIDER_SETUP[model.provider];
  if (setup) {
    log(`\n📝 Setup ${setup.name}:`, 'cyan');
    log(setup.instructions, 'dim');
    log(`\n🔗 Sign up: ${setup.signupUrl}`, 'blue');

    const hasKey = await ask(`\nDo you have your ${setup.envVar} set up? (yes/no): `);
    if (hasKey.toLowerCase() === 'no') {
      log(`\n⚠️  Please set up your API key first:`, 'yellow');
      log(`   export ${setup.envVar}=your_api_key`, 'dim');
      log(`   Or add it to your shell profile (~/.bashrc, ~/.zshrc)`, 'dim');
      return null;
    }
  }

  return { provider: model.provider, model: model.id };
}

async function browseAllModels() {
  log('\n📚 All Available Models', 'cyan');
  log('─'.repeat(80), 'bright');

  // Group by provider
  const providers = {};
  MODEL_CATALOG.forEach(m => {
    if (!providers[m.provider]) providers[m.provider] = [];
    providers[m.provider].push(m);
  });

  Object.entries(providers).forEach(([provider, models]) => {
    log(`\n${provider.toUpperCase()} Provider:`, 'magenta');
    models.forEach((m, i) => {
      log(`${i + 1}. ${m.name} - ${m.description}`, 'white');
      log(`   Quality: ${m.quality} | Speed: ${m.speed} | Free: ${m.freeLimit}`, 'dim');
    });
  });

  const _choice = await ask('\nSelect model (number): ');
  // Simplified - in real implementation would map to specific model
  return await quickSetup(); // Fallback to quick setup for now
}

async function customApiKey() {
  log('\n🔑 Bring Your Own Key', 'cyan');
  log('─'.repeat(60), 'bright');

  log('Supported providers:', 'white');
  log('1. OpenAI (GPT-4, GPT-4o, etc)', 'dim');
  log('2. Anthropic (Claude 3, etc)', 'dim');
  log('3. OpenRouter (100+ models)', 'dim');

  const provider = await ask('\nSelect provider (1-3): ');
  const apiKey = await ask('Enter your API key: ');

  const providerMap = {
    '1': { name: 'openai', env: 'OPENAI_API_KEY' },
    '2': { name: 'anthropic', env: 'ANTHROPIC_API_KEY' },
    '3': { name: 'openrouter', env: 'OPENROUTER_API_KEY' }
  };

  const selected = providerMap[provider] || providerMap['1'];

  // Save to config
  const config = loadConfig();
  if (!config.apiKeys) config.apiKeys = {};
  config.apiKeys[selected.name] = apiKey;
  config.provider = selected.name;
  saveConfig(config);

  log(`\n✅ API key saved for ${selected.name}`, 'green');
  log(`   Set env var: export ${selected.env}=your_key`, 'dim');

  return { provider: selected.name, model: 'default' };
}

async function localOnly() {
  log('\n🏠 Local Models Only', 'cyan');
  log('─'.repeat(60), 'bright');

  log('Available local providers:', 'white');
  log('1. Ollama (http://localhost:11434)', 'dim');
  log('2. LM Studio (http://localhost:1234)', 'dim');
  log('3. Custom local server', 'dim');

  const choice = await ask('\nSelect local provider (1-3): ');

  const localMap = {
    '1': 'ollama',
    '2': 'lmstudio',
    '3': 'local'
  };

  const provider = localMap[choice] || 'ollama';

  // Check if local server is running
  const { checkProviderHealth } = require('./core-engine');
  const healthy = await checkProviderHealth(provider);

  if (!healthy) {
    log(`\n⚠️  ${provider} doesn't appear to be running`, 'yellow');
    log('   Start Ollama: ollama serve', 'dim');
    log('   Start LM Studio: Open LM Studio and start server', 'dim');
  }

  return { provider, model: 'default' };
}

// ─── Onboarding Flow ──────────────────────────────────────────────────────────

async function runOnboarding() {
  log('\n🐯 Welcome to Tiger Code Pilot!', 'cyan');
  log('AI-powered coding assistant with multiple model support', 'dim');
  log('─'.repeat(80), 'bright');

  // Step 1: Show multi-provider stack
  displayProviderStack();

  const continueSetup = await ask('\nContinue with model setup? (yes/no): ');
  if (continueSetup.toLowerCase() !== 'yes') {
    log('\n✅ You can run setup later with: tiger-code-pilot setup', 'yellow');
    return;
  }

  // Step 2: Model selection
  const selected = await selectModel();

  if (selected) {
    // Step 3: Save configuration
    const config = loadConfig();
    config.provider = selected.provider;
    config.model = selected.model;
    saveConfig(config);

    log('\n✅ Configuration saved!', 'green');
    log(`   Provider: ${selected.provider}`, 'dim');
    log(`   Model: ${selected.model}`, 'dim');

    // Step 4: Test connection
    log('\n🧪 Testing connection...', 'cyan');
    const { getCoreEngine } = require('./core-engine');
    const engine = getCoreEngine();

    try {
      const healthy = await engine.checkHealth(selected.provider);
      if (healthy) {
        log('✅ Connection successful!', 'green');
        log('🎉 You\'re ready to start coding!', 'cyan');
      } else {
        log('⚠️  Connection test failed', 'yellow');
        log('   Check your API key and try again', 'dim');
      }
    } catch (e) {
      log(`⚠️  Health check error: ${e.message}`, 'yellow');
    }
  }

  log('\n─'.repeat(80), 'bright');
  log('📖 Documentation: https://github.com/tiger-code-pilot/tiger-code-pilot', 'blue');
  log('💡 Run "tiger-code-pilot help" for all commands', 'blue');
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  runOnboarding,
  selectModel,
  displayModelList,
  displayProviderStack,
  MODEL_CATALOG,
  PROVIDER_SETUP
};
