#!/usr/bin/env node

/**
 * Tiger Code Pilot - Core Engine
 * Local-first: all inference runs on your hardware via Ollama, LM Studio,
 * or any OpenAI-compatible local server.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
// axios reserved for future HTTP request functionality
// const axios = require('axios');

// Usage analytics
const usageAnalytics = require('./usage-analytics');

// Provider modules — cloud + local
const qwenProvider = require('./providers/qwen');
const groqProvider = require('./providers/groq');
const hfProvider = require('./providers/huggingface');
const ollamaProvider = require('./providers/ollama');
const lmstudioProvider = require('./providers/lmstudio');
const localProvider = require('./providers/local');

const PROVIDER_MODULES = {
  qwen: qwenProvider,
  groq: groqProvider,
  huggingface: hfProvider,
  ollama: ollamaProvider,
  lmstudio: lmstudioProvider,
  local: localProvider
};

const CONFIG_DIR = path.join(os.homedir(), '.tiger-code-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CHAT_HISTORY_FILE = path.join(CONFIG_DIR, 'chat-history.json');

const DEFAULT_CONFIG = {
  provider: 'ollama',
  model: 'llama3.2',
  endpointUrl: 'http://localhost:11434/api/chat',
  apiKeys: {},
  settings: { temperature: 0.7, maxTokens: 4096 }
};

const PROVIDER_ENDPOINTS = {
  qwen:       'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  groq:       'https://api.groq.com/openai/v1/chat/completions',
  huggingface: 'https://api-inference.huggingface.co/models/',
  ollama:     'http://localhost:11434/api/chat',
  lmstudio:   'http://localhost:1234/v1/chat/completions',
  local:      'http://localhost:8080/v1/chat/completions'
};

// ─── Config ──────────────────────────────────────────────────────────────────

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  ensureConfigDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed, settings: { ...DEFAULT_CONFIG.settings, ...(parsed.settings || {}) } };
    }
  } catch (e) {
    console.error(`⚠️  Config file corrupted, resetting to defaults. (${e.message})`);
    saveConfig(DEFAULT_CONFIG);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function repairConfig() {
  saveConfig(DEFAULT_CONFIG);
  console.log(`✅ Config reset to defaults: ${CONFIG_FILE}`);
}

// ─── Chat History ─────────────────────────────────────────────────────────────

function loadHistory() {
  try {
    if (fs.existsSync(CHAT_HISTORY_FILE)) return JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
  } catch (e) { /* corrupt — start fresh */ }
  return [];
}

function saveHistory(history) {
  try {
    ensureConfigDir();
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(history.slice(-200), null, 2));
  } catch (e) { /* ignore */ }
}

function addToHistory(role, content, sessionId = 'default') {
  const history = loadHistory();
  history.push({ role, content, sessionId, timestamp: new Date().toISOString() });
  saveHistory(history);
}

function getSessionHistory(sessionId = 'default', limit = 20) {
  return loadHistory().filter(m => m.sessionId === sessionId).slice(-limit);
}

