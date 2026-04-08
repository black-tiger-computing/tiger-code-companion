'use strict';

/**
 * ACP (Agent Communication Protocol) Tool Functions
 *
 * Provides tools for inter-agent communication, task delegation,
 * progress broadcasting, and agent coordination within the Tiger Code Pilot platform.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ACP_DIR = path.join(os.homedir(), '.tiger-code-pilot', 'acp');
const ACP_QUEUE_FILE = path.join(ACP_DIR, 'message-queue.json');
const ACP_AGENTS_FILE = path.join(ACP_DIR, 'registered-agents.json');

function ensureAcpDir() {
  if (!fs.existsSync(ACP_DIR)) fs.mkdirSync(ACP_DIR, { recursive: true });
}

// ─── Message Queue ────────────────────────────────────────────────────────────

function readQueue() {
  try {
    if (fs.existsSync(ACP_QUEUE_FILE)) return JSON.parse(fs.readFileSync(ACP_QUEUE_FILE, 'utf8'));
  } catch (e) { /* corrupt — start fresh */ }
  return [];
}

function writeQueue(queue) {
  ensureAcpDir();
  // Cap at 500 messages
  fs.writeFileSync(ACP_QUEUE_FILE, JSON.stringify(queue.slice(-500), null, 2));
}

function enqueueMessage(msg) {
  const queue = readQueue();
  queue.push({ ...msg, timestamp: new Date().toISOString(), status: 'pending' });
  writeQueue(queue);
  return queue.length - 1;
}

function dequeueMessage(filter = {}) {
  const queue = readQueue();
  const idx = queue.findIndex(m => {
    if (m.status !== 'pending') return false;
    if (filter.to && m.to !== filter.to) return false;
    if (filter.type && m.type !== filter.type) return false;
    return true;
  });
  if (idx === -1) return null;
  queue[idx].status = 'delivered';
  queue[idx].deliveredAt = new Date().toISOString();
  writeQueue(queue);
  return queue[idx];
}

// ─── Agent Registry ───────────────────────────────────────────────────────────

function readAgents() {
  try {
    if (fs.existsSync(ACP_AGENTS_FILE)) return JSON.parse(fs.readFileSync(ACP_AGENTS_FILE, 'utf8'));
  } catch (e) { /* corrupt */ }
  return {};
}

function writeAgents(agents) {
  ensureAcpDir();
  fs.writeFileSync(ACP_AGENTS_FILE, JSON.stringify(agents, null, 2));
}

function registerAgent(agentId, meta) {
  const agents = readAgents();
  agents[agentId] = { ...meta, registeredAt: new Date().toISOString(), status: 'active' };
  writeAgents(agents);
  return agents[agentId];
}

function unregisterAgent(agentId) {
  const agents = readAgents();
  if (agents[agentId]) {
    agents[agentId].status = 'unregistered';
    agents[agentId].unregisteredAt = new Date().toISOString();
    writeAgents(agents);
    return true;
  }
  return false;
}

function listAgents() {
  return Object.entries(readAgents())
    .filter(([, meta]) => meta.status === 'active')
    .map(([id, meta]) => ({ id, ...meta }));
}

// ─── ACP Plugin ───────────────────────────────────────────────────────────────

const acpPlugin = {
  name: 'acp',
  version: '1.0.0',
  description: 'Agent Communication Protocol — inter-agent messaging, task delegation, and coordination',
  tools: [
    {
      name: 'acp_send',
      description: 'Send a message to another agent or process',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Target agent or recipient ID' },
          type: { type: 'string', enum: ['task', 'status', 'data', 'signal'], description: 'Message type' },
          payload: { type: 'object', description: 'Message content' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }
        },
        required: ['to', 'type', 'payload']
      },
      handler: async (args) => {
        const idx = enqueueMessage({
          to: args.to,
          type: args.type,
          payload: args.payload,
          priority: args.priority || 'normal',
          from: args.from || 'tiger-code-pilot'
        });
        return `Message queued at index ${idx}, awaiting delivery to "${args.to}"`;
      }
    },
    {
      name: 'acp_receive',
      description: 'Receive the next pending message for this agent',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Agent ID to receive for' },
          type: { type: 'string', description: 'Filter by message type' }
        }
      },
      handler: async (args) => {
        const msg = dequeueMessage({ to: args.to, type: args.type });
        if (!msg) return 'No pending messages';
        return JSON.stringify(msg, null, 2);
      }
    },
    {
      name: 'acp_register',
      description: 'Register an agent with the ACP system',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Unique agent identifier' },
          capabilities: { type: 'array', items: { type: 'string' }, description: 'List of agent capabilities' },
          endpoint: { type: 'string', description: 'Agent communication endpoint URL' }
        },
        required: ['agent_id']
      },
      handler: async (args) => {
        const meta = registerAgent(args.agent_id, {
          capabilities: args.capabilities || [],
          endpoint: args.endpoint || null
        });
        return `Agent "${args.agent_id}" registered with capabilities: ${meta.capabilities.join(', ') || 'none specified'}`;
      }
    },
    {
      name: 'acp_list_agents',
      description: 'List all active registered agents',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const agents = listAgents();
        if (!agents.length) return 'No agents registered';
        return agents.map(a => `${a.id}: ${a.capabilities?.join(', ') || 'general'} [${a.endpoint || 'local'}]`).join('\n');
      }
    },
    {
      name: 'acp_queue_status',
      description: 'Show message queue statistics',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const queue = readQueue();
        const pending = queue.filter(m => m.status === 'pending').length;
        const delivered = queue.filter(m => m.status === 'delivered').length;
        return `Queue: ${queue.length} total, ${pending} pending, ${delivered} delivered`;
      }
    },
    {
      name: 'acp_broadcast',
      description: 'Send a message to all registered agents',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Message type' },
          payload: { type: 'object', description: 'Message content' }
        },
        required: ['type', 'payload']
      },
      handler: async (args) => {
        const agents = listAgents();
        let count = 0;
        for (const agent of agents) {
          enqueueMessage({
            to: agent.id,
            type: args.type,
            payload: args.payload,
            from: 'broadcast',
            priority: 'normal'
          });
          count++;
        }
        return `Broadcast sent to ${count} agent(s)`;
      }
    }
  ]
};

module.exports = {
  acpPlugin,
  enqueueMessage,
  dequeueMessage,
  registerAgent,
  unregisterAgent,
  listAgents,
  readQueue,
  ACP_DIR,
  ACP_QUEUE_FILE,
  ACP_AGENTS_FILE
};
