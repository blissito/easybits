// Traducción EN de las secciones `agents` y `hosting` de reference.ts. Generada 2026-09-16.
export const EN_AGENTS = `## Agents & Sandboxes

Firecracker microVMs for running agents and isolated code. The tools live in the \`sandbox\` MCP group (the full catalog is at /api/tools.json).

### Templates
\`code-interpreter\` (Python + persistent Jupyter kernel), \`python\` / \`node\` / \`bun\` (base runtimes), \`ubuntu\` (full Linux), \`rust-ghosty\` (DeepSeek-first Ghosty + WhatsApp), \`claude-code\` (Claude Agent SDK loop), \`ghosty-lite\` (lightweight ACP agent in Rust, multi-provider; see Agents) and \`goose\` (AAIF's goose, native ACP), \`computer-ghosty\` (computer-use with a desktop), \`livekit-svc\` (video-call room + HD recording → see the Studio section), \`ghostyclaw\` / \`openclaw\` (always-on daemons).

### Create a sandbox
\`POST /sandboxes\`
Body: \`{ template, timeoutSeconds?, name?, suspendOnIdle?, hardTtlSeconds?, persistent?, size? }\`
MCP: \`sandbox_create({ template, timeoutSeconds?, suspendOnIdle?, hardTtlSeconds? })\`

⚠️ **Without \`suspendOnIdle\`, when \`timeoutSeconds\` runs out the box is DESTROYED — it does not go to sleep.**
And if you omit \`timeoutSeconds\` the default is **300 s**: five minutes and the box is gone.
That is the difference between "my agent is still there tomorrow" and an unexplained 404.

- \`suspendOnIdle: true\` — on idle, SUSPEND (Firecracker snapshot) instead of destroying.
  Waking up takes ~0.2 s **and any request to its public URL triggers it**, including a
  WebSocket upgrade: there is no need to "poke" it first (measured 2026-09-01).
- \`hardTtlSeconds\` — when to actually destroy it. Without this it sleeps, but the janitor sweeps
  anything that has been suspended for 72 h.
- \`persistent: true\` — the box skips the age-based reaper (for always-on).

The body takes no fields beyond those. What a box does **on wake-up** is not declared here:
it is a separate call on the already-created box — see *Bootstrap on resume*.

For any box hosting an agent you are going to write to LATER —an ACP agent, a bot—
\`suspendOnIdle\` is not optional: without it you lose the box and its URL stops serving, because the
new box's sandboxId is a different one.

### Run a command
\`POST /sandboxes/:id/exec\`
Body: \`{ command, cwd?, timeoutSeconds?, env? }\`
MCP: \`sandbox_exec({ sandboxId, command })\`

### Long-running commands (background)
\`POST /sandboxes/:id/bg\` · MCP: \`sandbox_exec_background({ sandboxId, command })\`
Status: \`GET /sandboxes/:id/bg/:execId\` · MCP: \`sandbox_exec_status({ sandboxId, execId })\`
List: \`GET /sandboxes/:id/bg\` · MCP: \`sandbox_exec_list({ sandboxId })\`
Kill: \`DELETE /sandboxes/:id/bg/:execId\` (or \`POST /sandboxes/:id/bg/:execId/kill\`) · MCP: \`sandbox_exec_kill({ sandboxId, execId })\`

\`exec\` is synchronous (60 s by default, 600 s cap): for a build, a dev server or anything that outlives the request, use background. Do not try to leave something running with \`nohup\` or \`&\` inside \`exec\`: the shell dies when it responds and takes the child with it. Write the command as \`exec <program>\` so the shell is REPLACED by your process instead of staying on as its parent.

And **remember \`sandbox_exec_kill\`**: without it a hung process keeps eating the box until the TTL expires. It kills the WHOLE GROUP (SIGTERM, then SIGKILL after the grace period), so any children the command forked die too. If you lost the \`execId\`, \`sandbox_exec_list\` gives it back.

### Run inline code
\`POST /sandboxes/:id/run-code\`
Body: \`{ code, lang?, timeoutSeconds? }\`
MCP: \`sandbox_run_code({ sandboxId, code, lang? })\`

### Bootstrap on resume

A box restored from a snapshot comes back **without booting**: it does not re-run systemd, nor the
entrypoint, nor \`.bashrc\` — all of that happened when the image was baked. So a box that
slept for three days wakes up with the world as it was three days ago, and nothing flags it.

\`sandbox_set_bootstrap({ sandboxId, script, mode?, timeoutSeconds? })\`
\`POST /sandboxes/:id/bootstrap\`
Body: \`{ script, mode?, timeoutSeconds? }\`

⚠️ **This is not a field of \`POST /sandboxes\`.** Create does not accept it: it is a second call
on the already-created box. Create first, then declare the bootstrap on its \`sandboxId\`.

The script is run by **the host**, on every wake-up, whatever triggered it: a request to a
port's proxy, a message to the agent, the public domain. Not only when you call \`resume\`.

\`\`\`bash
git -C /data/work fetch --all --prune \\
  && git -C /data/work checkout -B "sesion/\${EB_SANDBOX_ID}" origin/main \\
  && ln -sfn /skills /data/work/.claude/skills
\`\`\`

- **Make it idempotent.** It runs on EVERY wake-up: \`checkout -B\`, not \`-b\`; \`ln -sfn\`, not \`ln -s\`.
- Available variables: \`EB_RESUME=1\` and \`EB_SANDBOX_ID\`. The cwd is \`/data/work\`.
- \`mode: "async"\` (default) — the box responds immediately while the script runs, so the
  first message does not pay for it. \`"blocking"\` waits up to \`timeoutSeconds\` before serving,
  for when the work HAS to be done first.
- A failing script **never** leaves the box unreachable. The result is recorded
  (\`eb_boot_exit\`, \`eb_boot_err\`) so it is diagnosable instead of invisible.
- Empty script = turn it off, without destroying the box.

⚠️ **Never put a credential in the script.** The recipe travels in the box's metadata and
shows up in listings. Reference variables that already live inside the VM, or resolve the
secret with \`$secret:\` from a git tool.

\`\`\`js
await sbx.setBootstrap({
  script: 'git -C /data/work checkout -B "sesion/\${EB_SANDBOX_ID}"',
  mode: "blocking",
});
\`\`\`
\`\`\`bash
curl -X POST https://www.easybits.cloud/api/v2/sandboxes/$SB/bootstrap \\
  -H "Authorization: Bearer $EB_KEY" -H 'Content-Type: application/json' \\
  -d '{"script":"git -C /data/work fetch --all","mode":"async"}'
\`\`\`

This is the piece that turns skills into real memory: in a template without hot reload,
an installed skill takes effect on the next wake-up, by itself.

### Git: make the agent's work outlive the box

A box that sleeps for three days wakes up with three-day-old code, and without a way to
publish, whatever the agent wrote dies with it. These seven tools close the full loop:
clone, work, publish.

\`\`\`
sandbox_git_clone({ sandboxId, repo, dir, branch?, depth?, commit?, token? })
sandbox_git_status({ sandboxId, dir })
sandbox_git_commit({ sandboxId, dir, message, addAll?, paths? })
sandbox_git_push({ sandboxId, dir, branch?, setUpstream?, token? })
sandbox_git_pull({ sandboxId, dir, rebase?, token? })
sandbox_git_checkout({ sandboxId, dir, branch, create?, from? })
sandbox_git_log({ sandboxId, dir, limit?, cursor? })
\`\`\`

**The credential is PER CALL and does not stay in the box.** \`token\` accepts the literal value or
—better— a reference to your vault:

\`\`\`js
await eb.secrets.set({ name: "GITHUB_TOKEN", value: "ghp_…" });   // una vez
await sb.git.clone({ repo, dir: "/data/work", token: "$secret:GITHUB_TOKEN" });
\`\`\`

The token travels to the box for that operation and is wiped when it finishes. It is **never**
written to the repo's \`.git/config\` nor shown on the command line, so a \`ps\` from inside the
box does not see it. That is why there is no "clean up credentials afterwards" step: there is nothing to
clean. A URL with embedded credentials (\`https://user:token@…\`) is rejected with 422 instead
of being silently accepted, precisely because git WOULD persist it.

Details that matter when the caller is an agent and not a person:

- \`sandbox_git_status\` returns data, not text: \`{ branch, upstream, ahead, behind, clean,
  staged[], modified[], untracked[], conflicted[] }\`. It comes from \`porcelain=v2\`, so it does not change
  across git versions or with the system locale.
- \`sandbox_git_commit\` with no changes returns \`{ nothingToCommit: true }\` as SUCCESS. An error
  there invites the agent to retry, and retrying changes nothing: it is a loop.
- \`sandbox_git_checkout\` with \`create: true\` uses \`-B\`, which is idempotent — meant to
  run on every start without failing with "branch already exists".
- \`sandbox_git_push\` with \`force\` uses \`--force-with-lease\`: if someone else pushed to that branch,
  it fails instead of wiping out their work.
- The commit identity goes per call (\`authorName\` / \`authorEmail\`, default
  \`EasyBits Agent\`), without leaving a \`git config\` written in the client's repo.

For private repos in \`launch_app\`, the same mechanism: \`launch_app({ repo, repoToken:
"$secret:GITHUB_TOKEN" })\`. The token does not enter the runspec or the release tarball.

The same seven operations over REST and through the SDK:

\`\`\`bash
# REST — POST para clone|commit|push|pull|checkout, GET para status|log
curl -X POST https://www.easybits.cloud/api/v2/sandboxes/$SB/git/clone \\
  -H "Authorization: Bearer $EB_KEY" -H 'Content-Type: application/json' \\
  -d '{"repo":"https://github.com/tu/repo.git","dir":"/data/work","token":"$secret:GITHUB_TOKEN"}'

curl "https://www.easybits.cloud/api/v2/sandboxes/$SB/git/status?dir=/data/work" \\
  -H "Authorization: Bearer $EB_KEY"
\`\`\`

\`\`\`js
const sbx = await eb.sandboxes.create({ template: "node" });
await sbx.git.clone({ repo, dir: "/data/work", token: "$secret:GITHUB_TOKEN" });
await sbx.git.checkout({ dir: "/data/work", branch: "feature/x", create: true });
await sbx.git.commit({ dir: "/data/work", message: "cambios del agente" });
await sbx.git.push({ dir: "/data/work", setUpstream: true, token: "$secret:GITHUB_TOKEN" });

const st = await sbx.git.status("/data/work");   // { branch, ahead, behind, clean, ... }
\`\`\`

### Persistent kernel (code-interpreter)
MCP: \`sandbox_run_cell({ sandboxId, code })\` — state survives between cells. Matplotlib charts come back as images.
MCP: \`sandbox_kernel_restart({ sandboxId })\` — restart the kernel.

### Expose a port (public URL)
\`POST /sandboxes/:id/expose-port\`
Body: \`{ port }\`
MCP: \`sandbox_expose_port({ sandboxId, port })\`
Returns a public HTTPS URL (alive as long as the sandbox exists).

If the response carries a \`warning\`, the service is listening **only on \`127.0.0.1\`** inside the box: the URL is published but will return 502 until you bind to \`0.0.0.0\` (or \`::\`). The proxy dials the guest's IP, so a loopback bind is unreachable by design — same as in Docker, Fly or Cloud Run.

**Layer 7 with TLS: HTTP and WebSocket.** The certificate is already at the edge, so the same URL serves \`https://\` and \`wss://\` — no cloudflared or raw port needed for a WebSocket. What it does not do is raw layer 4: ports 22, 23, 25, 445 and 3389 are rejected with 400. For those use the L4 forward.

### Raw ports (TCP/UDP)
\`POST /sandboxes/:id/expose-raw\` · Body: \`{ port, protocol }\` (\`"tcp"\` | \`"udp"\`)
MCP: \`sandbox_expose_raw_port({ sandboxId, port, protocol })\` · SDK: \`sb.exposeRawPort(port, protocol)\`
Close: \`POST /sandboxes/:id/unexpose-raw\` — MCP \`sandbox_unexpose_raw_port\` · SDK \`sb.unexposeRawPort(port, protocol)\`

Returns:

\`\`\`json
{ "hostPort": 49123, "guestPort": 22, "protocol": "tcp",
  "host": "cname.sandboxes.easybits.cloud",
  "endpoint": "cname.sandboxes.easybits.cloud:49123", "ok": true }
\`\`\`

Use \`endpoint\` as-is for the target; do not assemble it by hand. The \`hostPort\` comes from a pool (49000-49999), is **different per box** and is **not** equal to the \`guestPort\` — that is exactly what lets each box have its own 22. It is not stable either: it is released when the box is destroyed and re-assigned, so read it again instead of storing it.

It is **gated by template capability**: if the template does not declare that port, the response is 403 — that is a "no", not a transient failure; do not retry.

### SSH into a box
\`POST /sandboxes/:id/ssh-enable\` · Body: \`{ publicKeys: string[] }\`
MCP: \`sandbox_ssh_enable({ sandboxId, publicKeys })\` · SDK: \`sb.enableSsh(publicKeys)\`
Close: \`POST /sandboxes/:id/ssh-disable\` — MCP \`sandbox_ssh_disable\` · SDK \`sb.disableSsh()\`

**The public key comes from the CLI; do not write it by hand.** \`easybits ssh-key\` creates it at \`~/.ssh/easybits_ed25519\` the first time and always returns the same one — and it is the one \`easybits ssh-proxy\` uses when connecting, so they cannot drift apart. Picking another one from \`~/.ssh\` is the most common mistake: you inject a public key that does not match the private key you later connect with, and sshd answers \`Permission denied\` with everything else correct. The private key never leaves the user's machine.

A single call does both halves: it injects the keys, restarts \`box-sshd\` and exposes 22 over L4. It returns the forward plus a ready-to-paste command:

\`\`\`
ssh -p 49002 root@cname.sandboxes.easybits.cloud
\`\`\`

- The box's sshd is **fail-closed**: without a key it does not start, so a box nobody injected anything into has no SSH surface, not even a closed one. That is why the key goes first.
- **Key-only** access, as \`root\` (\`PasswordAuthentication no\`).
- Several keys: one per array element. Internally they are separated by **comma**, not by newline.
- The host key persists in \`/app/ssh/\`, so the fingerprint survives restarts and resume — no MITM warning on every boot.
- \`ssh-disable\` only closes the port; the key stays injected. To truly **revoke** it, remove it from \`/app/secrets.env\`.
- Only on templates that declare 22 (today: \`ghosty-studio\`).

### SSH over a tunnel (recommended: no ports, goes through 443)

The command above uses a high port on the host, and **a high port does not get through an office network or a corporate VPN**. That reaches you as "it won't connect" from a network you cannot reproduce. The tunnel comes in through the usual 443: if the user can open a web page, they can get into their box.

\`\`\`sh
npm i -g @easybits.cloud/cli && easybits login <tu-api-key>
easybits ssh-key          # tu llave pública; la crea si no existe
\`\`\`

In \`~/.ssh/config\`:

\`\`\`
Host *.ghosty
  ProxyCommand easybits ssh-proxy %h
  User root
\`\`\`

And that is it:

\`\`\`sh
ssh mi-caja.ghosty        # el NOMBRE que le diste al crearla
ssh sb_abc123.ghosty      # el id también sirve
ssh mi-caja.ghosty "cd /data/work && ghosty serve --acp"   # ACP remoto por stdio
\`\`\`

You still need \`ssh-enable\` once, to inject the key: the box's sshd is fail-closed. Pass it the output of \`easybits ssh-key\` — it is the same key \`ssh-proxy\` will use when connecting, so they cannot drift apart. The private key never leaves your machine.

The box's **name** (the \`name\` from create) works as the host: \`ssh mi-caja.ghosty\`. It is neither unique nor secret — if two boxes share it the proxy fails instead of choosing, because getting into the wrong box is worse than not getting in. It does not matter that it is public: the session is authenticated with your key and the ticket, never with the name.

- **The tunnel does not authenticate.** It moves opaque bytes; the SSH session is authenticated end to end between your \`ssh\` and the box's sshd. A tunnel failure gives nobody access.
- The CLI requests a **short-lived signed ticket** (\`POST /sandboxes/:id/ssh-ticket\` · SDK \`sb.sshTicket()\`) and opens \`wss://…/_ssh\`. You normally do not call it yourself.
- Expired ticket, tampered signature or someone else's box: **403/404** at the edge, without reaching the host.
- The proxy's \`stdout\` is the SSH channel: any extra byte there corrupts the handshake, so all its diagnostics go to \`stderr\`.

### Custom domains (custom domain + automatic HTTPS)
Serve a sandbox port under YOUR domain (\`app.cliente.com\` or \`cliente.com\`) instead of the \`sb-…\` URL. The TLS cert is issued on its own on first access (no egress fees, no extra config). One domain → one sandbox.

\`POST /sandboxes/:id/domain-add\` · Body: \`{ domain, port }\`
MCP: \`sandbox_domain_add({ sandboxId, domain, port })\` · SDK: \`sb.addDomain(domain, port)\`
Returns in \`dns\` the EXACT record to create: **subdomain → CNAME** to \`cname.sandboxes.easybits.cloud\`; **root/apex → A** to the edge IP (apex does not allow CNAME).

\`POST /sandboxes/:id/domain-remove\` · Body: \`{ domain }\` — MCP: \`sandbox_domain_remove\` · SDK: \`sb.removeDomain(domain)\`
\`POST /sandboxes/:id/domain-list\` — MCP: \`sandbox_domain_list\` · SDK: \`sb.listDomains()\`
\`POST /sandboxes/:id/domain-verify\` · Body: \`{ domain }\` — MCP: \`sandbox_domain_verify\` · SDK: \`sb.verifyDomain(domain)\` — confirms DNS + TLS cert

Flow: \`domain-add\` → create the DNS record given in \`dns\` → \`domain-verify\`. Create the record in your **authoritative** DNS (if your registrar delegates nameservers to another provider, edit it there).

### Files
- \`sandbox_files_write({ sandboxId, path, content })\` — write a file
- \`sandbox_files_read({ sandboxId, path })\` — read a file
- \`sandbox_files_list({ sandboxId, path })\` — list a directory
- \`sandbox_files_delete({ sandboxId, path })\` — delete
- \`sandbox_files_move({ sandboxId, from, to })\` — move/rename
- \`sandbox_files_mkdir({ sandboxId, path })\` — create a directory
- \`sandbox_files_edit({ sandboxId, path, oldString, newString, replaceAll? })\` — surgical in-place edit (read→replace→write). Use this instead of exec+sed: it avoids shell escaping. Replaces all occurrences by default; \`replaceAll:false\` = only the first. SDK: \`sb.files.edit(path, old, new)\`

### Logs & daemon runtime
- \`sandbox_logs({ sandboxId, unit?, lines?, since?, grep? })\` — native journald logs (no piping journalctl through exec). REST: \`POST /sandboxes/:id/logs\` with that body, or \`GET /sandboxes/:id/logs?unit=&lines=&grep=\`. \`unit\` filters one systemd service (e.g. \`ghosty-gc-runtime\`, convention \`<template>-runtime\`); omit it for the full journal. No follow/streaming. SDK: \`sb.logs({ unit, lines, since, grep })\`
- \`sandbox_runtime({ sandboxId, action, unit?, buildCommand?, cwd? })\` — control via systemd. \`status\` (unit state) · \`restart\` (unit required) · \`rebuild\` (runs buildCommand in cwd and restarts the unit). SDK: \`sb.runtime(action, { unit, buildCommand, cwd })\`
- \`sandbox_apply_patch({ sandboxId, edits[], rebuild?, restart? })\` — atomic hotfix: applies N edits → optional rebuild → optional restart, in one call. If the build fails it does NOT restart (the live daemon stays up). SDK: \`sb.applyPatch({ edits, rebuild, restart })\`

### Lifecycle
- \`sandbox_list()\` — list active sandboxes
- \`sandbox_status({ sandboxId })\` — state (starting/running/stopped/error/lost/suspended)
- \`sandbox_extend({ sandboxId, extendSeconds? })\` — extend the TTL (max per plan: Byte 1h · Mega 4h · Tera 24h)
- \`sandbox_suspend({ sandboxId })\` — snapshot to disk; pauses the TTL while suspended
- \`sandbox_resume({ sandboxId })\` — restore from snapshot; restores the remaining TTL (no sandbox_extend needed)
- \`sandbox_destroy({ sandboxId })\` — destroy and release

### Persistent agents (agent_create)
\`POST /agents\`
Body: \`{ template, env, name?, timeoutSeconds?, seedFiles?, mcpServers? }\` — \`env\` is required (\`{}\` if the template asks for nothing): model keys and agent config; they are written inside the VM and never come back out through the API.
\`seedFiles: [{ name, contentBase64 }]\` are written to \`/data/workspace/<name>\` **flattened** (no subfolders: \`/\` becomes \`_\`); they are for dropping in an MCP or knowledge without cloning a repo. \`mcpServers\` (ACP templates only) travels in the \`session/new\`; see below.
Responds immediately with \`status: building\`; poll \`GET /agents/:id\` until \`running\` before the first message.
MCP: \`agent_create({ template })\` — creates an agent with a public HTTP endpoint
MCP: \`agent_list()\` — list agents
MCP: \`agent_message({ agentId, content })\` — send a message
MCP: \`agent_destroy({ agentId })\` — destroy an agent

### 🆕 ACP agents: \`ghosty-lite\` and \`goose\`
Agents that speak [ACP](https://agentclientprotocol.com) (Agent Client Protocol) in their own microVM: \`ghosty-lite\` (Rust, lightweight, ours) and \`goose\` (AAIF / Linux Foundation). Same flow with \`POST /agents\`; what changes is the \`env\` and what \`running\` means.

**1. Create** — \`env: {}\` is enough: \`ghosty-lite\` starts with **your own EasyBits key** as its brain (provider \`easybits\`, model \`deepseek-v4-pro\`) and with the EasyBits MCP already connected. It is the same key for both things: turns are deducted from **your** LLM tokens (\`GET /llm/balance\`) and the agent operates on **your** account. If you have none stored, one is minted with the scopes of the key that made the call.
For another brain, the \`env\` rules: \`{ GHOSTY_PROVIDER: "anthropic", GHOSTY_MODEL: "claude-haiku-4-5", ANTHROPIC_API_KEY: "..." }\` · goose uses \`GOOSE_PROVIDER\` / \`GOOSE_MODEL\`.
Providers: \`easybits\` (metered, default), \`anthropic\`, \`openai\`, \`custom_deepseek\` (+ \`DEEPSEEK_API_KEY\`, off-meter), \`ollama\`… If you only send \`DEEPSEEK_API_KEY\`, the box picks DeepSeek on its own.
**Your Claude subscription (Max/Pro)**: send \`CLAUDE_CODE_OAUTH_TOKEN\` (the one from \`claude setup-token\`) and the agent is born with \`GHOSTY_PROVIDER: "claude-acp"\` + \`GHOSTY_MODEL: "current"\` (whatever model the adapter brings); flat rate, off-meter. The metered proxy (\`/llm/v1/models\`) does NOT offer Claude: that is the only path to Claude in \`ghosty-lite\`.

**2. Wait for \`running\`** — for ACP it means Easybits already did \`initialize\` + \`session/new\` and stored the session (~6 s from create). Before that \`/message\` has no session.

**3. \`POST /agents/:id/message\`** \`{ content }\` → SSE \`{type:"chunk",value:"…"}\` … \`{type:"done"}\`. Each turn reuses the session; the agent keeps context and disk (\`/data\`). Works with the owner's \`eb_sk\` or with the \`embedToken\` from a browser.

**4. The machine is yours** — \`POST /sandboxes/:sandboxId/exec\` to read what the agent wrote; \`DELETE /agents/:id\` destroys it. Without deleting, it sleeps on idle and wakes with the next message.

**From an editor (Zed, JetBrains, VS Code), Ghosty Teams or any ACP client**: put \`ACP_AGENT_TOKEN\` in the \`env\` at create time and connect over WebSocket to the **agent's stable URL**, which comes as \`agentUrl\` from the POST (it answers once it reaches \`running\`): \`wss://acp-<agentId>.sandboxes.easybits.cloud/acp?token=<ACP_AGENT_TOKEN>\` — the \`/acp\` **is part of the URL** (with the bridge \`npx ghosty-acp <that url>\`, \`env: {}\`; the keys already live in the box). Port 3000 is already exposed; no \`/expose\` needed.

**5. Stable identity and revive** — the URL carries the \`agentId\`, not the machine: if the host recycles the box (days without use), the URL stays the same. \`POST /agents/:id/revive\` (Bearer the owner's \`eb_sk\` **or** the agent's \`embedToken\` / \`ACP_AGENT_TOKEN\`) brings it back up on the same agent and returns \`{ agentId, sandboxId, status, wsUrl }\`; if the box exists it does nothing. It takes as long as the boot takes (~10-60 s): wait for the response, do not retry. The previous box's disk (\`/data\`) is lost. \`/message\` does it on its own when it finds the agent in \`lost\`. A WebSocket client recognizes it by a \`404\` with \`preview host not found\` on the agent's URL.

Usage: with the \`easybits\` brain (the default) the proxy meters it and it shows in \`GET /llm/balance\`; with your own provider (BYOK) the spend is against that provider and EasyBits does not count it. The \`/message\` SSE also emits a \`{type:"usage", inputTokens, outputTokens, totalTokens}\` right before \`done\`, when the agent reports it (these are SESSION totals, not per-turn). **Your own tools (\`mcpServers\`)**: \`[{ name, command, args?, env? }]\` (stdio) or \`[{ name, type:"http", url, headers? }]\`; \`$secret:NOMBRE\` in \`env\`/\`headers\` resolves from the owner's vault. ⚠️ With \`claude-acp\` **only http MCPs get in** (it announces \`mcpCapabilities: {http:true}\`, no stdio): a stdio one is rejected with 400. Bring the server up over Streamable HTTP inside the box (e.g. seeded with \`seedFiles\`) and declare it as \`{ type:"http", url:"http://127.0.0.1:<puerto>/mcp" }\`. With \`easybits\`/DeepSeek (goose) stdio does work. With \`claude-acp\` tools run **without asking for permission** (bypass mode inside the microVM): there is no confirmation dialog to attend to.

### Agent Run (one-shot)
MCP: \`agent_run({ prompt, model?, maxTurns? })\` — asynchronous Claude agent
MCP: \`agent_run_status({ jobId })\` — check status
MCP: \`agent_run_destroy({ jobId })\` — release the sandbox

Rate limits: 10 spawns/min, 120 ops/min. Sandboxes self-destruct at the TTL (default 5 min; max per plan: Byte 1h · Mega 4h · Tera 24h).
`;