async function condenseSession(sessionId = 'default') {
  const history = loadHistory();
  const session = history.filter(m => m.sessionId === sessionId);
  if (session.length < 4) return 'Nothing to condense yet.';
  const transcript = session.map(m => `${m.role}: ${m.content}`).join('\n');
  const summary = await _callAI([
    { role: 'user', content: `Summarise this conversation concisely, preserving all key decisions, code snippets, and context:\n\n${transcript}` }
  ], { temperature: 0.3 });
  const other = history.filter(m => m.sessionId !== sessionId);
  other.push({ role: 'system', content: `[Condensed session summary]\n${summary}`, sessionId, timestamp: new Date().toISOString() });
  saveHistory(other);
  return summary;
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function withRetry(fn, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      const status = e.response?.status;
      const retryable = status === 429 || status === 503 || status === 502;
      if (!retryable || i === retries - 1) throw e;
      const wait = delayMs * Math.pow(2, i);
      console.error(`⏳ Retrying in ${wait}ms (attempt ${i + 2}/${retries})...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ─── Core AI caller — delegates to local provider modules ─────────────────────

// Fallback chain: Qwen → Groq → HuggingFace → Ollama → LM Studio
const FALLBACK_CHAIN = ['qwen', 'groq', 'huggingface', 'ollama', 'lmstudio', 'local'];

async function _callAI(messages, options = {}) {
  const config = loadConfig();
  const primaryProvider = options.provider || config.provider;
  const _endpointUrl = options.endpointUrl || config.endpointUrl || PROVIDER_ENDPOINTS[primaryProvider];
  const model = options.model || config.model;
  const temperature = options.temperature ?? config.settings?.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? config.settings?.maxTokens ?? 4096;

  // Try primary provider first, then fallback
  const providersToTry = [primaryProvider, ...FALLBACK_CHAIN.filter(p => p !== primaryProvider)];
  let lastError = null;

  for (const provider of providersToTry) {
    const apiKey = config.apiKeys?.[provider] || null;
    const mod = PROVIDER_MODULES[provider];

    if (!mod) continue; // Skip unsupported providers

    try {
      // Cloud providers with API key support
      if (provider === 'qwen') {
        const startTime = Date.now();
        const result = await withRetry(() => mod.callQwen(messages, { model, temperature, maxTokens, apiKey, endpoint: PROVIDER_ENDPOINTS[provider] }));
        const responseTime = Date.now() - startTime;
        // Estimate tokens (rough: ~4 chars per token)
        const promptTokens = JSON.stringify(messages).length / 4;
        const completionTokens = result.length / 4;
        usageAnalytics.trackAPICall(provider, model, promptTokens, completionTokens, responseTime, true);
        return result;
      }
      if (provider === 'groq') {
        const startTime = Date.now();
        const result = await withRetry(() => mod.callGroq(messages, { model, temperature, maxTokens, apiKey, endpoint: PROVIDER_ENDPOINTS[provider] }));
        const responseTime = Date.now() - startTime;
        const promptTokens = JSON.stringify(messages).length / 4;
        const completionTokens = result.length / 4;
        usageAnalytics.trackAPICall(provider, model, promptTokens, completionTokens, responseTime, true);
        return result;
      }
      if (provider === 'huggingface') {
        const startTime = Date.now();
        const result = await withRetry(() => mod.callHuggingFace(messages, { model, temperature, maxTokens, apiKey }));
        const responseTime = Date.now() - startTime;
        const promptTokens = JSON.stringify(messages).length / 4;
        const completionTokens = result.length / 4;
        usageAnalytics.trackAPICall(provider, model, promptTokens, completionTokens, responseTime, true);
        return result;
      }

      // Local providers (free, no cost tracking)
      if (mod.callOllama) {
        const startTime = Date.now();
        const result = await withRetry(() => mod.callOllama(messages, { model, temperature, maxTokens }));
        const responseTime = Date.now() - startTime;
        const promptTokens = JSON.stringify(messages).length / 4;
        const completionTokens = result.length / 4;
        usageAnalytics.trackAPICall(provider, model, promptTokens, completionTokens, responseTime, true);
        return result;
      }
      if (mod.callLMStudio) {
        const startTime = Date.now();
        const result = await withRetry(() => mod.callLMStudio(messages, { model, temperature, maxTokens }));
        const responseTime = Date.now() - startTime;
        const promptTokens = JSON.stringify(messages).length / 4;
        const completionTokens = result.length / 4;
        usageAnalytics.trackAPICall(provider, model, promptTokens, completionTokens, responseTime, true);
        return result;
      }
      if (mod.callLocal) {
        const startTime = Date.now();
        const result = await withRetry(() => mod.callLocal(messages, { model, temperature, maxTokens, endpoint: PROVIDER_ENDPOINTS[provider] }));
        const responseTime = Date.now() - startTime;
        const promptTokens = JSON.stringify(messages).length / 4;
        const completionTokens = result.length / 4;
        usageAnalytics.trackAPICall(provider, model, promptTokens, completionTokens, responseTime, true);
        return result;
      }

    } catch (e) {
      lastError = e;
      console.warn(`Provider "${provider}" failed: ${e.message}. Trying next provider in fallback chain...`);
      // Continue to next provider in chain
    }
  }

  // All providers failed
  throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

// ─── Streaming ────────────────────────────────────────────────────────────────

async function _callAIStream(messages, onChunk, options = {}) {
  const config = loadConfig();
  const primaryProvider = options.provider || config.provider;
  const endpointUrl = options.endpointUrl || config.endpointUrl || PROVIDER_ENDPOINTS[primaryProvider];
  const model = options.model || config.model;
  const temperature = options.temperature ?? 0.7;
  const apiKey = config.apiKeys?.[primaryProvider] || null;

  // Try primary provider first
  let mod = PROVIDER_MODULES[primaryProvider];

  // If primary doesn't support streaming, try fallback providers that do
  if (mod) {
    if (primaryProvider === 'qwen' && mod.callQwenStream) {
      await mod.callQwenStream(messages, onChunk, { model, temperature, apiKey, endpoint: endpointUrl });
      return;
    }
    if (primaryProvider === 'groq' && mod.callGroqStream) {
      await mod.callGroqStream(messages, onChunk, { model, temperature, apiKey, endpoint: endpointUrl });
      return;
    }
    if (primaryProvider === 'huggingface' && mod.callHuggingFaceStream) {
      await mod.callHuggingFaceStream(messages, onChunk, { model, temperature, apiKey });
      return;
    }
    if (mod.callOllamaStream) { await mod.callOllamaStream(messages, onChunk, { model, temperature }); return; }
    if (mod.callLMStudioStream) { await mod.callLMStudioStream(messages, onChunk, { model, temperature }); return; }
    if (mod.callLocalStream) { await mod.callLocalStream(messages, onChunk, { model, temperature, endpoint: endpointUrl }); return; }
  }

  // Primary provider doesn't support streaming — try fallback chain
  for (const fallbackProvider of FALLBACK_CHAIN) {
    if (fallbackProvider === primaryProvider) continue;
    const fallbackMod = PROVIDER_MODULES[fallbackProvider];
    if (!fallbackMod) continue;

    const fallbackApiKey = config.apiKeys?.[fallbackProvider] || null;

    if (fallbackProvider === 'qwen' && fallbackMod.callQwenStream) {
      await fallbackMod.callQwenStream(messages, onChunk, { model, temperature, apiKey: fallbackApiKey, endpoint: PROVIDER_ENDPOINTS[fallbackProvider] });
      return;
    }
    if (fallbackProvider === 'groq' && fallbackMod.callGroqStream) {
      await fallbackMod.callGroqStream(messages, onChunk, { model, temperature, apiKey: fallbackApiKey, endpoint: PROVIDER_ENDPOINTS[fallbackProvider] });
      return;
    }
    if (fallbackMod.callOllamaStream) { await fallbackMod.callOllamaStream(messages, onChunk, { model, temperature }); return; }
    if (fallbackMod.callLMStudioStream) { await fallbackMod.callLMStudioStream(messages, onChunk, { model, temperature }); return; }
    if (fallbackMod.callLocalStream) { await fallbackMod.callLocalStream(messages, onChunk, { model, temperature, endpoint: PROVIDER_ENDPOINTS[fallbackProvider] }); return; }
  }

  // No streaming support anywhere — fall back to non-streaming call
  const fullResponse = await _callAI(messages, { provider: primaryProvider, model, temperature });
  onChunk(fullResponse);
}

// ─── Provider Health ──────────────────────────────────────────────────────────

const _healthCache = {};
async function checkProviderHealth(provider) {
  const now = Date.now();
  if (_healthCache[provider] && now - _healthCache[provider].ts < 60000) return _healthCache[provider].ok;
  let ok = false;
  try {
    const config = loadConfig();
    const apiKey = config.apiKeys?.[provider] || null;
    const mod = PROVIDER_MODULES[provider];
    if (mod && mod.checkHealth) {
      // Cloud providers need API key for health check
      if (['qwen', 'groq', 'huggingface'].includes(provider)) {
        ok = await mod.checkHealth(apiKey);
      } else {
        ok = await mod.checkHealth();
      }
    }
  } catch (e) { ok = false; }
  _healthCache[provider] = { ok, ts: now };
  return ok;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

class CoreEngine {
  constructor() { this.config = loadConfig(); }
  reload() { this.config = loadConfig(); return this; }

  async chat(message, sessionId = 'default') {
    this.config = loadConfig();
    const history = getSessionHistory(sessionId);

    // Resolve pinned model from session tracker
    let providerOverride = null;
    let modelOverride = null;
    try {
      const { resolveModel } = require('./session-tracker');
      const pinned = resolveModel(sessionId, {});
      if (pinned && pinned.provider !== 'default') {
        providerOverride = pinned.provider;
        modelOverride = pinned.model;
      }
    } catch (e) { /* session-tracker not available — use global config */ }

    const messages = [
      { role: 'system', content: 'You are Tiger Code Pilot, an expert AI coding assistant. Be helpful, provide complete code examples, and explain your reasoning.' },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];
    const response = await _callAI(messages, {
      provider: providerOverride || undefined,
      model: modelOverride || undefined
    });
    addToHistory('user', message, sessionId);
    addToHistory('assistant', response, sessionId);
    return response;
  }

  async chatStream(message, sessionId = 'default', onChunk) {
    this.config = loadConfig();
    const history = getSessionHistory(sessionId);

    // Resolve pinned model from session tracker
    let providerOverride = null;
    let modelOverride = null;
    try {
      const { resolveModel } = require('./session-tracker');
      const pinned = resolveModel(sessionId, {});
      if (pinned && pinned.provider !== 'default') {
        providerOverride = pinned.provider;
        modelOverride = pinned.model;
      }
    } catch (e) { /* session-tracker not available — use global config */ }

    const messages = [
      { role: 'system', content: 'You are Tiger Code Pilot, an expert AI coding assistant.' },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];
    let full = '';
    await _callAIStream(messages, chunk => { full += chunk; onChunk(chunk); }, {
      provider: providerOverride || undefined,
      model: modelOverride || undefined
    });
    addToHistory('user', message, sessionId);
    addToHistory('assistant', full, sessionId);
  }

  async analyze(code, language, mode = 'general') {
    const prompts = {
      general: `Analyze this ${language} code for quality, bugs, and improvements:`,
      security: `Perform a security audit of this ${language} code:`,
      performance: `Analyze this ${language} code for performance issues:`,
      bugs: `Find bugs and issues in this ${language} code:`
    };
    const prompt = `${prompts[mode] || prompts.general}\n\n\`\`\`${language}\n${code}\n\`\`\``;
    return await _callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  }

  async vibecode(action, params) {
    const prompts = {
      generate: `Generate complete working ${params.language || ''} code with comments.\nDescription: ${params.description}`,
      explain: `Explain this code in simple terms:\n${params.code}`,
      refactor: `Refactor this code to be cleaner and more maintainable:\n${params.code}`,
      debug: `Find and fix all bugs in this code:\n${params.code}`,
      test: `Write comprehensive unit tests for this code:\n${params.code}`,
      optimize: `Optimize this code for performance:\n${params.code}`,
      document: `Add full documentation, JSDoc/docstrings, and inline comments:\n${params.code}`,
      convert: `Convert this code to ${params.language}:\n${params.code}`
    };
    const prompt = prompts[action];
    if (!prompt) throw new Error(`Unknown vibecode action: ${action}`);
    return await _callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  }

  async condenseSession(sessionId = 'default') { return await condenseSession(sessionId); }
  async checkHealth(provider) { return await checkProviderHealth(provider || this.config.provider); }

  switchProvider(name) {
    this.config = loadConfig();
    this.config.provider = name;
    if (PROVIDER_ENDPOINTS[name]) this.config.endpointUrl = PROVIDER_ENDPOINTS[name];
    saveConfig(this.config);
  }

  setApiKey(provider, key) {
    this.config = loadConfig();
    if (!this.config.apiKeys) this.config.apiKeys = {};
    this.config.apiKeys[provider] = key;
    saveConfig(this.config);
  }

  setModel(model) { this.config = loadConfig(); this.config.model = model; saveConfig(this.config); }
  getConfig() { return loadConfig(); }
  repairConfig() { repairConfig(); }
  async callAI(messages, options = {}) { return await _callAI(messages, options); }
}

let _instance = null;
function getCoreEngine() { if (!_instance) _instance = new CoreEngine(); return _instance; }

module.exports = { getCoreEngine, CoreEngine, PROVIDER_ENDPOINTS, loadConfig, saveConfig, repairConfig, checkProviderHealth };
