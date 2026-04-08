#!/usr/bin/env node

/**
 * Tiger Code Pilot - Local Agent
 *
 * Autonomous AI agent. Takes a goal, plans steps, executes them.
 * Supports abort, task condensing, and a full natural language command set.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getCoreEngine } = require('./core-engine');
const { getPluginSystem } = require('./plugin-system');

const execAsync = promisify(exec);

const AGENT_DIR = path.join(os.homedir(), '.tiger-code-pilot', 'agent');
const TASK_LOG_FILE = path.join(AGENT_DIR, 'task-log.json');

// Safe commands — Windows + Unix
const ALLOWED_COMMANDS = new Set([
  'npm', 'npx', 'node', 'git',
  'echo', 'jest', 'mocha', 'vitest',
  // Windows
  'dir', 'type', 'copy', 'move', 'del', 'ren', 'md', 'rd',
  'where', 'tasklist', 'taskkill', 'net', 'ping', 'ipconfig',
  // Unix
  'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch',
  'grep', 'find', 'head', 'tail', 'wc', 'sort', 'pwd',
  'curl', 'wget', 'ssh', 'scp', 'ping', 'ps', 'kill'
]);

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/[^\s]/i,        // rm -rf /something (but allow rm -rf ./local)
  /rm\s+-rf\s+\$HOME/i,         // rm -rf $HOME
  /rm\s+-rf\s+~/,               // rm -rf ~/
  /del\s+\/[sf]\s+[c-z]:/i,     // Windows destructive delete of system drives
  /sudo\s+/i,                    // privilege escalation
  /chmod\s+777\s+\/[^\s]/i,     // world-writable system paths
  /format\s+[c-z]:/i,           // Windows format
  />\s*\/dev\/null/i,           // redirect to /dev/null
  />\s*NUL/i,                   // Windows redirect to NUL
  /\|\s*sh\b/i,                 // pipe to sh
  /\|\s*bash\b/i,               // pipe to bash
  /eval\s*\(/i,                 // eval()
  /exec\s*\(/i,                 // exec()
  /net\s+user/i,                // user management
  /net\s+localgroup/i           // group management
];

// ─── Path safety ──────────────────────────────────────────────────────────────

function safePath(workingDir, target) {
  // Resolve fully, then verify it stays inside workingDir
  const resolved = path.resolve(workingDir, target);
  const base = path.resolve(workingDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path traversal blocked: "${target}" resolves outside working directory`);
  }
  return resolved;
}

// ─── Context gathering (pure Node.js, Windows safe) ──────────────────────────

async function gatherContext(workingDir, depth = 2) {
  const lines = [];

  async function walk(dir, currentDepth) {
    if (currentDepth > depth) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (e) { return; }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const indent = '  '.repeat(currentDepth);
      lines.push(`${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), currentDepth + 1);
    }
  }

  await walk(workingDir, 0);

  const summary = [`Directory: ${workingDir}`, 'Structure:', ...lines, ''];

  // Read key files fully
  const keyFiles = ['package.json', 'tsconfig.json', 'README.md', '.gitignore'];
  for (const file of keyFiles) {
    try {
      const content = await fs.readFile(path.join(workingDir, file), 'utf8');
      summary.push(`--- ${file} ---`);
      summary.push(content.substring(0, 1000));
      summary.push('');
    } catch (e) { /* file doesn't exist */ }
  }

  // Detect primary language
  const exts = lines.map(l => path.extname(l.trim())).filter(Boolean);
  const extCount = {};
  for (const e of exts) extCount[e] = (extCount[e] || 0) + 1;
  const primary = Object.entries(extCount).sort((a, b) => b[1] - a[1])[0];
  if (primary) summary.push(`Primary language: ${primary[0]}`);

  return summary.join('\n');
}

// ─── LocalAgent ───────────────────────────────────────────────────────────────

class LocalAgent {
  constructor() {
    this.engine = getCoreEngine();
    this.plugins = getPluginSystem();
    this.currentTask = null;
    this.progress = [];
    this.workingDir = process.cwd();
    this.maxSteps = 50;
    this.stepCount = 0;
    this.onProgress = null;
    this._aborted = false;
  }

  // ── Abort ──────────────────────────────────────────────────────────────────

  abort() {
    this._aborted = true;
    this._logSync('abort', 'aborted', 'Task aborted by user');
  }

