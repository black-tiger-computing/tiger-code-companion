#!/usr/bin/env node

/**
 * Tiger Code Pilot - Concept to Reality Session
 *
 * Interactive session: describe what you want → clarify → spec → build.
 * Supports abort mid-build via Ctrl+C or the agent "stop" command.
 */

const readline = require('readline');
const { LocalAgent } = require('./local-agent');
const { getCoreEngine } = require('./core-engine');

const C = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${C[color] || ''}${msg}${C.reset}`);
}

class ConceptToRealitySession {
  constructor() {
    this.agent = new LocalAgent();
    this.engine = getCoreEngine();
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    this._aborted = false;

    // Wire Ctrl+C to abort the agent mid-build
    process.on('SIGINT', () => {
      if (this.agent && !this._aborted) {
        this._aborted = true;
        this.agent.abort();
        log('\n🛑 Build aborted.', 'red');
        this.endSession();
      }
    });
  }

  prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => resolve(answer.trim()));
    });
  }

  async start() {
    log('\n🐯 Tiger Code Pilot — Concept to Reality', 'cyan');
    log('━'.repeat(60), 'bright');
    log('Describe what you want to build. I\'ll ask a few questions,', 'blue');
    log('create a spec, confirm with you, then build it autonomously.', 'blue');
    log('Press Ctrl+C at any time to abort.\n', 'yellow');

    // Step 1: Get concept
    log('What would you like to build?', 'magenta');
    const concept = await this.prompt('You: ');
    if (!concept || concept.toLowerCase() === 'exit') { this.endSession(); return; }

    // Step 2: Clarify
    log('\n🤔 Let me ask a few questions...\n', 'yellow');
    const clarifications = await this.askClarifyingQuestions(concept);

    // Step 3: Spec
    log('\n📋 Creating specification...\n', 'cyan');
    let spec;
    try {
      spec = await this.createSpec(concept, clarifications);
    } catch (e) {
      log(`❌ Failed to create spec: ${e.message}`, 'red');
      this.endSession(); return;
    }
    log(spec, 'blue');
    log('');

    // Step 4: Confirm
    const confirmed = await this.prompt('Ready to build this? (yes/no): ');
    if (!['yes', 'y'].includes(confirmed.toLowerCase())) {
      log('OK — run again when you\'re ready.', 'yellow');
      this.endSession(); return;
    }

    // Step 5: Build
    log('\n🚀 Starting autonomous build...\n', 'green');

    this.agent.onProgress = ({ step, status, details }) => {
      const icon = status.includes('complete') || status === 'recovered' ? '✅'
        : status === 'error' || status === 'failed' ? '❌'
        : status === 'aborted' ? '🛑'
        : status === 'retrying' ? '🔁' : '⏳';
      log(`${icon} [${step}] ${status}${details ? ' — ' + details : ''}`,
        status.includes('error') || status === 'failed' ? 'red' : 'green');
    };

    try {
      const result = await this.agent.executeTask(spec, { maxSteps: 100 });
      log('\n' + '━'.repeat(60), 'bright');
      log(result.success ? '🎉 Build Complete!' : '⚠️  Build Partially Complete',
        result.success ? 'green' : 'yellow');
      log(`Steps: ${result.steps}`, 'blue');
      log(`Summary: ${result.summary}`, 'blue');
      log('━'.repeat(60), 'bright');
    } catch (e) {
      log(`\n❌ Build failed: ${e.message}`, 'red');
    }

    this.endSession();
  }

  async askClarifyingQuestions(concept) {
    const clarifications = {};

    let questions;
    try {
      const response = await this.engine.callAI([{
        role: 'user',
        content: `A user wants to build: ${concept}\n\nGenerate 3-5 clarifying questions covering features, tech stack, scope, UI, and integrations.\n\nReturn ONLY a JSON array: ["Question 1?", "Question 2?"]`
      }], { temperature: 0.7 });

      const match = response.match(/\[[\s\S]*\]/);
      questions = match ? JSON.parse(match[0]) : null;
    } catch (e) { questions = null; }

    if (!questions || !questions.length) {
      questions = [
        'What are the core features you need?',
        'Any preferred technology stack?',
        'Web, mobile, or desktop?',
        'Do you need a database or external API?',
        'Any specific UI or styling requirements?'
      ];
    }

    for (const question of questions) {
      if (this._aborted) break;
      log(`❓ ${question}`, 'yellow');
      const answer = await this.prompt('You: ');
      if (answer && answer.toLowerCase() !== 'skip') {
        clarifications[question] = answer;
      }
    }

    return clarifications;
  }

  async createSpec(concept, clarifications) {
    const clarificationText = Object.entries(clarifications)
      .map(([q, a]) => `- ${q}\n  Answer: ${a}`)
      .join('\n');

    const response = await this.engine.callAI([{
      role: 'user',
      content: `Create a detailed build specification.

Concept: ${concept}

Clarifications:
${clarificationText}

Format the spec as:

# Project Name

## Overview
[Brief description]

## Core Features
1. [Feature]
2. [Feature]

## Technical Stack
- Language:
- Framework:
- Database:
- Other:

## File Structure
\`\`\`
[tree]
\`\`\`

## Implementation Steps
1. [Step]
2. [Step]

Return the formatted spec only.`
    }], { temperature: 0.7 });

    return response;
  }

  endSession() {
    this.rl.close();
    log('\n👋 Session ended. Run again anytime!', 'cyan');
    process.exit(0);
  }
}

async function main() {
  const session = new ConceptToRealitySession();
  await session.start();
}

if (require.main === module) {
  main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
}

module.exports = { ConceptToRealitySession };
