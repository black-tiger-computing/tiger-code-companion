#!/usr/bin/env node

/**
 * Tiger Code Pilot — Autonomy Level Enforcement
 *
 * Three levels, user-controlled:
 *   "auto"    — Agent executes file writes, git commits, npm installs without asking
 *   "ask"     — Agent shows plan, user says "go" before execution  (default)
 *   "confirm" — Agent asks before each individual step
 *
 * Storage: ~/.tiger-code-pilot/config.json → { "autonomy": "auto" | "ask" | "confirm" }
 *
 * Usage in agent/tools:
 *   const autonomy = require('./autonomy');
 *   const ok = await autonomy.check('Create auth.ts?', { plan: '...' });
 *   if (!ok) return 'Cancelled by user';
 */

const { loadConfig } = require('./core-engine');
const readline = require('readline');

const VALID_LEVELS = new Set(['auto', 'ask', 'confirm']);
const DEFAULT_LEVEL = 'ask';

// ─── Level resolution ─────────────────────────────────────────────────────────

function getLevel() {
  const config = loadConfig();
  return VALID_LEVELS.has(config.autonomy) ? config.autonomy : DEFAULT_LEVEL;
}

function setLevel(level) {
  if (!VALID_LEVELS.has(level)) throw new Error(`Invalid autonomy level: "${level}". Valid: ${[...VALID_LEVELS].join(', ')}`);
  const config = loadConfig();
  config.autonomy = level;
  const { saveConfig } = require('./core-engine');
  saveConfig(config);
  return level;
}

// ─── Checkpoint API ───────────────────────────────────────────────────────────

/**
 * Ask for permission based on current autonomy level.
 *
 * @param {string} question  — "Create auth.ts?"
 * @param {object} ctx       — optional context (plan, step number, etc.)
 * @param {object} rl        — readline interface (optional, for non-interactive fallback)
 * @returns {Promise<boolean>}
 *
 * Behavior:
 *   auto    → always true
 *   ask     → ask once, wait for "go"/"yes"/"y"
 *   confirm → always ask (same as ask but semantically distinct)
 */
async function check(question, ctx = {}, rl = null) {
  const level = getLevel();
  if (level === 'auto') return true;

  // For ask and confirm, we need user input
  // In HTTP/server context, the caller provides a signal callback
  // In CLI context, we use readline
  if (ctx.onAsk) {
    // Server/extension context — callback returns Promise<boolean>
    try {
      return await ctx.onAsk(question, ctx);
    } catch (e) {
      // If the ask callback fails, default to safe behavior: deny
      return false;
    }
  }

  // CLI context — use readline
  const input = rl || _defaultRL();
  if (!input) return true; // non-interactive, allow by default (safe for read-only ops)

  const prefix = level === 'confirm' ? '🔒' : '📋';
  const prompt = `${prefix} ${question}`;
  const hint = level === 'ask' ? ' (go/cancel): ' : ' (yes/no): ';

  return new Promise((resolve) => {
    input.question(prompt + hint, (answer) => {
      const a = (answer || '').trim().toLowerCase();
      resolve(['go', 'yes', 'y', 'ok', 'continue'].includes(a));
    });
  });
}

/**
 * Ask for permission for a batch of steps (ask mode only).
 * Shows the full plan and waits for a single "go".
 *
 * @param {string} plan    — full plan text
 * @param {object} ctx     — optional context
 * @param {object} rl      — readline interface
 * @returns {Promise<boolean>}
 */
async function checkPlan(plan, ctx = {}, rl = null) {
  const level = getLevel();
  if (level === 'auto') return true;
  if (level === 'confirm') return true; // confirm mode handles per-step

  // ask mode — show plan, wait for go
  const input = rl || _defaultRL();
  if (!input) return true;

  return new Promise((resolve) => {
    input.question(`\n📋 Here's the plan:\n${plan}\n\nOK to proceed? (go/cancel): `, (answer) => {
      const a = (answer || '').trim().toLowerCase();
      resolve(['go', 'yes', 'y', 'ok'].includes(a));
    });
  });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

let _rlInstance = null;
function _defaultRL() {
  if (!_rlInstance) {
    try {
      _rlInstance = readline.createInterface({ input: process.stdin, output: process.stdout });
    } catch (e) { return null; }
  }
  return _rlInstance;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'get':
      console.log(`Current autonomy level: "${getLevel()}"`);
      break;
    case 'set':
      if (!args[1]) { console.log('Usage: autonomy set <auto|ask|confirm>'); break; }
      try {
        setLevel(args[1]);
        console.log(`✅ Autonomy level set to "${args[1]}"`);
      } catch (e) { console.error(`❌ ${e.message}`); }
      break;
    default:
      console.log(`
🐯 Autonomy Level Control

  get                     Show current level
  set <level>             Set level (auto, ask, confirm)

Levels:
  auto     — Execute without asking
  ask      — Show plan, wait for "go"  (default)
  confirm  — Ask before each step
`);
  }
}

module.exports = {
  getLevel,
  setLevel,
  check,
  checkPlan,
  main
};

if (require.main === module) main();