  _logSync(step, status, details) {
    this.progress.push({ step, status, details, timestamp: new Date().toISOString() });
    if (this.onProgress) this.onProgress({ step, status, details });

    // Emit structured JSON to stderr for extension parsing
    this._emitProgressEvent(step, status, details);
  }

  _emitProgressEvent(step, status, details) {
    const event = {
      type: 'progress',
      step,
      status,
      details: details || '',
      stepCount: this.stepCount,
      timestamp: new Date().toISOString()
    };
    // Write as a single JSON line to stderr — one event per line
    process.stderr.write(JSON.stringify(event) + '\n');
  }

  _emitInitEvent(goal) {
    const event = {
      type: 'init',
      goal,
      timestamp: new Date().toISOString()
    };
    process.stderr.write(JSON.stringify(event) + '\n');
  }

  async logProgress(step, status, details = null) {
    this._logSync(step, status, details);
    try {
      if (!fsSync.existsSync(AGENT_DIR)) await fs.mkdir(AGENT_DIR, { recursive: true });
      await fs.writeFile(TASK_LOG_FILE, JSON.stringify(this.progress, null, 2));
    } catch (e) { /* ignore log errors */ }
  }

  // ── Task execution ─────────────────────────────────────────────────────────

  async executeTask(goal, options = {}) {
    this._aborted = false;
    this.currentTask = {
      goal,
      startTime: new Date().toISOString(),
      workingDir: options.workingDir || this.workingDir,
      maxSteps: options.maxSteps || this.maxSteps
    };
    this.progress = [];
    this.stepCount = 0;

    // Emit task init event for extension
    this._emitInitEvent(goal);

    await this.logProgress('init', 'starting', `Goal: ${goal}`);

    try {
      await this.logProgress('planning', 'analyzing');
      const plan = await this.createPlan(goal);
      await this.logProgress('planning', 'complete', `${plan.steps.length} steps planned`);

      for (const step of plan.steps) {
        if (this._aborted) {
          await this.logProgress('abort', 'stopped', 'Task was aborted');
          return { success: false, summary: 'Aborted by user', steps: this.stepCount, progress: this.progress };
        }
        if (this.stepCount >= this.currentTask.maxSteps) {
          await this.logProgress('error', 'max_steps_reached');
          break;
        }

        await this.logProgress(`step_${this.stepCount + 1}`, 'starting', step.description);

        try {
          const result = await this.executeStep(step);
          await this.logProgress(`step_${this.stepCount + 1}`, 'complete', result.summary);
          this.stepCount++;
        } catch (error) {
          await this.logProgress(`step_${this.stepCount + 1}`, 'error', error.message);
          const recovery = await this.handleStepError(step, error);
          if (recovery.retry) {
            try {
              const result = await this.executeStep(step, recovery.context);
              await this.logProgress(`step_${this.stepCount + 1}`, 'recovered', result.summary);
              this.stepCount++;
            } catch (retryError) {
              await this.logProgress(`step_${this.stepCount + 1}`, 'failed', retryError.message);
              if (!recovery.continueOnError) throw new Error(`Step failed: ${step.description}`);
            }
          } else if (!recovery.continueOnError) {
            throw error;
          }
        }
      }

      const verification = await this.verifyGoalAchieved(goal);
      await this.logProgress('complete', verification.achieved ? 'success' : 'partial', verification.summary);

      return { success: verification.achieved, summary: verification.summary, steps: this.stepCount, progress: this.progress };
    } catch (error) {
      await this.logProgress('error', 'failed', error.message);
      throw error;
    }
  }

  async createPlan(goal) {
    const context = await gatherContext(this.workingDir);
    const prompt = `You are planning how to achieve this goal autonomously.

Goal: ${goal}
Working Directory: ${this.workingDir}

Context:
${context}

Return ONLY a JSON array of steps. Available actions:
- read_file: Read a file (target: path)
- write_file: Create a new file (target: path, details: content)
- modify_file: Edit existing file (target: path, details: instructions)
- run_command: Run a safe command (details: command)
- git_add: Stage files (target: path or "." for all)
- git_commit: Commit changes (details: commit message)
- git_checkout: Switch/create branch (target: branch name)
- analyze: Analyze progress (no target needed)

Example:
[
  {
    "action": "write_file",
    "description": "Create package.json",
    "target": "package.json",
    "details": "{...json content...}",
    "verify": "File exists and is valid JSON"
  }
]

Return ONLY the JSON array, no explanation.`;

    const response = await this.engine.callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
    const match = response.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Agent could not create a valid plan');
    return { steps: JSON.parse(match[0]) };
  }

