---
name: easybits-eve
description: Run eve (Vercel's open-source agent framework) on EasyBits - install @easybits.cloud/eve-sandbox as the SandboxBackend so every agent session gets its own Firecracker microVM, and self-host the eve server itself in an eve-nitro box with a public URL. Use when the user builds agents with eve or eve.dev, mentions defineSandbox or a SandboxBackend, wants eve sandboxes that persist between turns, or wants to deploy eve outside Vercel.
license: MIT
compatibility: Node.js 24 or newer (eve requires it), pnpm or npm, an EasyBits API key with WRITE scope (DELETE if eve should delete derived templates)
metadata:
  author: easybits
  version: "1.1"
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

Node ≥ 24 on the machine. Create the project (or use the existing one), install the backend and a direct model provider:

```bash
npx eve init app && cd app
pnpm add @easybits.cloud/eve-sandbox @ai-sdk/anthropic --allow-build=cbor-extract   # or: npm i …
```

pnpm 12 blocks dependency build scripts: without `--allow-build=cbor-extract`, `pnpm add` fails with `ERR_PNPM_IGNORED_BUILDS: cbor-extract@2.2.2` (and anything chained after `&&` never runs). npm does not need it.

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
| `prewarm` (runs on `eve start`, **not** on `eve build`) | temporary box + seed files + `bootstrap()` → **derived template** (`POST /sandboxes/:id/template-snapshot`, key `eve:<templateKey>` + hash of the options; idempotent on the host). `eve build` only compiles (~10 s); first `eve start` logs `easybits: plantilla dt_… lista`, later ones `reusada` |
| `create()` | `POST /sandboxes` with `templateKey`+`templateHash`: born with the bootstrap done (~0.6 s create + ~2 s boot; session ready in ~4 s), or a fresh box from `template` when eve sends no template. 404 `DerivedTemplateNotProvisioned` / 409 `DerivedTemplateStale` → `SandboxTemplateNotProvisionedError` (eve prewarms again) |
| between turns | the box stays alive with `suspendOnIdle` (idle 600 s → suspend, resume ~1 s); reattached by `sandboxId` |
| `stop()` / `shutdown()` | suspend · `delete()` | destroy |
| `run` / `spawn` | `bash -lc` via `/bg`; stdout/stderr polled and streamed, `kill()` signals the process group |
| files | `/files/*`, relative paths anchored at `/workspace`, `$HOME/...` resolved inside the box |

Options: `easybits({ apiKey, baseUrl, template: "node", timeoutSeconds, workingDirectory: "/workspace", runTimeoutSeconds, idleTtlSeconds: 600, hardTtlSeconds: 7d, metadata })`.
`setNetworkPolicy` applies a **per-box egress policy** with the same shape eve uses on Vercel: `"allow-all"`, `"deny-all"` or a per-domain allow-list (`{ allow: { "api.github.com": [], "registry.npmjs.org": [] } }`; `"*"` opens everything). The host resolves it to IPs per microVM with DNS refresh, persists it with the box and re-applies it on resume; it takes effect once the promise resolves, so `await` it before the egress you want governed. **Not supported**: `transform` (header injection at the firewall) — throws an explicit error; that flow (GitHub checkout without the token entering the box) eve does through its `defaultBackend`. Outside eve the same policy lives at `PUT/GET /sandboxes/:id/network-policy` · SDK `sb.setNetworkPolicy(policy)` · MCP `sandbox_set_network_policy`.

**Model.** The `eve init` scaffold (eve 0.59.1) uses Vercel's AI Gateway: `model: "openai/gpt-5.6-luna-fast"` as a string in `agent/agent.ts`; without `AI_GATEWAY_API_KEY` it fails with "AI Gateway received no credentials". Outside Vercel switch to a direct provider: `import { anthropic } from "@ai-sdk/anthropic"` and `model: anthropic("claude-sonnet-5")` (reads `ANTHROPIC_API_KEY`).

**Build, then start.** `eve build` is mandatory before `eve start` and needs `EASYBITS_API_KEY` in the environment (it validates the backend; without it: `@easybits.cloud/eve-sandbox: falta apiKey`). Locally `eve start` answers `401` even from localhost (`localDev()` is ignored in production): use `eve dev --no-ui` for a local session, or `httpBasic` as in section 2. `eve dev` and `eve start` compute different template hashes, so the first time the prewarm runs twice — not a bug. On Vercel (or any Node 24) `eve start` with
`EASYBITS_API_KEY` in the environment (WRITE scope; DELETE if eve should delete snapshots). The
prewarm uses a temporary box destroyed once the template is captured (no quota afterwards); then one
child box per session, asleep when idle. Validated with eve 0.58.1 and 0.59.1.

## 2. Hosted route (Mega+): self-hosting the eve server on EasyBits

Use the `eve-nitro` template (Node 24, pnpm, `eve` CLI 0.58.1 — `pnpm add eve@latest` bumps the
project to 0.59.1 —, git/curl/tar; `/data` is a persistent 4 GB volume but NOT the working
directory: `exec` starts in `/`, always `cd /data` explicitly; port 3000). Six steps: create the
box, `eve init` the app inside it (or clone yours) and install the packages, pick a model, set
auth, build and start the server, expose the port. A freshly created box is `starting`:
`exec`/`bg` on it answer `409 {error:"SandboxNotReady"}` — poll until `status=running`:

```bash
B=https://www.easybits.cloud/api/v2
H=(-H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json")
SB=$(curl -s -X POST "$B/sandboxes" "${H[@]}" -d '{"template":"eve-nitro","timeoutSeconds":3600,"suspendOnIdle":true}' | jq -r .sandboxId)
until [ "$(curl -s "$B/sandboxes/$SB" "${H[@]}" | jq -r .status)" = running ]; do sleep 2; done
curl -s -X POST "$B/sandboxes/$SB/exec" "${H[@]}" -d '{"command":"cd /data && eve init app && cd app && pnpm add eve@latest @easybits.cloud/eve-sandbox @easybits.cloud/eve-world @ai-sdk/anthropic --allow-build=cbor-extract","timeoutSeconds":600}'
```

**Writing files into the box** (`agent/sandbox.ts` from section 1, `agent/agent.ts`, `agent/channels/eve.ts`): `POST /sandboxes/:id/files/write` with `{ path, content, encoding? }` (text, or `"base64"`) → `{ ok, bytes }`. SDK: `sb.files.write(path, content)`.

```bash
curl -s -X POST "$B/sandboxes/$SB/files/write" "${H[@]}" -d "$(jq -n --rawfile c agent/sandbox.ts '{path:"/data/app/agent/sandbox.ts",content:$c}')"
```

**Model outside Vercel.** The scaffold targets Vercel's AI Gateway (`model: "openai/gpt-5.6-luna-fast"` string) and fails without `AI_GATEWAY_API_KEY` ("AI Gateway received no credentials"). Pass a model object from a direct AI SDK provider instead, in `agent/agent.ts`:

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

Build (`eve build` validates the backend → it needs `EASYBITS_API_KEY` in the exec `env`, otherwise `falta apiKey`; it creates no boxes), start (full env: `EASYBITS_API_KEY`, `ANTHROPIC_API_KEY` or your provider's, `EVE_PASSWORD`, `PORT=3000`) and expose:

```bash
curl -s -X POST "$B/sandboxes/$SB/exec" "${H[@]}" -d '{"command":"cd /data/app && eve build","timeoutSeconds":300,"env":{"EASYBITS_API_KEY":"<key>"}}'
curl -s -X POST "$B/sandboxes/$SB/bg"   "${H[@]}" -d '{"command":"exec eve start","cwd":"/data/app","env":{"EASYBITS_API_KEY":"<key>","ANTHROPIC_API_KEY":"<key>","EVE_PASSWORD":"<pass>","PORT":"3000"}}'
curl -s -X POST "$B/sandboxes/$SB/expose" "${H[@]}" -d '{"port":3000}'      # → { url }
```

The `eve-nitro` box is born with `EASYBITS_DB_URL` in its environment (no token): it reaches the shell, `/exec` and `/bg` on its own. Set it by hand in the `/bg` `env` only in two cases: a box created by fork/snapshot, or to resume runs on a new box — the SAME value, readable in `metadata.eve_db_url` (`GET /sandboxes/:id`). Without it eve silently falls back to `world-local`.

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

`npm i @easybits.cloud/eve-world` and set `experimental.workflow.world: "@easybits.cloud/eve-world"` in `defineAgent({...})` in `agent/agent.ts` (snippet above). EasyBits generates the DB URL at box creation (one DB per box, created on first use, no token): the box is born with it as `EASYBITS_DB_URL` and also exposes it as `metadata.eve_db_url`; pass it by hand in the `/bg` `env` only on a fork/snapshot box or to resume on a new box (same value). Measured: runs AND chat sessions survive destroying the server (new box from snapshot answering 75 s later with the conversation intact). Outside EasyBits use `WORKFLOW_LIBSQL_URL`/`WORKFLOW_LIBSQL_AUTH_TOKEN`; no env → `world-local`. Not implemented: `events.createBatch`, `queueBatch`, `runs.cancelMany`, analytics.

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
- `@easybits.cloud/sdk@0.35.2`
- `@easybits.cloud/eve-sandbox@0.1.2`
- `@easybits.cloud/eve-world@0.1.1`
<!-- /generated -->

## Verify

Do not use `npx tsx -e 'import(...)'` — it crashes with `ERR_INVALID_ARG_VALUE … [eval]` (eve's `createRequire`). Write a file instead:

```bash
echo 'import("@easybits.cloud/eve-sandbox").then(m=>console.log(Object.keys(m)))' > check.mjs && node check.mjs   # → [ 'BACKEND_NAME', 'easybits' ]
```

Then `eve build` (with `EASYBITS_API_KEY`) and `eve start`/`eve dev --no-ui` must log `easybits: plantilla … lista` on the first run and `reusada` on the second.
