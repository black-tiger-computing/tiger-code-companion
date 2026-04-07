#!/usr/bin/env node

/**
 * Tiger Code Pilot - Concept to Reality Session
 * 
 * Interactive session where user describes what they want,
 * and the system autonomously builds it.
 */

const readline = require('readline');
const { LocalAgent } = require('./local-agent');
const { getCoreEngine } = require('./core-engine');

class ConceptToRealitySession {
  constructor() {
    this.agent = new LocalAgent();
    this.engine = getCoreEngine();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.sessionActive = false;
  }

  COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };

  log(msg, color = 'reset') {
    console.log(`${this.COLORS[color]}${msg}${this.COLORS.reset}`);
  }

  async start() {
    this.sessionActive = true;
    
    this.log('\n🐯 Tiger Code Pilot - Concept to Reality Session', 'cyan');
    this.log('━'.repeat(60), 'bright');
    this.log('Describe what you want to build, and I\'ll create it autonomously.', 'blue');
    this.log('I\'ll ask clarifying questions, then get to work!', 'blue');
    this.log('');

    // Step 1: Get the initial concept
    this.log('What would you like to build?', 'magenta');
    const concept = await this.prompt('You: ');

    if (!concept || concept.toLowerCase() === 'exit') {
      this.endSession();
      return;
    }

    // Step 2: Ask clarifying questions
    this.log('\n🤔 Let me ask some questions to understand better...\n', 'yellow');
    const clarifications = await this.askClarifyingQuestions(concept);

    // Step 3: Create a refined specification
    this.log('\n📋 Creating specification...\n', 'cyan');
    const spec = await this.createSpec(concept, clarifications);
    this.log(spec, 'blue');
    this.log('');

    // Step 4: Confirm and start building
    const confirmed = await this.confirm('Ready to build this? (yes/no): ');
    
    if (confirmed.toLowerCase() !== 'yes' && confirmed.toLowerCase() !== 'y') {
      this.log('OK! Let me know what you\'d like to change.', 'yellow');
      this.endSession();
      return;
    }

    // Step 5: Execute the build
    this.log('\n🚀 Starting autonomous build...\n', 'green');
    this.log('I\'ll work through this step-by-step. You can watch the progress.\n', 'blue');

    // Set up progress handler
    this.agent.onProgress = (progress) => {
      const icon = progress.status === 'complete' ? '✅' : 
                   progress.status === 'error' ? '❌' :
                   progress.status === 'starting' ? '🔄' :
                   progress.status === 'retrying' ? '🔁' : '⏳';
      this.log(`${icon} ${progress.step}: ${progress.status}`, progress.status === 'error' ? 'red' : 'green');
      if (progress.details) {
        this.log(`   ${progress.details}`, 'blue');
      }
    };

    try {
      const result = await this.agent.executeTask(spec, {
        maxSteps: 100
      });

      this.log('\n' + '━'.repeat(60), 'bright');
      if (result.success) {
        this.log('🎉 Build Complete!', 'green');
      } else {
        this.log('⚠️  Build Partially Complete', 'yellow');
      }
      this.log(`Steps executed: ${result.steps}`, 'blue');
      this.log(`Summary: ${result.summary}`, 'blue');
      this.log('━'.repeat(60), 'bright');

    } catch (error) {
      this.log(`\n❌ Build failed: ${error.message}`, 'red');
    }

    this.endSession();
  }

  async askClarifyingQuestions(concept) {
    const clarifications = {};
    
    // AI generates clarifying questions based on the concept
    const questionsPrompt = `A user wants to build: ${concept}

Generate 3-5 clarifying questions to understand what they want. Focus on:
1. Core features and functionality
2. Technology preferences
3. Scope and complexity
4. UI/UX expectations
5. Integration needs

Return questions as a JSON array like:
["Question 1?", "Question 2?", "Question 3?"]

Only return the JSON array, no other text.`;

    const response = await this.engine.callAI([{ role: 'user', content: questionsPrompt }], {
      temperature: 0.7
    });

    let questions = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      questions = [
        'What are the core features you need?',
        'Any preferred technology stack?',
        'Should this be web, mobile, or desktop?',
        'Do you need a database or API?',
        'Any specific UI requirements?'
      ];
    }

    for (const question of questions) {
      this.log(`❓ ${question}`, 'yellow');
      const answer = await this.prompt('You: ');
      if (answer && answer.toLowerCase() !== 'skip') {
        clarifications[question] = answer;
      }
    }

    return clarifications;
  }

  async createSpec(concept, clarifications) {
    const specPrompt = `Create a detailed specification for building this:

Concept: ${concept}

Clarifications:
${Object.entries(clarifications).map(([q, a]) => `- ${q}\n  Answer: ${a}`).join('\n')}

Create a SPEC document with:

# Project Name
[Name]

## Overview
[Brief description]

## Core Features
1. [Feature 1]
2. [Feature 2]
3. [Feature 3]

## Technical Stack
- Language: 
- Framework: 
- Database: 
- Other: 

## File Structure
[src/
  ...
]

## Implementation Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

Return the formatted spec document.`;

    const spec = await this.engine.callAI([{ role: 'user', content: specPrompt }], {
      temperature: 0.7
    });

    return spec;
  }

  prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  confirm(question) {
    return this.prompt(question);
  }

  endSession() {
    this.sessionActive = false;
    this.rl.close();
    this.log('\n👋 Session ended. Run again anytime you want to build something!', 'cyan');
  }
}

// CLI integration
async function main() {
  const session = new ConceptToRealitySession();
  await session.start();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { ConceptToRealitySession };
