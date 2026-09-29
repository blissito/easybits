# @easybits.cloud/cli

The official CLI for [EasyBits](https://www.easybits.cloud), the cloud for AI agents:
sandboxes, hosting, custom domains, SQL databases, agents and files from your terminal.
Built for people and for coding agents — every command takes `--json` and exit codes are stable.

## Install

```bash
npm i -g @easybits.cloud/cli        # installs `easybits`
npx -y @easybits.cloud/cli --help   # or run it without installing
```

Requires Node 22+.

## Log in

```bash
easybits login                       # opens your browser (OAuth2 + PKCE); session renews itself
easybits login --no-browser          # only print the sign-in URL
easybits login - < key.txt           # or save an API key, read from stdin (never in argv)
printenv EB_KEY | easybits login --with-token   # same as -
easybits usage
easybits logout
```

Running a command without a session in a terminal starts the login automatically;
without a terminal (agents, CI) it exits `3`. Precedence: `EASYBITS_API_KEY` env var >
`--token <key>` > browser session > saved API key. Keys: https://www.easybits.cloud/dash/developer.
In CI and agents, `EASYBITS_API_KEY` needs no login at all. `EASYBITS_URL` points the CLI at
another server (default `https://www.easybits.cloud`; `baseUrl` in `~/.easybitsrc` works too).

## Commands

```bash
# Sandboxes (alias: sb)
easybits sandboxes ls
easybits sandboxes create --template node --name scratch --dotenv .env
easybits sandboxes create --size m --ttl 1800 --no-wait   # size s|m|l|xl (plan-gated)
easybits sandboxes get sb_abc123
easybits sandboxes exec sb_abc123 -- npm test
easybits sandboxes logs sb_abc123 --unit myapp --lines 100 --since "10 min ago" --grep ERROR
easybits sandboxes files ls sb_abc123 /data/work
easybits sandboxes files read sb_abc123 /etc/os-release
easybits sandboxes files write sb_abc123 /data/work/app.js ./app.js
easybits sandboxes suspend sb_abc123
easybits sandboxes resume sb_abc123
easybits sandboxes snapshot sb_abc123 --name before-upgrade
easybits sandboxes destroy sb_abc123 --yes

# Hosting: permanent machines (alias: deploy)
easybits machines ls
easybits deploy sb_abc123 -m "v1.2"   # = machines deploy
easybits machines releases sb_abc123 --limit 5
easybits machines logs sb_abc123 --lines 100 --grep ERROR
easybits machines rollback sb_abc123 rel_789
easybits machines secrets ls sb_abc123
easybits machines secrets set sb_abc123 --dotenv .env.production   # - reads stdin
easybits machines secrets unset sb_abc123 DATABASE_URL
easybits init --port 3000            # GitHub Actions workflow that deploys on every push

# Domains
easybits domains ls sb_abc123
easybits domains add sb_abc123 shop.example.com --port 3000
easybits domains verify sb_abc123 shop.example.com
easybits domains rm sb_abc123 shop.example.com --yes

# Databases
easybits db ls
easybits db create leads
easybits db tables leads             # tables, row counts, columns, permanent vs external links
easybits db photos put catalog --table products --key-column sku --dir photos/   # SKU-123.jpg → row sku=SKU-123
easybits db query leads "SELECT * FROM leads" --json
easybits db rm leads --yes

# Agents
easybits agents ls
easybits agents create --template goose --name helper --dotenv .env
easybits agents get helper          # by name or id: record + prompt, MCP, skills, files
easybits agents get helper --fields status,systemPromptMode --json
easybits agents get helper --prompt-out PROMPT.md
easybits agents message helper "hello"
easybits agents message helper "and now?" --session ses_456   # continue a conversation
easybits agents destroy helper --yes

# Configure an agent with a machine (ghosty-lite, goose) — every write takes --dry-run
easybits agents set helper --prompt-file PROMPT.md [--prompt-mode append|replace]
easybits agents files ls|get|put|rm helper [path|local-files…] [--to DIR] [--out FILE]
easybits agents skills ls|get|add|rm helper [slug…] [--dir FOLDER | --file SKILL.md] [--restart]
easybits agents mcp get|set helper [--file servers.json|-]   # set replaces the list and restarts
easybits agents restart helper
easybits agents try helper "who are you?"      # one full turn as text: verify what you set up
easybits agents logs helper --since "10 min ago"
easybits agents doctor helper                   # exits 1 on a problem; status "error" shows why it did not start
easybits agents export helper --out ./helper      # the agent as a folder: agent.yaml + skills/ + files/
easybits apply ./helper --dry-run                 # after editing: the plan (+ ~ - !); --prune also removes
easybits apply ./helper --create --name helper-2  # a new agent from the folder
easybits agents create --like helper --name helper-2 [--copy-files] --dry-run   # clone its setup, never its env
easybits agents create --from helper.json --name helper-3

# Files, websites, account
easybits files ls
easybits files upload ./report.pdf
easybits files rm FILE_ID --yes
easybits websites ls
easybits providers                   # storage provider (Tigris by default)
easybits usage

# MCP, SSH, docs
easybits whoami        # account and where the credential comes from
easybits doctor        # Node, CLI version, credential, API; exits 1 on a problem
easybits mcp config    # MCP config (streamable HTTP)
easybits mcp config --stdio   # MCP config (stdio)
easybits ssh-key       # public key for sandbox SSH
easybits docs cli      # a docs section as markdown (--en for English)
easybits docs --open   # open the docs in your browser
```

**Names or ids.** Wherever a command takes an agent, a sandbox/machine or a database, you can
pass its name instead of the id (`easybits sb exec scratch -- ls`, `easybits domains ls shop`).
The match is exact and case-insensitive; if two share the name the CLI exits 2 and lists the ids.

Shell completion: `source <(easybits completion zsh)` (or `bash`, `fish`).

Help and messages follow your locale (`LANG=es_*` → Spanish) or `--lang es|en`.

Every command has help with examples: `easybits <command> <subcommand> --help`
(or `easybits help <command> <subcommand>`). A typo gets a "Did you mean" suggestion.

**Destructive commands** (`db rm`, `agents destroy`, `sandboxes destroy`, `domains rm`,
`files rm`) ask before acting in a terminal: `[y/N]`, or typing the name/id for
irreversible ones (a database, an agent, a permanent sandbox). Without a terminal they
never prompt — and neither do they with `--json`: pass `--yes` / `-y`, or they exit `2`.

**Dry runs.** Writes that change an agent (`agents set`, `files put|rm`, `skills add|rm`,
`mcp set`, `create`) take `--dry-run`: they print what would change and touch nothing.

**Updates.** Once a day the CLI checks npm and, in a terminal, says on stderr when a newer
version is out (never with `--json`). `EASYBITS_NO_UPDATE_CHECK=1` or `CI` turns it off.

**Secrets** go in a dotenv file or on stdin, never in argv (visible in `ps` and shell
history): `--dotenv <path>` (`KEY=VALUE` lines, `-` = stdin) on `sandboxes create|exec|resume`,
`agents create` and `machines secrets set`. `--env K=V` stays for non-secret values and wins
over the file. (It is not called `--env-file` because Node 22 intercepts that flag name.)

## SSH over 443

Add to `~/.ssh/config`, then `ssh <sandbox-name>.ghosty`:

```
Host *.ghosty
    ProxyCommand easybits ssh-proxy %h
    User root
```

## For coding agents

- `--json`: stdout is JSON only, errors included: `{"error":"…","code":3,"hint":"…"}` (`code` = exit code).
- Exit codes: `0` ok · `1` API error · `2` usage error · `3` no session, expired or rejected.
- Login for a person: `easybits login --json` prints `{"event":"login_url","url":…}` first (show it to them), then `{"event":"logged_in","email":…}`.
- Destructive commands need `--yes`, also with `--json` (no TTY or `--json` means no prompt: exit `2` with the exact command to rerun).
- `sandboxes exec` without `--json` exits with the remote command's code; with `--json` it exits 0 and reports `exitCode`.
- Skill: `npx skills add https://easybits.cloud` (includes `easybits-cli`).

Full reference: https://www.easybits.cloud/docs#cli · https://www.easybits.cloud/en/docs/cli.md

## Changes in 0.13.0

- Catalog photos: `db photos put <db> --table T --key-column sku --dir photos/ [--column C]
  [--replace] [--dry-run]` uploads each photo as a public file with a permanent link and writes it
  in the matching row (real type by bytes, JPEG/PNG/WebP, 10 MB; one upload per distinct photo).
- `db tables` shows, per text column with links, how many are permanent, expiring (signed),
  external or empty (`--json`: `links`).

## Changes in 0.12.0

- `easybits completion zsh|bash|fish`: TAB completes commands, subcommands, flags and the names of
  your agents, sandboxes and databases (cached 5 min in `~/.cache/easybits/`).

## Changes in 0.11.0

- **Spanish or English, following your locale** (`LANG=es_*` → Spanish; otherwise English), or
  `--lang es|en` / `EASYBITS_LANG`. Help, errors, hints and human output; `--json` keys and exit
  codes never change. Known API messages are shown in the same language.

## Changes in 0.10.0

- **The agent as a file**: `agents export <agent> [--out DIR|file.yaml|file.json]` and
  `easybits apply <file|dir> [--agent X] [--create] [--prune] [--dry-run] [--yes]`. Declarative
  plan computed by the server (`+ ~ - !`; removing needs `--prune`), secrets exported as `${NAME}`
  and filled from your environment, previous file saved to `~/.easybits/backups/`.
  `create --from <file>` accepts the new files too.
- `agents create --timeout` is now `--ttl` (the old flag still works and says so).

## Changes in 0.9.0

- Configure agents with a machine (ghosty-lite, goose) from the terminal, same contract as
  Ghosty Studio's `ghosty` CLI: `agents set` (system prompt), `agents files`, `agents skills`,
  `agents mcp`, `agents restart`, `agents try` (one turn as text), `agents logs`, `agents doctor`.
- `agents get` shows the prompt, MCP servers (secrets masked), skills and files;
  `--fields a,b` and `--prompt-out FILE` (write a long prompt to a file instead of the terminal).
- `agents export` and `agents create --like <agent> | --from <export.json>`: clone an agent's
  setup (template, prompt, MCP, skills, optionally files). Never its env: pass keys with `--dotenv`.
- `agents create --prompt | --prompt-file | --prompt-mode | --mcp-file`. A multi-line prompt is
  written once the machine is up (the box env cannot hold newlines).
- `--dry-run` on every agent write; `files rm` and `skills rm` take several at once (one confirmation).
- New `easybits doctor`; a daily update notice on stderr; an unknown flag on an old version says to update.

## Changes in 0.8.0

- One naming rule (like `gh`): `easybits <noun> <verb>`. Old spellings still work and print the new
  one on stderr (never with `--json`):
  `easybits config` → `easybits mcp config`; `easybits mcp` → `easybits mcp config --stdio`;
  `easybits deploy <machine>` is now the verb (= `machines deploy`), so `deploy ls` → `machines ls`;
  `machines release` → `machines deploy` (it clashed with `releases`);
  `sandboxes create --timeout` → `--ttl` (`--timeout` stays in `exec`, where it caps the command).
- `files rm` is the name (`delete` still works), like `db rm` and `domains rm`.
- New `easybits whoami`: account email and where the credential comes from.

## Changes in 0.7.0

- Agents, sandboxes/machines and databases by **name** anywhere an id goes; `easybits agents get`.

## Changes in 0.6.1

- Help: `--yes` is no longer listed as a global flag; it lives on each destructive command
  (and the global help says it is required without a terminal or with `--json`).
- `easybits init` suggests `machines secrets set <id> --dotenv …` instead of `KEY=VALUE` in argv.

## Changes in 0.6.0

- **Breaking for scripts:** `db rm`, `agents destroy`, `sandboxes destroy`, `domains rm` and
  `files delete` now require `--yes` when not running in a terminal (exit `2` otherwise).
- `--dotenv <path|->` for env vars and secrets; `easybits login -` / `--with-token` reads the key from stdin.
  `login <api-key>` and `secrets set KEY=VALUE` still work but are no longer advertised.
- `easybits db tables <db>`: tables with row counts and columns (`--json`: `[{name, rows, columns:[{name,type,pk}]}]`).
- "Did you mean" for unknown commands and subcommands; `easybits help <command> <subcommand>`.

## License

MIT
