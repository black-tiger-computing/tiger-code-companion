'use strict';

/**
 * OpenAI API client — also compatible with Groq, OpenRouter, LM Studio
 * Default model: gpt-4o-mini
 */

const axios = require('axios');

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(messages, options = {}) {
  const apiKey = options.apiKey;
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const model = options.model || DEFAULT_MODEL;

  if (!apiKey) throw new Error('OpenAI API key required');

  try {
    const res = await axios.post(endpoint, {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 4096
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 120000
    });

    return res.data.choices?.[0]?.message?.content || 'No response.';
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    throw new Error(`OpenAI error: ${msg}`);
  }
}

async function callOpenAIStream(messages, onChunk, options = {}) {
  const apiKey = options.apiKey;
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const model = options.model || DEFAULT_MODEL;

  if (!apiKey) throw new Error('OpenAI API key required');

  try {
    const res = await axios.post(endpoint, {
      model, messages,
      temperature: options.temperature ?? 0.7,
      stream: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      responseType: 'stream',
      timeout: 120000
    });

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
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) onChunk(token);
        } catch (e) { /* skip malformed */ }
      }
    });

    await new Promise((resolve, reject) => {
      res.data.on('end', resolve);
      res.data.on('error', reject);
    });
  } catch (e) {
    // Fall back to full response
    const full = await callOpenAI(messages, options);
    onChunk(full);
  }
}

async function checkHealth(apiKey, endpoint) {
  if (!apiKey) return false;
  try {
    await axios.post(endpoint || DEFAULT_ENDPOINT, {
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 5000
    });
    return true;
  } catch (e) {
    // 400/401 means reachable but auth issue — still counts as reachable
    return e.response?.status !== undefined;
  }
}

module.exports = { callOpenAI, callOpenAIStream, checkHealth, DEFAULT_MODEL, DEFAULT_ENDPOINT };