  async executeStep(step, _context = {}) {
    switch (step.action) {
      case 'read_file':    return await this.readFile(step);
      case 'write_file':   return await this.writeFile(step);
      case 'modify_file':  return await this.modifyFile(step);
      case 'run_command':  return await this.runCommand(step);
      case 'analyze':      return await this.analyzeStep(step);
      case 'git_commit':   return await this.gitCommit(step);
      case 'git_add':      return await this.gitAdd(step);
      case 'git_checkout': return await this.gitCheckout(step);
      default: throw new Error(`Unknown action: ${step.action}`);
    }
  }

  async readFile(step) {
    const filePath = safePath(this.workingDir, step.target);
    const content = await fs.readFile(filePath, 'utf8');
    return { summary: `Read ${step.target} (${content.length} chars)`, content };
  }

  async writeFile(step) {
    const filePath = safePath(this.workingDir, step.target);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, step.details, 'utf8');
    return { summary: `Created ${step.target}` };
  }

  async modifyFile(step) {
    const filePath = safePath(this.workingDir, step.target);
    const current = await fs.readFile(filePath, 'utf8');
    const prompt = `Modify this file:\n\nFile: ${step.target}\n\nCurrent:\n\`\`\`\n${current.substring(0, 8000)}\n\`\`\`\n\nInstructions: ${step.details}\n\nReturn ONLY the complete modified file content.`;
    const newContent = await this.engine.callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
    await fs.writeFile(filePath, newContent, 'utf8');
    return { summary: `Modified ${step.target}` };
  }

  async runCommand(step) {
    const command = step.details.trim();
    const base = command.split(/\s+/)[0].toLowerCase();

    if (!ALLOWED_COMMANDS.has(base)) {
      throw new Error(`Command not allowed: "${base}". Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`);
    }
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) throw new Error(`Dangerous pattern blocked: ${command}`);
    }

    const { stdout, stderr } = await execAsync(command, { cwd: this.workingDir, timeout: 120000 });
    return { summary: `Ran: ${command}`, output: stdout, errors: stderr };
  }

  async analyzeStep(step) {
    const context = await gatherContext(this.workingDir, 1);
    const prompt = `Analyze progress toward the goal.\n\nGoal: ${this.currentTask.goal}\nStep: ${step.description}\n\nContext:\n${context}\n\nSummarise: what's done, what's left, any concerns.`;
    const analysis = await this.engine.callAI([{ role: 'user', content: prompt }], { temperature: 0.5 });
    return { summary: 'Analysis complete', analysis };
  }

  async gitCommit(step) {
    const message = step.details || step.description || 'Auto-commit by Tiger Agent';
    return this.plugins.executeTool('git_commit', { message, cwd: this.workingDir });
  }

  async gitAdd(step) {
    const target = step.target || '.';
    return this.plugins.executeTool('git_add', { path: target, cwd: this.workingDir });
  }

  async gitCheckout(step) {
    return this.plugins.executeTool('git_checkout', {
      branch: step.target,
      create: step.create || false,
      cwd: this.workingDir
    });
  }

  async handleStepError(step, error) {
    const prompt = `A step failed.\n\nGoal: ${this.currentTask.goal}\nStep: ${step.description}\nError: ${error.message}\n\nRespond with JSON only:\n{"retry": true/false, "continueOnError": true/false, "reason": "...", "context": "..."}`;
    const response = await this.engine.callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) { /* fall through */ }
    return { retry: false, continueOnError: false };
  }

  async verifyGoalAchieved(goal) {
    const context = await gatherContext(this.workingDir, 1);
    const prompt = `Verify if the goal was achieved.\n\nGoal: ${goal}\n\nCurrent state:\n${context}\n\nRespond with JSON only:\n{"achieved": true/false, "summary": "...", "missing": "..."}`;
    const response = await this.engine.callAI([{ role: 'user', content: prompt }], { temperature: 0.3 });
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) { /* fall through */ }
    return { achieved: false, summary: 'Verification failed', missing: 'Unknown' };
  }

  // ── Agent commands ─────────────────────────────────────────────────────────

  async showStatus() {
    if (!this.currentTask) return 'No task running.';
    return [
      `Task: ${this.currentTask.goal}`,
      `Steps: ${this.stepCount}/${this.currentTask.maxSteps}`,
      `Status: ${this._aborted ? 'aborted' : 'running'}`,
      `Progress entries: ${this.progress.length}`
    ].join('\n');
  }

  async showLog() {
    try {
      const log = await fs.readFile(TASK_LOG_FILE, 'utf8');
      return log;
    } catch (e) { return 'No task log found.'; }
  }

  async clearLog() {
    try { await fs.writeFile(TASK_LOG_FILE, '[]'); return 'Log cleared.'; }
    catch (e) { return `Could not clear log: ${e.message}`; }
  }
}

