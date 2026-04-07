#!/usr/bin/env node

/**
 * Tiger Code Pilot - Core Engine
 * 
 * Central AI routing and provider management.
 * All components communicate through this engine.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG_DIR = path.join(require('os').homedir(), '.tiger-code-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CHAT_HISTORY_FILE = path.join(CONFIG_DIR, 'chat-history.json');

class CoreEngine {
  constructor() {
    this.config = this.loadConfig();
    this.chatHistory = this.loadChatHistory();
    this.providerHealth = {};
  }

  loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    return {
      provider: 'openai',
      model: 'gpt-4o-mini',
      endpointUrl: 'https://api.openai.com/v1/chat/completions',
      apiKeys: {},
      settings: {
        temperature: 0.7,
        maxTokens: 4096
      }
    };
  }

  saveConfig() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  loadChatHistory() {
    try {
      if (fs.existsSync(CHAT_HISTORY_FILE)) {
        return JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
      }
    } catch (e) {}
    return [];
  }

  saveChatHistory() {
    try {
      if (this.chatHistory.length > 200) {
        this.chatHistory = this.chatHistory.slice(-100);
      }
      fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(this.chatHistory, null, 2));
    } catch (e) {}
  }

  getApiKey() {
    const provider = this.config.provider;
    return this.config.apiKeys?.[provider] || 
           process.env[`${provider.toUpperCase()}_API_KEY`];
  }

  async callAI(messages, options = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(`No API key for ${this.config.provider}. Run: tiger-code-pilot provider key ${this.config.provider} <key>`);
    }

    const requestConfig = {
      model: options.model || this.config.model,
      messages: messages,
      temperature: options.temperature ?? this.config.settings?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this.config.settings?.maxTokens ?? 4096
    };

    // Handle different provider formats
    if (this.config.provider === 'anthropic') {
      return await this.callAnthropic(messages, options);
    } else if (this.config.provider === 'google') {
      return await this.callGoogle(messages, options);
    }

    // OpenAI-compatible format
    try {
      const response = await axios.post(
        this.config.endpointUrl,
        requestConfig,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: options.timeout ?? 120000
        }
      );

      return response.data.choices?.[0]?.message?.content || 'No response received.';
    } catch (error) {
      if (error.response?.data?.error?.message) {
        throw new Error(`${this.config.provider} error: ${error.response.data.error.message}`);
      }
      throw error;
    }
  }

  async callAnthropic(messages, options) {
    // Anthropic has different API format
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');
    const lastUserMsg = userMsgs[userMsgs.length - 1];

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.config.model,
          system: systemMsg?.content,
          messages: userMsgs,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.7
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.getApiKey(),
            'anthropic-version': '2023-06-01'
          },
          timeout: 120000
        }
      );

      return response.data.content?.[0]?.text || 'No response received.';
    } catch (error) {
      throw new Error(`Anthropic error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async callGoogle(messages, options) {
    try {
      const lastMsg = messages[messages.length - 1];
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.getApiKey()}`,
        {
          contents: [{
            parts: [{ text: lastMsg.content }]
          }],
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 4096
          }
        },
        { timeout: 120000 }
      );

      return response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
    } catch (error) {
      throw new Error(`Google error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async chat(userMessage, sessionId = 'default') {
    const sessionHistory = this.chatHistory.filter(m => m.sessionId === sessionId).slice(-20);
    
    const messages = [
      {
        role: 'system',
        content: `You are Tiger Code Pilot, an expert AI coding assistant. You help with:
- Writing code in any language
- Explaining complex code concepts simply
- Debugging and fixing issues
- Refactoring and optimizing code
- Architecture and design advice
- Writing tests and documentation

Be helpful, provide complete code examples, and explain your reasoning.`
      },
      ...sessionHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ];

    const response = await this.callAI(messages, { temperature: 0.7 });
    
    this.chatHistory.push({
      role: 'user',
      content: userMessage,
      sessionId,
      timestamp: new Date().toISOString()
    });
    this.chatHistory.push({
      role: 'assistant',
      content: response,
      sessionId,
      timestamp: new Date().toISOString()
    });
    this.saveChatHistory();

    return response;
  }

  async analyze(code, language, mode = 'general') {
    const modePrompts = {
      general: 'Analyze this code for quality, bugs, and improvements:',
      security: 'Perform a security audit of this code:',
      performance: 'Analyze this code for performance issues:',
      bugs: 'Find bugs and issues in this code:'
    };

    const prompt = `${modePrompts[mode] || modePrompts.general}

${language?.toUpperCase() || 'CODE'}:
\`\`\`${language || ''}
${code}
\`\`\``;

    return await this.callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  }

  async vibecode(action, params) {
    const prompts = {
      generate: `Generate code based on this description. Provide complete, working code with comments.

Description: ${params.description}
Language: ${params.language || 'auto'}

Provide the complete code:`,

      explain: `Explain this code in simple terms:

${params.code}`,

      refactor: `Refactor this code to be cleaner and more maintainable:

${params.code}

Provide the refactored code with explanations:`,

      debug: `Find and fix bugs in this code:

${params.code}

Explain what was wrong and provide the fixed code:`,

      test: `Write comprehensive unit tests for this code:

${params.code}

Provide complete test file with edge cases:`,

      optimize: `Optimize this code for performance:

${params.code}

Explain the optimizations made:`
    };

    const prompt = prompts[action];
    if (!prompt) {
      throw new Error(`Unknown vibecode action: ${action}`);
    }

    return await this.callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
  }

  switchProvider(provider) {
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

    this.config.provider = provider;
    if (endpoints[provider]) {
      this.config.endpointUrl = endpoints[provider];
    }
    this.saveConfig();
  }

  getConfig() {
    return { ...this.config };
  }
}

// Singleton instance
let engineInstance = null;

function getCoreEngine() {
  if (!engineInstance) {
    engineInstance = new CoreEngine();
  }
  return engineInstance;
}

module.exports = { CoreEngine, getCoreEngine };
