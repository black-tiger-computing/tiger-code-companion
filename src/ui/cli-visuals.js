#!/usr/bin/env node

/**
 * Tiger Code Pilot - CLI Visual Enhancements
 * 
 * Beautiful terminal output with colors, progress bars, and animations.
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// Gradient colors for headers
const GRADIENT_COLORS = [
  '\x1b[38;5;99m',   // Purple
  '\x1b[38;5;105m',  // Light purple
  '\x1b[38;5;111m',  // Blue-purple
  '\x1b[38;5;117m',  // Light blue
  '\x1b[38;5;123m',  // Cyan-blue
  '\x1b[38;5;129m'   // Purple-cyan
];

class CLIVisuals {
  static log(msg, color = 'reset', bold = false) {
    const colorCode = COLORS[color] || COLORS.reset;
    const boldCode = bold ? COLORS.bright : '';
    console.log(`${boldCode}${colorCode}${msg}${COLORS.reset}`);
  }

  static header(title) {
    const width = 60;
    const padding = Math.max(0, Math.floor((width - title.length) / 2));
    const paddedTitle = ' '.repeat(padding) + title + ' '.repeat(padding);
    
    console.log('');
    console.log(`${COLORS.bright}${COLORS.cyan}┌${'━'.repeat(width)}┐${COLORS.reset}`);
    
    // Create gradient effect for title
    const chars = paddedTitle.split('');
    const coloredChars = chars.map((char, i) => {
      const colorIndex = Math.floor(i / (chars.length / GRADIENT_COLORS.length)) % GRADIENT_COLORS.length;
      return `${GRADIENT_COLORS[colorIndex]}${char}`;
    }).join('');
    
    console.log(`${COLORS.bright}${COLORS.cyan}│${COLORS.reset}${coloredChars}${COLORS.bright}${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.bright}${COLORS.cyan}└${'━'.repeat(width)}┘${COLORS.reset}`);
    console.log('');
  }

  static progressBar(percent, options = {}) {
    const {
      width = 40,
      label = '',
      showPercent = true
    } = options;

    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    
    let line = '';
    if (label) line += `${label} `;
    line += `${COLORS.bright}${COLORS.cyan}[${COLORS.reset}`;
    line += `${COLORS.green}${filledBar}${COLORS.reset}`;
    line += `${COLORS.dim}${emptyBar}${COLORS.reset}`;
    line += `${COLORS.bright}${COLORS.cyan}]${COLORS.reset}`;
    
    if (showPercent) {
      line += ` ${COLORS.bright}${COLORS.green}${percent}%${COLORS.reset}`;
    }
    
    console.log(line);
  }

  static animatedProgress(percent, label = 'Progress') {
    const width = 40;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    
    // Clear line and write progress
    process.stdout.write('\r');
    process.stdout.write(`${COLORS.bright}${COLORS.cyan}${label}:${COLORS.reset} `);
    process.stdout.write(`${COLORS.bright}${COLORS.cyan}[${COLORS.reset}`);
    process.stdout.write(`${COLORS.green}${filledBar}${COLORS.reset}`);
    process.stdout.write(`${COLORS.dim}${emptyBar}${COLORS.reset}`);
    process.stdout.write(`${COLORS.bright}${COLORS.cyan}]${COLORS.reset}`);
    process.stdout.write(` ${COLORS.bright}${COLORS.green}${percent}%${COLORS.reset}`);
  }

  static success(msg) {
    console.log(`${COLORS.green}✅ ${msg}${COLORS.reset}`);
  }

  static error(msg) {
    console.log(`${COLORS.red}❌ ${msg}${COLORS.reset}`);
  }

  static warning(msg) {
    console.log(`${COLORS.yellow}⚠️  ${msg}${COLORS.reset}`);
  }

  static info(msg) {
    console.log(`${COLORS.blue}ℹ️  ${msg}${COLORS.reset}`);
  }

  static spinner(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    
    return setInterval(() => {
      process.stdout.write('\r');
      process.stdout.write(`${COLORS.cyan}${frames[i]}${COLORS.reset} ${text}`);
      i = (i + 1) % frames.length;
    }, 80);
  }

  static stopSpinner(spinner) {
    if (spinner) {
      clearInterval(spinner);
      process.stdout.write('\r');
    }
  }

  static card(title, items, options = {}) {
    const {
      color = 'cyan',
      icon = '•'
    } = options;

    const colorCode = COLORS[color] || COLORS.cyan;
    
    console.log(`${COLORS.bright}${colorCode}┌─ ${title} ${'─'.repeat(50 - title.length)}┐${COLORS.reset}`);
    
    items.forEach(item => {
      const label = typeof item === 'string' ? item : item.label;
      const value = item.value ? `: ${item.value}` : '';
      const line = `│ ${icon} ${label}${value}`;
      const padding = ' '.repeat(Math.max(0, 58 - line.length));
      console.log(`${COLORS.bright}${colorCode}${line}${padding}${COLORS.bright}${colorCode}│${COLORS.reset}`);
    });
    
    console.log(`${COLORS.bright}${colorCode}└${'─'.repeat(58)}┘${COLORS.reset}`);
    console.log('');
  }

  static table(headers, rows) {
    // Calculate column widths
    const colWidths = headers.map((h, i) => {
      const maxRowVal = Math.max(...rows.map(r => String(r[i] || '').length));
      return Math.max(String(h).length, maxRowVal) + 2;
    });

    // Print headers
    const headerLine = headers.map((h, i) => 
      `${COLORS.bright}${COLORS.cyan}${h.padEnd(colWidths[i])}${COLORS.reset}`
    ).join('');
    
    console.log(headerLine);
    console.log(`${COLORS.dim}${'─'.repeat(colWidths.reduce((a, b) => a + b, 0))}${COLORS.reset}`);
    
    // Print rows
    rows.forEach((row, idx) => {
      const rowLine = row.map((cell, i) => 
        `${COLORS.white}${String(cell || '').padEnd(colWidths[i])}${COLORS.reset}`
      ).join('');
      console.log(rowLine);
    });
    console.log('');
  }

  static tree(nodes, level = 0) {
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const prefix = level === 0 ? '' : (isLast ? '└─ ' : '├─ ');
      const indent = '  '.repeat(level);
      
      console.log(`${COLORS.dim}${indent}${prefix}${COLORS.reset}${COLORS.white}${node.name}${COLORS.reset}`);
      
      if (node.children && node.children.length > 0) {
        this.tree(node.children, level + 1);
      }
    });
  }

  static statusBadge(status) {
    const badges = {
      success: `${COLORS.bgGreen}${COLORS.black} SUCCESS ${COLORS.reset}`,
      error: `${COLORS.bgRed}${COLORS.white} ERROR ${COLORS.reset}`,
      warning: `${COLORS.bgYellow}${COLORS.black} WARNING ${COLORS.reset}`,
      info: `${COLORS.bgBlue}${COLORS.white} INFO ${COLORS.reset}`,
      running: `${COLORS.bgCyan}${COLORS.black} RUNNING ${COLORS.reset}`
    };
    
    return badges[status] || badges.info;
  }

  static codeBlock(code, lang = 'code') {
    const lines = code.split('\n');
    const width = Math.max(...lines.map(l => l.length)) + 4;
    
    console.log(`${COLORS.dim}┌─ ${lang} ${'─'.repeat(width - lang.length - 4)}┐${COLORS.reset}`);
    lines.forEach((line, i) => {
      const lineNum = `${COLORS.dim}${String(i + 1).padStart(3)}${COLORS.reset}`;
      console.log(`${COLORS.dim}│${COLORS.reset} ${lineNum} ${COLORS.white}${line}${COLORS.reset}`);
    });
    console.log(`${COLORS.dim}└${'─'.repeat(width - 2)}┘${COLORS.reset}`);
    console.log('');
  }
}

module.exports = CLIVisuals;
