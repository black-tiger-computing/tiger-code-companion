/**
 * Tiger Code Pilot - Core Engine Stub
 *
 * Thin wrapper around the existing axios call pattern.
 * This stub will be replaced by the real core-engine.js
 * built by the backend team. Method signatures are locked.
 */

const axios = require('axios');

// Internal state
let _provider = 'openai';
let _model = 'gpt-4o-mini';
let _apiKey = '';
let _endpointUrl = 'https://api.openai.com/v1/chat/completions';
let _temperature = 0.7;
let _sessionId = 'default';

const PROVIDER_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  huggingface: 'https://api-inference.huggingface.co/models/',
  ollama: 'http://localhost:11434/api/generate',
  local: 'http://localhost:8080/v1/chat/completions'
};

/**
 * Get the singleton core engine instance
 */
function getCoreEngine() {
  return {
    /**
     * Send a chat message and get a response
     */
    async chat(message, sessionId) {
      _sessionId = sessionId || _sessionId;

      try {
        const response = await axios.post(
          _endpointUrl,
          {
            model: _model,
            messages: [{ role: 'user', content: message }],
            temperature: _temperature
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${_apiKey}`
            }
          }
        );

        return response.data.choices?.[0]?.message?.content || 'No response received.';
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return `API Error: ${error.response?.data?.error?.message || error.message}`;
        }
        throw error;
      }
    },

    /**
     * Streaming chat — not yet supported by backend, falls back to chat()
     */
    async chatStream(message, sessionId, onChunk) {
      // Backend doesn't support streaming yet — fallback to full response
      const response = await this.chat(message, sessionId);
      onChunk(response);
    },

    /**
     * Analyze code with a specific mode
     */
    async analyze(code, language, mode) {
      const modePrompts = {
        general: `Analyze the following ${language} code and provide a comprehensive review covering code quality, potential bugs, best practices, and performance considerations.`,
        security: `Perform a security audit of the following ${language} code. Look for input validation issues, injection vulnerabilities, hardcoded secrets, and auth flaws.`,
        performance: `Analyze the following ${language} code for performance issues including algorithmic complexity, memory usage, and caching opportunities.`,
        bugs: `Review the following ${language} code for bugs, logic errors, unhandled edge cases, and missing error handling.`
      };

      const prompt = modePrompts[mode] || modePrompts.general;
      return this.chat(`${prompt}\n\n\`\`\`${language}\n${code}\n\`\`\``);
    },

    /**
     * VibeCode — natural language code generation
     */
    async vibecode(action, params) {
      const prompts = {
        generate: `Generate code based on this description:\n${params.description}\n\nLanguage: ${params.language || 'javascript'}`,
        refactor: `Refactor the following code:\n\`\`\`${params.language || 'javascript'}\n${params.code}\n\`\`\``,
        debug: `Find and fix bugs in this code:\n\`\`\`${params.language || 'javascript'}\n${params.code}\n\`\`\``,
        test: `Write tests for this code:\n\`\`\`${params.language || 'javascript'}\n${params.code}\n\`\`\``
      };

      const prompt = prompts[action] || prompts.generate;
      return this.chat(prompt);
    },

    /**
     * Switch the active AI provider
     */
    switchProvider(name) {
      _provider = name;
      _endpointUrl = PROVIDER_ENDPOINTS[name] || _endpointUrl;
    },

    /**
     * Get current engine configuration
     */
    getConfig() {
      return {
        provider: _provider,
        model: _model,
        endpointUrl: _endpointUrl,
        temperature: _temperature,
        sessionId: _sessionId
      };
    },

    /**
     * Set API key for the current provider
     */
    setApiKey(key) {
      _apiKey = key;
    },

    /**
     * Set model for the current provider
     */
    setModel(model) {
      _model = model;
    },

    /**
     * Set endpoint URL
     */
    setEndpoint(url) {
      _endpointUrl = url;
    }
  };
}

module.exports = { getCoreEngine };
