'use strict';

/**
 * LM Studio local server client — http://localhost:1234
 * OpenAI-compatible API, no key required
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:1234/v1';
const DEFAULT_MODEL = '';

async function callLMStudio(messages, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  try {
    const res = await axios.post(`${BASE_URL}/chat/completions`, {
      model, messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 4096
    }, { timeout: 120000 });
    return res.data.choices?.[0]?.message?.content || 'No response.';
  } catch (e) {
    throw new Error(`LM Studio error: ${e.response?.data?.error?.message || e.message}`);
  }
}

async function callLMStudioStream(messages, onChunk, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  try {
    const res = await axios.post(`${BASE_URL}/chat/completions`, {
      model, messages, temperature: options.temperature ?? 0.7, stream: true
    }, { responseType: 'stream', timeout: 120000 });
    let buffer = '';
    res.data.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const token = JSON.parse(data).choices?.[0]?.delta?.content;
          if (token) onChunk(token);
        } catch (e) { /* skip */ }
      }
    });
    await new Promise((resolve, reject) => {
      res.data.on('end', resolve);
      res.data.on('error', reject);
    });
  } catch (e) {
    const full = await callLMStudio(messages, options);
    onChunk(full);
  }
}

async function checkHealth() {
  try {
    const res = await axios.get(`${BASE_URL}/models`, { timeout: 3000 });
    return res.status === 200;
  } catch (e) { return false; }
}

async function listModels() {
  try {
    const res = await axios.get(`${BASE_URL}/models`, { timeout: 3000 });
    return (res.data?.data || []).map(m => m.id);
  } catch (e) { return []; }
}

module.exports = { callLMStudio, callLMStudioStream, checkHealth, listModels, BASE_URL };
