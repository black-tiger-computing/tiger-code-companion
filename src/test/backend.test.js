'use strict';

/**
 * Tiger Code Pilot — Backend Integration Tests
 * Run: npm test  or  node src/test/backend.test.js
 * No external test framework — pure Node.js assert.
 *
 * Strategy: Patch provider modules after loading so core-engine routes through them.
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ─── Temp config dir so tests never touch real user config ────────────────────

const TEST_HOME = path.join(os.tmpdir(), `tiger-test-${Date.now()}`);
fs.mkdirSync(TEST_HOME, { recursive: true });
const _realHomedir = os.homedir;
os.homedir = () => TEST_HOME;

// Load modules
const { getCoreEngine, loadConfig, saveConfig, repairConfig } = require('../core-engine');
const { safePath } = require('../local-agent');
const {
  detectLocalProviders, setActiveProvider, setProviderApiKey,
  getProviderApiKey, PROVIDER_REGISTRY, MODEL_CATALOG
} = require('../provider-registry');

// ─── Mock all three provider modules ─────────────────────────────────────────

let _callCount = 0;

function patchProvider(mod, content = 'mock response') {
  if (mod.callOllama)      mod.callOllama = async () => { _callCount++; return content; };
  if (mod.callOllamaStream) mod.callOllamaStream = async (msgs, cb) => { _callCount++; cb(content); };
  if (mod.callLMStudio)     mod.callLMStudio = async () => { _callCount++; return content; };
  if (mod.callLMStudioStream) mod.callLMStudioStream = async (msgs, cb) => { _callCount++; cb(content); };
  if (mod.callLocal)        mod.callLocal = async () => { _callCount++; return content; };
  if (mod.callLocalStream)  mod.callLocalStream = async (msgs, cb) => { _callCount++; cb(content); };
  if (mod.checkHealth)      mod.checkHealth = async () => true;
}

const ollamaMod = require('../providers/ollama');
const lmstudioMod = require('../providers/lmstudio');
const localMod = require('../providers/local');
const qwenMod = require('../providers/qwen');
const groqMod = require('../providers/groq');
const hfMod = require('../providers/huggingface');
patchProvider(ollamaMod);
patchProvider(lmstudioMod);
patchProvider(localMod);

// ─── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}\n     ${e.message}`);
    failed++;
  }
}

function resetMock(content = 'mock response') {
  _callCount = 0;
  patchProvider(ollamaMod, content);
  patchProvider(lmstudioMod, content);
  patchProvider(localMod, content);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {

  // ── Config ──────────────────────────────────────────────────────────────────
  console.log('\n📋 Config');

  await test('loadConfig returns defaults when no file exists', () => {
    const c = loadConfig();
    assert.strictEqual(c.provider, 'ollama');
    assert.strictEqual(c.model, 'llama3.2');
    assert.strictEqual(c.settings.temperature, 0.7);
  });

  await test('saveConfig / loadConfig round-trip', () => {
    const c = loadConfig();
    c.model = 'deepseek-coder-6.7b';
    saveConfig(c);
    assert.strictEqual(loadConfig().model, 'deepseek-coder-6.7b');
  });

  await test('loadConfig merges missing keys with defaults', () => {
    const configFile = path.join(TEST_HOME, '.tiger-code-pilot', 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({ provider: 'lmstudio', model: 'llama-3.2' }));
    const c = loadConfig();
    assert.strictEqual(c.provider, 'lmstudio');
    assert.ok(c.settings, 'settings should be merged from defaults');
  });

  await test('loadConfig auto-repairs corrupted config', () => {
    const configFile = path.join(TEST_HOME, '.tiger-code-pilot', 'config.json');
    fs.writeFileSync(configFile, '{ not valid json !!!');
    const c = loadConfig();
    assert.strictEqual(c.provider, 'ollama');
  });

  await test('repairConfig resets to defaults', () => {
    const c = loadConfig();
    c.provider = 'local';
    saveConfig(c);
    repairConfig();
    assert.strictEqual(loadConfig().provider, 'ollama');
  });

  // ── Core Engine ──────────────────────────────────────────────────────────────
  console.log('\n🔧 Core Engine');

  await test('getCoreEngine returns singleton', () => {
    assert.strictEqual(getCoreEngine(), getCoreEngine());
  });

  await test('engine.chat calls AI and returns response', async () => {
    resetMock();
    const c = loadConfig();
    c.apiKeys = { openai: 'sk-test' };
    saveConfig(c);
    const result = await getCoreEngine().chat('hello', 'test-session');
    assert.strictEqual(result, 'mock response');
    assert.ok(_callCount > 0);
  });

  await test('engine.analyze calls AI', async () => {
    resetMock();
    const result = await getCoreEngine().analyze('const x = 1;', 'javascript', 'general');
    assert.strictEqual(result, 'mock response');
  });

  await test('engine.vibecode throws on unknown action', async () => {
    await assert.rejects(() => getCoreEngine().vibecode('nonexistent', {}), /Unknown vibecode action/);
  });

  await test('engine.vibecode generate returns response', async () => {
    resetMock();
    const result = await getCoreEngine().vibecode('generate', { description: 'hello world', language: 'python' });
    assert.strictEqual(result, 'mock response');
  });

  await test('retry logic retries on failure then succeeds', async () => {
    let attempts = 0;
    const origFn = ollamaMod.callOllama;
    ollamaMod.callOllama = async () => {
      attempts++;
      if (attempts < 3) {
        const e = new Error('rate limited');
        e.response = { status: 429 };
        throw e;
      }
      return 'success after retry';
    };
    const result = await getCoreEngine().chat('retry test', 'retry-session');
    assert.strictEqual(result, 'success after retry');
    assert.strictEqual(attempts, 3);
    ollamaMod.callOllama = origFn;
    resetMock();
  });

  await test('retry does not retry on 400', async () => {
    let attempts = 0;
    const origOllamaFn = ollamaMod.callOllama;
    const origQwenFn = qwenMod.callQwen;
    const origGroqFn = groqMod.callGroq;
    const origHfFn = hfMod.callHuggingFace;
    const origLmstudioFn = lmstudioMod.callLMStudio;
    const origLocalFn = localMod.callLocal;

    // Mock all providers to fail with 400 (non-retryable error)
    ollamaMod.callOllama = async () => {
      attempts++;
      const e = new Error('bad request');
      e.response = { status: 400 };
      throw e;
    };
    qwenMod.callQwen = async () => {
      const e = new Error('bad request');
      e.response = { status: 400 };
      throw e;
    };
    groqMod.callGroq = async () => {
      const e = new Error('bad request');
      e.response = { status: 400 };
      throw e;
    };
    hfMod.callHuggingFace = async () => {
      const e = new Error('bad request');
      e.response = { status: 400 };
      throw e;
    };
    lmstudioMod.callLMStudio = async () => {
      const e = new Error('bad request');
      e.response = { status: 400 };
      throw e;
    };
    localMod.callLocal = async () => {
      const e = new Error('bad request');
      e.response = { status: 400 };
      throw e;
    };

    await assert.rejects(() => getCoreEngine().chat('bad', 'bad-session'), /bad request/);
    assert.strictEqual(attempts, 1);

    // Restore all providers
    ollamaMod.callOllama = origOllamaFn;
    qwenMod.callQwen = origQwenFn;
    groqMod.callGroq = origGroqFn;
    hfMod.callHuggingFace = origHfFn;
    lmstudioMod.callLMStudio = origLmstudioFn;
    localMod.callLocal = origLocalFn;
    resetMock();
  });

  await test('condenseSession returns "Nothing to condense" for short sessions', async () => {
    resetMock();
    const result = await getCoreEngine().condenseSession('empty-xyz');
    assert.strictEqual(result, 'Nothing to condense yet.');
  });

  await test('checkHealth returns true when provider is reachable', async () => {
    assert.strictEqual(await getCoreEngine().checkHealth('ollama'), true);
  });

  await test('checkHealth returns false for unknown provider', async () => {
    assert.strictEqual(await getCoreEngine().checkHealth('nonexistent'), false);
  });

  // ── Provider Registry ────────────────────────────────────────────────────────
  console.log('\n🗂️  Provider Registry');

  await test('PROVIDER_REGISTRY has 3 local providers', () => {
    const expected = ['ollama', 'lmstudio', 'local'];
    for (const id of expected) assert.ok(PROVIDER_REGISTRY[id], `Missing: ${id}`);
  });

  await test('MODEL_CATALOG has 7 models with required fields', () => {
    assert.strictEqual(MODEL_CATALOG.length, 7);
    for (const m of MODEL_CATALOG) {
      assert.ok(m.id && m.name && m.url && m.category, `Model ${m.id} missing fields`);
    }
  });

  await test('setActiveProvider writes to config.json', () => {
    setActiveProvider('lmstudio');
    assert.strictEqual(loadConfig().provider, 'lmstudio');
  });

  await test('setProviderApiKey / getProviderApiKey round-trip', () => {
    setProviderApiKey('local', 'local-key');
    assert.strictEqual(getProviderApiKey('local'), 'local-key');
  });

  await test('getProviderApiKey falls back to env var', () => {
    process.env.OLLAMA_API_KEY = 'env-key';
    assert.strictEqual(getProviderApiKey('ollama'), 'env-key');
    delete process.env.OLLAMA_API_KEY;
  });

  await test('detectLocalProviders detects ollama', async () => {
    // detectLocalProviders uses raw http, not axios — mock at module level
    const http = require('http');
    const _realGet = http.get;
    http.get = (url, opts, cb) => {
      const callback = typeof opts === 'function' ? opts : cb;
      const mockRes = {
        statusCode: 200,
        on: (event, fn) => {
          if (event === 'data') fn(JSON.stringify({ models: [{ name: 'llama3.2' }] }));
          if (event === 'end') fn();
          return mockRes;
        }
      };
      callback(mockRes);
      return { on: () => {}, destroy: () => {} };
    };
    const d = await detectLocalProviders();
    http.get = _realGet;
    assert.ok(d.ollama.available);
    assert.ok(d.ollama.models.includes('llama3.2'));
  });

  await test('detectLocalProviders detects lmstudio', async () => {
    const http = require('http');
    const _realGet = http.get;
    http.get = (url, opts, cb) => {
      const callback = typeof opts === 'function' ? opts : cb;
      const mockRes = {
        statusCode: 200,
        on: (event, fn) => {
          if (event === 'data') fn(JSON.stringify({ data: [{ id: 'phi-3' }] }));
          if (event === 'end') fn();
          return mockRes;
        }
      };
      callback(mockRes);
      return { on: () => {}, destroy: () => {} };
    };
    const d = await detectLocalProviders();
    http.get = _realGet;
    assert.ok(d.lmstudio.available);
    assert.ok(d.lmstudio.models.includes('phi-3'));
  });

  // ── Path Traversal ───────────────────────────────────────────────────────────
  console.log('\n🔒 Path Traversal Security');

  const workDir = path.join(TEST_HOME, 'project');
  fs.mkdirSync(workDir, { recursive: true });

  await test('safePath allows valid relative path', () => {
    const result = safePath(workDir, 'src/app.js');
    assert.ok(result.startsWith(workDir));
  });

  await test('safePath blocks ../ traversal', () => {
    assert.throws(() => safePath(workDir, '../../etc/passwd'), /Path traversal blocked/);
  });

  await test('safePath blocks absolute path outside workDir', () => {
    assert.throws(() => safePath(workDir, '/etc/passwd'), /Path traversal blocked/);
  });

  await test('safePath blocks Windows-style traversal', () => {
    assert.throws(() => safePath(workDir, '..\\..\\Windows\\System32'), /Path traversal blocked/);
  });

  // ── Session Condense ─────────────────────────────────────────────────────────
  console.log('\n💬 Session Condense');

  await test('condenseSession replaces messages with summary', async () => {
    resetMock('condensed summary');

    const histFile = path.join(TEST_HOME, '.tiger-code-pilot', 'chat-history.json');
    const fakeHistory = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
      sessionId: 'condense-test',
      timestamp: new Date().toISOString()
    }));
    fs.writeFileSync(histFile, JSON.stringify(fakeHistory));

    const summary = await getCoreEngine().condenseSession('condense-test');
    assert.strictEqual(summary, 'condensed summary');

    const history = JSON.parse(fs.readFileSync(histFile, 'utf8'));
    const session = history.filter(m => m.sessionId === 'condense-test');
    assert.strictEqual(session.length, 1, 'should be condensed to 1 entry');
    assert.ok(session[0].content.includes('condensed summary'));
  });

  // ── Results ──────────────────────────────────────────────────────────────────
  console.log(`\n${'━'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('━'.repeat(50) + '\n');

  os.homedir = _realHomedir;
  try {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  } catch (e) {
    console.error(`⚠️  Test cleanup failed: ${e.message}`);
  }

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(`\n❌ Test runner crashed: ${e.message}`); process.exit(1); });