export const EN_HOSTING = `## Hosting — Permanent sandboxes (always-on)

An ephemeral sandbox self-destructs at the TTL. A **permanent sandbox** runs 24/7 and is billed **flat in MXN/month**. Same resource, same \`sandboxId\` — "permanent" is just a flag + billing. MCP group: \`hosting\`.

**You do NOT need a paid plan to host.** Hosting bills on its own, with its own subscription: someone on Free pays for their box and nothing else. The plan still gates AI, storage and fleet; it no longer gates hosting.

\`create_machine\` returns one of two things:
- **with an active plan** → the machine, provisioned instantly, billed on the plan's same invoice.
- **without a plan** → \`{ checkoutUrl }\`. You hand that link to the customer; **the machine is created on its own when the payment is confirmed** (nothing runs for free in the meantime). After they pay, \`list_machines()\` shows it.

Cancelling a machine's subscription does NOT touch your plan, and vice versa: they are independent charges. On cancel, the box goes to soft delete with a 7-day grace period and a final backup is taken.

### Tier catalog
\`GET /machines/tiers\` · MCP: \`list_machine_tiers()\` · SDK: \`eb.machines.tiers()\`
Tiers (vCPU/RAM/NVMe → MXN/month shared):
__HOSTING_TIERS_MD__
For a 24/7 Node app the real floor is \`micro\`: \`nano\` (256MB) runs a static binary or a side project, but does NOT survive a Node build. Disk add-on: +100GB NVMe = $99/month (stackable). **Reserved** CPU (guaranteed floor) only from focus up.

### Create a permanent sandbox
\`POST /machines\` · Body: \`{ tier, cpuMode?, diskAddonsGB?, template?, name? }\`
MCP: \`create_machine({ tier })\` · SDK: \`eb.sandboxes.createPermanent({ tier })\` (or \`eb.machines.create({ tier })\`)
Returns the record with \`sandboxId\`, \`tier\`, \`monthlyMxn\`, \`status\`. You operate it like any other sandbox (exec, files, expose_port, domains) by its \`sandboxId\`.

### Promote an ephemeral to permanent
\`POST /machines\` · Body: \`{ fromSandboxId, tier }\`
MCP: \`make_permanent({ sandboxId, tier })\` · SDK: \`sb.makePermanent(tier)\`
Keeps the SAME \`sandboxId\`, disarms the reaper and starts billing.

### List / release
MCP: \`list_machines()\` · SDK: \`eb.machines.list()\` — your permanent sandboxes with \`tier\` + \`monthlyMxn\`.
\`DELETE /machines/:sandboxId\` · MCP: \`release_machine({ sandboxId })\` · SDK: \`sb.release()\` — removes the charge (prorated) and destroys the VM. **Destructive**, idempotent.

The plan is the access gate; each sandbox bills separately. If your plan is cancelled, your sandboxes are suspended.

### launch_app — an app in production in ONE call
The equivalent of \`fly launch\`. It provisions the machine, puts in the code, builds, starts, exposes a public HTTPS URL, **publishes the recovery release** and optionally attaches the customer's domain. Returns \`{ url, releaseId, domain.dns }\`.

**Use this instead of chaining create + deploy + expose + domain by hand.** Done by hand, the step that gets skipped is the release — and a machine without a release cannot be rebuilt if it dies.

Source: exactly ONE of the three.
- \`repo\` — git clone. The reproducible path.
- \`archiveUrl\` — URL of a \`.tar.gz\`/\`.zip\` of the app; for when the customer uploads it **from their computer** and has no repo yet. Accepts zip and tarball, and flattens the nested folder a zip usually comes with.
- \`sandboxId\` — the agent already wrote the app inside that box; do the rest.

MCP: \`launch_app({ repo | archiveUrl | sandboxId, tier?, port?, dataPaths?, domain? })\`
REST: \`POST /machines/launch\` · SDK: \`eb.machines.launch({ … })\`

Defaults: \`tier: "micro"\` (nano is 256MB — it does NOT survive a Node build), \`template: "node"\` (Node 22 + npm; \`ubuntu\` does NOT ship Node), \`appDir: "/app"\`, \`buildCommand: "(npm ci || npm install) && npm run build"\`, \`startCommand: "npm start"\`, \`port: 3000\`.

**App variables (non-secret)** go in \`env\`: \`{ PORT: "4000", API_URL: "…" }\`. They are exported before the build and before start; vault secrets win by name. Keys must be shell identifiers (\`A-Z_0-9\`).

**What we learned with a real app (React Router v7 + Express 5)**:
- \`npm start\` with \`node --env-file=.env server.js\` **dies in the box**: there is no \`.env\`. Start with \`startCommand: "node server.js"\` and pass config through \`env\` + secrets.
- Express 5 rejects \`app.all("*", …)\` (path-to-regexp 8). Use \`app.use(handler)\`.
- Public GitHub repos clone without a token. A private one: \`https://x-access-token:GH_TOKEN@github.com/usuario/repo.git\`.

**Redeploy the same machine from the repo** (the direct flow, no workflow): secrets first, then \`launch_app({ sandboxId, repo, … })\`. It publishes a new release (v2, v3…) and restarts the app in ~18 s. \`sandboxId\` is the TARGET; \`repo\` the source.

**Measured times** with a real React Router v7 app (204 MB of \`node_modules\`, 49.5 MB release), on tier \`micro\`:

| step | time |
|---|---|
| provision the box | 3.7 s |
| \`npm ci\` + build inside the box (first deploy) | 6.9 s |
| publish the \`prebuilt\` release | 11.3 s |
| **redeploy to a clean box** | **12.0 s** |

A heavier app takes longer, mostly downloading the release. With \`prebuilt: true\` the deploy runs no build: it downloads, extracts and starts.

⚠️ **Build INSIDE the box, not on your machine.** A \`node_modules\` with native modules (sharp, better-sqlite3) compiled on macOS blows up on Linux. The first deploy pays for the \`npm ci\`; from then on you publish \`prebuilt\` and every deploy takes seconds.

If the build fails, the machine \`launch_app\` created is released on its own: it does not leave you paying for a broken box. A box you passed via \`sandboxId\` is NEVER touched.

**It also works without a paid plan**: if the account has no plan, \`launch_app\` (and \`create_machine\`) return \`{ checkoutUrl }\` instead of failing. You hand that link to the customer; when they pay, the machine is created on its own and shows up in \`list_machines()\`. Then you call \`launch_app\` again with its \`sandboxId\` to deploy on top.

### Releases — making the box rebuildable
Fly/Vercel treat the disk as disposable because the deploy rebuilds it from an image. Here the app is written INSIDE the box, so without a release a dead box takes the app with it, not just the data. A **release** is a versioned tarball of the code in durable storage + a **runspec** that says how to build and start it.

**Release = CODE. Backup = DATA.** A box recreated from a release starts empty.

1. \`set_machine_runspec({ sandboxId, appDir, buildCommand?, startCommand?, unit?, port?, dataPaths? })\` — required before the first deploy. \`dataPaths\` is what the daily backup copies: without it the machine has NOTHING backed up. Do not put secrets in \`env\` (it is stored and travels inside every tarball).
2. \`deploy_machine({ sandboxId, message? })\` → publishes a release. SDK: \`eb.machines.deploy(id)\`
3. \`list_machine_releases({ sandboxId })\` · \`rollback_machine({ sandboxId, releaseId })\` — goes back to a previous version on the SAME box. **No rebuild**: a release published by \`launch_app\` carries its build (\`prebuilt\`), so rollback and redeploy are download + extract + start. In exchange the tarball is heavier (it carries \`node_modules\`).
5. \`get_machine_logs({ sandboxId, lines?, grep? })\` — THE APP's log (last N lines): the unit's journal if the runspec has one, or the file the \`startCommand\` writes to. First place to look when the deploy said it started and the site does not answer. SDK: \`eb.machines.logs(id, { lines })\`.
4. \`redeploy_machine({ releaseId, tier?, replaceSandboxId? })\` — builds a NEW box. It serves two purposes: recovering a dead machine and **changing tier** (there is no hot resize — it is recreated). \`replaceSandboxId\` releases the old one once the new one is confirmed running; without it you pay for both.

REST: \`PUT /machines/:id/runspec\` · \`POST|GET /machines/:id/releases\` · \`POST /machines/:id/rollback\` · \`POST /machine-releases/:releaseId/redeploy\` (separate collection: works even if the original machine no longer exists) · \`GET /machines/:id/logs?lines=200&grep=\`.

### Backups — included, 7 days
Every night the runspec's \`dataPaths\` are copied to durable storage **off the host**, 7-day retention, **at no extra cost** (same deal Fly gives on volumes). The operating system is not backed up: it is rebuilt from the template.

- \`list_backups({ sandboxId })\` · \`create_backup({ sandboxId })\` — the latter, before anything risky.
- \`restore_machine_from_backup({ backupId, targetSandboxId?, confirm: true })\` — **overwrites data**, which is why it requires \`confirm\`. Restoring onto the source box takes an automatic backup first. With \`targetSandboxId\` you restore to a new box (e.g. one just made with \`redeploy_machine\`).

Two limits stated up front: the RPO is **24 hours**, and the backup is taken from the live filesystem, so a DB writing during the copy may end up inconsistent — each backup reports its level in \`consistency\`. If the app has a DB, keep it outside the box (EasyBits Databases, Atlas) or stop the service before \`create_backup\`.

Full recovery of a machine = \`redeploy_machine\` (code) + \`restore_machine_from_backup\` (data).

### App secret variables
Your app needs its \`DATABASE_URL\`, its \`STRIPE_SECRET_KEY\`. **Do not put them in \`runspec.env\`**: that is stored in the database and travels inside every release tarball. The API rejects them by name.

\`PUT /machines/:sandboxId/secrets\` · Body: \`{ "DATABASE_URL": "...", "JWT_SECRET": "..." }\`

The values are stored encrypted in your vault and the runspec keeps only the LIST of names. They are materialized inside the machine —in a file only root can read— right before building and before starting. They do not enter the release: a box rebuilt from a tarball still does not carry them inside, but it knows which ones to ask for.

- \`GET /machines/:id/secrets\` → \`{ secretNames, inVault }\`. Names, never values: a stored secret is never read back through the API.
- \`DELETE /machines/:id/secrets?name=DATABASE_URL\` → stops injecting it (the value stays in the vault).

They take effect on the **next deploy**, not on the fly. Rotating a secret means changing it here and deploying again. If the runspec declares one that is not in the vault, the deploy fails naming which one — better than watching the app die on connect.

### Deploy from GitHub on every push
The recommended pattern for a customer's site: **build on the GitHub runner** and send the machine the finished result. The box compiles nothing, so a site that would need 4 GB to bundle fits in \`micro\`.

Once, to create the machine:

\`\`\`bash
curl -X POST https://www.easybits.cloud/api/v2/machines/launch \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json" \\
  -d '{"repo":"https://x-access-token:GH_TOKEN@github.com/usuario/repo.git",
       "branch":"main","tier":"micro","template":"node","appDir":"/srv/app","port":3000}'
\`\`\`

Save the \`sandboxId\` it returns. Then, in the customer's repo, two secrets (\`EASYBITS_API_KEY\`, \`EASYBITS_SANDBOX_ID\`) and a workflow that on every push to \`main\`:

1. \`npm ci && npm run build\` **on the runner** — if the build is broken it never reaches production and the site stays up.
2. \`npm prune --omit=dev\` and package \`build\`, \`node_modules\`, \`package*.json\` and whatever the app reads on start.
3. Upload it with \`POST /files\` (\`access: "public"\`) and keep \`file.url\`.
4. \`POST /machines/launch\` with \`{ sandboxId, archiveUrl, prebuilt: true, appDir, port }\`.

**\`npx @easybits.cloud/cli init\` writes that workflow for you.**

Why \`sandboxId\` **and** \`archiveUrl\` together: \`sandboxId\` is the TARGET, not a source. You can send an already-built artifact to a machine that already exists — without that, the only place the build could happen would be inside the customer's box.

The GitHub runner is Linux x64, same as the microVM, so native modules compile for the right target. **Building on a Mac does break**: a \`node_modules\` with sharp or better-sqlite3 compiled on macOS blows up on Linux.

Every deploy publishes a release, so history and rollback keep working the same way.

### Dashboard (UI)
They are also managed from \`/dash/hosting\`: each site with its status and its address, and when you open one, four tabs — **Domains** (with the DNS record to create and whether it resolves yet), **Versions** (with one-click rollback), **Variables** and **Log** (the last lines of the log). From there you can also pause and cancel.
`;
