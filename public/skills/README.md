# EasyBits skills

Agent Skills for [EasyBits](https://www.easybits.cloud), the cloud for AI agents: sandboxes,
web, files, SQL databases, documents, hosting and a fleet of agents on WhatsApp/Teams.

Install in any agent (Claude Code, Cursor, Codex, Gemini CLI, Copilot, Goose, Windsurf…):

```bash
npx skills add https://easybits.cloud          # discovery by well-known (RFC 8615), digest-verified
npx skills add blissito/easybits-skills        # same skills, from this repo
```

| Skill | Use when |
|---|---|
| `easybits` | do work on EasyBits from a coding agent (REST, SDK or MCP) |
| `easybits-cli` | drive EasyBits from a shell with the `easybits` CLI (`--json`, exit codes) |
| `easybits-sandbox` | create and drive a Firecracker microVM |
| `easybits-agent` | create a persistent agent and talk to it (HTTP/ACP) |
| `easybits-mcp` | connect the MCP server to an editor or Claude.ai |
| `easybits-docs` | read the docs without scraping (`.md`, llms.txt, docs MCP) |
| `easybits-clone-verify` | score an HTML clone of a PDF page by page and iterate until it passes |

Source of truth: `public/skills/` in [blissito/easybits](https://github.com/blissito/easybits);
this repo is a `git subtree` mirror pushed with `npm run skills:publish`. MIT.
