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

## 1. Sandboxes for eve agents (the backend)

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
    await s.run({ command: "npm i -g typescript" });
  },
});
```

What happens under the hood (so you can explain it and debug it):

| eve | EasyBits |
|---|---|
| `prewarm` at build time | temporary box + seed files + `bootstrap()` → copy-on-write **snapshot** named `eve:<templateKey>:<hash>`; reused on later builds (0.2 s) |
| `create()` | fork of that snapshot (~7 s), or a fresh box from `template` when eve sends no template |
| between turns | the box stays alive with `suspendOnIdle` (idle 600 s → suspend, resume ~1 s); reattached by `sandboxId` |
| `stop()` / `shutdown()` | suspend · `delete()` | destroy |
| `run` / `spawn` | `bash -lc` via `/bg`; stdout/stderr polled and streamed, `kill()` signals the process group |
| files | `/files/*`, relative paths anchored at `/workspace`, `$HOME/...` resolved inside the box |

Options: `easybits({ apiKey, baseUrl, template: "node", timeoutSeconds, workingDirectory: "/workspace", runTimeoutSeconds, idleTtlSeconds: 600, hardTtlSeconds: 7d, metadata })`.
`setNetworkPolicy` applies a **per-box egress policy** with the same shape eve uses on Vercel: `"allow-all"`, `"deny-all"` or a per-domain allow-list (`{ allow: { "api.github.com": [], "registry.npmjs.org": [] } }`; `"*"` opens everything). The host resolves it to IPs per microVM with DNS refresh, persists it with the box and re-applies it on resume; it takes effect once the promise resolves, so `await` it before the egress you want governed. **Not supported**: `transform` (header injection at the firewall) — throws an explicit error; that flow (GitHub checkout without the token entering the box) eve does through its `defaultBackend`. Outside eve the same policy lives at `PUT/GET /sandboxes/:id/network-policy` · SDK `sb.setNetworkPolicy(policy)` · MCP `sandbox_set_network_policy`.

## 2. Self-hosting the eve server on EasyBits

Use the `eve-nitro` template (Node 24, pnpm, `eve` CLI, git/curl/tar; `/data` is a persistent
4 GB volume and the working directory; port 3000):

```bash
B=https://www.easybits.cloud/api/v2
H=(-H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json")
SB=$(curl -s -X POST "$B/sandboxes" "${H[@]}" -d '{"template":"eve-nitro","timeoutSeconds":3600,"suspendOnIdle":true,"hardTtlSeconds":2592000}' | jq -r .sandboxId)
curl -s -X POST "$B/sandboxes/$SB/exec" "${H[@]}" -d '{"command":"cd /data && git clone <repo> app && cd app && pnpm i && eve build","timeoutSeconds":600}'
curl -s -X POST "$B/sandboxes/$SB/bg"   "${H[@]}" -d '{"command":"exec eve start","cwd":"/data/app","env":{"EASYBITS_API_KEY":"<key>"}}'
curl -s -X POST "$B/sandboxes/$SB/expose" "${H[@]}" -d '{"port":3000}'      # → { url }
```

The public URL proxies every path, so `/eve/` and `/.well-known/workflow/` reach Nitro with no
extra config. Keep the project and `.eve/.workflow-data` under `/data` so runs survive
suspend/resume; declare a `bootstrap` that restarts `eve start` on every wake.

Durable state: eve's default world stores runs on disk (`.eve/.workflow-data`). For state that
outlives the box use `@workflow/world-postgres` (plain Postgres, install it in the box or in a
second one) — the world package must match eve's `@workflow/*` line.

## Rules

- **Node ≥ 24** for eve and for this backend; `eve-nitro` ships it, a plain `node` box (Node 22) does not.
- Every eve agent session is a box in the user's account: it counts toward their concurrent
  sandbox budget. Tell the user when they hit `SandboxLimitReached`.
- Snapshots `eve:*` are the templates; do not delete them while an eve deployment uses them.
- eve is beta: pin `eve` and `@easybits.cloud/eve-sandbox` versions together.

<!-- generated:packages -->
- `@easybits.cloud/mcp@0.3.7`
- `@easybits.cloud/sdk@0.34.7`
- `@easybits.cloud/eve-sandbox@0.0.6`
<!-- /generated -->

## Verify

`npx tsx -e 'import("@easybits.cloud/eve-sandbox").then(m=>console.log(Object.keys(m)))'` prints
`easybits`; then `eve build` must log `easybits: snapshot … listo` on the first run and `reusado`
on the second.
