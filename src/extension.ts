import * as axios from 'axios';
import * as path from 'path';
import * as vscode from 'vscode';

const MODE_OPTIONS = [
  'brainstorm',
  'research',
  'develop',
  'code-debug',
  'write-complete-code',
  'design-project'
];

const MODEL_PRESETS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'text-davinci-003'],
  huggingface: ['gpt2', 'distilgpt2', 'microsoft/DialoGPT-medium', 'Salesforce/codegen-350M-mono'],
  ollama: ['llama3.2', 'llama3.1', 'codellama', 'deepseek-coder', 'mistral', 'phi3'],
  local: ['llama2', 'llama3', 'mistral']
};

// Free models that work without API keys
const FREE_MODELS = [
  {
    id: 'hf-free',
    name: 'HuggingFace Free Tier',
    provider: 'huggingface' as Provider,
    model: 'Salesforce/codegen-350M-mono',
    endpointUrl: 'https://api-inference.huggingface.co/models/Salesforce/codegen-350M-mono',
    description: 'Free code generation model - no API key required',
    requiresApiKey: false
  },
  {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    provider: 'ollama' as Provider,
    model: 'llama3.2',
    endpointUrl: 'http://localhost:11434/api/generate',
    description: 'Run models locally - no API key needed',
    requiresApiKey: false
  }
];

// Quick-start prompt templates
const QUICK_START_PRESETS = [
  {
    id: 'explain-code',
    name: '[EX] Explain This Code',
    prompt: 'Explain what this code does in simple terms. Break down:\n1. The purpose of the code\n2. How it works step-by-step\n3. Key functions/variables\n4. Any potential improvements\n\nCode:'
  },
  {
    id: 'add-comments',
    name: '[CM] Add Comments',
    prompt: 'Add comprehensive comments to this code explaining:\n1. What each function does\n2. Parameters and return values\n3. Complex logic explanations\n4. Any edge cases handled\n\nCode:'
  },
  {
    id: 'find-bugs',
    name: '[BD] Find Bugs',
    prompt: 'Review this code for bugs, errors, and issues:\n1. Logic errors\n2. Missing error handling\n3. Edge cases not covered\n4. Type errors\n5. Potential crashes\n\nFor each issue, explain the fix.\n\nCode:'
  },
  {
    id: 'optimize',
    name: '[PR] Optimize Code',
    prompt: 'Optimize this code for better performance:\n1. Identify bottlenecks\n2. Suggest algorithmic improvements\n3. Reduce complexity\n4. Add caching opportunities\n5. Memory optimizations\n\nProvide before/after examples.\n\nCode:'
  },
  {
    id: 'refactor',
    name: '[RF] Refactor Code',
    prompt: 'Refactor this code to follow best practices:\n1. Clean code principles\n2. Better naming\n3. DRY (Don\'t Repeat Yourself)\n4. SOLID principles\n5. Modern language features\n\nExplain each change.\n\nCode:'
  },
  {
    id: 'add-tests',
    name: '[TS] Write Unit Tests',
    prompt: 'Write comprehensive unit tests for this code:\n1. Test all public functions\n2. Edge cases\n3. Error cases\n4. Happy path\n5. Include mock data if needed\n\nCode to test:'
  },
  {
    id: 'security-review',
    name: '[SR] Security Review',
    prompt: 'Perform a security audit of this code:\n1. Input validation\n2. SQL injection risks\n3. XSS vulnerabilities\n4. Hardcoded secrets\n5. Auth issues\n6. Data exposure\n\nFor each finding, provide the secure version.\n\nCode:'
  },
  {
    id: 'convert-language',
    name: '[CV] Convert to Another Language',
    prompt: 'Convert this code to {TARGET_LANGUAGE}:\n1. Maintain same functionality\n2. Use idiomatic patterns for target language\n3. Follow target language conventions\n4. Handle language-specific edge cases\n\nCode to convert:'
  }
];

type Provider = 'openai' | 'huggingface' | 'ollama' | 'local';

interface CopilotState {
  mode: string;
  provider: Provider;
  model: string;
  preset: string;
  apiKey: string;
  endpointUrl: string;
  prompt: string;
  codeInput: string;
}

interface SavedModel {
  name: string;
  provider: Provider;
  endpointUrl: string;
  addedAt: string;
}

interface SavedFile {
  name: string;
  content: string;
  language?: string;
  savedAt: string;
}

interface StorageData {
  prompts: string[];
  models: SavedModel[];
  files: SavedFile[];
}

