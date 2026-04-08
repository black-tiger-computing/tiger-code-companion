# Open Source Grants & Funding Guide

This document outlines grant opportunities available for the Tiger Code MCP Server project and similar open source AI/software projects.

---

## GitHub Funding Programs

### 1. GitHub Sponsors

- **What**: Monthly recurring sponsorships from individuals and organizations
- **Eligibility**: Any public GitHub repository
- **How to Apply**:
  1. Go to repository Settings → Sponsorship
  2. Enable GitHub Sponsors
  3. Set up funding tiers and benefits
- **Link**: <https://github.com/sponsors>
- **Status**: ✅ Can enable immediately

### 2. GitHub Open Source Security Fund

- **What**: Security-focused funding for critical open source projects
- **Amount**: Variable (typically $5,000 - $50,000)
- **Focus**: Vulnerability remediation, security tooling, supply chain security
- **How it works**: Funding disbursed through GitHub Sponsors program
- **Application**: Open rolling basis — apply via <https://github.com/open-source>
- **Regions**: Limited to countries supported by GitHub Sponsors payouts
- **Deadline**: Applications open (no fixed deadline)

### 3. GitHub Alpha-Omega (with Microsoft + OpenSSF)

- **What**: Security-focused funding for open source maintainers
- **Focus**: Software supply chain security, vulnerability scanning, secure coding tools
- **Why We Qualify**: Tiger Code MCP has built-in security features (command allowlisting, pattern blocking, file safety)
- **How to Apply**: Submit proposal via [OpenSSF Alpha-Omega](https://alpha-omega.dev/)
- **Deadline**: Rolling applications

### 4. GitHub Security Lab

- **What**: Security research and project support
- **Focus**: Tools that improve code security, static analysis, vulnerability detection
- **Why We Qualify**: `analyze_code` tool with security mode, secure command execution
- **Link**: <https://securitylab.github.com/>

---

## Other Major Programs

### 5. Google Season of Docs

- **What**: Funding for documentation improvements
- **Amount**: $5,000 - $10,000
- **Deadline**: Annual (usually March-April)
- **How to Apply**: Submit project proposal as a mentor organization
- **Link**: <https://developers.google.com/season-of-docs>

### 6. OpenSSF Best Practices Badge

- **What**: Self-certification for security best practices
- **Why**: Increases credibility for grant applications
- **Link**: <https://bestpractices.coreinfrastructure.org/>

### 7. NLNet (EU Open Source Grants)

- **What**: European open source innovation grants
- **Amount**: €5,000 - €50,000 (some up to €500,000 for extraordinary projects)
- **Focus**: Privacy, security, open standards, AI ethics
- **Why We Qualify**: Local-first AI, privacy-preserving coding assistant
- **Deadline**: Quarterly rounds
- **Link**: <https://nlnet.nl/>

### 8. Ford Foundation

- **What**: Open source for social impact
- **Focus**: Technology that benefits society, equitable access
- **Why We Qualify**: Democratizing AI access through local models, free coding education
- **Link**: <https://www.fordfoundation.org/>

### 9. Open Funding Network (ralphtheninja/open-funding)

- **What**: Curated list of open source funding opportunities
- **Amount**: $5,000 - $250,000 average, up to $500,000 extraordinary
- **Link**: <https://github.com/ralphtheninja/open-funding>

---

## Application Strategy

### Phase 1: Immediate (Week 1-2)

- [ ] Enable GitHub Sponsors
- [ ] Complete OpenSSF Best Practices Badge
- [ ] Add Sponsors section to README.md

### Phase 2: Short-term (Month 1-2)

- [ ] Submit Alpha-Omega security proposal
- [ ] Apply for NLNet privacy grant
- [ ] Register for Google Season of Docs

### Phase 3: Medium-term (Month 3-6)

- [ ] Publish security audit report
- [ ] Build community metrics (stars, contributors, downloads)
- [ ] Apply for Ford Foundation social impact grant

---

## What Makes Us Eligible

### Strong Points

1. **MIT License** — Fully open source
2. **Active Development** — Regular commits, clear roadmap
3. **Security Focus** — Built-in security features (allowlists, pattern blocking)
4. **Privacy-First** — Supports local AI providers (Ollama, LM Studio)
5. **Community Ready** — CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
6. **Real-World Impact** — Helps developers code better with AI

### Metrics to Track

- GitHub stars
- npm downloads
- Number of contributors
- MCP client integrations
- Community discussions

---

## Proposal Template (Alpha-Omega / Security Fund)

```
Project: Tiger Code MCP Server
Description: Model Context Protocol server for AI coding assistance

Security Features:
1. Command execution allowlist with pattern-based blocking
2. File system safety (no automatic deletion, explicit writes)
3. Local-first AI provider support (Ollama, LM Studio)
4. No API key exposure in logs or errors

Funding Request: $X,XXX
Use of Funds:
- Security audit ($X,XXX)
- Bug bounty program ($X,XXX)
- Dependency vulnerability monitoring ($X,XXX)

Impact: Improving security for X developers using AI coding tools
```

## Ready Email Drafts

Copy-paste ready proposals (tailored for Tiger Code Companion repo <https://github.com/black-tiger-computing/tiger-code-companion>):

| Grant | File | Min Ask |
|-------|------|---------|
| Alpha-Omega | [alpha-omega-proposal.md](./grant-emails/alpha-omega-proposal.md) | $10k |
| NLNet | [nlnet-proposal.md](./grant-emails/nlnet-proposal.md) | €5k |
| Google Season of Docs | [google-season-of-docs-proposal.md](./grant-emails/google-season-of-docs-proposal.md) | $6k |
| GitHub Security Lab | [github-security-lab-proposal.md](./grant-emails/github-security-lab-proposal.md) | Support |
| Ford Foundation | [ford-foundation-proposal.md](./grant-emails/ford-foundation-proposal.md) | $10k |

---

## Resources

- [GitHub Open Source Programs](https://github.com/open-source)
- [OpenSSF](https://openssf.org/)
- [Alpha-Omega](https://alpha-omega.dev/)
- [NLNet](https://nlnet.nl/)
- [Google Season of Docs](https://developers.google.com/season-of-docs)
- [Open Funding Network](https://github.com/ralphtheninja/open-funding)
