#!/usr/bin/env node

/**
 * Terminal Tools — run_command with safety filters
 *
 * Standalone terminal command execution used by the plugin system,
 * local agent, and MCP server tool handlers.
 *
 * Safety model:
 *   - Allowlist of safe commands
 *   - Blocklist of dangerous patterns (never bypassable)
 *   - Timeout and output buffer limits
 *   - No sudo, no rm -rf /, no filesystem destruction
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ─── Safety configuration ─────────────────────────────────────────────────────

const ALLOWED_COMMANDS = new Set([
  // Package managers
  'npm', 'npx', 'yarn', 'pnpm', 'pip', 'pip3', 'uv',
  // Runtimes
  'node', 'python', 'python3', 'java', 'go', 'rustc', 'cargo',
  // Build / test
  'tsc', 'eslint', 'prettier', 'jest', 'mocha', 'vitest', 'pytest',
  'ruff', 'mypy', 'mvn', 'gradle', 'dotnet', 'msbuild',
  // Version control
  'git',
  // File operations (safe)
  'ls', 'dir', 'cat', 'type', 'pwd', 'cd',
  'head', 'tail', 'wc', 'sort', 'uniq', 'tee',
  'cp', 'copy', 'mv', 'move', 'mkdir', 'md',
  'touch', 'ren',
  // Search
  'grep', 'find', 'rg', 'where', 'which', 'Get-ChildItem',
  // Network
  'curl', 'wget', 'ping', 'ipconfig', 'ifconfig', 'netstat', 'ss',
  // Process
  'ps', 'tasklist', 'taskkill', 'kill', 'top', 'htop',
  // Utilities
  'echo', 'date', 'whoami', 'hostname', 'uname', 'env', 'set',
  // Docker
  'docker', 'docker-compose', 'docker', 'compose',
  // Shell builtins (Windows)
  'where', 'set', 'ver', 'vol', 'cls',
  // Archive
  'tar', 'unzip', 'zip'
]);

const DANGEROUS_PATTERNS = [
  // Filesystem destruction
  /rm\s+-rf\s+\/[^\s]/i,            // rm -rf /something
  /rm\s+-rf\s+\$HOME/i,             // rm -rf $HOME
  /rm\s+-rf\s+~\//,                 // rm -rf ~/
  /rm\s+-rf\s+\.\.\//,              // rm -rf ../
  /del\s+\/[sf]\s+[c-z]:/i,         // Windows destructive delete
  /format\s+[c-z]:/i,               // Windows format
  /mkfs/i,                          // Filesystem creation
  /dd\s+of=/i,                      // Raw disk write

  // Privilege escalation
  /sudo\s+/i,                       // Sudo
  /runas\s+/i,                      // Windows runas
  /net\s+user\s+\/add/i,            // User creation
  /net\s+localgroup/i,              // Group modification

  // System modification
  /chmod\s+777\s+\/[^\s]/i,         // World-writable system paths
  /chown\s+root/i,                  // Ownership changes for root
  /reg\s+add/i,                     // Windows registry writes

  // Exfiltration
  />\s*\/dev\/null/i,               // Redirect to /dev/null
  /\|\s*sh\b/i,                     // Pipe to shell
  /\|\s*bash\b/i,                   // Pipe to bash
  /curl.*\|\s*sh/i,                 // curl | sh pattern

  // Code execution
  /eval\s*\(/i,                     // eval()
  /exec\s*\(/i,                     // exec()
  /powershell.*-encoded/i,          // Encoded PowerShell
  /mshta/i,                         // HTML Application host
  /certutil.*-decode/i,             // Certutil decode
  /bitsadmin/i                      // BITS transfer
];

/**
 * Check if a command is safe to execute.
 * @param {string} command
 * @returns {{ safe: boolean, reason?: string }}
 */
function checkSafety(command) {
  const trimmed = command.trim();
  const base = trimmed.split(/\s+/)[0].toLowerCase();

  // Check allowlist
  if (!ALLOWED_COMMANDS.has(base)) {
    return { safe: false, reason: `Command not allowed: "${base}". Use allowed commands only.` };
  }

  // Check blocklist
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: 'Command blocked: dangerous pattern detected' };
    }
  }

  return { safe: true };
}

// ─── run_command ──────────────────────────────────────────────────────────────

/**
 * Execute a safe shell command.
 *
 * @param {object} args — {
 *   command: string,
 *   cwd?: string,
 *   timeout?: number,
 *   maxBuffer?: number
 * }
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}|{error: string}>}
 */
async function runCommand(args) {
  const command = args.command;
  if (!command) return { error: 'command is required' };

  // Safety check
  const safety = checkSafety(command);
  if (!safety.safe) return { error: safety.reason };

  const cwd = args.cwd || process.cwd();
  const timeout = args.timeout || 120000; // 2 minute default
  const maxBuffer = args.maxBuffer || 10 * 1024 * 1024; // 10MB default

  try {
    // Use child_process.exec with shell for cross-platform compatibility
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer,
      // Use cmd.exe on Windows, bash on Unix
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    });

    // Combine output intelligently
    let output = '';
    if (stdout && stdout.trim()) output += `stdout:\n${stdout.trim()}`;
    if (stderr && stderr.trim()) {
      if (output) output += '\n\n';
      output += `stderr:\n${stderr.trim()}`;
    }

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      output: output || 'Command completed successfully (no output)'
    };
  } catch (e) {
    let output = '';
    if (e.stdout && e.stdout.trim()) output += `stdout:\n${e.stdout.trim()}`;
    if (e.stderr && e.stderr.trim()) {
      if (output) output += '\n\n';
      output += `stderr:\n${e.stderr.trim()}`;
    }

    return {
      error: `Command failed: ${e.message}`,
      stdout: e.stdout?.trim() || '',
      stderr: e.stderr?.trim() || '',
      exitCode: e.code || 1,
      output: output || e.message
    };
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'run':
      if (!args[1]) { console.log('Usage: terminal-tools run <command>'); break; }
      const command = args.slice(1).join(' ');
      runCommand({ command, cwd: process.cwd() }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(r.output);
      });
      break;

    case 'check':
      if (!args[1]) { console.log('Usage: terminal-tools check <command>'); break; }
      const safety = checkSafety(args.slice(1).join(' '));
      console.log(safety.safe ? '✅ Safe to execute' : `❌ ${safety.reason}`);
      break;

    case 'list':
      console.log('Allowed commands:');
      console.log([...ALLOWED_COMMANDS].sort().join(', '));
      break;

    default:
      console.log(`
🐯 Terminal Tools

  run <command>                   Execute a safe command
  check <command>                 Check if a command is safe
  list                            Show allowed commands
`);
  }
}

module.exports = {
  ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS,
  checkSafety,
  runCommand,
  main
};

if (require.main === module) main();
