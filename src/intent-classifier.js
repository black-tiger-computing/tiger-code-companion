#!/usr/bin/env node

/**
 * Tiger Code Pilot — Intent Classifier
 *
 * Routes natural language CLI input to the correct MCP tool.
 *
 * "add error handling"       → generate_code / edit_file
 * "why is my app crashing"   → debug_code + read_file
 * "make me a REST API"       → generate_code (multi-file)
 * "analyze this"             → analyze_code
 * "what does this do"        → explain_code
 * "fix this bug"             → debug_code
 *
 * Two-tier classification:
 *   1. Rule-based (keyword matching) — fast, no AI cost
 *   2. LLM fallback (if rule-based confidence is low) — accurate, costs tokens
 */

// ─── Rule-based classifier ───────────────────────────────────────────────────

const INTENT_RULES = [
  // Debug / fix intents
  {
    pattern: /\b(fix|debug|error|crash|crashing|broken|bug|issue|problem|doesn'?t work|not working|exception|fail|failed|stack trace|traceback|why.*crash|why.*error)\b/i,
    intent: 'debug_code',
    confidence: 0.85
  },
  // Analysis intents
  {
    pattern: /\b(analyze|review|audit|inspect|scan|check.*code|quality|security.*scan|vulnerab|performance.*issue|bottleneck)\b/i,
    intent: 'analyze_code',
    confidence: 0.85
  },
  // Explanation intents
  {
    pattern: /\b(what.*do|what.*does|how.*work|explain|understand|describe.*code|walk.?through|summary.*code)\b/i,
    intent: 'explain_code',
    confidence: 0.85
  },
  // Refactor intents
  {
    pattern: /\b(refactor|clean.?up|cleaner|improve.*code|restructure|reorganize|simplify|make.*readable|better.*design|technical.?debt)\b/i,
    intent: 'refactor_code',
    confidence: 0.85
  },
  // Test intents
  {
    pattern: /\b(test|tests|testing|unit.?test|integration.?test|e2e|coverage|mock|stub|jest|mocha|vitest|write.*test|generate.*test|create.*test)\b/i,
    intent: 'write_tests',
    confidence: 0.85
  },
  // Generation intents (broadest — lowest confidence)
  {
    pattern: /\b(make|create|build|generate|write|implement|develop|scaffold|new.*app|new.*api|new.*endpoint|rest.*api|graphql|microservice|component|hook|route|controller|service)\b/i,
    intent: 'generate_code',
    confidence: 0.6
  },
  // Edit intents
  {
    pattern: /\b(add|modify|update|change|edit|enhance|improve|extend|add.*feature|add.*support|add.*handling|update.*to|change.*to)\b/i,
    intent: 'generate_code',
    confidence: 0.55
  },
  // Chat / general
  {
    pattern: /\b(how.*do.*i|can.*you|help|what.*is|how.*to|tell.*me|guide|tutorial)\b/i,
    intent: 'chat',
    confidence: 0.5
  }
];

function classifyRuleBased(input) {
  let bestMatch = null;
  let bestScore = 0;

  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(input)) {
      if (rule.confidence > bestScore) {
        bestScore = rule.confidence;
        bestMatch = { intent: rule.intent, confidence: rule.confidence, method: 'rule' };
      }
    }
  }

  return bestMatch || { intent: 'chat', confidence: 0.3, method: 'rule' };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify natural language input and return intent + recommended tool.
 *
 * @param {string} input — user's natural language command
 * @returns {{ intent: string, confidence: number, method: string }}
 */
function classifyIntent(input) {
  if (!input || !input.trim()) return { intent: 'chat', confidence: 0, method: 'rule' };

  // Rule-based classification
  const ruleResult = classifyRuleBased(input.trim());

  // If confidence is high enough, return it
  if (ruleResult.confidence >= 0.7) return ruleResult;

  // Low confidence — could fall back to LLM classification here
  // For now, return the best rule match with low confidence flag
  return ruleResult;
}

/**
 * Map an intent to the recommended MCP tool name.
 *
 * @param {string} intent
 * @returns {string}
 */
function intentToTool(intent) {
  const mapping = {
    debug_code: 'debug_code',
    analyze_code: 'analyze_code',
    explain_code: 'explain_code',
    refactor_code: 'refactor_code',
    write_tests: 'write_tests',
    generate_code: 'generate_code',
    chat: 'chat'
  };
  return mapping[intent] || 'chat';
}

/**
 * Build the tool call arguments from user input + optional context.
 *
 * @param {string} intent
 * @param {string} input
 * @param {object} context — { code, language, cwd, etc. }
 * @returns {object}
 */
function buildToolArgs(intent, input, context = {}) {
  switch (intent) {
    case 'debug_code':
      return {
        code: context.code || input,
        error_message: context.error || '',
        language: context.language || 'auto'
      };
    case 'analyze_code':
      return {
        code: context.code || input,
        language: context.language || 'auto',
        mode: context.mode || 'general'
      };
    case 'explain_code':
      return { code: context.code || input };
    case 'refactor_code':
      return { code: context.code || input };
    case 'write_tests':
      return {
        code: context.code || input,
        framework: context.framework || ''
      };
    case 'generate_code':
      return {
        description: input,
        language: context.language || 'auto'
      };
    case 'chat':
    default:
      return { message: input, session_id: context.session_id || '' };
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const input = args.join(' ');

  if (!input) {
    console.log('Usage: intent-classifier "your natural language command here"');
    console.log('Example: intent-classifier "add error handling to my auth routes"');
    return;
  }

  const result = classifyIntent(input);
  const tool = intentToTool(result.intent);
  const args_obj = buildToolArgs(result.intent, input);

  console.log(`\n🐯 Intent Classification:`);
  console.log(`  Input:     "${input}"`);
  console.log(`  Intent:    ${result.intent}`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`  Method:    ${result.method}`);
  console.log(`  Tool:      ${tool}`);
  console.log(`  Args:      ${JSON.stringify(args_obj, null, 2)}`);
}

module.exports = {
  classifyIntent,
  intentToTool,
  buildToolArgs,
  INTENT_RULES,
  main
};

if (require.main === module) main();