function getInitialState(): CopilotState {
  return {
    mode: 'develop',
    provider: 'openai',
    model: 'gpt-4o-mini',
    preset: '',
    apiKey: '',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    prompt: '',
    codeInput: ''
  };
}

// Storage keys
const STORAGE_KEYS = {
  PROVIDER: 'tigerCodePilot.provider',
  MODEL: 'tigerCodePilot.model',
  ENDPOINT_URL: 'tigerCodePilot.endpointUrl',
  MODE: 'tigerCodePilot.mode',
  STORAGE_DATA: 'tigerCodePilot.storageData'
};

// Secret storage keys
const SECRET_KEYS = {
  OPENAI_API_KEY: 'tigerCodePilot.openai.apiKey',
  HUGGINGFACE_API_KEY: 'tigerCodePilot.huggingface.apiKey',
  OLLAMA_API_KEY: 'tigerCodePilot.ollama.apiKey',
  LOCAL_API_KEY: 'tigerCodePilot.local.apiKey'
};

function getSecretKeyForProvider(provider: Provider): string {
  switch (provider) {
    case 'openai':
      return SECRET_KEYS.OPENAI_API_KEY;
    case 'huggingface':
      return SECRET_KEYS.HUGGINGFACE_API_KEY;
    case 'ollama':
      return SECRET_KEYS.OLLAMA_API_KEY;
    case 'local':
      return SECRET_KEYS.LOCAL_API_KEY;
  }
}

function getModelOptions(provider: string): string {
  const presets = MODEL_PRESETS[provider] || [];
  return presets.map(p => `<option value="${p}">${p}</option>`).join('');
}

function getEndpointUrlForProvider(provider: Provider, endpointUrl?: string): string {
  if (endpointUrl) {
    return endpointUrl;
  }
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'huggingface':
      return 'https://api-inference.huggingface.co/models/';
    case 'ollama':
      return 'http://localhost:11434/api/generate';
    case 'local':
      return 'http://localhost:8080/v1/chat/completions';
  }
}

const ANALYSIS_PROMPTS = {
  general: `Analyze the following code and provide a comprehensive review covering:
1. Code quality and readability
2. Potential bugs or issues
3. Best practices and improvements
4. Security concerns (if any)
5. Performance considerations

Provide specific, actionable suggestions with code examples where helpful.`,

  security: `Perform a security audit of the following code. Look for:
1. Input validation issues
2. Authentication/authorization flaws
3. Data exposure risks
4. Injection vulnerabilities (SQL, XSS, etc.)
5. Hardcoded secrets or credentials
6. Insecure configurations

For each issue found, explain the vulnerability and provide a secure code example.`,

  performance: `Analyze the following code for performance issues:
1. Algorithmic complexity (Big O notation)
2. Memory usage and potential leaks
3. Unnecessary computations or re-renders
4. Database query optimization
5. Caching opportunities
6. Bundle size concerns

Provide specific optimizations with before/after code examples.`,

  bugs: `Review the following code for bugs and issues:
1. Logic errors
2. Edge cases not handled
3. Type errors or mismatches
4. Race conditions
5. Off-by-one errors
6. Missing error handling
7. Deprecated API usage

For each bug found, explain the issue and provide the corrected code.`
};

