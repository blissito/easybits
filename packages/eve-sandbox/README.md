# @easybits.cloud/eve-sandbox

Sandbox provider for [eve](https://eve.dev) (Vercel's agent framework, **0.64+**): every agent session runs in its own EasyBits Firecracker microVM, in your account, billed on your plan (MXN). Sessions sleep between turns (resume ~1 s) and are born from a template prepared once in `eve build`.

> eve ≤ 0.63 used `defineSandbox({ backend, bootstrap })`. For those versions pin `@easybits.cloud/eve-sandbox@0.1`.

## Install

Node ≥ 24 (eve requires it).

```bash
npx eve init app && cd app
npm i @easybits.cloud/eve-sandbox        # or: pnpm add @easybits.cloud/eve-sandbox
export EASYBITS_API_KEY=eb_...           # WRITE scope (DELETE if eve should delete boxes and templates)
```

## Use

```ts
// agent/sandbox.ts
import { defineSandbox } from "eve/sandbox";
import { EasybitsSandbox } from "@easybits.cloud/eve-sandbox";

// Prepared ONCE during `eve build` and captured as a derived template.
export const environment = EasybitsSandbox.environment({
  prepare: async (sandbox) => {
    await sandbox.run({ command: "npm i -g cowsay" });
  },
});

// Every session opens its own microVM from that template.
export default defineSandbox(() => environment.open());
```

`export const environment` is required: `eve build` looks for it. Then `npx eve build` (logs `easybits: plantilla dt_… lista`, later `reusada`) and `npx eve dev --no-ui` / `npx eve start`.

## How it maps

| eve | EasyBits |
|---|---|
| `prepare()` — `eve build` (in `eve dev`, on first access) | temporary `node` box + workspace (`/workspace`) + skills (`~/.agents/skills`) + your `prepare(sandbox)` → **derived template** keyed by content (`template-snapshot`). Idempotent: 9.7 s first time, 0.3 s reused. Unused for 30 days, it is deleted. |
| `open()` → `start()` | `POST /sandboxes` from the template (`templateKey` + `templateHash`), ~5 s. `open({ env })` goes to `/etc/profile.d`; `open({ networkPolicy })` is applied on the host. |
| `resume()` | reattach by `sandboxId`, waking it if asleep (~1 s). If the box is gone it **fails** (eve's contract) and eve reruns the selector; `recreateOnLoss: true` recreates it from the template instead. |
| stop · delete | suspend · destroy |
| `run` / `spawn` | `bash -lc` via `/bg`, stdout/stderr streamed, `kill()` signals the process group |
| `setNetworkPolicy` | `"allow-all"`, `"deny-all"` or a per-domain allow-list, same shape as Vercel; `transform` is not supported (explicit error) |

## Options

`EasybitsSandbox.environment({ prepare, apiKey, baseUrl, template: "node", timeoutSeconds: 3600, workingDirectory: "/workspace", runTimeoutSeconds: 600, idleTtlSeconds: 600, hardTtlSeconds: 7d, metadata, recreateOnLoss: false })` · `environment.open({ env, networkPolicy })`.

`createEasybitsProvider(options)` exposes the raw `{ prepare, start, resume }` implementation (used by `scripts/smoke-provider.ts`, which runs the whole lifecycle against the real cloud).

## Versions

<!-- generated:packages -->
- `@easybits.cloud/mcp@0.3.7`
- `@easybits.cloud/sdk@0.36.0`
- `@easybits.cloud/eve-sandbox@0.2.1`
- `@easybits.cloud/eve-world@0.1.2`
<!-- /generated -->

## Self-hosting eve on EasyBits

The eve server itself can run in an EasyBits box (template `eve-nitro`: Node 24, pnpm, eve CLI 0.65), with the project on the persistent `/data` volume and a public HTTPS URL via `expose`. Each agent session then gets its own microVM through this provider, and [`@easybits.cloud/eve-world`](https://www.npmjs.com/package/@easybits.cloud/eve-world) keeps eve's durable state in EasyBits DB so a run survives the server box. Full guide: https://www.easybits.cloud/docs/eve.md
