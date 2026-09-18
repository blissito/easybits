---
name: easybits-eve
description: Run eve (Vercel's open-source agent framework) on EasyBits - install @easybits.cloud/eve-sandbox as the SandboxBackend so every agent session gets its own Firecracker microVM, and self-host the eve server itself in an eve-nitro box with a public URL. Use when the user builds agents with eve or eve.dev, mentions defineSandbox or a SandboxBackend, wants eve sandboxes that persist between turns, or wants to deploy eve outside Vercel.
license: MIT
compatibility: Node.js 24 or newer (eve requires it), pnpm or npm, an EasyBits API key with WRITE scope (DELETE if eve should delete snapshots)
metadata:
  author: easybits
  version: "1.0"
---

# eve on EasyBits

eve is a Node server: an agent is a directory (instructions, tools, channels, schedules) and
every session is a durable run of the Workflow SDK. When an agent needs to execute code, eve asks
a **SandboxBackend** for a box. `@easybits.cloud/eve-sandbox` is that backend for EasyBits.

Two routes, pick one first:

1. **Free, without moving the server** (section 1): the eve server stays where it is (Vercel, or the
   user's laptop with `eve dev`/`eve start`) and only the sessions run on EasyBits. Fits the free
   Byte plan: 1 concurrent box = one conversation at a time, 1-hour sessions, size `s`.
2. **Everything on EasyBits** (sections 2-3): the eve server in an `eve-nitro` box + one child box per
   session = 2 concurrent boxes → needs **Mega** ($499 MXN/month, 2 boxes) or **Tera** ($2,490
   MXN/month, 5 boxes). `@easybits.cloud/eve-world` only works with the server inside EasyBits.

## 1. Free route: sandboxes for eve agents, server where it already is

```bash
npm i @easybits.cloud/eve-sandbox
```

```ts
// agent/sandbox.ts
import { defineSandbox } from "eve/sandbox";
import { easybits } from "@easybits.cloud/eve-sandbox";

export default defineSandbox({
  backend: easybits(),                  // reads EASYBITS_API_KEY
  async bootstrap({ use }) {
    const s = await use();
    await s.run({ command: "git clone https://github.com/your-org/tools /workspace/tools && cd /workspace/tools && npm ci" });
  },
});
```

What happens under the hood (so you can explain it and debug it):

| eve | EasyBits |
|---|---|
| `prewarm` (runs on `eve start`, **not** on `eve build`) | temporary box + seed files + `bootstrap()` → copy-on-write **snapshot** named `eve:<templateKey>:<hash>`. `eve build` only compiles (~10 s); first `eve start` logs `easybits: snapshot snap_… listo`, later ones `reusado` (start ~3 s) |
| `create()` | fork of that snapshot (~7 s), or a fresh box from `template` when eve sends no template |
| between turns | the box stays alive with `suspendOnIdle` (idle 600 s → suspend, resume ~1 s); reattached by `sandboxId` |
| `stop()` / `shutdown()` | suspend · `delete()` | destroy |
| `run` / `spawn` | `bash -lc` via `/bg`; stdout/stderr polled and streamed, `kill()` signals the process group |
| files | `/files/*`, relative paths anchored at `/workspace`, `$HOME/...` resolved inside the box |

Options: `easybits({ apiKey, baseUrl, template: "node", timeoutSeconds, workingDirectory: "/workspace", runTimeoutSeconds, idleTtlSeconds: 600, hardTtlSeconds: 7d, metadata })`.
`setNetworkPolicy` applies a **per-box egress policy** with the same shape eve uses on Vercel: `"allow-all"`, `"deny-all"` or a per-domain allow-list (`{ allow: { "api.github.com": [], "registry.npmjs.org": [] } }`; `"*"` opens everything). The host resolves it to IPs per microVM with DNS refresh, persists it with the box and re-applies it on resume; it takes effect once the promise resolves, so `await` it before the egress you want governed. **Not supported**: `transform` (header injection at the firewall) — throws an explicit error; that flow (GitHub checkout without the token entering the box) eve does through its `defaultBackend`. Outside eve the same policy lives at `PUT/GET /sandboxes/:id/network-policy` · SDK `sb.setNetworkPolicy(policy)` · MCP `sandbox_set_network_policy`.

That is the whole free route: `eve dev` locally or `eve start` on Vercel (or any Node 24) with
`EASYBITS_API_KEY` in the environment (WRITE scope; DELETE if eve should delete snapshots). The
prewarm uses a temporary box destroyed once the snapshot is captured (no quota afterwards); then one
child box per session, asleep when idle. Validated with eve 0.58.1 and 0.59.1.

## 2. Hosted route (Mega+): self-hosting the eve server on EasyBits

Use the `eve-nitro` template (Node 24, pnpm, `eve` CLI, git/curl/tar; `/data` is a persistent
4 GB volume and the working directory; port 3000). Six steps: create the box, `eve init` the
app inside it (or clone yours) and install the packages, pick a model, set auth, start the
server, expose the port:

```bash
B=https://www.easybits.cloud/api/v2
H=(-H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json")
SB=$(curl -s -X POST "$B/sandboxes" "${H[@]}" -d '{"template":"eve-nitro","timeoutSeconds":3600,"suspendOnIdle":true,"hardTtlSeconds":2592000}' | jq -r .sandboxId)
curl -s -X POST "$B/sandboxes/$SB/exec" "${H[@]}" -d '{"command":"cd /data && eve init app && cd app && pnpm add @easybits.cloud/eve-sandbox @easybits.cloud/eve-world @ai-sdk/anthropic && eve build","timeoutSeconds":600}'
```

**Model outside Vercel.** The scaffold targets Vercel's AI Gateway (`model: "anthropic/claude-sonnet-5"` string) and fails without `AI_GATEWAY_API_KEY` ("AI Gateway received no credentials"). Pass a model object from any AI SDK provider instead, in `agent/agent.ts`:

```ts
import { defineAgent } from "eve";
import { anthropic } from "@ai-sdk/anthropic";
export default defineAgent({
  model: anthropic("claude-sonnet-5"),   // reads ANTHROPIC_API_KEY
  experimental: { workflow: { world: "@easybits.cloud/eve-world" } },
});
```

**Server auth.** In production the HTTP API requires auth (scaffold: `vercelOidc()/localDev()/placeholderAuth()` → public URL answers `401 Authorization is required for this route`). Edit `agent/channels/eve.ts`:

```ts
import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev } from "eve/channels/auth";
export default eveChannel({
  auth: [localDev(), httpBasic({ username: "eve", password: process.env.EVE_PASSWORD! })],
});
```

Start (full env: `EASYBITS_API_KEY`, `ANTHROPIC_API_KEY` or your provider's, `EVE_PASSWORD`, `PORT=3000`) and expose:

```bash
DB=$(curl -s "$B/sandboxes/$SB" "${H[@]}" | jq -r .metadata.eve_db_url)   # generated by EasyBits at box creation
curl -s -X POST "$B/sandboxes/$SB/bg"   "${H[@]}" -d '{"command":"exec eve start","cwd":"/data/app","env":{"EASYBITS_API_KEY":"<key>","ANTHROPIC_API_KEY":"<key>","EVE_PASSWORD":"<pass>","PORT":"3000","EASYBITS_DB_URL":"'$DB'"}}'
curl -s -X POST "$B/sandboxes/$SB/expose" "${H[@]}" -d '{"port":3000}'      # → { url }
```

`EASYBITS_DB_URL` does NOT reach the shell on its own: EasyBits generates it at box creation and leaves it in `metadata.eve_db_url` (`POST /sandboxes` response / `GET /sandboxes/:id`). Pass it in the `/bg` `env` on ANY box (created or forked from a snapshot), and reuse the SAME value to resume runs after destroying the server. Without it eve silently falls back to `world-local`.

The public URL proxies every path, so `/eve/` and `/.well-known/workflow/` reach Nitro with no
extra config — but eve enforces the auth you declared: call it with `-u eve:$EVE_PASSWORD`.
Keep the project and `.eve/.workflow-data` under `/data` so runs survive
suspend/resume; declare a `bootstrap` that restarts `eve start` on every wake.

Talk to the server (`$URL` from `/expose`):

```bash
curl -s -u eve:$EVE_PASSWORD -X POST "$URL/eve/v1/session" -H "Content-Type: application/json" -d '{"message":"hi"}'   # → { sessionId }
curl -s -u eve:$EVE_PASSWORD "$URL/eve/v1/session/$SESSION/stream"                                                    # NDJSON; message.completed = reply
curl -s -u eve:$EVE_PASSWORD -X POST "$URL/eve/v1/session/$SESSION" -H "Content-Type: application/json" -d '{"message":"go on"}'
```

Durable state: eve's default world stores runs on disk (`.eve/.workflow-data`). For state that
outlives the box use `@easybits.cloud/eve-world` (section 3).

## 3. Durable state: `@easybits.cloud/eve-world`

`npm i @easybits.cloud/eve-world` and set `experimental.workflow.world: "@easybits.cloud/eve-world"` in `defineAgent({...})` in `agent/agent.ts` (snippet above). EasyBits generates the DB URL at box creation (one DB per box, created on first use, no token) and exposes it as `metadata.eve_db_url`; pass it as `EASYBITS_DB_URL` in the `/bg` `env` (same value to resume). Measured: runs AND chat sessions survive destroying the server (new box from snapshot answering 75 s later with the conversation intact). Outside EasyBits use `WORKFLOW_LIBSQL_URL`/`WORKFLOW_LIBSQL_AUTH_TOKEN`; no env → `world-local`. Not implemented: `events.createBatch`, `queueBatch`, `runs.cancelMany`, analytics.

## Rules

- **With a free (Byte) account only route 1 works; hosting the eve server needs Mega+** (server box +
  session box = 2 concurrent boxes, Byte allows 1). Tell the user before creating an `eve-nitro` box.
- **Node ≥ 24** for eve and for this backend; both `eve-nitro` and the `node` template ship Node 24 (plus typescript, tsx, pnpm).
- Every eve agent session is a box in the user's account: it counts toward their concurrent
  sandbox budget. Tell the user when they hit `SandboxLimitReached`.
- Snapshots `eve:*` are the templates; do not delete them while an eve deployment uses them.
- eve is beta: pin `eve` and `@easybits.cloud/eve-sandbox` versions together.

<!-- generated:packages -->
- `@easybits.cloud/mcp@0.3.7`
- `@easybits.cloud/sdk@0.34.7`
- `@easybits.cloud/eve-sandbox@0.0.6`
- `@easybits.cloud/eve-world@0.1.1`
<!-- /generated -->

## Verify

`npx tsx -e 'import("@easybits.cloud/eve-sandbox").then(m=>console.log(Object.keys(m)))'` prints
`easybits`; then `eve start` (not `eve build`, which only compiles) must log `easybits: snapshot … listo` on the first run and `reusado`
on the second.
