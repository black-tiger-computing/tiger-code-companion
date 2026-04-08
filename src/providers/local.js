'use strict';

/**
 * Custom local server provider — http://localhost:8080
 * OpenAI-compatible API. Use for llama.cpp, text-generation-webui, etc.
 */

const axios = require('axios');

const DEFAULT_ENDPOINT = 'http://localhost:8080/v1/chat/completions';
const DEFAULT_MODEL = '';

async function callLocal(messages, options = {}) {
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const model = options.model || DEFAULT_MODEL;
  try {
    const res = await axios.post(endpoint, {
      model, messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 4096
    }, { timeout: 120000 });
    return res.data.choices?.[0]?.message?.content || 'No response.';
  } catch (e) {
    throw new Error(`Local server error: ${e.response?.data?.error?.message || e.message}`);
  }
}

async function callLocalStream(messages, onChunk, options = {}) {
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const model = options.model || DEFAULT_MODEL;
  try {
    const res = await axios.post(endpoint, {
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
    const full = await callLocal(messages, options);
    onChunk(full);
  }
}

async function checkHealth(endpoint) {
  try {
    await axios.post(endpoint || DEFAULT_ENDPOINT, {
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1
    }, { timeout: 5000 });
    return true;
  } catch (e) { return e.response?.status !== undefined; }
}

module.exports = { callLocal, callLocalStream, checkHealth, DEFAULT_MODEL, DEFAULT_ENDPOINT };
