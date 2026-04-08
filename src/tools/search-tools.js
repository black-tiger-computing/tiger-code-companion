#!/usr/bin/env node

/**
 * Tiger Code Pilot — Search Tools
 *
 * Standalone file search utilities used by the plugin system,
 * local agent, and MCP server tool handlers.
 *
 * Tools: search_files (grep/rg), find_files
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ─── search_files ─────────────────────────────────────────────────────────────

/**
 * Search for a pattern across project files.
 * Uses ripgrep (rg) if available, falls back to grep, then pure Node.js.
 *
 * @param {object} args — {
 *   pattern: string,
 *   cwd?: string,
 *   glob?: string,       // file filter e.g. "*.js"
 *   case_sensitive?: boolean,
 *   max_results?: number
 * }
 * @returns {Promise<{results: Array<{file, line, content, line_number}>}|{error: string}>}
 */
async function searchFiles(args) {
  const pattern = args.pattern;
  if (!pattern) return { error: 'pattern is required' };

  const cwd = args.cwd || process.cwd();
  const maxResults = args.max_results || 100;
  const caseSensitive = args.case_sensitive || false;
  const glob = args.glob || '';

  // Try ripgrep first (fastest)
  try {
    const rgCmd = buildRgCommand(pattern, cwd, glob, caseSensitive, maxResults);
    const { stdout } = await execAsync(rgCmd, { cwd, timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
    return { results: parseRgOutput(stdout), tool: 'ripgrep' };
  } catch (e) {
    // rg not found or no matches — fall through
  }

  // Try grep (Unix) or findstr (Windows)
  try {
    if (process.platform === 'win32') {
      const findstrCmd = buildFindstrCommand(pattern, cwd, caseSensitive);
      const { stdout } = await execAsync(findstrCmd, { cwd, timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
      return { results: parseFindstrOutput(stdout), tool: 'findstr' };
    } else {
      const grepCmd = buildGrepCommand(pattern, cwd, glob, caseSensitive, maxResults);
      const { stdout } = await execAsync(grepCmd, { cwd, timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
      return { results: parseGrepOutput(stdout), tool: 'grep' };
    }
  } catch (e) {
    // grep not found or no matches — fall through to pure JS
  }

  // Pure Node.js fallback
  try {
    const results = await searchFilesJS(cwd, pattern, caseSensitive, maxResults, glob);
    return { results, tool: 'nodejs' };
  } catch (e) {
    return { error: `Search failed: ${e.message}` };
  }
}

// ─── ripgrep command builder ──────────────────────────────────────────────────

function buildRgCommand(pattern, cwd, glob, caseSensitive, maxResults) {
  let cmd = 'rg';
  cmd += ' --line-number';      // Include line numbers
  cmd += ' --no-heading';       // Single-line output
  cmd += ' --color=never';      // No ANSI colors
  cmd += ` --max-count=${maxResults}`;

  if (caseSensitive) {
    cmd += ' --case-sensitive';
  } else {
    cmd += ' --ignore-case';
  }

  if (glob) {
    cmd += ` --glob "${glob}"`;
  }

  // Skip common directories
  cmd += ' --hidden --no-ignore-vcs';
  cmd += ' --glob "!.git" --glob "!node_modules" --glob "!.svn"';

  cmd += ` "${pattern.replace(/"/g, '\\"')}"`;
  cmd += ' .';

  return cmd;
}

// ─── grep command builder ─────────────────────────────────────────────────────

function buildGrepCommand(pattern, cwd, glob, caseSensitive, maxResults) {
  let cmd = 'grep';
  cmd += ' -r';                 // Recursive
  cmd += ' -n';                 // Line numbers
  cmd += ' --no-messages';      // Suppress errors

  if (caseSensitive) {
    cmd += ' --ignore-case';    // grep is case-insensitive by default with -i
  } else {
    cmd += ' -i';
  }

  if (glob) {
    cmd += ` --include="${glob}"`;
  }

  cmd += ` -m ${maxResults}`;

  // Skip directories
  cmd += ' --exclude-dir=.git --exclude-dir=node_modules';

  cmd += ` "${pattern.replace(/"/g, '\\"')}"`;
  cmd += ' .';

  return cmd;
}

// ─── findstr command builder (Windows) ────────────────────────────────────────

function buildFindstrCommand(pattern, cwd, caseSensitive) {
  let cmd = 'findstr';
  cmd += ' /s';                 // Recursive
  cmd += ' /n';                 // Line numbers
  cmd += ' /i';                 // Case insensitive

  if (caseSensitive) {
    cmd = cmd.replace(' /i', '');
  }

  cmd += ` "${pattern}"`;
  cmd += ' *.*';

  return cmd;
}

// ─── Output parsers ───────────────────────────────────────────────────────────

function parseRgOutput(stdout) {
  return stdout.trim().split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (!match) return null;
      return {
        file: match[1],
        line_number: parseInt(match[2], 10),
        content: match[3].trim()
      };
    })
    .filter(Boolean);
}

function parseGrepOutput(stdout) {
  return stdout.trim().split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (!match) return null;
      return {
        file: match[1],
        line_number: parseInt(match[2], 10),
        content: match[3].trim()
      };
    })
    .filter(Boolean);
}

function parseFindstrOutput(stdout) {
  return stdout.trim().split('\n')
    .filter(line => line.trim())
    .map(line => {
      // findstr format: filename:linenumber:content
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (!match) return null;
      return {
        file: match[1],
        line_number: parseInt(match[2], 10),
        content: match[3].trim()
      };
    })
    .filter(Boolean);
}

// ─── Pure JavaScript fallback ─────────────────────────────────────────────────

async function searchFilesJS(cwd, pattern, caseSensitive, maxResults, glob) {
  const results = [];
  const regex = new RegExp(pattern, caseSensitive ? '' : 'i');
  const globRegex = glob ? globToRegex(glob) : null;

  async function walk(dir) {
    if (results.length >= maxResults) return;

    let entries;
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;

      // Skip hidden files and common ignore patterns
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.git') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        // Apply glob filter
        if (globRegex && !globRegex.test(entry.name)) continue;

        try {
          const content = await fsPromises.readFile(fullPath, 'utf8');
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({
                file: fullPath,
                line_number: i + 1,
                content: lines[i].trim()
              });
              if (results.length >= maxResults) return;
            }
          }
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(cwd);
  return results;
}

// ─── Glob to Regex ────────────────────────────────────────────────────────────

function globToRegex(globPattern) {
  // Simple glob-to-regex conversion for *.ext patterns
  const regex = globPattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

// ─── find_files ───────────────────────────────────────────────────────────────

/**
 * Find files by name pattern.
 *
 * @param {object} args — { pattern: string, cwd?: string, recursive?: boolean, max_results?: number }
 * @returns {Promise<{files: string[]}|{error: string}>}
 */
async function findFiles(args) {
  const pattern = args.pattern;
  if (!pattern) return { error: 'pattern is required' };

  const cwd = args.cwd || process.cwd();
  const recursive = args.recursive !== false;
  const maxResults = args.max_results || 50;
  const results = [];

  try {
    async function walk(dir) {
      if (results.length >= maxResults) return;

      let entries;
      try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxResults) return;

        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.git') continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          // Simple glob match
          if (matchGlob(pattern, entry.name)) {
            results.push(fullPath);
          }
        }
      }
    }

    await walk(cwd);
    return { files: results, count: results.length };
  } catch (e) {
    return { error: `Find failed: ${e.message}` };
  }
}

