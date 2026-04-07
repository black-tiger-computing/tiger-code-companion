#!/usr/bin/env node

/**
 * Tiger Code Pilot - Core Engine
 * Single source of truth for all AI calls.
 * All other modules use getCoreEngine() — no direct axios calls elsewhere.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const CONFIG_DIR = path.join(os.homedir(), '.tiger-code-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CHAT_HISTORY_FILE = path.join(CONFIG_DIR, 'chat-history.json');

const DEFAULT_CONFIG = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  endpointUrl: 'https://api.openai.com/v1/chat/completions',
  apiKeys: {},
  settings: { temperature: 0.7, maxTokens: 4096 }
};

const PROVIDER_ENDPOINTS = {
  openai:      'https://api.openai.com/v1/chat/completions',
  anthropic:   'https://api.anthropic.com/v1/messages',
  google:      'https://generativelanguage.googleapis.com/v1beta/models',
  huggingface: 'https://api-inference.huggingface.co/models/',
  ollama:      'http://localhost:11434/api/generate',
  lmstudio:    'http://localhost:1234/v1/chat/completions',
  groq:        'https://api.groq.com/openai/v1/chat/completions',
  openrouter:  'https://openrouter.ai/api/v1/chat/completions',
  local:       'http://localhost:8080/v1/chat/completions'
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
      // Merge with defaults so missing keys are always present
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
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
    }
  } catch (e) { /* corrupt history — start fresh */ }
  return [];
}

function saveHistory(history) {
  try {
    ensureConfigDir();
    // Cap at 200 messages total
    const capped = history.slice(-200);
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(capped, null, 2));
  } catch (e) { /* ignore write errors */ }
}

function addToHistory(role, content, sessionId = 'default') {
  const history = loadHistory();
  history.push({ role, content, sessionId, timestamp: new Date().toISOString() });
  saveHistory(history);
}

function getSessionHistory(sessionId = 'default', limit = 20) {
  return loadHistory()
    .filter(m => m.sessionId === sessionId)
    .slice(-limit);
}

/**
 * Condense a session's history — summarise it with AI and replace the
 * raw messages with a single summary entry so context stays small.
 */
async function condenseSession(sessionId = 'default') {
  const history = loadHistory();
  const session = history.filter(m => m.sessionId === sessionId);
  if (session.length < 4) return 'Nothing to condense yet.';

  const transcript = session.map(m => `${m.role}: ${m.content}`).join('\n');
  const summary = await _callAI([
    { role: 'user', content: `Summarise this conversation concisely, preserving all key decisions, code snippets, and context:\n\n${transcript}` }
  ], { temperature: 0.3 });

  // Replace session messages with one summary entry
  const other = history.filter(m => m.sessionId !== sessionId);
  other.push({ role: 'system', content: `[Condensed session summary]\n${summary}`, sessionId, timestamp: new Date().toISOString() });
  saveHistory(other);
  return summary;
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function withRetry(fn, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = e.response?.status;
      const retryable = status === 429 || status === 503 || status === 502;
      if (!retryable || i === retries - 1) throw e;
      const wait = delayMs * Math.pow(2, i);
      console.error(`⏳ Retrying in ${wait}ms (attempt ${i + 2}/${retries})...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ─── Core AI caller ───────────────────────────────────────────────────────────

async function _callAI(messages, options = {}) {
  const config = loadConfig();
  const provider = options.provider || config.provider;
  const apiKey = config.apiKeys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`];
  const endpointUrl = options.endpointUrl || config.endpointUrl || PROVIDER_ENDPOINTS[provider];
  const model = options.model || config.model;
  const temperature = options.temperature ?? config.settings?.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? config.settings?.maxTokens ?? 4096;

  if (!apiKey && provider !== 'ollama' && provider !== 'lmstudio' && provider !== 'local') {
    throw new Error(`No API key for "${provider}". Run: tiger-code-pilot config set ${provider} <key>`);
  }

  return await withRetry(async () => {
    // Anthropic format
    if (provider === 'anthropic') {
      const systemMsg = messages.find(m => m.role === 'system');
      const userMsgs = messages.filter(m => m.role !== 'system');
      const res = await axios.post('https://api.anthropic.com/v1/messages', {
        model, max_tokens: maxTokens, temperature,
        system: systemMsg?.content,
        messages: userMsgs
      }, {
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        timeout: 120000
      });
      return res.data.content?.[0]?.text || 'No response.';
    }

    // Google format
    if (provider === 'google') {
      const lastMsg = messages[messages.length - 1];
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: lastMsg.content }] }], generationConfig: { temperature, maxOutputTokens: maxTokens } },
        { timeout: 120000 }
      );
      return res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
    }

    // OpenAI-compatible (openai, groq, openrouter, ollama, lmstudio, local, huggingface)
    const res = await axios.post(endpointUrl, {
      model, messages, temperature, max_tokens: maxTokens
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      timeout: 120000
    });
    return res.data.choices?.[0]?.message?.content || 'No response.';
  });
}

// ─── Streaming ────────────────────────────────────────────────────────────────

