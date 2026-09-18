# Issue para vercel/eve — template "Feature request"

**Title:** Discoverability for third-party SandboxBackends (EasyBits Firecracker backend, ready to migrate to `defineSandboxProvider`)

## What problem are you trying to solve?

`docs/sandbox.mdx` documents writing a custom `SandboxBackend`, but there is no place to list or discover third-party ones: the registry/catalog kinds are channel/connection/extension/instrumentation/memory, with no `sandbox` kind. Blaxel raised the same gap in #1922 (still unanswered). Users who cannot or do not want to run Docker/KVM locally, or who need sessions that persist and resume across turns and server restarts, have no way to find backends that provide that.

We ship one: **`@easybits.cloud/eve-sandbox`** (npm, MIT) — a `SandboxBackend` over EasyBits Firecracker microVMs (remote; no local Docker/KVM). Verified end-to-end against eve **0.58.1 and 0.59.1** with a real agent (`eve init` scaffold + Anthropic provider):

- `prewarm()` → one-time bootstrap captured as a copy-on-write snapshot keyed by `templateKey`+content hash; later builds reuse it (0.2 s) instead of rebuilding.
- `create()` → fork of that snapshot per session (~7 s); between turns the VM is suspended (memory snapshot) and resumed in ~1 s, reattached by `sandboxId` with disk and processes intact.
- `stop()`/`shutdown()` → suspend; `delete()` → destroy. `run()`/`spawn()` with streamed stdout/stderr and group `kill()`; text/binary/line-range file I/O; `removePath`.
- `setNetworkPolicy()` with the `@vercel/sandbox` shape: `allow-all`, `deny-all`, or a per-host allow-list enforced by the host firewall per VM (DNS-refreshed, persisted across suspend/resume, applied atomically). `transform` (header injection) is not supported and throws explicitly.

Companion: **`@easybits.cloud/eve-world`**, a Workflow SDK World (port of `@workflow/world-postgres` to libSQL, specVersion 7) so a self-hosted eve server can be destroyed and recreated without losing a run — measured: an 8-step run killed at step 2 resumed at step 3 on a fresh box 59 s later, no steps repeated.

Docs: https://www.easybits.cloud/en/docs/eve.md · Tutorial: https://www.easybits.cloud/blog/agentes-eve-en-easybits?lang=en · Source: https://github.com/blissito/easybits/tree/main/packages/eve-sandbox

## Proposed solution

Either (a) a "Community backends" list in `docs/sandbox.mdx` (name, package, one line, link), or (b) a registry item following the extension flow in CONTRIBUTING (`extension/easybits-sandbox`: npm dev dependency in `apps/docs`, mount example under `registry/extensions/`, catalog identity, integrations page + logo). We will do whichever you prefer and wait for maintainer agreement before opening a PR.

We are aware of #3271 (`defineSandboxProvider()` with `prepare/start/resume` replacing `SandboxBackend`). Our host already exposes the primitives that contract wants (immutable provider state = snapshot id + sandbox id; `resume` without re-running the selector), so we will publish the provider shape as soon as it lands and can be an early external tester of the new contract if useful.

## Alternatives considered

Keeping it undiscoverable (status quo): users only find it through our own docs. A one-line pointer in `docs/sandbox.mdx` costs nothing to maintain and does not add runtime code to eve.
