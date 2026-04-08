#!/usr/bin/env node

/**
 * Tiger Code Pilot — Git Tools
 *
 * Standalone git operation utilities used by the plugin system,
 * local agent, and MCP server tool handlers.
 *
 * Tools: git_status, git_log, git_diff, git_branch, git_commit, git_add, git_checkout
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ─── git_status ───────────────────────────────────────────────────────────────

/**
 * Show git status (short format).
 * @param {object} args — { cwd?: string }
 * @returns {Promise<string>}
 */
async function gitStatus(args = {}) {
  try {
    const { stdout } = await execAsync('git status --short', { cwd: args.cwd || process.cwd(), timeout: 10000 });
    return stdout.trim() || 'Working tree clean';
  } catch (e) {
    return `Not a git repository: ${e.message}`;
  }
}

// ─── git_log ──────────────────────────────────────────────────────────────────

/**
 * Show recent commits.
 * @param {object} args — { cwd?: string, count?: number }
 * @returns {Promise<string>}
 */
async function gitLog(args = {}) {
  const count = args.count || 10;
  try {
    const { stdout } = await execAsync(`git log --oneline -${count}`, { cwd: args.cwd || process.cwd(), timeout: 10000 });
    return stdout.trim() || 'No commits found';
  } catch (e) {
    return `Not a git repository: ${e.message}`;
  }
}

// ─── git_diff ─────────────────────────────────────────────────────────────────

/**
 * Show unstaged diff.
 * @param {object} args — { cwd?: string, file?: string }
 * @returns {Promise<string>}
 */
async function gitDiff(args = {}) {
  try {
    const fileArg = args.file ? ` -- "${args.file}"` : '';
    const { stdout } = await execAsync(`git diff${fileArg}`, { cwd: args.cwd || process.cwd(), timeout: 10000 });
    return stdout.trim() || 'No unstaged changes';
  } catch (e) {
    return `Not a git repository: ${e.message}`;
  }
}

// ─── git_branch ───────────────────────────────────────────────────────────────

/**
 * List branches.
 * @param {object} args — { cwd?: string, remote?: boolean }
 * @returns {Promise<string>}
 */
async function gitBranch(args = {}) {
  const cmd = args.remote ? 'git branch -a' : 'git branch';
  try {
    const { stdout } = await execAsync(cmd, { cwd: args.cwd || process.cwd(), timeout: 10000 });
    return stdout.trim() || 'No branches found';
  } catch (e) {
    return `Not a git repository: ${e.message}`;
  }
}

// ─── git_commit ───────────────────────────────────────────────────────────────

/**
 * Commit staged changes with a message.
 * @param {object} args — { message: string, cwd?: string }
 * @returns {Promise<string>}
 */
async function gitCommit(args) {
  if (!args.message) return { error: 'message is required' };

  // Sanitize message — escape double quotes
  const safeMsg = args.message.replace(/"/g, '\\"');

  try {
    const { stdout } = await execAsync(`git commit -m "${safeMsg}"`, {
      cwd: args.cwd || process.cwd(),
      timeout: 30000
    });
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    return { error: `Commit failed: ${e.message}${e.stderr ? `\n${e.stderr}` : ''}` };
  }
}

// ─── git_add ──────────────────────────────────────────────────────────────────

/**
 * Stage files for commit.
 * @param {object} args — { path: string, cwd?: string }
 * @returns {Promise<{ok: boolean, output: string}|{error: string}>}
 */
async function gitAdd(args) {
  if (!args.path) return { error: 'path is required' };

  try {
    const { stdout } = await execAsync(`git add ${args.path}`, {
      cwd: args.cwd || process.cwd(),
      timeout: 30000
    });
    return { ok: true, output: stdout.trim() || `Staged: ${args.path}` };
  } catch (e) {
    return { error: `Git add failed: ${e.message}` };
  }
}

// ─── git_checkout ─────────────────────────────────────────────────────────────

/**
 * Create or switch branches.
 * @param {object} args — { branch: string, create?: boolean, cwd?: string }
 * @returns {Promise<{ok: boolean, output: string}|{error: string}>}
 */
async function gitCheckout(args) {
  if (!args.branch) return { error: 'branch is required' };

  const cmd = args.create ? `git checkout -b ${args.branch}` : `git checkout ${args.branch}`;

  try {
    const { stdout } = await execAsync(cmd, {
      cwd: args.cwd || process.cwd(),
      timeout: 30000
    });
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    return { error: `Git checkout failed: ${e.message}` };
  }
}

// ─── git_init ─────────────────────────────────────────────────────────────────

/**
 * Initialize a new git repository.
 * @param {object} args — { cwd?: string }
 * @returns {Promise<{ok: boolean, output: string}|{error: string}>}
 */
async function gitInit(args = {}) {
  try {
    const { stdout } = await execAsync('git init', {
      cwd: args.cwd || process.cwd(),
      timeout: 10000
    });
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    return { error: `Git init failed: ${e.message}` };
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'status':
      gitStatus({ cwd: args[1] }).then(r => console.log(r));
      break;

    case 'log':
      gitLog({ cwd: process.cwd(), count: parseInt(args[1]) || 10 }).then(r => console.log(r));
      break;

    case 'diff':
      gitDiff({ cwd: process.cwd(), file: args[1] }).then(r => console.log(r));
      break;

    case 'branch':
      gitBranch({ cwd: process.cwd(), remote: args.includes('--remote') }).then(r => console.log(r));
      break;

    case 'commit':
      gitCommit({ message: args.slice(1).join(' '), cwd: process.cwd() }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(`✅ ${r.output}`);
      });
      break;

    case 'add':
      gitAdd({ path: args[1] || '.', cwd: process.cwd() }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(`✅ ${r.output}`);
      });
      break;

    case 'checkout':
      gitCheckout({ branch: args[1], create: args.includes('-b'), cwd: process.cwd() }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(`✅ ${r.output}`);
      });
      break;

    case 'init':
      gitInit({ cwd: args[1] || process.cwd() }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(`✅ ${r.output}`);
      });
      break;

    default:
      console.log(`
🐯 Git Tools

  status [cwd]                    Show git status
  log [count]                     Show recent commits
  diff [file]                     Show unstaged diff
  branch [--remote]               List branches
  commit <message>                Commit staged changes
  add [path]                      Stage files (default: .)
  checkout [-b] <branch>          Switch or create branch
  init [path]                     Initialize repository
`);
  }
}

module.exports = {
  gitStatus,
  gitLog,
  gitDiff,
  gitBranch,
  gitCommit,
  gitAdd,
  gitCheckout,
  gitInit,
  main
};

if (require.main === module) main();
