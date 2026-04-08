# Contributing to Tiger Code MCP Server

Thank you for your interest in contributing! 🐯

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/tiger-code-pilot/tiger-code-mcp-server.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development Workflow

```bash
# Run tests
npm test

# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Start in stdio mode (for MCP clients)
npm start

# Start in HTTP mode
npm run start:http
```

## Adding New Tools

1. Add tool definition to `TOOLS` array in `index.js`
2. Add handler to `TOOL_HANDLERS` in `index.js`
3. Add tests to `test.js`
4. Update README.md with the new tool
5. Run `npm test && npm run lint`

### Tool Template

```javascript
// In TOOLS array
{
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description' }
    },
    required: ['param1']
  }
}

// In TOOL_HANDLERS
my_tool: async (args) => {
  // Implementation
  return 'Result';
}
```

## Code Style

- Single quotes for strings
- Semicolons at end of statements
- JSDoc comments for public functions
- Maximum 2 blank lines between sections
- Trailing commas: never

## Pull Request Guidelines

- [ ] Tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] New tools have tests
- [ ] README.md is updated
- [ ] Commit messages are descriptive

## Reporting Bugs

Please include:
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## Security

Report security vulnerabilities privately via GitHub's security advisory feature. Do not open a public issue.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
