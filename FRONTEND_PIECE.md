# Tiger Code Pilot — Frontend / Extension Piece

> This document covers the frontend half of the project.
> Qwen Code Copilot is responsible for this piece.
> Amazon Q is responsible for the Backend piece (see BACKEND_PIECE.md).

---

## Scope

Everything that runs inside VS Code:

| File | Responsibility |
|---|---|
| `src/extension.ts` | Extension entry point — commands, webview, onboarding |
| `src/ui/webview.html` | Chat panel UI (dark theme, animated logo, code blocks) |
| `src/ui/theme.js` | UI theme tokens |
| `src/ui/cli-visuals.js` | Terminal visual helpers |
| `src/ui/progress-dashboard.html` | Agent progress dashboard UI |
| `images/logo-vscode.svg` | VS Code marketplace banner (500×500) |
| `images/logo-agent-core.svg` | Agent core logo variant |
| `images/logo-dark-core.svg` | Dark core logo variant |
| `images/icon-64.svg` | 64px app icon |
| `images/icon.png` | Packaged extension icon (must be PNG) |

---

## Current Status

### Working
- VS Code commands registered: `openChat`, `start` (analyze), `onboarding`, `testConnection`
- Webview chat panel with dark theme, animated `</>` logo, code block rendering
- Quick action buttons: Analyze, Explain, Refactor, Tests, Debug, Optimize
- Onboarding wizard with free model setup (HuggingFace, Ollama, OpenAI)
- API key secure storage via `vscode.SecretStorage`
- Provider/model preferences persisted via `vscode.globalState`
- Load code from active editor into chat context
- Save/load prompts and code snippets in local storage

### Needs Work
- `webview.html` — quick action buttons fill the input but don't auto-load selected editor code
- `extension.ts` — `openCopilotPanel()` creates a new panel every call instead of reusing existing one
- `extension.ts` — the webview `run` message handler calls `callCopilot()` directly, bypassing `core-engine.js`
- `extension.ts` — no streaming — response only appears after full completion
- `src/ui/progress-dashboard.html` — exists but is never opened by any command
- No sidebar/tree view — everything is a floating panel

---

## What Needs Building

### 1. Reuse Existing Panel (`extension.ts`)
`openCopilotPanel()` should check if a panel already exists and call `panel.reveal()` instead of creating a new one. Store the panel reference outside the function.

### 2. Wire Webview to Core Engine (`extension.ts`)
The `run` message handler currently calls a local `callCopilot()` function. Replace it with a call to `getCoreEngine().chat()` from `core-engine.js` so the backend handles all AI routing.

### 3. Auto-Load Editor Code on Quick Actions (`webview.html`)
When a quick action button is clicked, automatically request the selected editor code via `vscode.postMessage({ type: 'loadFromEditor' })` before filling the prompt, so the user doesn't have to click "Load from Editor" separately.

### 4. Hook Up Progress Dashboard (`extension.ts`)
Add a command `codePilot.agentProgress` that opens `progress-dashboard.html` in a second webview column. The local agent sends progress events — display them here as a live step list.

### 5. Streaming Responses (`extension.ts` + `webview.html`)
When the backend supports streaming (see BACKEND_PIECE.md), update the webview message handler to append chunks to the current assistant message instead of waiting for the full response.

---

## API Contract (Frontend → Backend)

The extension calls the backend via direct Node.js `require()` — no HTTP, no sockets.
Do not change these — the backend (Amazon Q) implements them.

### Core Engine (direct import)
```ts
const { getCoreEngine } = require('./core-engine');
const engine = getCoreEngine();

engine.chat(message: string, sessionId: string): Promise<string>
engine.analyze(code: string, language: string, mode: string): Promise<string>
engine.vibecode(action: string, params: object): Promise<string>
engine.switchProvider(name: string): void
engine.getConfig(): object
// Streaming variant — callback receives each chunk as it arrives
engine.chatStream(message: string, sessionId: string, onChunk: (chunk: string) => void): Promise<void>
```

### Webview ↔ Extension Messages
```ts
// Webview → Extension
{ type: 'chat',         payload: { message } }
{ type: 'run',          payload: { mode, provider, preset, apiKey, prompt, codeInput } }
{ type: 'loadFromEditor' }
{ type: 'savePrompt',   payload: { prompt } }
{ type: 'saveFile',     payload: { name, content } }
{ type: 'loadFile',     payload: { name } }

// Extension → Webview
{ type: 'response',     payload: string }
{ type: 'error',        payload: string }
{ type: 'fileContent',  payload: { content, language } }
{ type: 'progress',     payload: { step, status, details } }
```

---

## VS Code Commands

| Command ID | Title | Trigger |
|---|---|---|
| `codePilot.openChat` | Tiger Code Pilot: Open Chat | Command palette |
| `codePilot.start` | Tiger Code Pilot: Analyze Code | Command palette |
| `codePilot.onboarding` | Tiger Code Pilot: Quick Start | First launch + palette |
| `codePilot.testConnection` | Tiger Code Pilot: Test Connection | Command palette |

---

## Build & Run

```bash
npm install
npm run compile       # TypeScript → dist/
# Press F5 in VS Code → Extension Development Host
```

Package for marketplace:
```bash
npm run compile
vsce package          # generates .vsix
```

---

## Extension Manifest Notes (`package.json`)

- `"icon"` must point to a PNG file — `images/icon.png`
- `"galleryBanner"` is set to `{ "color": "#1e1e1e", "theme": "dark" }`
- `"engines.vscode"` is `^1.90.0`
- `"main"` points to `./dist/extension.js` (compiled output)

---

## Design System (`webview.html`)

CSS variables already defined — use these, don't add new colors:

```css
--primary: #6366f1        /* indigo — buttons, focus rings */
--secondary: #10b981      /* green — success states */
--accent: #f59e0b         /* amber — warnings */
--danger: #ef4444         /* red — errors */
--bg-primary: #0f172a     /* darkest background */
--bg-secondary: #1e293b   /* panel background */
--bg-tertiary: #334155    /* input background */
--text-primary: #f8fafc
--text-secondary: #94a3b8
--text-muted: #64748b
```

Logo uses red `#dc2626` / `#991b1b` gradient with a silver `#c0c0c0` orbit dot — keep consistent with `logo-vscode.svg`.
