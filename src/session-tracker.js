#!/usr/bin/env node

/**
 * Tiger Code Pilot — Session Tracker
 *
 * Manages chat sessions with model pinning per conversation.
 * Each session locks its model/provider at creation time so
 * every message in that session uses the same model regardless
 * of global config changes.
 *
 * Storage: ~/.tiger-code-pilot/sessions.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CONFIG_DIR = path.join(os.homedir(), '.tiger-code-pilot');
const SESSIONS_FILE = path.join(CONFIG_DIR, 'sessions.json');

// ─── Storage ──────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadSessions() {
  ensureDir();
  try {
    if (fs.existsSync(SESSIONS_FILE)) return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch (e) { /* corrupt — start fresh */ }
  return {};
}

function saveSessions(sessions) {
  ensureDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Create a new session with a pinned model/provider.
 * @param {object} opts
 * @param {string} opts.provider  — e.g. "openai", "ollama", "huggingface"
 * @param {string} opts.model     — e.g. "gpt-4o-mini", "llama3.2"
 * @returns {object} session info including sessionId
 */
function createSession(opts = {}) {
  const sessionId = crypto.randomBytes(8).toString('hex'); // e.g. "a1b2c3d4e5f6a7b8"
  const session = {
    session_id: sessionId,
    provider: opts.provider || 'default',
    model: opts.model || 'default',
    created_at: new Date().toISOString(),
    message_count: 0
  };

  const sessions = loadSessions();
  sessions[sessionId] = session;
  saveSessions(sessions);

  return session;
}

/**
 * Get session info (increments message_count if touch=true).
 * @param {string} sessionId
 * @param {boolean} touch — increment message counter
 * @returns {object|null}
 */
function getSession(sessionId, touch = false) {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) return null;

  if (touch) session.message_count++;
  saveSessions(sessions);
  return session;
}

/**
 * List all sessions with summary info.
 * @returns {Array<object>}
 */
function listSessions() {
  const sessions = loadSessions();
  return Object.values(sessions).map(s => ({
    session_id: s.session_id,
    provider: s.provider,
    model: s.model,
    created_at: s.created_at,
    message_count: s.message_count
  }));
}

/**
 * Delete a session.
 * @param {string} sessionId
 * @returns {boolean}
 */
function deleteSession(sessionId) {
  const sessions = loadSessions();
  if (!sessions[sessionId]) return false;
  delete sessions[sessionId];
  saveSessions(sessions);
  return true;
}

/**
 * Resolve the effective model/provider for a message.
 * If sessionId is provided, returns the session's pinned model.
 * If no sessionId, returns the fallback from opts or defaults.
 *
 * @param {string|null} sessionId
 * @param {object} fallback — { provider, model }
 * @returns {{ provider: string, model: string }}
 */
function resolveModel(sessionId, fallback = {}) {
  if (sessionId) {
    const session = getSession(sessionId);
    if (session && session.provider !== 'default') {
      return { provider: session.provider, model: session.model };
    }
  }
  return {
    provider: fallback.provider || 'default',
    model: fallback.model || 'default'
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'list':
      const sessions = listSessions();
      if (!sessions.length) { console.log('No sessions.'); break; }
      console.log('\n📋 Sessions:\n' + '━'.repeat(60));
      for (const s of sessions) {
        console.log(`  ${s.session_id}  ${s.provider}/${s.model}  msgs:${s.message_count}  ${s.created_at}`);
      }
      break;

    case 'create':
      const provider = args[1] || 'default';
      const model = args[2] || 'default';
      const s = createSession({ provider, model });
      console.log(`✅ Session created: ${s.session_id} (${provider}/${model})`);
      break;

    case 'delete':
      if (!args[1]) { console.log('Usage: session-tracker delete <sessionId>'); break; }
      console.log(deleteSession(args[1]) ? `✅ Deleted ${args[1]}` : `❌ Not found: ${args[1]}`);
      break;

    case 'get':
      if (!args[1]) { console.log('Usage: session-tracker get <sessionId>'); break; }
      const info = getSession(args[1]);
      console.log(info ? JSON.stringify(info, null, 2) : `❌ Not found: ${args[1]}`);
      break;

    default:
      console.log(`
🐯 Session Tracker

  create [provider] [model]   Create new session with pinned model
  list                        List all sessions
  get <sessionId>             Show session details
  delete <sessionId>          Delete a session
`);
  }
}

module.exports = {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  resolveModel,
  loadSessions,
  saveSessions,
  main
};

if (require.main === module) main();
