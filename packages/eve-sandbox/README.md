# @easybits.cloud/eve-sandbox

Run your [eve](https://eve.dev) agents' sandboxes on [EasyBits](https://www.easybits.cloud) Firecracker microVMs — persistent, snapshot-backed, billed in MXN.

## Requirements

- **Node.js ≥ 24** — eve itself requires it (`engines.node >= 24`); this package inherits the requirement. On EasyBits, the `eve-nitro` template ships Node 24.
- An EasyBits API key with `WRITE` scope (creating boxes, snapshots and forks). Add `DELETE` if eve should be able to delete snapshots.

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
    await s.run({ command: "npm i -g typescript" });
  },
});
```

## How eve's contract maps to EasyBits

| eve | EasyBits |
|---|---|
| `prewarm(templateKey)` at build time | temporary box + seed files + `bootstrap()` → copy-on-write **snapshot** named `eve:<templateKey>`. Idempotent: an existing snapshot is reused. |
| `create()` | **fork** of that snapshot (boots in seconds). With `templateKey: null`, a fresh box from `template`. |
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

## Versions

<!-- generated:packages -->
- `@easybits.cloud/mcp@0.3.7`
- `@easybits.cloud/sdk@0.34.7`
- `@easybits.cloud/eve-sandbox@0.0.6`
<!-- /generated -->

## Self-hosting eve on EasyBits

The eve server itself can run in an EasyBits box (template `eve-nitro`: Node 24, pnpm, eve CLI), with `.eve/.workflow-data` on the persistent `/data` volume and a public HTTPS URL via `expose_port`. Each agent session then gets its own microVM through this backend.
