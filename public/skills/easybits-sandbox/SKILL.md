---
name: easybits-sandbox
description: Create and drive an EasyBits sandbox (Firecracker microVM with root, internet, persistent disk and a public URL) - run commands, background processes, code, files, git, snapshots and forks through the REST API v2 with the user's API key. Use when the user wants their agent to execute code in isolation, needs a Linux box on demand, or mentions EasyBits sandboxes or easybits.cloud.
license: MIT
compatibility: Needs curl or any HTTP client, network access to https://www.easybits.cloud and an EasyBits API key
metadata:
  author: easybits
  version: "1.0"
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
| "keep it alive / it must survive" | create with `suspendOnIdle: true`; `POST …/bootstrap` `{ "script": "…" }` for idempotent work on every wake |
| "snapshot / try variants in parallel" | `POST $B/sandboxes/$SB/snapshot`, `POST $B/sandboxes/$SB/fork` → child `sandboxId` (copy-on-write) |
| "destroy it" | `DELETE $B/sandboxes/$SB` |

Templates: `node` (Node 22), `python`, `bun`, `ubuntu` (no Node), `code-interpreter`
(Python + persistent Jupyter kernel: `POST …/run-cell`), `claude-code`, `ghosty-lite`, `goose`.

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
