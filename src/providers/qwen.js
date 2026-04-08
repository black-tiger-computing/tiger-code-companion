'use strict';

/**
 * Qwen (Alibaba Cloud Model Studio) API Client
 * 
 * OpenAI-compatible endpoint for Qwen3-Coder-Next and other Qwen models.
 * Free tier: 2,000 requests/day via Alibaba Cloud Model Studio.
 * 
 * Setup:
 *   1. Sign up: https://bailian.console.alibabacloud.com/
 *   2. Get API key: Settings > API Key
 *   3. Set env: DASHSCOPE_API_KEY=your_key
 * 
 * Endpoints:
 *   - OpenAI-compatible: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 *   - Anthropic-compatible: proxy mode available
 * 
 * Pricing (pay-as-you-go):
 *   - qwen3-max: $0.0012 input / $0.006 output per 1K tokens
 *   - qwen-plus: $0.0004 input / $0.0012 output per 1K tokens
 *   - qwen3-coder-next: competitive coding model pricing
 */

const https = require('https');
const http = require('http');

const DEFAULT_MODEL = 'qwen3-coder-next';
const DEFAULT_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

function getApiKey() {
  return process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || null;
}

function getEndpoint() {
  return process.env.QWEN_ENDPOINT || DEFAULT_ENDPOINT;
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
 * Call Qwen API (non-streaming)
 */
async function callQwen(messages, options = {}) {
  const apiKey = options.apiKey || getApiKey();
  const endpoint = options.endpoint || getEndpoint();
  const model = options.model || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('Qwen API key required. Get one at https://bailian.console.alibabacloud.com/ and set DASHSCOPE_API_KEY environment variable.');
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
      throw new Error('Qwen API key invalid. Check DASHSCOPE_API_KEY environment variable.');
    }
    if (e.message.includes('429')) {
      throw new Error('Qwen API rate limit exceeded. Free tier: 2,000 requests/day. Try again tomorrow or switch to another provider.');
    }
    throw new Error(`Qwen API error: ${e.message}`);
  }
}

/**
 * Call Qwen API with streaming support
 */
async function callQwenStream(messages, onChunk, options = {}) {
  const apiKey = options.apiKey || getApiKey();
  const endpoint = options.endpoint || getEndpoint();
  const model = options.model || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('Qwen API key required. Get one at https://bailian.console.alibabacloud.com/ and set DASHSCOPE_API_KEY environment variable.');
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
 * Check if Qwen API is reachable and healthy
 */
async function checkHealth(apiKey) {
  const key = apiKey || getApiKey();
  if (!key) return false;
  
  try {
    await makeRequest(getEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: {
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      },
      timeout: 5000
    });
    return true;
  } catch (e) {
    // 400/401 means reachable but auth issue — still counts as reachable
    return e.message.includes('400') || e.message.includes('401') || e.message.includes('HTTP 4');
  }
}

/**
 * List available Qwen models
 */
function getAvailableModels() {
  return [
    {
      id: 'qwen3-coder-next',
      name: 'Qwen3-Coder-Next',
      description: 'Latest code-specialized model, excellent for all programming tasks',
      quality: 'excellent',
      speed: 'fast',
      free: true,
      freeLimit: '2,000 req/day',
      category: 'code'
    },
    {
      id: 'qwen3-max',
      name: 'Qwen3-Max',
      description: 'Most capable Qwen model for complex reasoning and code',
      quality: 'excellent',
      speed: 'moderate',
      free: true,
      freeLimit: '2,000 req/day',
      category: 'general'
    },
    {
      id: 'qwen-plus',
      name: 'Qwen-Plus',
      description: 'Balanced speed and quality, cost-effective',
      quality: 'very-good',
      speed: 'fast',
      free: true,
      freeLimit: '2,000 req/day',
      category: 'general'
    }
  ];
}

module.exports = {
  callQwen,
  callQwenStream,
  checkHealth,
  getAvailableModels,
  getApiKey,
  getEndpoint,
  DEFAULT_MODEL,
  DEFAULT_ENDPOINT
};
