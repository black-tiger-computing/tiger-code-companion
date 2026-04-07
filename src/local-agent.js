#!/usr/bin/env node

/**
 * Tiger Code Pilot - Local Agent
 *
 * Autonomous AI agent that can execute tasks without constant user interaction.
 * Takes a goal, breaks it into steps, and executes them autonomously.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getCoreEngine } = require('./core-engine');

const execAsync = promisify(exec);

const AGENT_DIR = path.join(require('os').homedir(), '.tiger-code-pilot', 'agent');
const TASK_LOG_FILE = path.join(AGENT_DIR, 'task-log.json');

class LocalAgent {
  constructor() {
    this.engine = getCoreEngine();
    this.currentTask = null;
    this.taskSteps = [];
    this.progress = [];
    this.workingDir = process.cwd();
    this.allowedDirs = [this.workingDir];
    this.maxSteps = 50;
    this.stepCount = 0;
    this.onProgress = null; // Callback for progress updates
  }

  async ensureAgentDir() {
    if (!fsSync.existsSync(AGENT_DIR)) {
      await fs.mkdir(AGENT_DIR, { recursive: true });
    }
  }

  async logProgress(step, status, details = null) {
    await this.ensureAgentDir();

    this.progress.push({
      step,
      status,
      details,
      timestamp: new Date().toISOString()
    });

    // Save to log file
    try {
      await fs.writeFile(TASK_LOG_FILE, JSON.stringify(this.progress, null, 2));
    } catch (e) {
      // Ignore logging errors
    }

    if (this.onProgress) {
      this.onProgress({ step, status, details });
    }
  }

  async executeTask(goal, options = {}) {
    this.currentTask = {
      goal,
      startTime: new Date().toISOString(),
      workingDir: options.workingDir || this.workingDir,
      maxSteps: options.maxSteps || this.maxSteps
    };

    this.progress = [];
    this.stepCount = 0;

    await this.logProgress('init', 'starting', `Goal: ${goal}`);

    try {
      // Step 1: Analyze the goal and create a plan
      await this.logProgress('planning', 'analyzing goal');
      const plan = await this.createPlan(goal);
      await this.logProgress('planning', 'complete', `Created ${plan.steps.length} step plan`);

      // Step 2: Execute each step
      for (const step of plan.steps) {
        if (this.stepCount >= this.currentTask.maxSteps) {
          await this.logProgress('error', 'max_steps_reached', `Reached maximum of ${this.currentTask.maxSteps} steps`);
          break;
        }

        await this.logProgress(`step_${this.stepCount + 1}`, 'starting', step.description);

        try {
          const result = await this.executeStep(step);
          await this.logProgress(`step_${this.stepCount + 1}`, 'complete', result.summary);
          this.stepCount++;
        } catch (error) {
          await this.logProgress(`step_${this.stepCount + 1}`, 'error', error.message);

          // Try to recover
          const recovery = await this.handleStepError(step, error);
          if (recovery.retry) {
            await this.logProgress(`step_${this.stepCount + 1}`, 'retrying', recovery.reason);
            try {
              const result = await this.executeStep(step, recovery.context);
              await this.logProgress(`step_${this.stepCount + 1}`, 'complete_after_retry', result.summary);
              this.stepCount++;
            } catch (retryError) {
              await this.logProgress(`step_${this.stepCount + 1}`, 'failed', retryError.message);
              if (!recovery.continueOnError) {
                throw new Error(`Step failed after retry: ${step.description}`);
              }
            }
          } else if (!recovery.continueOnError) {
            throw error;
          }
        }
      }

      // Step 3: Verify the work
      await this.logProgress('verification', 'checking results');
      const verification = await this.verifyGoalAchieved(goal);

      if (verification.achieved) {
        await this.logProgress('complete', 'success', verification.summary);
      } else {
        await this.logProgress('complete', 'partial', verification.summary);
      }

      return {
        success: verification.achieved,
        summary: verification.summary,
        steps: this.stepCount,
        progress: this.progress
      };
    } catch (error) {
      await this.logProgress('error', 'failed', error.message);
      throw error;
    }
  }

  async createPlan(goal) {
    const context = await this.gatherContext();

    const prompt = `You are planning how to achieve this goal:

Goal: ${goal}

Current Working Directory: ${this.workingDir}
${context ? `Context:\n${context}\n` : ''}

Create a step-by-step plan. Each step should be:
1. Specific and actionable
2. Independent when possible
3. Testable/verifiable

Return the plan as a JSON array of steps like:
[
  {
    "action": "read_file" | "write_file" | "modify_file" | "run_command" | "analyze",
    "description": "What this step does",
    "target": "File path or description",
    "details": "Specific instructions",
    "verify": "How to verify this step succeeded"
  }
]

Only include these actions:
- read_file: Read existing code
- write_file: Create new files
- modify_file: Edit existing files
- run_command: Run safe commands (tests, lint, git)
- analyze: Think about what's been done

Provide ONLY the JSON array, no other text.`;

    const response = await this.engine.callAI([{ role: 'user', content: prompt }], {
      temperature: 0.3
    });

    // Parse the JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Agent failed to create valid plan');
    }

    const steps = JSON.parse(jsonMatch[0]);
    return { steps };
  }

  async gatherContext() {
    let context = '';

    try {
      // Get directory structure
      const { stdout } = await execAsync('ls -la', { cwd: this.workingDir });
      context += `Directory listing:\n${stdout}\n\n`;

      // Try to read common files for context
      const commonFiles = ['package.json', 'README.md', 'tsconfig.json', '.gitignore'];
      for (const file of commonFiles) {
        try {
          const content = await fs.readFile(path.join(this.workingDir, file), 'utf8');
          context += `\n--- ${file} ---\n${content.substring(0, 500)}...\n`;
        } catch (e) {
          // File doesn't exist, skip
        }
      }
    } catch (e) {
      // Ignore context gathering errors
    }

    return context;
  }

  async executeStep(step, context = {}) {
    switch (step.action) {
      case 'read_file':
        return await this.readFile(step);
      case 'write_file':
        return await this.writeFile(step);
      case 'modify_file':
        return await this.modifyFile(step, context);
      case 'run_command':
        return await this.runCommand(step);
      case 'analyze':
        return await this.analyzeStep(step);
      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  async readFile(step) {
    const filePath = path.join(this.workingDir, step.target);

    // Security check
    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: ${step.target}`);
    }

    const content = await fs.readFile(filePath, 'utf8');
    return {
      summary: `Read ${step.target} (${content.length} chars)`,
      content
    };
  }

  async writeFile(step) {
    const filePath = path.join(this.workingDir, step.target);

    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: ${step.target}`);
    }

    // Create directory if needed
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, step.details, 'utf8');
    return {
      summary: `Created ${step.target}`
    };
  }

  async modifyFile(step, context) {
    const filePath = path.join(this.workingDir, step.target);

    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: ${step.target}`);
    }

    // Read current content
    const currentContent = await fs.readFile(filePath, 'utf8');

    // Ask AI to generate modified content
    const prompt = `Modify this file according to the instructions:

File: ${step.target}

Current Content:
\`\`\`
${currentContent.substring(0, 8000)}
\`\`\`

Instructions:
${step.details}

Provide the COMPLETE modified file content. Return only the code, no explanations.`;

    const newContent = await this.engine.callAI([{ role: 'user', content: prompt }], {
      temperature: 0.3
    });

    // Write the modified content
    await fs.writeFile(filePath, newContent, 'utf8');
    return {
      summary: `Modified ${step.target}`
    };
  }

  async runCommand(step) {
    // Only allow safe commands
    const allowedCommands = ['npm', 'npx', 'node', 'git', 'ls', 'cat', 'echo', 'test', 'jest', 'mocha'];
    const command = step.details;
    const baseCommand = command.split(' ')[0];

    if (!allowedCommands.includes(baseCommand)) {
      throw new Error(`Command not allowed: ${baseCommand}. Allowed: ${allowedCommands.join(', ')}`);
    }

    // Block dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf/,
      /sudo/,
      /chmod\s+[777]/,
      />\/dev\/null/,
      /\|\s*sh/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Dangerous command pattern detected: ${command}`);
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDir,
        timeout: 120000
      });

      return {
        summary: `Ran: ${command}`,
        output: stdout,
        errors: stderr
      };
    } catch (error) {
      throw new Error(`Command failed: ${error.message}\n${error.stderr}`);
    }
  }

  async analyzeStep(step) {
    // This is a thinking step - AI analyzes what's been done
    const context = await this.gatherContext();

    const prompt = `Analyze the current state and what's been accomplished:

Goal: ${this.currentTask.goal}
Current Step: ${step.description}

Context:
${context}

Provide a summary of:
1. What's been completed so far
2. What still needs to be done
3. Any issues or concerns
4. Recommendations for next steps`;

    const analysis = await this.engine.callAI([{ role: 'user', content: prompt }], {
      temperature: 0.5
    });

    return {
      summary: 'Analysis complete',
      analysis
    };
  }

  async handleStepError(step, error) {
    const prompt = `A step failed while executing a task.

Goal: ${this.currentTask.goal}
Failed Step: ${step.description}
Action: ${step.action}
Error: ${error.message}

Should we:
1. Retry with modifications?
2. Skip this step and continue?
3. Abort the entire task?

Respond with JSON:
{
  "retry": true/false,
  "continueOnError": true/false,
  "reason": "Why this choice",
  "context": "Any modifications for retry"
}`;

    const response = await this.engine.callAI([{ role: 'user', content: prompt }], {
      temperature: 0.3
    });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {}

    // Default: don't retry
    return { retry: false, continueOnError: false };
  }

  async verifyGoalAchieved(goal) {
    const context = await this.gatherContext();

    const prompt = `Verify if the goal has been achieved.

Goal: ${goal}

Current State:
${context}

Respond with JSON:
{
  "achieved": true/false,
  "summary": "Brief summary of what was accomplished",
  "missing": "What's still missing (if anything)"
}`;

    const response = await this.engine.callAI([{ role: 'user', content: prompt }], {
      temperature: 0.3
    });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {}

    return {
      achieved: false,
      summary: 'Verification failed to parse',
      missing: 'Unknown'
    };
  }

  isPathAllowed(filePath) {
    const normalized = path.normalize(filePath);

    // Check if path is within allowed directories
    for (const allowedDir of this.allowedDirs) {
      if (normalized.startsWith(allowedDir)) {
        return true;
      }
    }

    return false;
  }
}

// Export
module.exports = { LocalAgent };