async function showOnboarding(context: vscode.ExtensionContext): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Tiger Code Pilot\n\nYour AI-powered coding assistant with:\n- Multi-provider support (OpenAI, HuggingFace, Ollama)\n- Code analysis & review\n- Smart prompt templates\n- Local storage for prompts & snippets\n\nReady to get started?',
    { modal: true },
    'Quick Start',
    'Configure Provider',
    'View Documentation'
  );

  if (choice === 'Quick Start') {
    // Show quick start panel with free models
    const quickStartChoice = await vscode.window.showQuickPick(
      [
        {
          label: '[HF] Try Free Model (HuggingFace)',
          description: 'Start coding with no API key required',
          detail: 'Uses Salesforce CodeGen free model'
        },
        {
          label: '[OL] Use Local Ollama',
          description: 'Run models on your machine',
          detail: 'No API key needed, fully private'
        },
        {
          label: '[OA] Configure OpenAI',
          description: 'Use GPT-4o models',
          detail: 'Requires OpenAI API key'
        }
      ],
      {
        placeHolder: 'Choose how to get started...'
      }
    );

    if (quickStartChoice?.label.includes('HuggingFace')) {
      // Set up HuggingFace free model
      context.globalState.update(STORAGE_KEYS.PROVIDER, 'huggingface');
      context.globalState.update(STORAGE_KEYS.MODEL, 'Salesforce/codegen-350M-mono');
      context.globalState.update(STORAGE_KEYS.ENDPOINT_URL, 'https://api-inference.huggingface.co/models/Salesforce/codegen-350M-mono');

      vscode.window.showInformationMessage(
        'Free model configured! Run "Tiger Code Pilot: Open Chat" to start coding.',
        'Open Chat'
      ).then(selection => {
        if (selection === 'Open Chat') {
          loadStoredState(context).then(state => {
            openCopilotPanel(context, state);
          });
        }
      });
    } else if (quickStartChoice?.label.includes('Ollama')) {
      // Test Ollama connection
      const ollamaRunning = await testOllamaConnection();
      if (ollamaRunning) {
        context.globalState.update(STORAGE_KEYS.PROVIDER, 'ollama');
        context.globalState.update(STORAGE_KEYS.MODEL, 'llama3.2');
        context.globalState.update(STORAGE_KEYS.ENDPOINT_URL, 'http://localhost:11434/api/generate');

        vscode.window.showInformationMessage(
          'Ollama configured! Run "Tiger Code Pilot: Open Chat" to start.',
          'Open Chat'
        ).then(selection => {
          if (selection === 'Open Chat') {
            loadStoredState(context).then(state => {
              openCopilotPanel(context, state);
            });
          }
        });
      } else {
        vscode.window.showWarningMessage(
          'Ollama not detected. Install from https://ollama.ai and run "ollama pull llama3.2"',
          'Learn More'
        );
      }
    } else if (quickStartChoice?.label.includes('OpenAI')) {
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your OpenAI API key',
        password: true,
        placeHolder: 'sk-...',
        ignoreFocusOut: true
      });

      if (apiKey) {
        await saveApikey(context, 'openai', apiKey);
        context.globalState.update(STORAGE_KEYS.PROVIDER, 'openai');
        context.globalState.update(STORAGE_KEYS.MODEL, 'gpt-4o-mini');
        context.globalState.update(STORAGE_KEYS.ENDPOINT_URL, 'https://api.openai.com/v1/chat/completions');

        vscode.window.showInformationMessage(
          'OpenAI configured! Your API key is stored securely.',
          'Open Chat'
        ).then(selection => {
          if (selection === 'Open Chat') {
            loadStoredState(context).then(state => {
              openCopilotPanel(context, state);
            });
          }
        });
      }
    }
  } else if (choice === 'Configure Provider') {
    vscode.commands.executeCommand('codePilot.openChat');
  } else if (choice === 'View Documentation') {
    vscode.commands.executeCommand('markdown.showPreview',
      vscode.Uri.file(path.join(context.extensionPath || '.', 'README.md')));
  }
}

async function testOllamaConnection(): Promise<boolean> {
  try {
    const response = await axios.default.get('http://localhost:11434/api/tags', {
      timeout: 3000
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function testConnection(context: vscode.ExtensionContext, state: CopilotState): Promise<void> {
  const endpointUrl = state.endpointUrl || getEndpointUrlForProvider(state.provider);

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Testing connection to ${state.provider}...`,
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: 'Checking endpoint...' });

      try {
        if (state.provider === 'ollama') {
          const running = await testOllamaConnection();
          if (running) {
            vscode.window.showInformationMessage('Ollama is running and accessible!');
          } else {
            vscode.window.showErrorMessage('Ollama not detected at http://localhost:11434');
          }
        } else {
          // Test with a minimal request
          const response = await axios.default.post(
            endpointUrl,
            {
              model: state.preset || state.model,
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 5
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.apiKey}`
              },
              timeout: 10000
            }
          );

          if (response.status >= 200 && response.status < 300) {
            vscode.window.showInformationMessage('Connection successful!');
          } else {
            vscode.window.showErrorMessage(`Connection failed: HTTP ${response.status}`);
          }
        }
      } catch (error) {
        if (axios.default.isAxiosError(error)) {
          const errorMsg = error.response?.data?.error?.message || error.message;
          vscode.window.showErrorMessage(`Connection failed: ${errorMsg}`);
        } else {
          vscode.window.showErrorMessage('Connection failed');
        }
      }
    }
  );
}