// ─── Natural language CLI ─────────────────────────────────────────────────────

const COMMANDS = {
  'run':          { desc: 'Run a task — e.g. "run create a REST API in Express"' },
  'stop':         { desc: 'Stop / abort the current running task' },
  'kill':         { desc: 'Alias for stop' },
  'status':       { desc: 'Show current task status and step count' },
  'log':          { desc: 'Show the full task progress log' },
  'clear log':    { desc: 'Clear the task log file' },
  'condense':     { desc: 'Summarise and compress the current chat session to save context' },
  'chunk':        { desc: 'Alias for condense' },
  'context':      { desc: 'Show the current working directory context (file tree + key files)' },
  'plan':         { desc: 'Show what the agent would plan for a goal without executing — e.g. "plan build a todo app"' },
  'explain':      { desc: 'Ask the agent to explain a file — e.g. "explain src/app.js"' },
  'fix':          { desc: 'Ask the agent to fix a file — e.g. "fix src/app.js"' },
  'refactor':     { desc: 'Ask the agent to refactor a file — e.g. "refactor src/app.js"' },
  'test':         { desc: 'Ask the agent to write tests for a file — e.g. "test src/app.js"' },
  'review':       { desc: 'Ask the agent to review a file — e.g. "review src/app.js"' },
  'generate':     { desc: 'Generate code from a description — e.g. "generate a login form in React"' },
  'ask':          { desc: 'Ask the agent a question — e.g. "ask how do I connect to MongoDB"' },
  'chat':         { desc: 'Start interactive chat with the agent' },
  'help':         { desc: 'Show this command list' },
  'exit':         { desc: 'Exit the agent CLI' }
};

