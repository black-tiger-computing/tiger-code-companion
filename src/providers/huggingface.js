'use strict';

/**
 * HuggingFace Inference API Client
 *
 * Free tier available for many open-source models.
 * Sign up: https://huggingface.co/
 * Get token: https://huggingface.co/settings/tokens
 *
 * Free Models Available (via Inference API):
 *   - Qwen/Qwen2.5-Coder-32B-Instruct
 *   - meta-llama/Llama-3.1-70B-Instruct
 *   - mistralai/Mixtral-8x7B-Instruct-v0.1
 *   - deepseek-ai/deepseek-coder-33b-instruct
 *
 * Free Tier:
 *   - Rate limited but usable for development
 *   - No credit card required
 *   - Token-based access via HF_TOKEN env var
 */

const https = require('https');
const http = require('http');

const DEFAULT_MODEL = 'Qwen/Qwen2.5-Coder-32B-Instruct';
const DEFAULT_ENDPOINT = 'https://api-inference.huggingface.co/models/';

function getApiKey() {
  return process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || null;
}

function getEndpoint(model) {
  const base = process.env.HF_ENDPOINT || DEFAULT_ENDPOINT;
  return `${base}${model}/v1/chat/completions`;
}

/**
 * Make HTTP request with proper error handling
 */
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: options.timeout || 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          let errorMsg = `HTTP ${res.statusCode}`;
          try {
            const parsed = JSON.parse(data);
            errorMsg = parsed.error?.message || parsed.message || errorMsg;
          } catch (e) { /* ignore */ }
          reject(new Error(errorMsg));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Call HuggingFace API (non-streaming)
 */
async function callHuggingFace(messages, options = {}) {
  const apiKey = options.apiKey || getApiKey();
  const model = options.model || DEFAULT_MODEL;
  const endpoint = getEndpoint(model);

  if (!apiKey) {
    throw new Error('HuggingFace API token required. Get free token at https://huggingface.co/settings/tokens and set HF_TOKEN environment variable.');
  }

  try {
    const response = await makeRequest(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 4096
      },
      timeout: 120000
    });

    return response.choices?.[0]?.message?.content || 'No response received.';
  } catch (e) {
    if (e.message.includes('401')) {
      throw new Error('HuggingFace token invalid. Check HF_TOKEN environment variable.');
    }
    if (e.message.includes('503')) {
      throw new Error('HuggingFace model loading. This free tier model is warming up. Try again in 20-30 seconds or switch to another model.');
    }
    if (e.message.includes('429')) {
      throw new Error('HuggingFace rate limit exceeded. Free tier has usage limits. Wait or switch to another provider.');
    }
    throw new Error(`HuggingFace API error: ${e.message}`);
  }
}

/**
 * Call HuggingFace API with streaming support
 */
async function callHuggingFaceStream(messages, onChunk, options = {}) {
  const apiKey = options.apiKey || getApiKey();
  const model = options.model || DEFAULT_MODEL;
  const endpoint = getEndpoint(model);

  if (!apiKey) {
    throw new Error('HuggingFace API token required. Get free token at https://huggingface.co/settings/tokens and set HF_TOKEN environment variable.');
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(endpoint);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 120000
    }, (res) => {
      let buffer = '';

      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) onChunk(token);
          } catch (e) { /* skip malformed */ }
        }
      });

      res.on('end', resolve);
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Stream timeout'));
    });

    req.write(JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      stream: true
    }));
    req.end();
  });
}

/**
 * Check if HuggingFace API is reachable and healthy
 */
async function checkHealth(apiKey, model) {
  const key = apiKey || getApiKey();
  const targetModel = model || DEFAULT_MODEL;
  if (!key) return false;

  try {
    const endpoint = getEndpoint(targetModel);
    await makeRequest(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: {
        model: targetModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      },
      timeout: 5000
    });
    return true;
  } catch (e) {
    // 503 means model loading — still reachable
    return e.message.includes('503') || e.message.includes('401') || e.message.includes('HTTP 4');
  }
}

/**
 * List available HuggingFace models
 */
function getAvailableModels() {
  return [
    {
      id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      name: 'Qwen 2.5 Coder 32B',
      description: 'Excellent code-specialized model from Alibaba',
      quality: 'excellent',
      speed: 'moderate',
      free: true,
      freeLimit: 'Rate limited free tier',
      category: 'code'
    },
    {
      id: 'meta-llama/Llama-3.1-70B-Instruct',
      name: 'Llama 3.1 70B',
      description: 'Meta\'s latest large language model',
      quality: 'excellent',
      speed: 'moderate',
      free: true,
      freeLimit: 'Rate limited free tier',
      category: 'general'
    },
    {
      id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      name: 'Mixtral 8x7B',
      description: 'Mixture of Experts model with large context',
      quality: 'very-good',
      speed: 'fast',
      free: true,
      freeLimit: 'Rate limited free tier',
      category: 'general'
    },
    {
      id: 'deepseek-ai/deepseek-coder-33b-instruct',
      name: 'DeepSeek Coder 33B',
      description: 'Specialized code generation model',
      quality: 'excellent',
      speed: 'moderate',
      free: true,
      freeLimit: 'Rate limited free tier',
      category: 'code'
    }
  ];
}

module.exports = {
  callHuggingFace,
  callHuggingFaceStream,
  checkHealth,
  getAvailableModels,
  getApiKey,
  getEndpoint,
  DEFAULT_MODEL,
  DEFAULT_ENDPOINT
};