async function analyzeCode(context: vscode.ExtensionContext, state: CopilotState): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('No active editor found. Open a file first.');
    return;
  }

  // Show quick pick for analysis type
  const analysisType = await vscode.window.showQuickPick(
    [
      { label: '[GA] General Analysis', description: 'Comprehensive code review', value: 'general' },
      { label: '[SA] Security Audit', description: 'Find security vulnerabilities', value: 'security' },
      { label: '[PR] Performance Review', description: 'Identify performance issues', value: 'performance' },
      { label: '[BD] Bug Detection', description: 'Find bugs and issues', value: 'bugs' }
    ],
    {
      placeHolder: 'Select analysis type...',
      matchOnDescription: true
    }
  );

  if (!analysisType) {
    return; // User cancelled
  }

  // Get code from editor
  const selection = editor.selection;
  const code = selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);

  if (!code.trim()) {
    vscode.window.showErrorMessage('No code to analyze.');
    return;
  }

  // Check if API key is set
  const secretKey = getSecretKeyForProvider(state.provider);
  const savedApiKey = await context.secrets.get(secretKey);

  if (!savedApiKey && !state.apiKey) {
    const apiKeyInput = await vscode.window.showInputBox({
      prompt: `Enter API key for ${state.provider}`,
      password: true,
      placeHolder: 'sk-...',
      ignoreFocusOut: true
    });

    if (!apiKeyInput) {
      return; // User cancelled
    }

    // Save API key
    await saveApikey(context, state.provider, apiKeyInput);
    state.apiKey = apiKeyInput;
  } else if (savedApiKey) {
    state.apiKey = savedApiKey;
  }

  // Create output channel
  const outputChannel = vscode.window.createOutputChannel('Tiger Code Pilot - Analysis');
  outputChannel.clear();
  outputChannel.show();

  const fileName = editor.document.fileName.split('/').pop() || 'unknown';
  const language = editor.document.languageId;
  const codeLength = code.split('\n').length;

  outputChannel.appendLine(`Tiger Code Pilot - Code Analysis`);
  outputChannel.appendLine(`=`.repeat(50));
  outputChannel.appendLine(`File: ${fileName}`);
  outputChannel.appendLine(`Language: ${language}`);
  outputChannel.appendLine(`Lines: ${codeLength}`);
  outputChannel.appendLine(`Analysis: ${analysisType.label}`);
  outputChannel.appendLine(`Provider: ${state.provider}`);
  outputChannel.appendLine(`Model: ${state.preset || state.model}`);
  outputChannel.appendLine(`=`.repeat(50));
  outputChannel.appendLine('');
  outputChannel.appendLine('Analyzing code...');
  outputChannel.appendLine('');

  // Build prompt
  const prompt = `${ANALYSIS_PROMPTS[analysisType.value as keyof typeof ANALYSIS_PROMPTS]}

${language.toUpperCase()} CODE:
\`\`\`${language}
${code}
\`\`\``;

  try {
    const model = state.preset || state.model;
    const endpointUrl = state.endpointUrl || getEndpointUrlForProvider(state.provider);

    const response = await axios.default.post(
      endpointUrl,
      {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3 // Lower temperature for more consistent analysis
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.apiKey}`
        }
      }
    );

    const analysisResult = response.data.choices?.[0]?.message?.content;

    if (analysisResult) {
      outputChannel.appendLine(analysisResult);
      outputChannel.appendLine('');
      outputChannel.appendLine('='.repeat(50));
      outputChannel.appendLine('Analysis complete!');

      // Save prompt to storage
      addPromptToStorage(context, prompt.substring(0, 200) + '...');

      vscode.window.showInformationMessage('Code analysis complete!');
    } else {
      outputChannel.appendLine('No response received from AI.');
      vscode.window.showErrorMessage('Analysis failed - no response received.');
    }
  } catch (error) {
    outputChannel.appendLine('');
    outputChannel.appendLine('Error during analysis:');
    outputChannel.appendLine('');

    if (axios.default.isAxiosError(error)) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      outputChannel.appendLine(errorMsg);
      vscode.window.showErrorMessage(`Analysis failed: ${errorMsg}`);
    } else {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      outputChannel.appendLine(errorMsg);
      vscode.window.showErrorMessage(`Analysis failed: ${errorMsg}`);
    }
  }
}

async function loadStoredState(context: vscode.ExtensionContext): Promise<CopilotState> {
  const state = getInitialState();

  // Load from global state
  const savedProvider = context.globalState.get<string>(STORAGE_KEYS.PROVIDER);
  const savedModel = context.globalState.get<string>(STORAGE_KEYS.MODEL);
  const savedEndpoint = context.globalState.get<string>(STORAGE_KEYS.ENDPOINT_URL);
  const savedMode = context.globalState.get<string>(STORAGE_KEYS.MODE);

  if (savedProvider) {
    state.provider = savedProvider as Provider;
  }
  if (savedModel) {
    state.model = savedModel;
    state.preset = savedModel;
  }
  if (savedEndpoint) {
    state.endpointUrl = savedEndpoint;
  } else {
    state.endpointUrl = getEndpointUrlForProvider(state.provider);
  }
  if (savedMode) {
    state.mode = savedMode;
  }

  // Load API key from secret storage
  const secretKey = getSecretKeyForProvider(state.provider);
  const savedApiKey = await context.secrets.get(secretKey);
  if (savedApiKey) {
    state.apiKey = savedApiKey;
  }

  return state;
}

async function saveApikey(context: vscode.ExtensionContext, provider: Provider, apiKey: string): Promise<void> {
  const secretKey = getSecretKeyForProvider(provider);
  await context.secrets.store(secretKey, apiKey);
}

function getStorageData(context: vscode.ExtensionContext): StorageData {
  const data = context.globalState.get<StorageData>(STORAGE_KEYS.STORAGE_DATA);
  return data || {
    prompts: [],
    models: [],
    files: []
  };
}

async function saveStorageData(context: vscode.ExtensionContext, data: StorageData): Promise<void> {
  await context.globalState.update(STORAGE_KEYS.STORAGE_DATA, data);
}

function addPromptToStorage(context: vscode.ExtensionContext, prompt: string): void {
  const data = getStorageData(context);
  if (!data.prompts.includes(prompt)) {
    data.prompts.unshift(prompt);
    // Keep only last 50 prompts
    if (data.prompts.length > 50) {
      data.prompts = data.prompts.slice(0, 50);
    }
    saveStorageData(context, data);
  }
}

function addModelToStorage(context: vscode.ExtensionContext, model: SavedModel): void {
  const data = getStorageData(context);
  // Avoid duplicates
  const existingIndex = data.models.findIndex(m => m.name === model.name && m.provider === model.provider);
  if (existingIndex >= 0) {
    data.models[existingIndex] = model;
  } else {
    data.models.unshift(model);
    // Keep only last 20 models
    if (data.models.length > 20) {
      data.models = data.models.slice(0, 20);
    }
  }
  saveStorageData(context, data);
}

// Used when user adds custom model
void addModelToStorage;

function addFileToStorage(context: vscode.ExtensionContext, file: SavedFile): void {
  const data = getStorageData(context);
  // Avoid duplicates
  const existingIndex = data.files.findIndex(f => f.name === file.name);
  if (existingIndex >= 0) {
    data.files[existingIndex] = file;
  } else {
    data.files.unshift(file);
    // Keep only last 30 files
    if (data.files.length > 30) {
      data.files = data.files.slice(0, 30);
    }
  }
  saveStorageData(context, data);
}

function getWebviewHtml(state: CopilotState, storageData: StorageData): string {
  const modes = MODE_OPTIONS.map(m => `<option value="${m}" ${m === state.mode ? 'selected' : ''}>${m}</option>`).join('');
  const presets = getModelOptions(state.provider);

  const savedPromptsOptions = storageData.prompts.slice(0, 20).map(p =>
    `<option value="${p.replace(/"/g, '&quot;')}">${p.substring(0, 50)}${p.length > 50 ? '...' : ''}</option>`
  ).join('');

  const savedModelsOptions = storageData.models.map(m =>
    `<option value="${m.name}" data-provider="${m.provider}">${m.name} (${m.provider})</option>`
  ).join('');

  const savedFilesOptions = storageData.files.map(f =>
    `<option value="${f.name}">${f.name}${f.language ? ` [${f.language}]` : ''}</option>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tiger Code Pilot</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
    label { display: block; margin-top: 10px; font-weight: bold; }
    select, textarea, input, button { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; margin-top: 8px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    pre { background: var(--vscode-textBlockQuote-background); padding: 10px; overflow-x: auto; white-space: pre-wrap; }
    .row { display: flex; gap: 10px; }
    .row > * { flex: 1; }
    .storage-section { margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--vscode-panel-border); }
    .status { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <h2>🐯 Tiger Code Pilot</h2>

  <div class="row">
    <div>
      <label>Mode</label>
      <select id="mode">${modes}</select>
    </div>
    <div>
      <label>Provider</label>
      <select id="provider">
        <option value="openai" ${state.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
        <option value="huggingface" ${state.provider === 'huggingface' ? 'selected' : ''}>HuggingFace</option>
        <option value="ollama" ${state.provider === 'ollama' ? 'selected' : ''}>Ollama</option>
        <option value="local" ${state.provider === 'local' ? 'selected' : ''}>Local</option>
      </select>
    </div>
  </div>

  <label>Model Preset</label>
  <select id="preset">
    <option value="">Select or type custom model...</option>
    ${presets}
    ${savedModelsOptions}
  </select>

  <label>API Key</label>
  <input type="password" id="apiKey" placeholder="Enter API key (saved securely)" value="${state.apiKey ? '••••••••••••' : ''}" />
  <div class="status">🔒 API keys are stored securely in VS Code's secret storage</div>
  <div class="status">💡 Tip: HuggingFace and Ollama offer free models that don't require API keys</div>

  <label>Endpoint URL (optional - auto-detected for providers)</label>
  <input type="text" id="endpointUrl" placeholder="${getEndpointUrlForProvider(state.provider)}" value="${state.endpointUrl}" />

  <div class="storage-section">
    <label>[QS] Quick Start Templates</label>
    <select id="quickStart">
      <option value="">Choose a task template...</option>
      ${QUICK_START_PRESETS.map(p => `<option value="${p.id}" data-prompt="${p.prompt.replace(/"/g, '&quot;')}">${p.name}</option>`).join('')}
    </select>
    <div class="status">Select a template to auto-fill the prompt with a structured request</div>
  </div>

  <div class="storage-section">
    <label>[SP] Saved Prompts</label>
    <select id="savedPrompt">
      <option value="">Load saved prompt...</option>
      ${savedPromptsOptions}
    </select>
  </div>

  <div class="storage-section">
    <label>[SF] Saved Files/Code Snippets</label>
    <select id="savedFile">
      <option value="">Load saved file...</option>
      ${savedFilesOptions}
    </select>
  </div>

  <div class="storage-section">
    <label>Prompt</label>
    <textarea id="prompt" rows="4" cols="40" placeholder="Enter your prompt here">${state.prompt}</textarea>

    <div class="row" style="margin-top: 8px;">
      <button id="savePrompt" class="secondary">[Save] Save Prompt</button>
      <button id="copyPrompt" class="secondary">[Copy] Copy Prompt</button>
    </div>
  </div>

  <label>Code Context (optional)</label>
  <textarea id="codeInput" rows="6" cols="40" placeholder="Paste code context here or use 'Load from Editor'">${state.codeInput}</textarea>

  <div class="row" style="margin-top: 8px;">
    <button id="loadFromEditor" class="secondary">[Load] Load from Editor</button>
    <button id="saveFile" class="secondary">[Save] Save Code</button>
  </div>

  <button id="run" style="margin-top: 15px; font-size: 16px; font-weight: bold;">[Run] Run Copilot</button>

  <h3>Output</h3>
  <pre id="out">Results will appear here...</pre>

  <button id="copyOutput" class="secondary">[Copy] Copy Output</button>

  <script>
    const vscode = acquireVsCodeApi();
    let currentProvider = '${state.provider}';
    let apiKeyModified = false;

    // Load saved prompt
    document.getElementById('savedPrompt').addEventListener('change', (e) => {
      if (e.target.value) {
        document.getElementById('prompt').value = e.target.value;
        e.target.value = '';
      }
    });

    // Load quick start template
    document.getElementById('quickStart').addEventListener('change', (e) => {
      const selected = e.target.selectedOptions[0];
      if (selected && selected.dataset.prompt) {
        document.getElementById('prompt').value = selected.dataset.prompt;
        e.target.value = '';
      }
    });

    // Load saved file
    document.getElementById('savedFile').addEventListener('change', (e) => {
      if (e.target.value) {
        vscode.postMessage({ type: 'loadFile', payload: { name: e.target.value } });
        e.target.value = '';
      }
    });

    // Save prompt
    document.getElementById('savePrompt').addEventListener('click', () => {
      const prompt = document.getElementById('prompt').value;
      if (prompt) {
        vscode.postMessage({ type: 'savePrompt', payload: { prompt } });
        alert('Prompt saved!');
      }
    });

    // Copy prompt
    document.getElementById('copyPrompt').addEventListener('click', () => {
      const prompt = document.getElementById('prompt').value;
      navigator.clipboard.writeText(prompt).then(() => {
        alert('Prompt copied to clipboard!');
      });
    });

    // Load from editor
    document.getElementById('loadFromEditor').addEventListener('click', () => {
      vscode.postMessage({ type: 'loadFromEditor' });
    });

    // Save file
    document.getElementById('saveFile').addEventListener('click', () => {
      const code = document.getElementById('codeInput').value;
      const name = prompt('Enter a name for this code snippet:');
      if (name && code) {
        vscode.postMessage({ type: 'saveFile', payload: { name, content: code } });
        alert('Code snippet saved!');
      }
    });

    // Copy output
    document.getElementById('copyOutput').addEventListener('click', () => {
      const output = document.getElementById('out').textContent;
      navigator.clipboard.writeText(output).then(() => {
        alert('Output copied to clipboard!');
      });
    });

    // Provider change - update endpoint
    document.getElementById('provider').addEventListener('change', (e) => {
      currentProvider = e.target.value;
      const endpoints = {
        openai: 'https://api.openai.com/v1/chat/completions',
        huggingface: 'https://api-inference.huggingface.co/models/',
        ollama: 'http://localhost:11434/api/generate',
        local: 'http://localhost:8080/v1/chat/completions'
      };
      document.getElementById('endpointUrl').placeholder = endpoints[currentProvider];
    });

    // Track API key modification
    document.getElementById('apiKey').addEventListener('input', (e) => {
      apiKeyModified = true;
    });

    // Run copilot
    document.getElementById('run').addEventListener('click', () => {
      const apiKeyInput = document.getElementById('apiKey').value;
      const isNewApiKey = apiKeyInput && !apiKeyInput.includes('•');

      const payload = {
        mode: document.getElementById('mode').value,
        provider: currentProvider,
        preset: document.getElementById('preset').value,
        apiKey: isNewApiKey ? apiKeyInput : (apiKeyModified ? apiKeyInput : ''),
        endpointUrl: document.getElementById('endpointUrl').value,
        prompt: document.getElementById('prompt').value,
        codeInput: document.getElementById('codeInput').value,
        saveApiKey: isNewApiKey
      };
      vscode.postMessage({ type: 'run', payload });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      if (event.data.type === 'result') {
        document.getElementById('out').textContent = event.data.payload;
      } else if (event.data.type === 'fileContent') {
        document.getElementById('codeInput').value = event.data.payload.content;
      }
    });
  </script>
