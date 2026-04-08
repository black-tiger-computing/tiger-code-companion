#!/usr/bin/env node

/**
 * Tiger Code Pilot — File Tools
 *
 * Standalone file operation utilities used by the plugin system,
 * local agent, and MCP server tool handlers.
 *
 * Tools: read_file, write_file, edit_file, list_directory
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// ─── Path safety ──────────────────────────────────────────────────────────────

/**
 * Verify a path stays within an allowed base directory.
 * @param {string} baseDir — allowed root
 * @param {string} target  — requested path
 * @returns {string} resolved safe path
 */
function safePath(baseDir, target) {
  const resolved = path.resolve(baseDir, target);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path traversal blocked: "${target}" resolves outside working directory`);
  }
  return resolved;
}

// ─── read_file ────────────────────────────────────────────────────────────────

/**
 * Read file contents with encoding detection.
 * @param {object} args — { path: string, encoding?: string }
 * @returns {Promise<string>}
 */
async function readFile(args) {
  const filePath = args.path;
  if (!filePath) return { error: 'path is required' };

  try {
    const stat = await fsPromises.stat(filePath);
    if (stat.isDirectory()) return { error: `Path is a directory: ${filePath}` };
    if (stat.size > 10 * 1024 * 1024) return { error: `File too large (${(stat.size / 1048576).toFixed(1)}MB). Max 10MB.` };

    const encoding = args.encoding || 'utf8';
    const content = await fsPromises.readFile(filePath, encoding);
    return { content, path: filePath, size: stat.size, lines: content.split(/\r?\n/).length };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── write_file ───────────────────────────────────────────────────────────────

/**
 * Create or overwrite a file, creating parent directories as needed.
 * @param {object} args — { path: string, content: string }
 * @returns {Promise<{ok: boolean, path: string, bytes: number}|{error: string}>}
 */
async function writeFile(args) {
  const filePath = args.path;
  const content = args.content;

  if (!filePath) return { error: 'path is required' };
  if (content === undefined || content === null) return { error: 'content is required' };

  try {
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(filePath, content, 'utf8');
    const stat = await fsPromises.stat(filePath);
    return { ok: true, path: filePath, bytes: stat.size };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── edit_file ────────────────────────────────────────────────────────────────

/**
 * Search and replace in an existing file.
 * Supports single replacement (first match) or replace_all.
 *
 * @param {object} args — {
 *   path: string,
 *   search: string,
 *   replace: string,
 *   replace_all?: boolean,
 *   use_regex?: boolean
 * }
 * @returns {Promise<{ok: boolean, path: string, replacements: number}|{error: string}>}
 */
async function editFile(args) {
  const filePath = args.path;
  const search = args.search;
  const replace = args.replace;

  if (!filePath) return { error: 'path is required' };
  if (!search) return { error: 'search is required' };
  if (replace === undefined && replace !== '') return { error: 'replace is required' };

  try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    let newContent;
    let replacementCount = 0;

    if (args.use_regex) {
      const flags = args.replace_all ? 'g' : '';
      const regex = new RegExp(search, flags);
      const matches = content.match(regex);
      replacementCount = matches ? matches.length : 0;
      if (replacementCount === 0) return { error: `Pattern not found: ${search}` };
      newContent = content.replace(regex, replace);
    } else {
      if (args.replace_all) {
        const count = content.split(search).length - 1;
        if (count === 0) return { error: `Text not found: ${search}` };
        replacementCount = count;
        newContent = content.split(search).join(replace);
      } else {
        const idx = content.indexOf(search);
        if (idx === -1) return { error: `Text not found: ${search}` };
        replacementCount = 1;
        newContent = content.substring(0, idx) + replace + content.substring(idx + search.length);
      }
    }

    await fsPromises.writeFile(filePath, newContent, 'utf8');
    return { ok: true, path: filePath, replacements: replacementCount };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── list_directory ───────────────────────────────────────────────────────────

/**
 * List files and directories with optional recursion.
 *
 * @param {object} args — { path: string, recursive?: boolean, max_depth?: number }
 * @returns {Promise<{entries: Array<{name, type, size, path}>}|{error: string}>}
 */
async function listDirectory(args) {
  const dirPath = args.path;
  if (!dirPath) return { error: 'path is required' };

  try {
    const entries = [];
    const maxDepth = args.max_depth || 1;

    async function walk(dir, depth) {
      if (depth > maxDepth) return;
      const items = await fsPromises.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files and common ignore patterns
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === '.git') continue;

        const fullPath = path.join(dir, item.name);
        const entry = {
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          path: fullPath
        };

        if (!item.isDirectory()) {
          try {
            const stat = await fsPromises.stat(fullPath);
            entry.size = stat.size;
          } catch (e) { /* skip */ }
        }

        entries.push(entry);

        if (item.isDirectory() && args.recursive) {
          await walk(fullPath, depth + 1);
        }
      }
    }

    await walk(dirPath, 0);
    return { entries, path: dirPath, count: entries.length };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'read':
      if (!args[1]) { console.log('Usage: file-tools read <path>'); break; }
      readFile({ path: args[1] }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(r.content);
      });
      break;

    case 'write':
      if (!args[1]) { console.log('Usage: file-tools write <path>'); break; }
      // Read content from stdin (simplified — in practice use pipe)
      const content = args.slice(2).join(' ');
      writeFile({ path: args[1], content }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(`✅ Written: ${r.path} (${r.bytes} bytes)`);
      });
      break;

    case 'edit':
      if (!args[1] || !args[2] || !args[3]) {
        console.log('Usage: file-tools edit <path> <search> <replace>');
        break;
      }
      editFile({ path: args[1], search: args[2], replace: args[3] }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        console.log(`✅ ${r.replacements} replacement(s) in ${r.path}`);
      });
      break;

    case 'list':
      listDirectory({ path: args[1] || '.', recursive: args.includes('--recursive') }).then(r => {
        if (r.error) { console.error(`❌ ${r.error}`); return; }
        for (const e of r.entries) {
          console.log(`${e.type === 'directory' ? '📁' : '📄'} ${e.path}${e.size ? ` (${e.size}B)` : ''}`);
        }
        console.log(`\nTotal: ${r.count} entries`);
      });
      break;

    default:
      console.log(`
🐯 File Tools

  read <path>                       Read file contents
  write <path> <content>            Write content to file
  edit <path> <search> <replace>    Search and replace
  list [path] [--recursive]         List directory contents
`);
  }
}

module.exports = {
  safePath,
  readFile,
  writeFile,
  editFile,
  listDirectory,
  main
};

if (require.main === module) main();
