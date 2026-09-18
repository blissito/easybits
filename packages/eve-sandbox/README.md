# @easybits.cloud/eve-sandbox

Run your [eve](https://eve.dev) agents' sandboxes on [EasyBits](https://www.easybits.cloud) Firecracker microVMs — persistent, born from derived templates, billed in MXN.

## Requirements

- **Node.js ≥ 24** — eve itself requires it (`engines.node >= 24`); this package inherits the requirement. On EasyBits, the `eve-nitro` template ships Node 24.
- An EasyBits API key with `WRITE` scope (creating boxes, capturing the derived template). Add `DELETE` if eve should be able to delete derived templates.

```bash
npm i @easybits.cloud/eve-sandbox
```

```ts
// agent/sandbox.ts
import { defineSandbox } from "eve/sandbox";
import { easybits } from "@easybits.cloud/eve-sandbox";

export default defineSandbox({
  backend: easybits(),          // reads EASYBITS_API_KEY
  async bootstrap({ use }) {
    const s = await use();
    await s.run({ command: "git clone https://github.com/your-org/tools /workspace/tools && cd /workspace/tools && npm ci" });
  },
});
```

## How eve's contract maps to EasyBits

| eve | EasyBits |
|---|---|
| `prewarm(templateKey)` — eve calls it on `eve start`, not on `eve build` (which only compiles) | temporary box + seed files + `bootstrap()` → **derived template** (`template-snapshot`, key `eve:<templateKey>` + hash of the image options). Idempotent on the host: the first start logs `easybits: plantilla dt_… lista`, later ones `reusada`. The capture itself takes ~0.5 s. |
| `create()` | `POST /sandboxes` with `templateKey`+`templateHash`: the box is **born with the bootstrap done** (~0.6 s create + ~2 s boot, session ready in ~4 s; no fork, no copy per child). With `templateKey: null`, a fresh box from `template`. 404 `DerivedTemplateNotProvisioned` / 409 `DerivedTemplateStale` (base template rebaked) → `SandboxTemplateNotProvisionedError`, so eve prewarms again. |
| `create()` with persisted state | reattaches the same box (resumes it if it was suspended). |
| `stop()` / `shutdown()` | **suspend** — Firecracker snapshot, resumes in ~1s, disk and memory intact. |
| `delete()` | destroy. |
| `run()` | `/exec` (exitCode, stdout, stderr). |
| `spawn()` | `/bg` background process; stdout/stderr are polled and streamed, `kill()` signals the whole process group. |
| files | `/files/*` — text, binary, line ranges, missing file → `null`. |
| `setNetworkPolicy` | per-box egress policy: `"allow-all"`, `"deny-all"` or a per-domain allow-list, resolved to IPs by the host (DNS refresh), persisted and re-applied on resume. `transform` (header injection) is **not supported** and throws. |

Relative paths resolve from `/workspace` (configurable).

## Options

```ts
easybits({
  apiKey,              // default: process.env.EASYBITS_API_KEY
  baseUrl,             // default: https://www.easybits.cloud
  template: "node",    // base template for bootstrap / template-less sessions
  timeoutSeconds: 3600,// TTL of each session box
  workingDirectory: "/workspace",
  runTimeoutSeconds: 600,
  metadata: {},        // extra metadata on every box (eve's tags are added too)
});
```

## eve next (`defineSandboxProvider`, PR #3271)

eve is redesigning providers ([vercel/eve#3271](https://github.com/vercel/eve/pull/3271): `defineSandboxProvider({ prepare, start, resume })`, `environment.open()`, immutable artifact + session state). This package ships that contract as a **separate export** so the `easybits()` backend above keeps working on eve ≤ 0.59. It targets the PR branch and may change until it merges.

```ts
// agent/sandbox.ts
import { defineSandbox } from "eve/sandbox";
import { EasybitsSandbox } from "@easybits.cloud/eve-sandbox/provider";

export const environment = EasybitsSandbox.environment({
  template: "node",
  prepare: async (sandbox) => {
    const r = await sandbox.run({ command: "git clone https://github.com/your-org/tools /workspace/tools && cd /workspace/tools && npm ci" });
    if (r.exitCode !== 0) throw new Error(r.stderr);
  },
});

export default defineSandbox(() =>
  environment.open({ env: { NODE_ENV: "production" }, networkPolicy: "deny-all" }),
);
```

| eve (#3271) | EasyBits |
|---|---|
| `prepare(ctx)` — on `eve build` | temporary box + workspace/skills resources written to `/workspace` and `$HOME/.agents/skills` + your `prepare(sandbox)` → **derived template** (`templateSnapshot`) keyed `eve:<resourcesKey>` + hash of template, resource keys and `prepare` source. Idempotent on the host (measured: 8.2 s first time, 0.3 s reused). Artifact: `{ derivedId, key, hash, template, version }`. |
| `start(ctx, options, artifact)` | `create({ templateKey, templateHash })` — the box boots with the bootstrap already done (~5 s to running); `options.env` is baked into `/etc/profile.d` (commands run in a login shell); `options.networkPolicy` applied on the host. State: `{ sandboxId, sessionName, generation, version }`. 404/409 → `SandboxTemplateNotProvisionedError`. |
| `resume(ctx, artifact, state)` | `GET` by id (suspended → resume, ~5 s). If the box is gone, it is looked up by `sessionName`; if that fails too, a new box is created from the same artifact (`recreateOnLoss: true`, default — the `env` from `open()` is lost since it lived on the lost disk). `recreateOnLoss: false` throws instead, as the eve docs prescribe. |
| `onSessionStop` / `onRuntimeShutdown` | suspend. |
| `onSessionDelete` | destroy. |
| session (`run`, `spawn`, files, `removePath`, `setNetworkPolicy`) | same implementation as the backend above. |

Not covered: `ctx.files` (Dockerfile builds — EasyBits boxes start from a template, not an image build), `/eve/resources` read-only mounts (resources are written to their target paths, as the Vercel provider does), and `transform`/`forwardURL` network rules. Credentials and open options are never serialized into the artifact or state.

`createEasybitsProvider(options)` exposes the raw `{ prepare, start, resume }` implementation (used by `scripts/smoke-provider.ts`).

## Versions

<!-- generated:packages -->
- `@easybits.cloud/mcp@0.3.7`
- `@easybits.cloud/sdk@0.35.1`
- `@easybits.cloud/eve-sandbox@0.1.1`
- `@easybits.cloud/eve-world@0.1.1`
<!-- /generated -->

## Self-hosting eve on EasyBits

The eve server itself can run in an EasyBits box (template `eve-nitro`: Node 24, pnpm, eve CLI), with `.eve/.workflow-data` on the persistent `/data` volume and a public HTTPS URL via `expose_port`. Each agent session then gets its own microVM through this backend.