/**
 * Simple glob matching (supports * and ?)
 */
function matchGlob(pattern, filename) {
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(filename);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'search':
      if (!args[1]) { console.log('Usage: search-tools search <pattern> [--glob "*.js"]'); break; }
      const globIdx = args.indexOf('--glob');
      const searchArgs = {
        pattern: args[1],
        cwd: process.cwd(),
        glob: globIdx !== -1 ? args[globIdx + 1] : undefined
      };
      searchFiles(searchArgs).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        if (!r.results.length) { console.log('No matches found.'); return; }
        console.log(`\n🔍 Found ${r.results.length} matches (using ${r.tool}):\n`);
        for (const m of r.results) {
          console.log(`${m.file}:${m.line_number}`);
          console.log(`  ${m.content}`);
          console.log('');
        }
      });
      break;

    case 'find':
      if (!args[1]) { console.log('Usage: search-tools find <pattern>'); break; }
      findFiles({ pattern: args[1], cwd: process.cwd() }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        if (!r.files.length) { console.log('No files found.'); return; }
        console.log(`\n📁 Found ${r.files.length} files:\n`);
        for (const f of r.files) {
          console.log(f);
        }
      });
      break;

    default:
      console.log(`
🐯 Search Tools

  search <pattern> [--glob "*.js"]   Search file contents
  find <pattern>                     Find files by name
`);
  }
}

module.exports = {
  searchFiles,
  findFiles,
  searchFilesJS,
  checkSafety: undefined, // Not applicable
  matchGlob,
  main
};

if (require.main === module) main();
