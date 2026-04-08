# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅         |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. Go to: https://github.com/tiger-code-pilot/tiger-code-mcp-server/security/advisories/new
3. Fill out the security advisory form
4. We will respond within 48 hours

## Security Features

### Command Execution Safety
- **Allowlist-based**: Only pre-approved commands can be executed
- **Pattern matching**: Dangerous patterns are blocked regardless of command
- **Timeout protection**: Commands timeout after 2 minutes
- **Buffer limits**: Output capped at 10MB

### File System Safety
- Read operations are always allowed
- Write operations require explicit tool call
- No automatic file deletion
- Directory creation is explicit

### AI Provider Security
- API keys stored locally only (`~/.tiger-code-pilot/config.json`)
- Keys never transmitted in logs or error messages
- Supports local providers (Ollama, LM Studio) for air-gapped environments

## Best Practices for Users

1. **Use local AI providers** when possible (Ollama, LM Studio)
2. **Review allowed commands** before expanding the allowlist
3. **Run in stdio mode** for MCP client integration (no HTTP exposure)
4. **Use HTTPS** if exposing HTTP mode over network
5. **Keep Node.js updated** to latest LTS version

## Audit Trail

All tool calls are logged to stderr in stdio mode. In HTTP mode, consider adding request logging for audit purposes.
