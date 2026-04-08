#!/usr/bin/env node

/**
 * Tiger Code Pilot - Usage Analytics & Cost Tracking
 * 
 * Tracks API usage, costs, rate limits, and provider performance.
 * Stores data in ~/.tiger-code-pilot/usage.json
 * 
 * Features:
 * - Per-provider request counting
 * - Token usage estimation
 * - Cost calculation based on provider pricing
 * - Rate limit tracking & warnings
 * - Monthly budget alerts
 * - Provider performance metrics (avg response time, success rate)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const USAGE_DIR = path.join(os.homedir(), '.tiger-code-pilot');
const USAGE_FILE = path.join(USAGE_DIR, 'usage.json');

// Provider pricing (per 1M tokens)
const PRICING = {
  qwen: {
    'qwen3-coder-next': { input: 0.0012, output: 0.006 },
    'qwen3-max': { input: 0.0012, output: 0.006 },
    'qwen-plus': { input: 0.0004, output: 0.0012 }
  },
  groq: {
    'llama3-70b-8192': { input: 0.00, output: 0.00 }, // Free tier
    'llama3-8b-8192': { input: 0.00, output: 0.00 },
    'mixtral-8x7b-32768': { input: 0.00, output: 0.00 },
    'gemma2-9b-it': { input: 0.00, output: 0.00 }
  },
  huggingface: {
    'Qwen/Qwen2.5-Coder-32B-Instruct': { input: 0.00, output: 0.00 }, // Free tier
    'meta-llama/Llama-3.1-70B-Instruct': { input: 0.00, output: 0.00 },
    'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.00, output: 0.00 },
    'deepseek-ai/deepseek-coder-33b-instruct': { input: 0.00, output: 0.00 }
  }
};

// Rate limits (requests per day for free tiers)
const RATE_LIMITS = {
  qwen: { daily: 2000, rpm: 60 },
  groq: { daily: 14400, rpm: 30 }, // Varies by model
  huggingface: { daily: 1000, rpm: 20 }, // Approximate
  ollama: { daily: Infinity, rpm: Infinity }, // Local - no limits
  lmstudio: { daily: Infinity, rpm: Infinity },
  local: { daily: Infinity, rpm: Infinity }
};

// ─── Usage Tracking ──────────────────────────────────────────────────────────

function loadUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    }
  } catch (e) {
    // File corrupted - start fresh
  }
  
  return {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    providers: {},
    monthlyCosts: {},
    lastReset: new Date().toISOString()
  };
}

function saveUsage(data) {
  try {
    if (!fs.existsSync(USAGE_DIR)) {
      fs.mkdirSync(USAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`⚠️  Failed to save usage data: ${e.message}`);
  }
}

function resetMonthly() {
  const usage = loadUsage();
  const now = new Date();
  const lastReset = new Date(usage.lastReset);
  
  // Reset if new month
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    usage.monthlyCosts = {};
    usage.lastReset = now.toISOString();
    saveUsage(usage);
  }
  
  return usage;
}

// ─── Track API Call ──────────────────────────────────────────────────────────

function trackAPICall(provider, model, promptTokens, completionTokens, responseTime, success = true) {
  const usage = resetMonthly();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Initialize provider tracking
  if (!usage.providers[provider]) {
    usage.providers[provider] = {
      requests: 0,
      tokens: 0,
      cost: 0,
      errors: 0,
      avgResponseTime: 0,
      lastRequest: null,
      dailyRequests: {},
      models: {}
    };
  }
  
  const providerData = usage.providers[provider];
  providerData.requests++;
  providerData.tokens += (promptTokens + completionTokens);
  providerData.lastRequest = now.toISOString();
  
  // Track daily requests for rate limiting
  const dayKey = now.toISOString().split('T')[0];
  if (!providerData.dailyRequests[dayKey]) {
    providerData.dailyRequests[dayKey] = 0;
  }
  providerData.dailyRequests[dayKey]++;
  
  // Track per-model usage
  if (model && !providerData.models[model]) {
    providerData.models[model] = { requests: 0, tokens: 0, cost: 0 };
  }
  if (model) {
    providerData.models[model].requests++;
    providerData.models[model].tokens += (promptTokens + completionTokens);
  }
  
  // Calculate cost
  const cost = calculateCost(provider, model, promptTokens, completionTokens);
  providerData.cost += cost;
  if (model) {
    providerData.models[model].cost += cost;
  }
  
  // Track errors
  if (!success) {
    providerData.errors++;
  }
  
  // Update average response time
  providerData.avgResponseTime = 
    (providerData.avgResponseTime * (providerData.requests - 1) + responseTime) / providerData.requests;
  
  // Update totals
  usage.totalRequests++;
  usage.totalTokens += (promptTokens + completionTokens);
  usage.totalCost += cost;
  
  // Update monthly costs
  if (!usage.monthlyCosts[monthKey]) {
    usage.monthlyCosts[monthKey] = { cost: 0, requests: 0 };
  }
  usage.monthlyCosts[monthKey].cost += cost;
  usage.monthlyCosts[monthKey].requests++;
  
  saveUsage(usage);
  
  // Check rate limits and budget
  checkRateLimits(provider, dayKey);
  checkBudget(monthKey, usage.totalCost);
  
  return { cost, remaining: getRemainingDailyQuota(provider, dayKey) };
}

// ─── Cost Calculation ────────────────────────────────────────────────────────

function calculateCost(provider, model, promptTokens, completionTokens) {
  const pricing = PRICING[provider]?.[model];
  if (!pricing) return 0; // Free or unknown
  
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

// ─── Rate Limit Checking ─────────────────────────────────────────────────────

function getRemainingDailyQuota(provider, dayKey = null) {
  if (!dayKey) dayKey = new Date().toISOString().split('T')[0];
  
  const usage = loadUsage();
  const limit = RATE_LIMITS[provider]?.daily || Infinity;
  const used = usage.providers[provider]?.dailyRequests?.[dayKey] || 0;
  
  return Math.max(0, limit - used);
}

function checkRateLimits(provider, dayKey) {
  const remaining = getRemainingDailyQuota(provider, dayKey);
  const limit = RATE_LIMITS[provider]?.daily || Infinity;
  
  if (remaining === 0) {
    console.warn(`🚨 ${provider.toUpperCase()} daily limit reached! (${limit}/${limit})`);
    console.warn(`   Switch to another provider or wait for reset tomorrow.`);
  } else if (remaining < limit * 0.1) {
    console.warn(`⚠️  ${provider.toUpperCase()} approaching daily limit: ${remaining} requests remaining`);
  }
}

// ─── Budget Alerts ───────────────────────────────────────────────────────────

function checkBudget(monthKey, totalCost) {
  const budget = 10.0; // Default $10/month alert threshold
  
  if (totalCost >= budget) {
    console.warn(`💰 Monthly cost alert: $${totalCost.toFixed(2)} spent this month`);
  }
}

// ─── Usage Dashboard ─────────────────────────────────────────────────────────

function showDashboard() {
  const usage = loadUsage();
  
  console.log('\n📊 Tiger Code Pilot - Usage Analytics');
  console.log('━'.repeat(60));
  
  // Overall stats
  console.log(`\n📈 Overall Statistics:`);
  console.log(`   Total Requests: ${usage.totalRequests.toLocaleString()}`);
  console.log(`   Total Tokens: ${(usage.totalTokens / 1000).toFixed(1)}K`);
  console.log(`   Total Cost: $${usage.totalCost.toFixed(4)}`);
  
  // Per-provider breakdown
  console.log(`\n🔌 Provider Breakdown:`);
  for (const [provider, data] of Object.entries(usage.providers)) {
    const remaining = getRemainingDailyQuota(provider);
    const limit = RATE_LIMITS[provider]?.daily || '∞';
    const emoji = data.errors > 0 ? '⚠️ ' : '✅';
    
    console.log(`\n   ${emoji} ${provider.toUpperCase()}`);
    console.log(`      Requests: ${data.requests.toLocaleString()}`);
    console.log(`      Tokens: ${(data.tokens / 1000).toFixed(1)}K`);
    console.log(`      Cost: $${data.cost.toFixed(4)}`);
    console.log(`      Avg Response: ${data.avgResponseTime.toFixed(0)}ms`);
    console.log(`      Success Rate: ${((data.requests - data.errors) / data.requests * 100).toFixed(1)}%`);
    console.log(`      Daily Quota: ${remaining}/${limit} remaining`);
    
    if (data.lastRequest) {
      const lastUsed = new Date(data.lastRequest);
      console.log(`      Last Used: ${lastUsed.toLocaleString()}`);
    }
  }
  
  // Monthly costs
  console.log(`\n💰 Monthly Costs:`);
  for (const [month, data] of Object.entries(usage.monthlyCosts).slice(-3)) {
    console.log(`   ${month}: $${data.cost.toFixed(4)} (${data.requests} requests)`);
  }
  
  console.log('\n' + '━'.repeat(60));
}

// ─── Reset Usage Data ────────────────────────────────────────────────────────

function resetUsage() {
  if (fs.existsSync(USAGE_FILE)) {
    fs.unlinkSync(USAGE_FILE);
    console.log('✅ Usage data reset');
  } else {
    console.log('ℹ️  No usage data to reset');
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
  trackAPICall,
  showDashboard,
  resetUsage,
  getRemainingDailyQuota,
  RATE_LIMITS,
  PRICING
};
