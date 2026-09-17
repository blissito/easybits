---
name: easybits-sandbox
description: Create and drive an EasyBits sandbox (Firecracker microVM with root, internet, persistent disk and a public URL) - run commands, background processes, code, files, git, snapshots and forks through the REST API v2 with the user's API key. Use when the user wants their agent to execute code in isolation, needs a Linux box on demand, or mentions EasyBits sandboxes or easybits.cloud.
license: MIT
compatibility: Needs curl or any HTTP client, network access to https://www.easybits.cloud and an EasyBits API key
metadata:
  author: easybits
  version: "1.1"
---

# Drive an EasyBits sandbox

A sandbox is a Firecracker microVM: root, internet, `/data/work` as working directory, and a
public HTTPS URL per exposed port. It sleeps in ~1 s and wakes on any request.

## Setup (once)

```bash
export EASYBITS_API_KEY="eb_sk_live_…"   # Dashboard de Desarrollador → API keys
B=https://www.easybits.cloud/api/v2
H=(-H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json")
```

## What you can do

| User asks | Do |
|---|---|
| "give me a box / run this in isolation" | `POST $B/sandboxes` `{ "template": "node", "suspendOnIdle": true, "timeoutSeconds": 3600 }` → `sandboxId` |
| "run this command" | `POST $B/sandboxes/$SB/exec` `{ "command": "…" }` (sync, 60 s default, 600 s max) |
| "start a dev server / a build / anything long" | `POST $B/sandboxes/$SB/bg` `{ "command": "exec npm run dev" }` → `execId`; poll `GET …/bg/$EXEC`; **kill** with `DELETE …/bg/$EXEC` |
| "run this Python / JS snippet" | `POST $B/sandboxes/$SB/run-code` `{ "code": "…", "lang": "python" }` |
| "put this file in the box / read that file" | `POST $B/sandboxes/$SB/files/write` `{ "path", "content" }` · `…/files/read` `{ "path" }` · `…/files/list` |
| "make it reachable" | `POST $B/sandboxes/$SB/expose` `{ "port": 3000 }` → `{ url }` (HTTPS and WebSocket) |
| "clone the repo in there" | `exec` with `git clone …` (public), or the git tools with `$secret:GH_TOKEN` for private repos |
| "keep it alive / it must survive" | create with `suspendOnIdle: true`; on an existing box `POST $B/sandboxes/$SB/idle` `{ "suspendOnIdle": true, "idleTtlSeconds": 600 }`; `POST …/bootstrap` `{ "script": "…" }` for idempotent work on every wake |
| "snapshot / try variants in parallel" | `POST $B/sandboxes/$SB/snapshot`, `POST $B/sandboxes/$SB/fork` → child `sandboxId` (copy-on-write) |
| "destroy it" | `DELETE $B/sandboxes/$SB` |

Templates (`base` = run code, `agent` = ready-made agent; internal/service kinds are created by
the platform, not by you):

<!-- generated:templates-en -->
| Template | Kind | Description |
|---|---|---|
| `ubuntu` | base | Full Linux. Install packages, compile, run servers. |
| `python` | base | Python runtime; each run-code is a fresh process. |
| `node` | base | Node 24 + typescript, tsx, pnpm, git and python3; each run-code is a fresh process. |
| `bun` | base | Bun runtime. |
| `dev-box` | base | Clean work box (git, curl, build-essential, Node 22); the recommended one for SSH. |
| `code-interpreter` | base | Python + persistent Jupyter kernel (sandbox_run_cell): variables and charts survive between cells. |
| `eve-nitro` | base | Self-hosted eve (Vercel) server: Node 24, pnpm, eve CLI; persistent /data, port 3000. |
| `node-agent` | agent | Node + Claude Agent SDK pre-baked (agent_run). |
| `claude-code` | agent | Claude Agent SDK loop; per-token billing. |
| `goose` | agent | goose (AAIF), coding agent with native ACP. |
| `ghostyclaw` | agent | Always-on Ghosty daemon (WhatsApp, Slack, Telegram) with Docker and admin-api. |
| `ghosty-lite` | agent | Lightweight Rust ACP agent, multi-provider; your EasyBits key can be its brain. |
| `open-ghosty` | agent | Ghosty on open models, SSE web chat. |
| `lang-ghosty` | agent | Ghosty on LangChain, SSE web chat. |
| `rust-ghosty` | agent | DeepSeek-first Ghosty (CodeWhale/Rust) with SSE web chat and WhatsApp. |
| `ghosty-gc` | agent | Ghosty for teams (GTeams): threads, artifacts, collaborative editor. |
| `ghosty-chat` | agent | Persistent Ghosty chat (Express + SSE). |
| `cagent-ghosty` | agent | Ghosty on cagent (Docker), SSE web chat. |
| `openclaw` | agent | OpenClaw, always-on personal AI. |
| `chat-openai` | agent | Persistent Express+SSE chat on OpenAI; create it with agent_create. |
| `chat-anthropic` | agent | Persistent Express+SSE chat on Anthropic; create it with agent_create. |
| `ghosty-studio` | agent | Ghosty Studio: agent control plane inside a box. |
| `desktop-ghosty` | agent | Linux desktop with Ghosty (noVNC). |
| `computer-ghosty` | agent | Computer-use with XFCE desktop + public noVNC. |
| `computer-ghosty-gemini` | agent | Computer-use on Gemini. |
| `livekit-svc` | service | Video call room + HD recording (Studio). |
| `whisper-svc` | service | whisper STT; part of the voice box. |
| `kokoro-svc` | service | kokoro TTS; part of the voice box. |
| `voice-svc` | service | Voice (STT + TTS) for the fleet; service_start('voice'). |
| `render-svc` | service | Chromium for PDF/PNG/audits; service_start('render'). |
| `collab-svc` | service | GTeams collaborative editor (Yjs). |
| `hyperframes-svc` | service | HyperFrames video rendering. |
| `claude-worker` | internal | Fleet worker (Claude). Created by the platform. |
| `codex-worker` | internal | Fleet worker (Codex). Created by the platform. |
<!-- /generated -->

## Rules

- **`suspendOnIdle: true` or you lose the box.** Without it, `timeoutSeconds` (default 300 s)
  destroys it and its URL. Say so to the user when you create one without it on purpose.
- **`exec` is synchronous and kills its shell.** `nohup … &` inside `exec` dies with the
  response. Long processes go through `/bg`, written as `exec <program>` so your process
  replaces the shell. Always kill what you started or it eats the box until TTL.
- **Wake-up runs no boot.** A resumed box does not re-run systemd, entrypoints or `.bashrc`.
  If something must happen on every wake, declare it in `/bootstrap` (idempotent: `checkout -B`,
  `ln -sfn`). Never put a credential in that script: it shows in listings.
- **Build inside the box.** Native modules compiled on the user's Mac crash on Linux.
- **Do not retry `404`/`409`.** `404` = wrong id or not yours; `409` = state conflict (e.g.
  suspended while a turn runs). Read `GET $B/sandboxes/$SB` and decide.
- Rate limits: 10 creates/min, 120 ops/min. Max TTL by plan: Byte 1 h, Mega 4 h, Tera 24 h.
- Never print the API key.

Reference with every field: `https://www.easybits.cloud/docs/agents.md`.

## After changes

Report `sandboxId`, status and the public URL if any, and suggest a check: "Run
`ls /data/work` in it to confirm the files are there."
