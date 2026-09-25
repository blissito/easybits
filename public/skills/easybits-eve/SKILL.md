---
name: easybits-eve
description: Run eve (Vercel's open-source agent framework) on EasyBits - install @easybits.cloud/eve-sandbox as the sandbox provider (EasybitsSandbox.environment, eve 0.64+) so every agent session gets its own Firecracker microVM, and self-host the eve server itself in an eve-nitro box with a public URL. Use when the user builds agents with eve or eve.dev, mentions defineSandbox, a sandbox provider or environment.open, wants eve sandboxes that persist between turns, or wants to deploy eve outside Vercel.
license: MIT
compatibility: Node.js 24 or newer (eve requires it), eve 0.64 or newer (for eve 0.63 or older pin @easybits.cloud/eve-sandbox@0.1), pnpm or npm, an EasyBits API key with WRITE scope (DELETE if eve should delete derived templates)
metadata:
  author: easybits
  version: "1.2"
---

# eve on EasyBits

eve is a Node server: an agent is a directory (instructions, tools, channels, schedules) and
every session is a durable run of the Workflow SDK. When an agent needs to execute code, eve asks
a **sandbox provider** for a box. `@easybits.cloud/eve-sandbox` is that provider for EasyBits.

**Versions.** eve ≥ 0.64 declares sandboxes with providers: `export const environment =
EasybitsSandbox.environment({ prepare })` + `export default defineSandbox(() => environment.open())`.
The old `defineSandbox({ backend: easybits(), bootstrap })` only exists in eve ≤ 0.63 — if the user
is there, pin `@easybits.cloud/eve-sandbox@0.1` and `@easybits.cloud/eve-world@0.1.1` (or upgrade eve).
Tested with eve 0.65 and eve-sandbox 0.2.

Two routes, pick one first:

1. **Free, without moving the server** (section 1): the eve server stays where it is (Vercel, or the
   user's laptop with `eve dev`/`eve start`) and only the sessions run on EasyBits. Fits the free
   Byte plan: 1 concurrent box = one conversation at a time, 1-hour sessions, size `s`.
2. **Everything on EasyBits** (sections 2-3): the eve server in an `eve-nitro` box + one child box per
   session = 2 concurrent boxes → needs **Mega** ($499 MXN/month, 2 boxes) or **Tera** ($2,490
   MXN/month, 5 boxes). `@easybits.cloud/eve-world` only works with the server inside EasyBits.

## 1. Free route: sandboxes for eve agents, server where it already is

Requires Node ≥ 24 on the machine (eve requires it). Create the project (or use yours) and install the provider:

```bash
npx eve init app && cd app
npm i @easybits.cloud/eve-sandbox        # or: pnpm add @easybits.cloud/eve-sandbox
export EASYBITS_API_KEY=eb_...           # WRITE scope (and DELETE if eve should delete boxes and templates)
```

```ts
// agent/sandbox.ts
import { defineSandbox } from "eve/sandbox";
import { EasybitsSandbox } from "@easybits.cloud/eve-sandbox";

// Prepared ONCE during `eve build` and captured as a template.
export const environment = EasybitsSandbox.environment({
  prepare: async (sandbox) => {
    await sandbox.run({ command: "git clone https://github.com/your-org/tools /workspace/tools && cd /workspace/tools && npm ci" });
  },
});

// Every session opens its own microVM from that template.
export default defineSandbox(() => environment.open());
```

The `export const environment` is required: `eve build` looks for it to prepare the template before any session exists.

| eve | EasyBits |
|---|---|
| `prepare()` (runs in `eve build`; in `eve dev`, on first access) | temporary `node` box + `agent/sandbox/workspace/` → `/workspace` + skills → `~/.agents/skills` + your `prepare(sandbox)` → **derived template** (`template-snapshot`, content key `eve:<resources>` + hash of what changes the image). Idempotent on the host: the first build logs `easybits: plantilla dt_… lista` and later ones `reusada` (measured: 9.7 s / 0.3 s) |
| `open()` → `start()` | `POST /sandboxes` with `templateKey`+`templateHash`: the box is born with `prepare` done (~5 s). `open()`'s `env` goes to `/etc/profile.d` (login shell); `networkPolicy` is applied on the host. 404 `DerivedTemplateNotProvisioned` / 409 `DerivedTemplateStale` → `SandboxTemplateNotProvisionedError` (run `eve build`) |
| `resume()` | reopens the box by `sandboxId` (wakes in ~1 s if it was asleep). If it no longer exists, it **fails** (eve's contract: resume reconnects, it doesn't recreate) and eve reruns the selector. `recreateOnLoss: true` recreates it from the template |
| between turns | the box stays alive with a nap (`idleTtlSeconds` 600 → suspend, resume ~1 s) |
| `stop()` · `delete()` | suspend · destroy |
| `run` / `spawn` | `bash -lc` through `/bg`; stdout/stderr as streams, `kill()` signals the process group |
| files | `/files/*`; relative paths anchored at `/workspace`, `$HOME/…` resolves inside the box |

Options: `EasybitsSandbox.environment({ prepare, apiKey, baseUrl, template: "node", timeoutSeconds, workingDirectory, runTimeoutSeconds, idleTtlSeconds, hardTtlSeconds, metadata, recreateOnLoss })` · `environment.open({ env, networkPolicy })`. The **per-box egress policy** uses the same shape eve uses on Vercel: `"allow-all"`, `"deny-all"` or a per-domain allow-list (`{ allow: { "api.github.com": [], "registry.npmjs.org": [] } }`; `"*"` opens everything); it goes in `open({ networkPolicy })` or live with `sandbox.setNetworkPolicy()`. The host resolves it to IPs per microVM with DNS refresh, persists it with the box and reapplies it on resume. **Not supported**: `transform` (injecting headers at the firewall) — it throws an explicit error. Outside eve, the same policy lives in `PUT/GET /sandboxes/:id/network-policy` · SDK `sb.setNetworkPolicy(policy)` · MCP `sandbox_set_network_policy`.

**Model.** The `eve init` scaffold uses Vercel's AI Gateway — `model: "spacexai/grok-4.7"` as a string in `agent/agent.ts` — which outside Vercel needs `AI_GATEWAY_API_KEY`. For a direct provider eve already ships helpers, nothing to install: `model: anthropic()` (`import { anthropic } from "eve/models/anthropic"`, claude-sonnet-5, reads `ANTHROPIC_API_KEY`) or `openai()` from `eve/models/openai` (reads `OPENAI_API_KEY`).

**Starting.** `eve build` prepares the template, so it needs `EASYBITS_API_KEY` in the environment (without it: `@easybits.cloud/eve-sandbox: falta apiKey`); it is required before `eve start`. Locally, `eve start` answers `401` even from localhost (`localDev()` is ignored in production): the local session goes in with `eve dev --no-ui`, or with `httpBasic` as in section 2. On Vercel (or any Node 24) run `eve start` with `EASYBITS_API_KEY` in the environment. Preparation uses a temporary box that is destroyed once the template is captured (it doesn't take a slot afterwards); then one child box per session, which sleeps when idle and doesn't take a slot while asleep. On Byte, one conversation at a time: the next one gets `SandboxLimitReached` while the previous one is awake, or move up to Mega. Tested with a brand-new free account.

## 2. Hosted route (Mega+): the eve server inside a box

`eve-nitro` template: Node 24, pnpm, the `eve` 0.65 CLI, git/curl/tar; `/data` is a persistent 4 GB volume (**not** the working directory: `exec` starts in `/`, do an explicit `cd /data`); port 3000. Since it ships pnpm, `eve init` uses it.

Six steps: create the box, create the app inside it with `eve init` (or clone yours if it already exists) and install the packages, pick the model, set auth, build and start the server, expose the port. First define the base URL and headers in bash. A freshly created box is `starting`: `exec`/`bg` on it answer `409 SandboxNotReady`, wait for `status=running`. pnpm 12 blocks `cbor-extract`'s build script (`eve-world` brings it): without `--allow-build=cbor-extract` the `pnpm add` fails with `ERR_PNPM_IGNORED_BUILDS`.

```bash
B=https://www.easybits.cloud/api/v2; H=(-H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json")
SB=$(curl -s -X POST "$B/sandboxes" "${H[@]}" -d '{"template":"eve-nitro","timeoutSeconds":3600,"suspendOnIdle":true}' | jq -r .sandboxId)
until [ "$(curl -s "$B/sandboxes/$SB" "${H[@]}" | jq -r .status)" = running ]; do sleep 2; done
curl -s -X POST "$B/sandboxes/$SB/exec" "${H[@]}" -d '{"command":"cd /data && eve init app --non-interactive && cd app && pnpm add @easybits.cloud/eve-sandbox @easybits.cloud/eve-world --allow-build=cbor-extract","timeoutSeconds":600}'
```

**Writing files into the box.** `POST /sandboxes/:id/files/write` with `{ path, content, encoding? }` (text, or `"base64"`); answers `{ ok, bytes }`. That's how `agent/sandbox.ts` (the one from section 1), `agent/agent.ts` and `agent/channels/eve.ts` go up:

```bash
curl -s -X POST "$B/sandboxes/$SB/files/write" "${H[@]}" -d "$(jq -n --rawfile c agent/sandbox.ts '{path:"/data/app/agent/sandbox.ts",content:$c}')"
```

**Model and world.** The same helper as section 1, plus the world line (section 3); the provider key goes in `eve start`'s env:

```ts
// agent/agent.ts
import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

export default defineAgent({
  model: anthropic(),   // reads ANTHROPIC_API_KEY
  experimental: { workflow: { world: "@easybits.cloud/eve-world" } },
});
```

**Server auth.** In production (`eve start`) the HTTP API requires auth: the scaffold ships `agent/channels/eve.ts` with `vercelOidc()`/`localDev()`/`placeholderAuth()` and the public URL answers `401 Authorization is required for this route`. Edit it, for example with basic auth:

```ts
// agent/channels/eve.ts
import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev } from "eve/channels/auth";

export default eveChannel({
  auth: [localDev(), httpBasic({ username: "eve", password: process.env.EVE_PASSWORD! })],
});
```

Build, start and expose. `eve build` prepares the session template, so it needs `EASYBITS_API_KEY` in the exec's `env` (log `easybits: plantilla dt_… lista`; later builds `reusada`):

```bash
curl -s -X POST "$B/sandboxes/$SB/exec" "${H[@]}" -d '{"command":"cd /data/app && npx eve build","timeoutSeconds":600,"env":{"EASYBITS_API_KEY":"<key>"}}'
curl -s -X POST "$B/sandboxes/$SB/bg"   "${H[@]}" -d '{"command":"exec npx eve start","cwd":"/data/app","env":{"EASYBITS_API_KEY":"<key>","ANTHROPIC_API_KEY":"<key>","EVE_PASSWORD":"<pass>","PORT":"3000"}}'
curl -s -X POST "$B/sandboxes/$SB/expose" "${H[@]}" -d '{"port":3000}'   # → { url }
```

The `eve-nitro` box is born with `EASYBITS_DB_URL` in its environment (no token): it reaches the shell, `/exec` and `/bg` without you passing it. To resume runs on a new box, create it with the **same** value (`"env":{"EASYBITS_DB_URL":"…"}` in the `POST /sandboxes`), which you read from `metadata.eve_db_url` (`GET /sandboxes/:id`) of the original. Without it, eve silently falls back to `world-local` (the box's disk) (section 3).

The public URL proxies the whole path (`/eve/` and `/.well-known/workflow/` reach Nitro with no configuration), but eve asks for the auth you declared: every call goes with `-u eve:$EVE_PASSWORD`. The project lives under `/data` to survive suspend/resume; if the box sleeps, relaunch `eve start` on wake. eve's durable state lives on disk by default; to make it outlive the box use `@easybits.cloud/eve-world` (section 3).

**Talking to the server.** Creating a session returns `{ sessionId }`; the stream is NDJSON events (`message.completed` carries the answer); the same id accepts more messages:

```bash
curl -s -u eve:$EVE_PASSWORD -X POST "$URL/eve/v1/session" -H "Content-Type: application/json" -d '{"message":"hi, what can you do?"}'   # → { sessionId }
curl -s -u eve:$EVE_PASSWORD "$URL/eve/v1/session/$SESSION/stream"                                                              # NDJSON; message.completed = answer
curl -s -u eve:$EVE_PASSWORD -X POST "$URL/eve/v1/session/$SESSION" -H "Content-Type: application/json" -d '{"message":"go on"}'  # continues the session
```

## 3. Durable state in EasyBits DB (`@easybits.cloud/eve-world`)

By default eve keeps its runs, steps, hooks and streams on the box's disk (`.eve/.workflow-data`). `@easybits.cloud/eve-world` is a Workflow SDK **World** on libSQL: the same state lives in EasyBits DB, so the server box can be destroyed and recreated without losing a run halfway. It's a 1:1 port of `@workflow/world-postgres` (lease-based delivery queue in a table) for `@workflow/world@5.0.0-beta.37`, the line eve 0.65 ships (for eve ≤ 0.63: `eve-world@0.1.1`).

```bash
pnpm add @easybits.cloud/eve-world --allow-build=cbor-extract   # npm i elsewhere
```

```ts
// agent/agent.ts
import { defineAgent } from "eve";

export default defineAgent({
  model: /* see section 2 */,
  experimental: { workflow: { world: "@easybits.cloud/eve-world" } },
});
```

**No token to paste.** When you create an `eve-nitro` box with `POST /sandboxes`, EasyBits generates its database URL (`eve-<id>`, created on first use; access is resolved by the host from the box's identity, the URL carries no credential) and puts it in `metadata.eve_db_url`. The box is born with `EASYBITS_DB_URL` already in its environment; to resume runs on a new box, create it with the **same** value. `eve start` env: `EASYBITS_API_KEY`, `ANTHROPIC_API_KEY` (or your provider's), `EVE_PASSWORD`, `PORT=3000`. Measured in production with eve 0.65: server destroyed, another with the same `EASYBITS_DB_URL` ready in 21 s, and the same session continued with its memory and its same session box; with eve 0.58, an 8-step run resumed at step 3 on a new machine 59 s after destroying the first. Outside EasyBits, `WORKFLOW_LIBSQL_URL` + `WORKFLOW_LIBSQL_AUTH_TOKEN` point at any libSQL/Turso; with no env it falls back to `world-local`. `WORKFLOW_SERVICE_URL` is only needed with several workers (default: the server itself on localhost).

Not implemented (optional in the contract): `events.createBatch`, `queueBatch`, `invoke`, `runs.cancelMany`, analytics.

## Rules

- **With a free (Byte) account only route 1 works; hosting the eve server needs Mega+** (server box +
  session box = 2 concurrent boxes, Byte allows 1). Tell the user before creating an `eve-nitro` box.
- **Node ≥ 24** for eve and for this provider; both `eve-nitro` and the `node` template ship Node 24 (plus typescript, tsx, pnpm).
- `agent/sandbox.ts` must `export const environment` (eve build looks for it) and `export default defineSandbox(...)`.
- Every eve agent session is a box in the user's account: while awake it counts toward their
  concurrent sandbox budget (asleep it doesn't). Tell the user when they hit `SandboxLimitReached`.
- Derived templates `eve:*` are the prepared images; do not delete them while an eve deployment uses them.
- eve is beta: pin `eve` and `@easybits.cloud/eve-sandbox` versions together.

<!-- generated:packages -->
- `@easybits.cloud/mcp@0.3.7`
- `@easybits.cloud/sdk@0.35.3`
- `@easybits.cloud/eve-sandbox@0.2.1`
- `@easybits.cloud/eve-world@0.1.2`
<!-- /generated -->

## Verify

Do not use `npx tsx -e 'import(...)'` — it crashes with `ERR_INVALID_ARG_VALUE … [eval]` (eve's `createRequire`). Write a file instead:

```bash
echo 'import("@easybits.cloud/eve-sandbox").then(m=>console.log(Object.keys(m)))' > check.mjs && node check.mjs   # → [ 'EasybitsSandbox', 'PROVIDER_NAME', 'createEasybitsProvider', 'easybitsProvider' ]
```

Then `eve build` (with `EASYBITS_API_KEY`) must log `easybits: plantilla … lista` the first time and `reusada` the next, and the first message that makes the agent run a command must create a box in the user's account.
