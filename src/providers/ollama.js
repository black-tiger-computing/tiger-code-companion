'use strict';

/**
 * Ollama local provider — http://localhost:11434
 * Default model: llama3.2
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';

async function callOllama(messages, options = {}) {
  const model = options.model || DEFAULT_MODEL;

  try {
    const res = await axios.post(`${BASE_URL}/api/chat`, {
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 4096
      }
    }, { timeout: 120000 });

    return res.data?.message?.content || 'No response.';
  } catch (e) {
    throw new Error(`Ollama error: ${e.response?.data?.error || e.message}`);
  }
}

async function callOllamaStream(messages, onChunk, options = {}) {
  const model = options.model || DEFAULT_MODEL;

  try {
    const res = await axios.post(`${BASE_URL}/api/chat`, {
      model, messages, stream: true,
      options: { temperature: options.temperature || 0.7 }
    }, { responseType: 'stream', timeout: 120000 });

    let buffer = '';
    res.data.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const token = parsed.message?.content;
          if (token) onChunk(token);
        } catch (e) { /* skip */ }
      }
    });

    await new Promise((resolve, reject) => {
      res.data.on('end', resolve);
      res.data.on('error', reject);
    });
  } catch (e) {
    // Fall back to non-streaming
    const full = await callOllama(messages, options);
    onChunk(full);
  }
}

async function checkHealth() {
  try {
    const res = await axios.get(`${BASE_URL}/api/tags`, { timeout: 3000 });
    return res.status === 200;
  } catch (e) { return false; }
}

async function listModels() {
  try {
    const res = await axios.get(`${BASE_URL}/api/tags`, { timeout: 3000 });
    return (res.data?.models || []).map(m => m.name);
  } catch (e) { return []; }
}

module.exports = { callOllama, callOllamaStream, checkHealth, listModels, DEFAULT_MODEL };
