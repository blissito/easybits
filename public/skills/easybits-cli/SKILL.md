---
name: easybits-cli
description: "Drive EasyBits from the terminal with the easybits CLI (npm @easybits.cloud/cli) - sandboxes, exec, sandbox files, permanent machines and releases, secrets, custom domains, SQL databases, agents (prompt, skills, MCP, files, clone) and files, all with --json and stable exit codes. Use when a coding agent has a shell and needs to create or operate EasyBits resources without writing HTTP calls, or when the user mentions the easybits CLI."
license: MIT
compatibility: Needs Node 22+ (npx is enough), network access to https://www.easybits.cloud and an EasyBits API key
metadata:
  author: easybits
  version: "1.8"
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

Alternatives: `EASYBITS_API_KEY` (preferred in CI, needs no login), or save a key read from
stdin — never put it in argv (`ps` and shell history see it):

```bash
easybits login - < key.txt                       # validated before it is saved
printenv EB_KEY | easybits login --with-token     # same thing
easybits logout                                   # forget session and key
```

Precedence: `EASYBITS_API_KEY` > `--token` > browser session > saved key. Keys come from
https://www.easybits.cloud/dash/developer — never invent one. `EASYBITS_URL` points the CLI
at another server (default https://www.easybits.cloud).

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
5. Deletes need `--yes`: `sb destroy`, `agents destroy`, `db rm`, `domains rm`, `files rm`,
   `agents files rm`, `agents skills rm`.
   With `--json` (or no terminal) they never prompt; without `--yes` they exit 2.
6. Names work where ids do: any agent, sandbox/machine or database argument takes its name
   (`easybits agents get helper`, `easybits sb exec scratch -- ls`, `easybits db query leads …`).
   Exact match, case-insensitive. Two with the same name → exit 2, `error` says so and `hint`
   lists the ids: retry with one. For destructive commands prefer the id you got back on create.
7. Command shape is `easybits <noun> <verb>` (like `gh`). Old spellings (`easybits config`,
   `easybits mcp`, `deploy ls`, `machines release`, `sb create --timeout`) still run but print the
   new form on stderr; use the new one: `mcp config [--stdio]`, `machines ls`, `deploy <machine>`,
   `sb create --ttl`. `easybits whoami --json` tells you which account and credential are in use.
8. Agent writes (`agents set|create|files put|rm|skills add|rm|mcp set`) take `--dry-run`: preview
   first, then run it, then verify with `easybits agents try <agent> "…" --json` (one full turn as
   text) or `easybits agents doctor <agent> --json` (exit 1 on a problem). `easybits doctor --json`
   checks the CLI itself (Node, version, credential, API).
9. Destroy what you create. Sandboxes you did not create belong to the user: do not
   suspend, exec into or destroy them unless asked.

## Sandboxes (Firecracker microVMs, alias `sb`)

```bash
ID=$(easybits sb create --template node --name scratch --ttl 1800 --json | jq -r .sandboxId)
easybits sb ls --json
easybits sb get "$ID" --json                                 # status, expiresAt, activity
easybits sb exec "$ID" --json -- 'cd /data/work && npm ci && npm test'
easybits sb files write "$ID" /data/work/app.js ./app.js     # or --content '...', or stdin
easybits sb files read  "$ID" /data/work/out.json            # --out file for binaries
easybits sb files ls    "$ID" /data/work --json
easybits sb logs "$ID" --unit myapp --lines 100 --since "10 min ago" --grep ERROR
easybits sb suspend "$ID" && easybits sb resume "$ID"
easybits sb snapshot "$ID" --name checkpoint
easybits sb destroy "$ID" --json --yes
```

`create` flags: `--size s|m|l|xl` (plan-gated), `--no-wait` (return before running),
`--dotenv <path|->` for env (`--env K=V` only for non-secret values).

Templates: `ubuntu` (default), `python`, `node`, `bun`, `code-interpreter`… Full list:
`easybits docs agents`.

## Hosting (permanent machines, alias `deploy`)

```bash
easybits machines ls --json
easybits machines deploy "$ID" -m "v1.2"            # publish a release of the current code
easybits machines releases "$ID" --limit 5 --json
easybits machines rollback "$ID" "$RELEASE_ID"
easybits machines logs "$ID" --lines 100 --grep ERROR
easybits machines secrets set "$ID" --dotenv .env.production     # KEY=VALUE lines
printf 'DATABASE_URL=%s\n' "$DATABASE_URL" | easybits machines secrets set "$ID" --dotenv -
easybits machines secrets unset "$ID" DATABASE_URL
easybits machines secrets ls "$ID" --json           # names only; values are never readable
easybits init --port 3000                           # GitHub Actions: deploy on every push
```

## Domains

```bash
easybits domains add "$ID" shop.example.com --port 3000 --json   # returns the DNS record
easybits domains verify "$ID" shop.example.com                   # exit 1 until ready
easybits domains ls "$ID" --json
easybits domains rm "$ID" shop.example.com --json --yes
```

## Databases (libSQL)

```bash
easybits db create leads --json
easybits db query leads "SELECT * FROM leads WHERE name = ?" --arg Ana --json
easybits db tables leads --json          # [{name, rows, columns:[{name,type,pk}]}]
easybits db ls --json
easybits db rm leads --json --yes
```

`query` and `tables` resolve id or name and never create a database from a typo.

## Agents and files

```bash
easybits agents create --template goose --name helper --json
easybits agents ls --json
easybits agents get helper --json                                  # by name or id
easybits agents message "$AGENT_ID" "summarize the README" --json   # { content, tokens }
easybits agents message "$AGENT_ID" "now the tests" --session "$SID" --json
easybits agents destroy "$AGENT_ID" --json --yes
easybits files upload ./report.pdf --json
easybits files ls --json
easybits files rm "$FILE_ID" --json --yes     # 7-day trash
easybits providers --json                         # storage provider
```

## Configure an agent (ghosty-lite, goose)

Same contract as the Ghosty Studio `ghosty` CLI. Other templates answer
`agente_sin_maquina`.

```bash
easybits agents get helper --fields systemPrompt,systemPromptMode,skills,mcpServers --json
easybits agents get helper --prompt-out PROMPT.md --json        # long prompt → file; JSON has {file, bytes}
easybits agents set helper --prompt-file PROMPT.md --dry-run --json   # {changes:{systemPrompt:{from,to}}}
easybits agents set helper --prompt-file PROMPT.md --prompt-mode replace --json   # no reboot
easybits agents files put helper catalog.pdf prices.csv --to docs --json   # into /data/work
easybits agents files ls helper --json
easybits agents skills add helper --dir ./skills/quotes --restart --json   # folder with SKILL.md
easybits agents skills ls helper --json
easybits agents mcp set helper --file servers.json --json   # replaces ALL servers, restarts
easybits agents try helper "which skills do you have?" --json   # {text, error, session, ms}
easybits agents doctor helper --json                            # {ok, checks:[{check,ok,detail,hint}]}
easybits agents get helper --fields status,lastError --json     # status "error" + lastError = the runtime did not start (fix, then agents restart)
easybits agents create --like helper --name helper-2 --dry-run --json   # plan: template, prompt, MCP, skills
easybits agents create --like helper --name helper-2 --copy-files --json
```

- A skill enters after a restart (`--restart`, or `agents restart`), which starts a new session.
  A SKILL.md with an unquoted `: ` in `name:`/`description:` is refused (the engine would drop it).
- Cloning copies template, prompt, MCP servers and skills (`--copy-files`: files too), never the
  env: pass the engine keys with `--dotenv`. `--from` needs an export made with `--show-secrets`
  if the MCP servers carry literal secrets (`$secret:NAME` references are fine).

## The agent as a file (export → edit → apply)

```bash
easybits agents export helper --out ./helper --json      # agent.yaml + skills/<slug>/ + files/
easybits apply ./helper --dry-run --json                 # {plan:[{op,what}]}: + add, ~ change, - remove, ! skipped
ANTHROPIC_API_KEY="$KEY" easybits apply ./helper --yes --json   # {applied, failed?, backup}
easybits apply ./helper --create --name helper-2 --yes --json   # {agentId, plan, applied}
```

- Declarative: fields missing from the file are left alone; removing needs `--prune`. Read the
  `!` lines: they say what was NOT applied and why (a `${VAR}` you did not export, a template
  change, a skill with no folder).
- Secrets are never in the file (`${NAME}`); export the variable before `apply` to set it, or
  leave it unset to keep today's value. Prefer `$secret:NAME` (vault) inside MCP headers.
- `failed` in the result = stopped at that step (exit 1); `backup` is the file to roll back with
  `easybits apply <backup> --agent <agent> --yes`.

## More

- `easybits --help`, `easybits <command> <sub> --help` or `easybits help <command> <sub>`
- `easybits docs cli --en` prints the full CLI reference as markdown; `easybits docs <section>`
  prints any docs section (hosting, agents, databases…); `easybits docs --open` opens the browser.
- `easybits mcp config` prints MCP config JSON (`--stdio` for the npx proxy) if the task is better served by the MCP tools.