async function _callAIStream(messages, onChunk, options = {}) {
  const config = loadConfig();
  const provider = options.provider || config.provider;
  const apiKey = config.apiKeys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`];
  const endpointUrl = options.endpointUrl || config.endpointUrl || PROVIDER_ENDPOINTS[provider];
  const model = options.model || config.model;

  // Providers that don't support streaming — fall back to full response
  if (provider === 'anthropic' || provider === 'google' || provider === 'huggingface') {
    const full = await _callAI(messages, options);
    onChunk(full);
    return;
  }

  try {
    const res = await axios.post(endpointUrl, {
      model, messages, temperature: options.temperature ?? 0.7, stream: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      responseType: 'stream',
      timeout: 120000
    });

    let buffer = '';
    res.data.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) onChunk(token);
        } catch (e) { /* skip malformed chunk */ }
      }
    });

    await new Promise((resolve, reject) => {
      res.data.on('end', resolve);
      res.data.on('error', reject);
    });
  } catch (e) {
    // Stream failed — fall back to full response
    const full = await _callAI(messages, options);
    onChunk(full);
  }
}

// ─── Provider Health ──────────────────────────────────────────────────────────

const _healthCache = {};

async function checkProviderHealth(provider) {
  const now = Date.now();
  if (_healthCache[provider] && now - _healthCache[provider].ts < 60000) {
    return _healthCache[provider].ok;
  }

  let ok = false;
  try {
    if (provider === 'ollama') {
      const res = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
      ok = res.status === 200;
    } else if (provider === 'lmstudio') {
      const res = await axios.get('http://localhost:1234/v1/models', { timeout: 3000 });
      ok = res.status === 200;
    } else {
      const config = loadConfig();
      const apiKey = config.apiKeys?.[provider] || process.env[`${provider.toUpperCase()}_API_KEY`];
      ok = !!apiKey;
    }
  } catch (e) { ok = false; }

  _healthCache[provider] = { ok, ts: now };
  return ok;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

class CoreEngine {
  constructor() {
    this.config = loadConfig();
  }

  // Reload config from disk (for auto-reload after user edits)
  reload() {
    this.config = loadConfig();
    return this;
  }

  async chat(message, sessionId = 'default') {
    this.config = loadConfig(); // always fresh
    const history = getSessionHistory(sessionId);
    const messages = [
      { role: 'system', content: 'You are Tiger Code Pilot, an expert AI coding assistant. Be helpful, provide complete code examples, and explain your reasoning.' },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];
    const response = await _callAI(messages);
    addToHistory('user', message, sessionId);
    addToHistory('assistant', response, sessionId);
    return response;
  }

  async chatStream(message, sessionId = 'default', onChunk) {
    this.config = loadConfig();
    const history = getSessionHistory(sessionId);
    const messages = [
      { role: 'system', content: 'You are Tiger Code Pilot, an expert AI coding assistant.' },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];
    let full = '';
    await _callAIStream(messages, chunk => { full += chunk; onChunk(chunk); });
    addToHistory('user', message, sessionId);
    addToHistory('assistant', full, sessionId);
  }

  async analyze(code, language, mode = 'general') {
    const prompts = {
      general:     `Analyze this ${language} code for quality, bugs, and improvements:`,
      security:    `Perform a security audit of this ${language} code:`,
      performance: `Analyze this ${language} code for performance issues:`,
      bugs:        `Find bugs and issues in this ${language} code:`
    };
    const prompt = `${prompts[mode] || prompts.general}\n\n\`\`\`${language}\n${code}\n\`\`\``;
    return await _callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  }

  async vibecode(action, params) {
    const prompts = {
      generate:  `Generate complete working ${params.language || ''} code with comments.\nDescription: ${params.description}`,
      explain:   `Explain this code in simple terms:\n${params.code}`,
      refactor:  `Refactor this code to be cleaner and more maintainable:\n${params.code}`,
      debug:     `Find and fix all bugs in this code:\n${params.code}`,
      test:      `Write comprehensive unit tests for this code:\n${params.code}`,
      optimize:  `Optimize this code for performance:\n${params.code}`,
      document:  `Add full documentation, JSDoc/docstrings, and inline comments:\n${params.code}`,
      convert:   `Convert this code to ${params.language}:\n${params.code}`
    };
    const prompt = prompts[action];
    if (!prompt) throw new Error(`Unknown vibecode action: ${action}`);
    return await _callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  }

  async condenseSession(sessionId = 'default') {
    return await condenseSession(sessionId);
  }

  async checkHealth(provider) {
    return await checkProviderHealth(provider || this.config.provider);
  }

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

  setModel(model) {
    this.config = loadConfig();
    this.config.model = model;
    saveConfig(this.config);
  }

  getConfig() {
    return loadConfig();
  }

  repairConfig() {
    repairConfig();
  }

  // Direct low-level call — used by local-agent and mcp-server
  async callAI(messages, options = {}) {
    return await _callAI(messages, options);
  }
}

let _instance = null;
function getCoreEngine() {
  if (!_instance) _instance = new CoreEngine();
  return _instance;
}

module.exports = { getCoreEngine, CoreEngine, PROVIDER_ENDPOINTS, loadConfig, saveConfig, repairConfig };
