'use strict';

/**
 * Groq API Client — Free Llama 3 & Mixtral Access
 * 
 * Groq provides extremely fast inference with generous free tiers.
 * Sign up: https://console.groq.com/
 * 
 * Free Models Available:
 *   - llama3-70b-8192: Llama 3 70B (excellent for code)
 *   - llama3-8b-8192: Llama 3 8B (fast, good for quick tasks)
 *   - mixtral-8x7b-32768: Mixtral (large context window)
 *   - gemma2-9b-it: Google Gemma 2 (free)
 * 
 * Free Tier Limits:
 *   - RPM (requests per minute): Varies by model
 *   - RPD (requests per day): Varies by model
 *   - Check https://console.groq.com/docs/rate-limits for current limits
 */

const https = require('https');
const http = require('http');

const DEFAULT_MODEL = 'llama3-70b-8192';
const DEFAULT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function getApiKey() {
  return process.env.GROQ_API_KEY || null;
}

function getEndpoint() {
  return process.env.GROQ_ENDPOINT || DEFAULT_ENDPOINT;
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
      timeout: options.timeout || 60000
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
 * Call Groq API (non-streaming)
 */
async function callGroq(messages, options = {}) {
  const apiKey = options.apiKey || getApiKey();
  const endpoint = options.endpoint || getEndpoint();
  const model = options.model || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('Groq API key required. Get free key at https://console.groq.com/ and set GROQ_API_KEY environment variable.');
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
      timeout: 60000
    });

    return response.choices?.[0]?.message?.content || 'No response received.';
  } catch (e) {
    if (e.message.includes('401')) {
      throw new Error('Groq API key invalid. Check GROQ_API_KEY environment variable.');
    }
    if (e.message.includes('429')) {
      throw new Error('Groq rate limit exceeded. Free tier has RPM/RPD limits. Wait or switch to another provider.');
    }
    throw new Error(`Groq API error: ${e.message}`);
  }
}

/**
 * Call Groq API with streaming support
 */
async function callGroqStream(messages, onChunk, options = {}) {
  const apiKey = options.apiKey || getApiKey();
  const endpoint = options.endpoint || getEndpoint();
  const model = options.model || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('Groq API key required. Get free key at https://console.groq.com/ and set GROQ_API_KEY environment variable.');
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
      timeout: 60000
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
 * Check if Groq API is reachable and healthy
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
 * List available Groq models
 */
function getAvailableModels() {
  return [
    {
      id: 'llama3-70b-8192',
      name: 'Llama 3 70B (Groq)',
      description: 'Excellent code generation, very fast on Groq infrastructure',
      quality: 'excellent',
      speed: 'very-fast',
      free: true,
      freeLimit: 'Generous free tier',
      category: 'code'
    },
    {
      id: 'llama3-8b-8192',
      name: 'Llama 3 8B (Groq)',
      description: 'Fast lightweight model for quick tasks',
      quality: 'good',
      speed: 'ultra-fast',
      free: true,
      freeLimit: 'Generous free tier',
      category: 'general'
    },
    {
      id: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B (Groq)',
      description: 'Mixture of Experts model with 32K context window',
      quality: 'very-good',
      speed: 'fast',
      free: true,
      freeLimit: 'Generous free tier',
      category: 'general'
    },
    {
      id: 'gemma2-9b-it',
      name: 'Gemma 2 9B (Groq)',
      description: "Google's open model, good for instruction following",
      quality: 'good',
      speed: 'very-fast',
      free: true,
      freeLimit: 'Generous free tier',
      category: 'general'
    }
  ];
}

module.exports = {
  callGroq,
  callGroqStream,
  checkHealth,
  getAvailableModels,
  getApiKey,
  getEndpoint,
  DEFAULT_MODEL,
  DEFAULT_ENDPOINT
};