</body>
</html>`;
}

// Panel references — reuse existing panels
let _chatPanel: vscode.WebviewPanel | undefined;
let _progressPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Register onboarding command
  const onboardingDisposable = vscode.commands.registerCommand('codePilot.onboarding', () => {
    showOnboarding(context);
  });

  // Register test connection command
  const testConnectionDisposable = vscode.commands.registerCommand('codePilot.testConnection', async () => {
    const state = await loadStoredState(context);
    await testConnection(context, state);
  });

  // Register progress dashboard command
  const progressDisposable = vscode.commands.registerCommand('codePilot.agentProgress', () => {
    openProgressPanel(context);
  });

  // Load stored state
  loadStoredState(context).then(state => {
    const openChatDisposable = vscode.commands.registerCommand('codePilot.openChat', () => {
      openCopilotPanel(context, state);
    });

    const startDisposable = vscode.commands.registerCommand('codePilot.start', () => {
      analyzeCode(context, state);
    });

    context.subscriptions.push(
      onboardingDisposable,
      testConnectionDisposable,
      progressDisposable,
      openChatDisposable,
      startDisposable
    );

    // Show onboarding on first use
    const hasSeenOnboarding = context.globalState.get<boolean>('tigerCodePilot.hasSeenOnboarding');
    if (!hasSeenOnboarding) {
      context.globalState.update('tigerCodePilot.hasSeenOnboarding', true);
      showOnboarding(context);
    }
  });
}

function openCopilotPanel(context: vscode.ExtensionContext, state: CopilotState) {
  // Reuse existing panel if it still exists
  if (_chatPanel) {
    _chatPanel.reveal(vscode.ViewColumn.Two);
    return;
  }

  const storageData = getStorageData(context);

  const panel = vscode.window.createWebviewPanel(
    'tigerCodePilot',
    'Tiger Code Pilot',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  _chatPanel = panel;

  // Reset panel reference when disposed
  panel.onDidDispose(() => {
    _chatPanel = undefined;
  });

  panel.webview.html = getWebviewHtml(state, storageData);

  panel.webview.onDidReceiveMessage(async message => {
    switch (message.type) {
      case 'run': {
        try {
          const payload = message.payload;

          // Save API key if provided
          if (payload.saveApiKey && payload.apiKey) {
            await saveApikey(context, payload.provider as Provider, payload.apiKey);
            state.apiKey = payload.apiKey;
          } else if (payload.apiKey) {
            state.apiKey = payload.apiKey;
          }

          // Save provider/model preferences
          context.globalState.update(STORAGE_KEYS.PROVIDER, payload.provider);
          context.globalState.update(STORAGE_KEYS.MODEL, payload.preset);
          context.globalState.update(STORAGE_KEYS.MODE, payload.mode);
          if (payload.endpointUrl) {
            context.globalState.update(STORAGE_KEYS.ENDPOINT_URL, payload.endpointUrl);
          }

          // Save prompt to storage
          if (payload.prompt) {
            addPromptToStorage(context, payload.prompt);
          }

          state.provider = payload.provider as Provider;
          state.mode = payload.mode;
          state.preset = payload.preset;
          state.prompt = payload.prompt;
          state.codeInput = payload.codeInput;
          state.endpointUrl = payload.endpointUrl || getEndpointUrlForProvider(state.provider);

          // Wire to Core Engine (stub — will be replaced by backend team)
          const { getCoreEngine } = require('./core-engine');
          const engine = getCoreEngine();
          engine.setApiKey(state.apiKey);
          engine.setEndpoint(state.endpointUrl);
          engine.setModel(state.preset || state.model);

          // Streaming with graceful fallback
          if (typeof engine.chatStream === 'function') {
            await engine.chatStream(
              state.prompt,
              'tiger-code-pilot-session',
              (chunk: string) => {
                panel.webview.postMessage({ type: 'response', payload: chunk });
              }
            );
          } else {
            // Fallback to full response
            const result = await engine.chat(state.prompt, 'tiger-code-pilot-session');
            panel.webview.postMessage({ type: 'response', payload: result });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          panel.webview.postMessage({ type: 'error', payload: errorMessage });
        }
        break;
      }

      case 'savePrompt':
        if (message.payload.prompt) {
          addPromptToStorage(context, message.payload.prompt);
        }
        break;

      case 'loadFromEditor': {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const selection = editor.selection;
          const code = selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(selection);

          const language = editor.document.languageId;
          panel.webview.postMessage({
            type: 'fileContent',
            payload: { content: code, language }
          });
        } else {
          panel.webview.postMessage({
            type: 'error',
            payload: 'No active editor found. Open a file first.'
          });
        }
        break;
      }

      case 'saveFile': {
        if (message.payload.name && message.payload.content) {
          const editor = vscode.window.activeTextEditor;
          const language = editor?.document.languageId;
          addFileToStorage(context, {
            name: message.payload.name,
            content: message.payload.content,
            language,
            savedAt: new Date().toISOString()
          });
        }
        break;
      }

      case 'loadFile': {
        const data = getStorageData(context);
        const file = data.files.find(f => f.name === message.payload.name);
        if (file) {
          panel.webview.postMessage({
            type: 'fileContent',
            payload: { content: file.content, language: file.language }
          });
        }
        break;
      }
    }
  });
}

function openProgressPanel(context: vscode.ExtensionContext) {
  // Reuse existing panel
  if (_progressPanel) {
    _progressPanel.reveal(vscode.ViewColumn.Two);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'tigerCodePilotProgress',
    'Agent Progress',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  _progressPanel = panel;

  panel.onDidDispose(() => {
    _progressPanel = undefined;
  });

  // Read the progress dashboard HTML
  const fs = require('fs');
  const dashboardPath = path.join(context.extensionPath, 'src', 'ui', 'progress-dashboard.html');
  const html = fs.existsSync(dashboardPath)
    ? fs.readFileSync(dashboardPath, 'utf-8')
    : '<html><body><h1>Agent Progress Dashboard</h1><p>No active tasks.</p></body></html>';

  panel.webview.html = html;
}

async function callCopilot(state: CopilotState): Promise<string> {
  const model = state.preset || state.model;

  if (!state.prompt) {
    return 'No prompt provided. Please enter a prompt to continue.';
  }

  try {
    const response = await axios.default.post(
      state.endpointUrl,
      {
        model: model,
        messages: [{ role: 'user', content: state.prompt }],
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.apiKey}`
        }
      }
    );

    return response.data.choices?.[0]?.message?.content || 'No response received.';
  } catch (error) {
    if (axios.default.isAxiosError(error)) {
      return `API Error: ${error.response?.data?.error?.message || error.message}`;
    }
    throw error;
  }
}

export function deactivate() {}

// Free models reference (used in onboarding and webview tips)
void FREE_MODELS;

