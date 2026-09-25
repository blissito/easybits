---
name: easybits-cli
description: "Drive EasyBits from the terminal with the easybits CLI (npm @easybits.cloud/cli) - sandboxes, exec, sandbox files, permanent machines and releases, secrets, custom domains, SQL databases, agents and files, all with --json and stable exit codes. Use when a coding agent has a shell and needs to create or operate EasyBits resources without writing HTTP calls, or when the user mentions the easybits CLI."
license: MIT
compatibility: Needs Node 22+ (npx is enough), network access to https://www.easybits.cloud and an EasyBits API key
metadata:
  author: easybits
  version: "1.2"
---

# Use the EasyBits CLI

`easybits` wraps the EasyBits REST API v2 in commands. Prefer it over hand-written `curl`
when you have a shell: arguments are validated, output is stable JSON with `--json`, and
the exit code tells you what went wrong.

## Setup

```bash
npx -y @easybits.cloud/cli --version      # no install needed
npm i -g @easybits.cloud/cli              # or install once → `easybits`
easybits usage --json                     # exit 3 = no session yet
```

### Log the person in (you drive it, they click)

```bash
easybits login --json
# → {"event":"login_url","url":"https://www.easybits.cloud/oauth/authorize?…"}   (immediately)
# → {"event":"logged_in","email":"…","method":"oauth"}                         (after they sign in)
```

Show the `login_url` link to the person and keep the command running until
`logged_in` arrives (it opens their browser too; `--no-browser` skips that). The
session renews itself (before expiry, and once on a 401). It uses a loopback redirect, so the browser must be on the same
machine as the CLI; otherwise ask for an API key.

Alternatives: `easybits login <api-key>` or `EASYBITS_API_KEY` (preferred in CI).
Precedence: `EASYBITS_API_KEY` > `--token` > browser session > saved key. Keys come from
https://www.easybits.cloud/dash/developer — never invent one.

## Rules for agents

1. Always pass `--json`. stdout is then JSON only, errors included:
   `{"error":"…","code":3,"hint":"…"}` (`code` is the exit code). Read only stdout.
2. Branch on the exit code:

   | Exit | Meaning | What to do |
   |---|---|---|
   | 0 | ok | continue |
   | 1 | API error (4xx/5xx) | read `error.message`/`hint`; 404 → wrong id, 402 → plan limit |
   | 2 | usage error | fix the command; run `easybits <cmd> <sub> --help` |
   | 3 | no session / expired / rejected | run `easybits login --json` (above) or ask for a key |

   Named API errors come inside `error` (e.g. `API error 409: SandboxBusy: …`) with a `hint`:
   `SandboxBusy` 409 (snapshot/fork running — `easybits sb get <id>` shows `activity`; retry
   in minutes), `SandboxNotReady` 409 (wait for running), `SandboxUnreachable` 409 (retry, else
   destroy), `SandboxHostTimeout` 504 (may still be running; check before repeating),
   `SandboxHostError` 502 (retry), `SQL_ERROR` 400 (fix the SQL), `DATABASE_STORAGE_MISSING` 409
   (data gone; `db rm` and recreate), `DATABASE_BACKEND_ERROR` 502 (retry).
3. `sandboxes exec` without `--json` exits with the remote command's code. With `--json`
   it exits 0 and reports `exitCode`, `stdout`, `stderr`. Put the command after `--`.
4. Put flags after the subcommand: `easybits sb create --template node`, not
   `easybits --template node sb create`.
5. Destroy what you create. Sandboxes you did not create belong to the user: do not
   suspend, exec into or destroy them unless asked.

## Sandboxes (Firecracker microVMs, alias `sb`)

```bash
ID=$(easybits sb create --template node --name scratch --timeout 1800 --json | jq -r .sandboxId)
easybits sb exec "$ID" --json -- 'cd /data/work && npm ci && npm test'
easybits sb files write "$ID" /data/work/app.js ./app.js     # or --content '...', or stdin
easybits sb files read  "$ID" /data/work/out.json            # --out file for binaries
easybits sb files ls    "$ID" /data/work --json
easybits sb logs "$ID" --unit myapp --lines 100
easybits sb suspend "$ID" && easybits sb resume "$ID"
easybits sb snapshot "$ID" --name checkpoint
easybits sb destroy "$ID"
```

Templates: `ubuntu` (default), `python`, `node`, `bun`, `code-interpreter`… Full list:
`easybits docs agents`.

## Hosting (permanent machines, alias `deploy`)

```bash
easybits machines ls --json
easybits machines deploy "$ID" -m "v1.2"            # publish a release of the current code
easybits machines releases "$ID" --json
easybits machines rollback "$ID" "$RELEASE_ID"
easybits machines logs "$ID" --grep ERROR
easybits machines secrets set "$ID" DATABASE_URL="$DATABASE_URL"
easybits machines secrets ls "$ID" --json           # names only; values are never readable
easybits init --port 3000                           # GitHub Actions: deploy on every push
```

## Domains

```bash
easybits domains add "$ID" shop.example.com --port 3000 --json   # returns the DNS record
easybits domains verify "$ID" shop.example.com                   # exit 1 until ready
```

## Databases (libSQL)

```bash
easybits db create leads --json
easybits db query leads "SELECT * FROM leads WHERE name = ?" --arg Ana --json
easybits db rm leads
```

`query` resolves id or name and never creates a database from a typo.

## Agents and files

```bash
easybits agents create --template goose --name helper --json
easybits agents message "$AGENT_ID" "summarize the README" --json   # { content, tokens }
easybits agents destroy "$AGENT_ID"
easybits files upload ./report.pdf --json
easybits files ls --json
```

## More

- `easybits --help`, `easybits <command> --help`, `easybits <command> <sub> --help`
- `easybits docs cli --en` prints the full CLI reference as markdown; `easybits docs <section>`
  prints any docs section (hosting, agents, databases…).
- `easybits config` prints MCP config JSON if the task is better served by the MCP tools.
