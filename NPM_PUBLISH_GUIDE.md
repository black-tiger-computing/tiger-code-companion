# How to Publish Tiger Code Pilot to npm

## Prerequisites

### 1. Create an npm Account

**If you don't have one:**
1. Go to: https://www.npmjs.com/signup
2. Choose a username (e.g., `black-tiger-computing` or your name)
3. Enter your email and password
4. Click "Create an account"
5. **Verify your email** (check your inbox)

### 2. Login to npm from Your Computer

Open a terminal and run:
```bash
npm adduser
```

It will prompt you for:
- **Username:** (your npm username)
- **Password:** (your npm password)
- **Email:** (your email)

If successful, you'll see: `Logged in as <username> on https://registry.npmjs.org/.`

---

## Publishing Steps

### Step 1: Verify Package Name

The package name is: **tiger-code-pilot**

To check if it's available:
```bash
npm view tiger-code-pilot
```

If it says "npm error code E404", that's good - it means the name is available!

### Step 2: Run Tests (Always Do This Before Publishing)

```bash
npm test
```

Make sure all 27 tests pass before publishing.

### Step 3: Compile TypeScript

```bash
npm run compile
```

This creates the `./dist/extension.js` file that the package.json points to.

### Step 4: Do a Dry Run (Optional but Recommended)

```bash
npm publish --dry-run
```

This shows you what would be published without actually publishing. Review the file list.

### Step 5: Publish!

```bash
npm publish
```

If successful, you'll see something like:
```
npm notice 📦  tiger-code-pilot@0.4.0
npm notice === Tarball Contents ===
...
npm notice published: tiger-code-pilot@0.4.0
```

### Step 6: Verify It's Published

Go to: https://www.npmjs.com/package/tiger-code-pilot

You should see your package!

---

## After Publishing

### Install It Globally (Test It Works)

```bash
npm install -g tiger-code-pilot
tiger-code-pilot help
```

### Update package-lock.json

```bash
npm install
git add package-lock.json
git commit -m "chore: update package-lock.json after npm publish"
git push
```

---

## Publishing Updates in the Future

When you make changes and want to release a new version:

### 1. Update the Version

```bash
npm version patch   # 0.4.0 → 0.4.1 (bug fixes)
npm version minor   # 0.4.0 → 0.5.0 (new features)
npm version major   # 0.4.0 → 1.0.0 (major release)
```

This automatically:
- Updates version in package.json
- Creates a git tag
- Creates a git commit

### 2. Push to GitHub

```bash
git push && git push --tags
```

### 3. Publish to npm

```bash
npm publish
```

---

## Common Issues and Solutions

### Issue: "You do not have permission to publish"
**Solution:** The package name is taken. Change the name in package.json to something unique.

### Issue: "You must be logged in to publish"
**Solution:** Run `npm adduser` to log in.

### Issue: "Cannot publish over previously published version"
**Solution:** You need to bump the version number. Run `npm version patch` or similar.

### Issue: "No README data"
**Solution:** Make sure you have a README.md file in your project.

### Issue: Missing files in published package
**Solution:** Check that all necessary files are included. npm publishes everything except what's in `.npmignore` or `.gitignore`.

---

## Your Package Details

- **Name:** tiger-code-pilot
- **Version:** 0.4.0
- **Description:** AI-powered coding assistant with MCP server, CLI, vibecoding, and natural language chat
- **Repository:** https://github.com/black-tiger-computing/tiger-code-companion
- **Homepage:** https://github.com/black-tiger-computing/tiger-code-companion

### Binaries (CLI Commands)
- `tiger-code-pilot` - Main CLI
- `tiger-code-mcp` - MCP Server
- `tiger-agent` - Local Agent

### Keywords
ai, copilot, tiger, code, vscode, mcp, vibecoding, cli

---

## Quick Checklist Before Publishing

- [ ] Created npm account
- [ ] Logged in with `npm adduser`
- [ ] All tests passing (`npm test`)
- [ ] TypeScript compiled (`npm run compile`)
- [ ] package.json has correct version
- [ ] README.md exists and is complete
- [ ] Repository URLs point to correct GitHub repo
- [ ] Ran `npm publish --dry-run` to review
- [ ] Ready to publish!