function showHelp() {
  console.log('\n🐯 Tiger Agent — Natural Language Commands\n' + '━'.repeat(50));
  for (const [cmd, info] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(14)} ${info.desc}`);
  }
  console.log('');
}

async function handleCommand(input, agent, rl) {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const engine = getCoreEngine();

  if (!trimmed) return;

  // stop / kill
  if (lower === 'stop' || lower === 'kill') {
    agent.abort();
    console.log('🛑 Task aborted.');
    return;
  }

  // status
  if (lower === 'status') {
    console.log(await agent.showStatus());
    return;
  }

  // log
  if (lower === 'log') {
    console.log(await agent.showLog());
    return;
  }

  // clear log
  if (lower === 'clear log') {
    console.log(await agent.clearLog());
    return;
  }

  // condense / chunk
  if (lower === 'condense' || lower === 'chunk') {
    console.log('⏳ Condensing session...');
    const summary = await engine.condenseSession();
    console.log('✅ Session condensed:\n' + summary);
    return;
  }

  // context
  if (lower === 'context') {
    console.log(await gatherContext(process.cwd()));
    return;
  }

  // help
  if (lower === 'help') {
    showHelp();
    return;
  }

  // exit
  if (lower === 'exit' || lower === 'quit') {
    console.log('👋 Goodbye!');
    rl.close();
    process.exit(0);
  }

  // plan <goal>
  if (lower.startsWith('plan ')) {
    const goal = trimmed.slice(5);
    console.log('🗺️  Planning (no execution)...');
    try {
      const plan = await agent.createPlan(goal);
      plan.steps.forEach((s, i) => console.log(`  ${i + 1}. [${s.action}] ${s.description}`));
    } catch (e) { console.error(`❌ ${e.message}`); }
    return;
  }

  // run <goal>
  if (lower.startsWith('run ')) {
    const goal = trimmed.slice(4);
    console.log(`🚀 Running: ${goal}\n`);
    agent.onProgress = ({ step, status, details }) => {
      const icon = status === 'complete' || status === 'recovered' ? '✅' : status === 'error' || status === 'failed' ? '❌' : status === 'aborted' ? '🛑' : '⏳';
      console.log(`${icon} [${step}] ${status}${details ? ' — ' + details : ''}`);
    };
    try {
      const result = await agent.executeTask(goal);
      console.log(`\n${result.success ? '🎉 Done!' : '⚠️  Partial'} — ${result.summary} (${result.steps} steps)`);
    } catch (e) { console.error(`❌ Task failed: ${e.message}`); }
    return;
  }

  // explain / fix / refactor / test / review <file>
  const fileActions = ['explain', 'fix', 'refactor', 'test', 'review'];
  for (const action of fileActions) {
    if (lower.startsWith(action + ' ')) {
      const target = trimmed.slice(action.length + 1);
      try {
        const filePath = safePath(process.cwd(), target);
        const code = fsSync.readFileSync(filePath, 'utf8');
        const ext = path.extname(target).slice(1) || 'code';
        console.log(`⏳ ${action.charAt(0).toUpperCase() + action.slice(1)}ing ${target}...`);
        const actionMap = { explain: 'explain', fix: 'debug', refactor: 'refactor', test: 'test', review: 'analyze' };
        let result;
        if (action === 'review') {
          result = await engine.analyze(code, ext, 'general');
        } else {
          result = await engine.vibecode(actionMap[action], { code, language: ext });
        }
        console.log('\n' + result);
      } catch (e) { console.error(`❌ ${e.message}`); }
      return;
    }
  }

  // generate <description>
  if (lower.startsWith('generate ')) {
    const description = trimmed.slice(9);
    console.log('⏳ Generating...');
    try {
      const result = await engine.vibecode('generate', { description });
      console.log('\n' + result);
    } catch (e) { console.error(`❌ ${e.message}`); }
    return;
  }

  // ask <question> or chat — just send to engine.chat
  if (lower.startsWith('ask ') || lower === 'chat') {
    const message = lower.startsWith('ask ') ? trimmed.slice(4) : null;
    if (message) {
      console.log('⏳ Thinking...');
      try { console.log('\n' + await engine.chat(message)); }
      catch (e) { console.error(`❌ ${e.message}`); }
      return;
    }
    // interactive chat mode
    console.log('💬 Chat mode — type "exit" to return to agent\n');
    const chatLoop = () => {
      rl.question('You: ', async (msg) => {
        if (msg.toLowerCase() === 'exit') { console.log('↩️  Back to agent\n'); return; }
        try { console.log('\n🐯 ' + await engine.chat(msg) + '\n'); }
        catch (e) { console.error(`❌ ${e.message}\n`); }
        chatLoop();
      });
    };
    chatLoop();
    return;
  }

  // Anything else — treat as a natural language task
  console.log(`🤔 Treating as task: "${trimmed}"\n`);
  agent.onProgress = ({ step, status, details }) => {
    const icon = status.includes('complete') || status === 'recovered' ? '✅' : status === 'error' || status === 'failed' ? '❌' : '⏳';
    console.log(`${icon} [${step}] ${status}${details ? ' — ' + details : ''}`);
  };
  try {
    const result = await agent.executeTask(trimmed);
    console.log(`\n${result.success ? '🎉 Done!' : '⚠️  Partial'} — ${result.summary}`);
  } catch (e) { console.error(`❌ ${e.message}`); }
}

async function main() {
  const agent = new LocalAgent();
  const args = process.argv.slice(2);

  // Single command mode: tiger-agent run "build a todo app"
  if (args.length > 0) {
    const input = args.join(' ');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await handleCommand(input, agent, rl);
    rl.close();
    return;
  }

  // Interactive REPL
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('🐯 Tiger Agent — type "help" for commands\n');

  const loop = () => {
    rl.question('agent> ', async (input) => {
      await handleCommand(input, agent, rl);
      loop();
    });
  };
  loop();
}

module.exports = { LocalAgent, gatherContext, safePath };

if (require.main === module) {
  main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
}
