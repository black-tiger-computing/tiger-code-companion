'use strict';

/**
 * HuggingFace Inference API client
 * Default model: Salesforce/codegen-350M-mono (free, no key required)
 */

const axios = require('axios');

const BASE_URL = 'https://api-inference.huggingface.co/models';
const DEFAULT_MODEL = 'Salesforce/codegen-350M-mono';

async function callHuggingFace(messages, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const apiKey = options.apiKey;
  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.post(`${BASE_URL}/${model}`, {
        inputs: prompt,
        parameters: {
          max_new_tokens: options.maxTokens || 1024,
          temperature: options.temperature || 0.7,
          return_full_text: false
        }
      }, { headers, timeout: 60000 });

      // HF returns array of generated_text
      const text = Array.isArray(res.data)
        ? res.data[0]?.generated_text
        : res.data?.generated_text;

      return text?.trim() || 'No response.';
    } catch (e) {
      lastError = e;
      const status = e.response?.status;
      // 503 = model loading — wait and retry
      if (status === 503) {
        const wait = (attempt + 1) * 3000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw new Error(`HuggingFace error: ${e.response?.data?.error || e.message}`);
    }
  }
  throw new Error(`HuggingFace error after retries: ${lastError?.message}`);
}

async function checkHealth(apiKey) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    await axios.post(`${BASE_URL}/${DEFAULT_MODEL}`,
      { inputs: 'test', parameters: { max_new_tokens: 1 } },
      { headers, timeout: 5000 }
    );
    return true;
  } catch (e) {
    // 503 means model is loading but reachable — still healthy
    return e.response?.status === 503;
  }
}

module.exports = { callHuggingFace, checkHealth, DEFAULT_MODEL };
